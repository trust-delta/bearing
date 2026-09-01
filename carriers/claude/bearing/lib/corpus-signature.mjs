// The per-session corpus signature — what "the facts have moved" resolves to.
//
// Derived from:
//
//   aim-upkeep   ...安い機械検知によって検査対象を可視化し...
//   drift-git    この「drift可能性」は検査価値があるものとして、git履歴から得られる
//                事実に基づいて機械的に安く表面化できる
//   aim-backlog-triage  Aimは開発の駆動力であり、エージェントはAimの未実装の手段に
//                       注意を払う必要がある
//
// ⚠ **None of those statements says "at boot".** The SessionStart composer is a
// snapshot, and a session that edits the corpus then keeps working is carrying
// numbers that were true when it started. A stale count is not a smaller truth;
// it is the 「悪センサーは無センサーに劣る」 case `drift-git` names, because a
// number still looks authoritative after it stops being right.
//
// ═══ Why the signature observes the repo, not the tool calls ════════════════
//
// ⚠ **Do not infer "an aim changed" from what the batch did.** The obvious
// matcher — `Write`/`Edit` with a `docs/aims/` path — misses every edit made
// through a shell heredoc, a `sed -i`, a `git checkout`, or a script. That is
// not hypothetical: the session that wrote this file edited an aim node with a
// python heredoc via Bash, which such a matcher would have skipped in silence.
// A sensor that reports "nothing changed" because it was watching the wrong
// door is the same failure as the parser that demanded an ASCII space after
// `]` and under-counted 41 of 44.
//
// ∴ ask git, not the transcript.
//
// ═══ Exactness vs. cost ═════════════════════════════════════════════════════
//
// Measured on this unit (2 repos, 77 nodes): the full compose is ~190ms, of
// which drift alone is ~169ms and the cheap layer (working-delta + backlog) is
// ~65ms. This runs before every model request, so it must not pay either.
//
// The signature is exact and cheap at once: per repo, `HEAD` + the porcelain
// path set + a content hash of ONLY the paths porcelain listed. Content that is
// neither dirty nor moved by a commit cannot have changed, so hashing the rest
// would buy nothing.

import { createHash } from 'node:crypto'
import os from 'node:os'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readAimSlugs } from './corpus.mjs'
import { runGit } from './git.mjs'
import { parsePorcelainPaths } from './working-delta.mjs'

const DELETED = '<deleted-in-working-tree>'

/**
 * A cheap, exact fingerprint of every corpus in the unit.
 *
 * @param {{repos: {root: string, label: string}[]}} unit
 * @returns {Promise<{sig: string|null, heads: Record<string, string|null>}>}
 *   `sig` is null when no repo in the unit carries a corpus — the structurally
 *   normal state for a unit that has not adopted the discipline, and the signal
 *   for callers to stay silent rather than to report an empty corpus.
 */
export async function corpusSignature(unit) {
  const parts = []
  const heads = {}
  let any = false

  for (const repo of unit.repos) {
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    any = true

    const head = await runGit(repo.root, ['rev-parse', 'HEAD'])
    heads[repo.label] = head?.trim() ?? null
    const status = await runGit(repo.root, ['status', '--porcelain', '--', 'docs/aims/'])
    const dirty = status === null ? new Set() : parsePorcelainPaths(status)

    const files = []
    for (const rel of [...dirty].sort()) {
      let body
      try {
        body = await readFile(path.join(repo.root, rel), 'utf8')
      } catch {
        // Deleted in the working tree. Its absence is part of the state, and a
        // distinct token keeps "deleted" from colliding with "empty file".
        body = DELETED
      }
      files.push(`${rel}:${createHash('sha256').update(body).digest('hex').slice(0, 16)}`)
    }

    parts.push(`${repo.label}|${head ?? 'no-head'}|${slugs.length}|${files.join(',')}`)
  }

  if (!any) return { sig: null, heads }
  return { sig: createHash('sha256').update(parts.join('\n')).digest('hex'), heads }
}

/**
 * Where a session's baseline signature lives.
 *
 * Keyed on the session id so two sessions in one workspace never read each
 * other's baseline — the boot facts they were each given are different.
 *
 * ⚠ Lives in `lib/`, not in the hook that consumes it: `bin/aim-facts.mjs`
 * seeds the baseline and `bin/corpus-delta.mjs` reads it, and importing one bin
 * from another would execute its top-level hook body.
 *
 * @param {string|undefined} sessionId
 * @param {string} [tmpdir]
 */
export function deltaStatePath(sessionId, tmpdir = os.tmpdir()) {
  const safe = String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
  return path.join(tmpdir, `aim-corpus-delta-${safe}.json`)
}

/**
 * A digest of what the working-tree layer would SAY, independent of how it is
 * phrased or of which bytes moved.
 *
 * ⚠ This is the gate that separates 「corpus が動いた」 from 「事実が変わった」.
 * Editing an aim body moves the signature and changes nothing here: the node is
 * still uncommitted, the count of nodes carrying a `[todo]` is still the same.
 * `aim-upkeep` puts the machine layer at *visibility*, and a surface that
 * re-states itself on every batch stops being visible.
 *
 * ⚠ HEAD is deliberately absent. Commit movement is a different question with a
 * different cost (the history fences), and folding it in here would make every
 * unrelated code commit look like an aim fact changing.
 *
 * @param {{label: string, working?: object[], backlog?: object}[]} repos
 * @returns {string}
 */
export function factsDigest(repos) {
  const norm = (repos ?? [])
    .map((r) => ({
      label: r.label,
      // ⚠ `unavailable` must not hash the same as a clean tree. Gate 2 asks
      // "would the facts SAY anything different"; losing the ability to look
      // is a different thing to say, not the absence of one.
      working:
        r.working == null
          ? 'unavailable'
          : r.working
              .map((w) => [w.slug, !!w.uncommitted, !!w.uncommittedAnchorChange, !!w.untracked])
              .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      openTodo: r.backlog?.openTodoNodes ?? 0,
      unknown: [...(r.backlog?.unknownNodes ?? [])].sort(),
      anomalies: (r.backlog?.anomalies ?? [])
        .map((a) => [a.slug, a.kind, a.no, a.line])
        .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex')
}
