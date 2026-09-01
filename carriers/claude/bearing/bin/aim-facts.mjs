#!/usr/bin/env node
// The plugin's SessionStart composer — what a session is handed.
//
// ═══ What goes in, and why ══════════════════════════════════════════════════
//
// The set is derived from the `aim:` statements, one demand each. Nothing is
// here because the engine emits it:
//
//   artifact-system-prompt   エージェントは、この第一級Artifactをどう読み・編集し・
//                            取り扱うかを、system-promptに代表される最も強いプロンプト
//                            挿入にて把握する                        → the FRAME
//   conversation-handoff     セッションを跨ぐコンテキスト伝達         → the BATON
//   aim-upkeep / drift-git   安い機械検知によって検査対象を可視化      → DRIFT fences
//   knowledge-crossing       知識は ... 次に判断する人へ届く           → UNPUSHED
//   aim-code-drift           aim⊥code driftは ... 表面化できる         → CHECKPOINT
//   aim-backlog-triage       エージェントはAimの未実装の手段に注意を払う → OPEN-TODO
//   cwd-git / multi-repo     cwdから下階層へ探索し、各枝で初めて現れたもの → the UNIT
//   boot-readiness-prompt    git不在=新規、構造物不在=新規アタッチ      → READINESS
//   guide-provisioning       正本(guide)が手元に実在する               → GUIDE check
//
// ═══ Two rules this file may never break ════════════════════════════════════
//
// 1. **Exit 0, always.** This runs at the start of EVERY session in EVERY
//    project. A broken corpus, an unreadable repo, a git that hangs — none of
//    them may obstruct the session they exist to inform.
// 2. **A fact we cannot observe is absent, never fabricated** — and absent must
//    never render as clean. Every fence says which of the two it is saying.
//
// stdout IS the injected context. Nothing else may write to it.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAimGraph, readAimSlugs } from '../lib/corpus.mjs'
import { runGit } from '../lib/git.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherBacklog } from '../lib/process.mjs'
import { gatherDrift, renderInterFence, renderIntraFence } from '../lib/drift.mjs'
import { gatherWorkingDelta, renderWorkingDeltaFence } from '../lib/working-delta.mjs'
import { gatherUnpushed, renderUnpushedFence } from '../lib/unpushed.mjs'
import { gatherCheckpointStale, renderCheckpointFence } from '../lib/checkpoint.mjs'
import { corpusSignature, deltaStatePath, factsDigest } from '../lib/corpus-signature.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const out = []
const say = (...lines) => out.push(...lines)

/** The always-on discipline. Static text; it never needed a binary. */
async function frame() {
  // Bundled beside the `aim` skill by `scripts/gen-carriers.sh`, and CI checks
  // the copy is in sync with `docs/aims/_guide/frame.md`.
  try {
    return await readFile(path.join(PLUGIN_ROOT, 'skills', 'aim', 'frame.md'), 'utf8')
  } catch {
    return null
  }
}

/** Per-repo facts. Every failure degrades to a fence that says it failed. */
async function repoFacts(repo) {
  const slugs = await readAimSlugs(repo.root)
  const head = (await runGit(repo.root, ['rev-parse', '--short', 'HEAD']))?.trim() ?? null
  if (slugs.length === 0) {
    return { ...repo, head, slugs, corpus: false }
  }
  const graph = await readAimGraph(repo.root)
  const [drift, working, unpushed, checkpoint] = await Promise.all([
    gatherDrift(repo.root),
    gatherWorkingDelta(repo.root, slugs),
    gatherUnpushed(repo.root, slugs),
    gatherCheckpointStale(repo.root, graph?.nodes ?? new Map()),
  ])
  const backlog = await gatherBacklog(repo.root)
  return { ...repo, head, slugs, corpus: true, drift, working, unpushed, checkpoint, backlog }
}

function renderRepo(r) {
  const role = r.primary ? ', primary' : ''
  say(`### ${r.label} (\`${r.root}\`${role}) · git HEAD ${r.head ?? 'unknown'}`, '')
  if (!r.corpus) {
    say('*No `docs/aims/` in this repo — it has not adopted the corpus. That is a', 
        'structurally normal state, not a fault.*', '')
    return
  }
  if (r.drift === null) {
    say('```tmai-aim-drift-intra v1', '# unavailable — git could not be read for this repo.',
        '# ⚠ Absent, NOT clean: do not read this as "no drift".', '```', '')
  } else {
    say(renderIntraFence(r.drift.intra).trimEnd(), '')
    say(renderInterFence(r.drift.inter).trimEnd(), '')
  }
  say(renderWorkingDeltaFence(r.working).trimEnd(), '')
  say(renderUnpushedFence(r.unpushed).trimEnd(), '')
  say(renderCheckpointFence(r.checkpoint).trimEnd(), '')
}

async function main() {
  const cwd = process.cwd()
  const f = await frame()
  if (f) say(f.trimEnd(), '', '---', '')

  const unit = await resolveUnit(cwd)
  const repos = []
  for (const repo of unit.repos) repos.push(await repoFacts(repo))

  const withCorpus = repos.filter((r) => r.corpus)
  const openTodo = withCorpus.reduce((n, r) => n + r.backlog.openTodoNodes, 0)
  const anomalies = withCorpus.flatMap((r) =>
    r.backlog.anomalies.map((a) => ({ repo: r.label, ...a })),
  )
  const unknown = withCorpus.flatMap((r) =>
    r.backlog.unknownNodes.map((slug) => `${r.label}/${slug}`),
  )
  const baton = await readBatonSafe(unit.root)

  say(`# aim facts — unit: ${unit.name} — composed ${new Date().toISOString()}`)
  say(
    `> ${repos.length} repo(s), ${withCorpus.length} with a corpus · ` +
      `baton: ${baton ? 'present' : 'none'}`,
    '',
  )

  // ── boot readiness ────────────────────────────────────────────────────────
  // `boot-readiness-prompt` splits the two absences, because the act they ask
  // for is different: no git is a new project, git without a corpus is an
  // existing project this discipline has not been attached to yet.
  if (repos.length === 0) {
    say(
      '⚠ **No git repository at or below this cwd.** Treat this as a NEW project:',
      'if work begins here, the first aim node is created before the first means',
      'is implemented (`aim-state-open`).',
      '',
    )
  } else if (withCorpus.length === 0) {
    say(
      '⚠ **Git is here but no `docs/aims/` is.** Treat this as an EXISTING project',
      'that has not adopted the aim discipline yet. Adopting it is an operator act,',
      'not yours to perform unasked — surface the option, do not provision silently.',
      '',
    )
  }
  if (unit.truncated) {
    say(
      `⚠ **The repo walk was truncated (${unit.truncated} cap).** This unit's repo list`,
      'is INCOMPLETE, so every fact below is partial. Say so before reporting on it.',
      '',
    )
  }

  // ── baton ─────────────────────────────────────────────────────────────────
  say('## ▶ Where you left off', '')
  if (!baton) {
    say(
      '*No baton at `.handoff/active.md` — this is a fresh start.*',
      '',
      '⚠ An empty baton is not an empty project. Read the backlog count below',
      'before concluding there is nothing to pick up.',
      '',
    )
  } else {
    say(
      `Baton at \`${path.relative(unit.root, baton.path) || baton.path}\`` +
        (baton.composedAt ? ` · composed-at \`${baton.composedAt}\`` : '') +
        (baton.readAt ? ` · **read-at \`${baton.readAt}\` (already read before)**` : ''),
      '',
      '**Follow `_guide/handoff.md` § 読む, steps 2-6** — this hook has surfaced the',
      'baton but has NOT stamped `read-at`, and steps 4-6 (surface un-pushed aims,',
      'read the pointers, report where you stand) are yours.',
      '',
      baton.text.trimEnd(),
      '',
    )
  }

  // ── per-repo aim facts ────────────────────────────────────────────────────
  say('## Aim corpus', '')
  if (withCorpus.length === 0) {
    say('*No repo in this unit carries `docs/aims/`.*', '')
  } else {
    for (const r of repos) renderRepo(r)
  }

  // ── forward backlog ───────────────────────────────────────────────────────
  if (withCorpus.length > 0) {
    say('## Forward backlog', '')
    say(
      `**open-todo: ${openTodo}** — aim nodes whose \`# PROCESS\` carries at least one`,
      '`[todo]` mark, excluding `state: dead` nodes. One count per node.',
      '',
      'Surface this number. Do not triage it, rank it, or propose which to work —',
      'the pick is the operator\'s.',
      '',
    )
    if (anomalies.length > 0) {
      // The corpus deviated from its own observed notation. Neither silently
      // absorbed nor silently ignored: a mark this parser did not count is a
      // todo nobody is attending to.
      say(
        `⚠ **${anomalies.length} PROCESS notation anomal${anomalies.length === 1 ? 'y' : 'ies'}** —`,
        'these lines look like marks but are not in the form the corpus uses, so they',
        'are counted NOWHERE in the number above:',
        '',
      )
      for (const a of anomalies.slice(0, 20)) {
        say(`- \`${a.repo}\` **${a.slug}** (${a.kind}, line ${a.no}): ${a.line.slice(0, 100)}`)
      }
      if (anomalies.length > 20) say(`- … and ${anomalies.length - 20} more`)
      say('')
    }
    if (unknown.length > 0) {
      // The `unknown` of the four-value progress read: a `# PROCESS` heading
      // with nothing readable under it. Folding these into "no todos" would be
      // the fabricated `done` this layer is forbidden.
      say(
        `⚠ **${unknown.length} node(s) have a \`# PROCESS\` heading with no readable mark.**`,
        'They are counted as neither done nor todo — read as `unknown`, never as',
        'nothing-to-do:',
        '',
        unknown.map((u) => `\`${u}\``).join(', '),
        '',
      )
    }
  }

  // ── the guide ─────────────────────────────────────────────────────────────
  // `guide-provisioning`: the canon must be REACHABLE from where the session
  // stands, and in a multi-repo unit it lives in a member repo, not at cwd.
  const guides = []
  for (const r of withCorpus) {
    const g = path.join(r.root, 'docs', 'aims', '_guide', 'producer-guide.md')
    try {
      await readFile(g, 'utf8')
      guides.push(path.relative(unit.root, g) || g)
    } catch {
      /* not there */
    }
  }
  if (withCorpus.length > 0) {
    say('## The canon', '')
    if (guides.length > 0) {
      say(`Guide present: ${guides.map((g) => `\`${g}\``).join(', ')}. Read it before`,
          'touching any aim node.', '')
    } else {
      say(
        '⚠ **No `docs/aims/_guide/producer-guide.md` in this unit.** The `aim` skill',
        'bundles its own copy of the canon — use that, and treat the absence here as',
        'something to raise with the operator.',
        '',
      )
    }
  }
  return { unit, repos: withCorpus }
}

async function readBatonSafe(unitRoot) {
  try {
    const { readBaton } = await import('../lib/baton.mjs')
    return await readBaton(unitRoot)
  } catch {
    return null
  }
}

/**
 * The hook input, read without ever being able to stall the composer.
 *
 * Started before `main()` and awaited after, so a pipe that never closes costs
 * nothing the facts had not already spent. The TTY guard is for the documented
 * by-hand invocation (`node bin/aim-facts.mjs` in a unit directory), where
 * stdin is a terminal and would never close at all.
 */
function readHookInput(ms = 1000) {
  if (process.stdin.isTTY) return Promise.resolve({})
  return new Promise((resolve) => {
    let buf = ''
    const done = () => {
      try {
        resolve(JSON.parse(buf || '{}'))
      } catch {
        resolve({})
      }
    }
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', done)
    process.stdin.on('error', done)
    setTimeout(done, ms).unref?.()
  })
}

/**
 * Record what this session was told, so `bin/corpus-delta.mjs` can tell later
 * whether the corpus has moved out from under it.
 *
 * ⚠ **Best-effort by construction.** Without a baseline the delta hook reports
 * the corpus as it stands and says so — louder than it needs to be, but never
 * silent. ∴ a failure here degrades toward noise, never toward a session that
 * believes stale numbers.
 */
async function seedDeltaBaseline(unit, sessionId, repos) {
  if (!unit || !sessionId) return
  try {
    const { sig, heads } = await corpusSignature(unit)
    if (sig === null) return
    const file = deltaStatePath(sessionId)
    mkdirSync(path.dirname(file), { recursive: true })
    // The digest comes from facts `main()` already gathered — the composer must
    // never pay twice, and both sides must agree on what "the facts" means.
    writeFileSync(file, JSON.stringify({ sig, heads, facts: factsDigest(repos ?? []) }), 'utf8')
  } catch (err) {
    process.stderr.write(`aim plugin: could not seed the delta baseline: ${err?.message ?? err}\n`)
  }
}

const hookInput = readHookInput()

let composed = null
try {
  composed = await main()
  process.stdout.write(out.join('\n') + '\n')
} catch (err) {
  // Rule 1. The session must start whatever happened here.
  const f = await frame()
  if (f) process.stdout.write(f.trimEnd() + '\n\n---\n\n')
  process.stdout.write(
    '⚠ **aim facts were NOT computed for this session** — the composer failed.\n' +
      'Absent, not clean: do not read the silence as "nothing to pick up".\n',
  )
  process.stderr.write(`aim plugin: composer failed: ${err?.stack ?? err}\n`)
}
await seedDeltaBaseline(composed?.unit, (await hookInput).session_id, composed?.repos)
process.exit(0)
