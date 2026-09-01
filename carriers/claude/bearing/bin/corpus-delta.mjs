#!/usr/bin/env node
// The staleness trigger — the boot snapshot, kept honest mid-session.
//
// Derived from `aim-upkeep` / `drift-git` / `aim-backlog-triage` (quoted in
// `lib/corpus-signature.mjs`, which owns the derivation of "the facts moved").
//
// ═══ Why PostToolBatch ══════════════════════════════════════════════════════
//
// The SessionStart composer is a snapshot. A session that edits the corpus and
// keeps working carries numbers that were true when it started — and a stale
// count is worse than no count, because it still looks authoritative.
//
// ⚠ **This does not need to be a tool.** The argument for an MCP server here was
// that the trigger — "I just edited an aim" — is a fact only the agent knows,
// so the régime would have to ask rather than tell. That is wrong: the harness
// knows when a batch of tool calls resolved, and git knows what they did to the
// tree. `PostToolBatch` fires exactly once per batch, **before the next model
// request**, and can inject `additionalContext`. So the push side has a firing
// point and the fact never has to become an option.
//
// That distinction is load-bearing, not stylistic. A hook the régime fires is
// owed to the session; a tool is offered to it. **A tool that is never called
// is indistinguishable, from inside the session, from a tool that does not
// exist** — and since declining to look is itself an appraisal, moving the
// open-todo count to a tool would hand the agent exactly the judgment
// `aim-upkeep` withholds from it, disguised as an omission.
//
// ═══ Three gates, cheapest first ════════════════════════════════════════════
//
// Measured on this unit (2 repos, 77 nodes): the signature costs ~40ms
// including node start, the working-tree layer ~65ms, drift ~169ms. This runs
// before every model request, so the common case must pay the first only.
//
//   1. **Signature** — HEAD plus a content hash of the dirty aim paths. If
//      nothing moved a byte: exit, silent.
//   2. **Facts digest** — what the working-tree layer would SAY. Editing an aim
//      body is the most common thing a session does to the corpus, and it moves
//      the signature while leaving every fact identical. Re-injecting an
//      unchanged report on every such batch is the noise `aim-upkeep` rules out
//      when it puts the machine layer at *visibility*: a surface that repeats
//      itself stops being read, and then a real change arrives looking like the
//      nine before it.
//   3. **Aim commits** — a HEAD that moved over `docs/aims/` makes the history
//      fences from boot wrong, so they are recomputed and emitted for real.
//      Paying 169ms on a commit is nothing; paying it per batch would be.
//
// ⚠ **One imprecision, stated rather than hidden**: `checkpoint-stale`'s
// `commits_since` moves on ANY commit, including one that never touches an aim,
// and this does not re-report those. That fence is explicitly a weak wall-clock
// candidate rather than a verdict, and the boot fence already named the slugs —
// a per-batch reminder that a counter ticked would be the noise gate 2 exists
// to prevent.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readAimGraph, readAimSlugs } from '../lib/corpus.mjs'
import { corpusSignature, deltaStatePath, factsDigest } from '../lib/corpus-signature.mjs'
import { renderCorpusDelta } from '../lib/corpus-delta.mjs'
import { gatherCheckpointStale, renderCheckpointFence } from '../lib/checkpoint.mjs'
import { gatherDrift, renderInterFence, renderIntraFence } from '../lib/drift.mjs'
import { runGit } from '../lib/git.mjs'
import { gatherBacklog } from '../lib/process.mjs'
import { gatherUnpushed, renderUnpushedFence } from '../lib/unpushed.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { resolveUnit } from '../lib/unit.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
    // A hook whose stdin never closes must not hang the session it serves.
    setTimeout(() => resolve(buf), 2000).unref?.()
  })
}

function readState(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Did any aim file move between two commits?
 *
 * ⚠ `git diff`, not `git log <a>..<b>`: the baseline sha need not be an ancestor
 * of HEAD (a rebase, a branch switch), and a range that is not ancestry reads as
 * empty rather than as different — a silent false negative, which is the failure
 * this plugin keeps refusing.
 *
 * ⚠ `null` is git failing, not git saying "nothing". Treat it as moved, so the
 * history fences get recomputed rather than quietly assumed fresh.
 */
async function aimsMovedBetween(repoRoot, from, to) {
  if (!from || !to || from === to) return false
  const out = await runGit(repoRoot, ['diff', '--name-only', from, to, '--', 'docs/aims/'])
  if (out === null) return true
  return out.trim() !== ''
}

/** The history layer, recomputed for one repo. Any failure renders as absent. */
async function historyFences(repo) {
  const graph = await readAimGraph(repo.root)
  const [drift, unpushed, checkpoint] = await Promise.all([
    gatherDrift(repo.root),
    gatherUnpushed(repo.root, repo.slugs),
    gatherCheckpointStale(repo.root, graph?.nodes ?? new Map()),
  ])
  const blocks = []
  if (drift === null) {
    blocks.push(
      '```tmai-aim-drift-intra v1\n# unavailable — git could not be read for this repo.\n' +
        '# ⚠ Absent, NOT clean: do not read this as "no drift".\n```',
    )
  } else {
    blocks.push(renderIntraFence(drift.intra).trimEnd())
    blocks.push(renderInterFence(drift.inter).trimEnd())
  }
  blocks.push(renderUnpushedFence(unpushed).trimEnd())
  blocks.push(renderCheckpointFence(checkpoint).trimEnd())
  return blocks
}

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  process.exit(0)
}

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  const { sig, heads } = await corpusSignature(unit)
  // No corpus anywhere in the unit: this project never adopted the discipline,
  // and reporting an empty one would be the plugin deciding something the
  // operator did not.
  if (sig === null) process.exit(0)

  const file = deltaStatePath(input.session_id)
  const prev = existsSync(file) ? readState(file) : null

  // ── Gate 1 ────────────────────────────────────────────────────────────────
  if (prev && prev.sig === sig) process.exit(0)

  const repos = []
  for (const repo of unit.repos) {
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    repos.push({
      label: repo.label,
      root: repo.root,
      slugs,
      working: await gatherWorkingDelta(repo.root, slugs),
      backlog: await gatherBacklog(repo.root),
    })
  }

  const facts = factsDigest(repos)

  // ── Gate 3, evaluated before gate 2 can short-circuit, so that a commit is
  //    never swallowed by a working tree that happens to look unchanged ──────
  const moved = []
  if (prev) {
    for (const r of repos) {
      const before = prev.heads?.[r.label]
      if (before === undefined || before === heads[r.label]) continue
      if (await aimsMovedBetween(r.root, before, heads[r.label])) {
        moved.push({ label: r.label, from: before, to: heads[r.label] })
      }
    }
  }

  // ── Gate 2 ────────────────────────────────────────────────────────────────
  if (prev && facts === prev.facts && moved.length === 0) {
    // The bytes moved; what they mean did not. Record the new signature so the
    // next batch stops at gate 1 instead of paying for this again.
    writeFileSync(file, JSON.stringify({ sig, heads, facts }), 'utf8')
    process.exit(0)
  }

  for (const m of moved) {
    m.blocks = await historyFences(repos.find((r) => r.label === m.label))
  }

  const body = renderCorpusDelta({ repos, moved, hadBaseline: Boolean(prev) })

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ sig, heads, facts }), 'utf8')

  if (body) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolBatch',
          additionalContext: body,
        },
      }) + '\n',
    )
  }
} catch (err) {
  // Never obstruct a turn over a bug in this hook. Exit 2 here would stop the
  // agentic loop outright, which is far worse than a missing refresh.
  process.stderr.write(`aim plugin: corpus-delta hook failed: ${err?.stack ?? err}\n`)
}
process.exit(0)
