// The `tmai-aim-working-delta v1` fence — the working-tree presence layer.
//
// What this layer states: working-tree changes are one of the two things a
// cheap mechanical sensor can see without judging anything. It reports presence
// and nothing else.
//
// The two notes below marked "kept for the comparison"
// below have therefore lost their reason and are now open decisions, flagged
// where they sit rather than silently acted on — changing what a fence says is
// a change to the contract, not a cleanup.
//
// PRESENCE only. Nothing here orders anything: a working tree has no commit
// timestamps, and emitting one would manufacture the false order judgment the
// design forbids. On commit a node's fact vanishes from this layer and the
// committed layer's real order judgment takes over.

import { runGit } from './git.mjs'
import { aimRelPath } from './corpus.mjs'

export const WORKING_DELTA_FENCE_TAG = 'tmai-aim-working-delta v1'

/**
 * Parse `git status --porcelain` output into the set of dirty repo-relative
 * paths.
 *
 * Each line is `XY <path>`, or `XY <old> -> <new>` for a rename — the
 * working-tree side (the last segment) is the one that matters. The slice at 3
 * drops the two status columns and the space after them.
 *
 * ⚠ **Open decision.** git quotes paths containing spaces or non-ASCII bytes
 * (`"docs/aims/a b.md"`), and this does not unquote them, so such a node reads
 * as clean rather than as wrong — a silent false negative. Aim slugs are
 * lowercase kebab-case by the guide, so the case does not arise in this corpus.
 * What keeps it standing is not caution but scope: fixing it changes what the
 * fence says, which is an operator-visible contract change and not a silent
 * cleanup.
 *
 * @param {string} out
 * @returns {Set<string>}
 */
export function parsePorcelainPaths(out) {
  const dirty = new Set()
  for (const line of out.split('\n')) {
    // A line shorter than the status prefix carries no path.
    if (line.length < 3) continue
    const rest = line.slice(3).trim()
    const path = rest.split(' -> ').pop().trim()
    dirty.add(path)
  }
  return dirty
}

/**
 * Does the working tree (staged + unstaged, vs HEAD) change this path's `aim:`
 * frontmatter line?
 *
 * The `+++`/`---` file headers cannot false-positive: stripping their first
 * byte leaves `++ …` / `-- …`, never `aim:`.
 *
 * @param {string} repoRoot
 * @param {string} relPath
 * @returns {Promise<boolean>}
 */
export async function workingAnchorChanged(repoRoot, relPath) {
  const out = await runGit(repoRoot, ['diff', '-U0', 'HEAD', '--', relPath])
  if (out === null) return false
  return out.split('\n').some((l) => {
    const rest = l.startsWith('+') || l.startsWith('-') ? l.slice(1) : null
    return rest !== null && rest.startsWith('aim:')
  })
}

/**
 * Every repo-relative path under `docs/aims/` that any commit has ever touched.
 *
 * Asking this per node, as `git log -1 -- <path>`, costs one process spawn per
 * aim node — 76 of them on a corpus that size, ~11s on Windows, well past the
 * hook's 20s timeout. One `git log` over the directory answers the same
 * question for every node at once. ⚠ Neither form follows renames (no
 * `--follow`): a node's history begins at its current path either way.
 *
 * ⚠ **A `null` from git is two different facts wearing one mask**, and telling
 * them apart is the whole job of the failure branch below. `git log` exits
 * non-zero in a repo with no commits yet — there, every node legitimately IS
 * untracked. It returns `null` just the same on timeout or spawn failure,
 * where we know NOTHING. Collapsing the second into the first published
 * `untracked: true` for all 77 nodes of a clean corpus (observed 2026-09-01)
 * — the positive form of the lie `git.mjs` forbids, whose contract only ever
 * spelled out the negative one ("never read null as no drift").
 *
 * ⚠ **Open decision.** This still walks the whole history, which is what
 * remains of the cost. `git ls-tree -r HEAD --name-only docs/aims/` would read
 * one tree instead and be far faster, but it answers a subtly different
 * question — "is this path in HEAD?" rather than "did any commit touch it?" —
 * and the two diverge for a node deleted and then recreated without a commit:
 * one calls it committed-and-dirty, the other untracked. Which question the
 * fence should ask is an operator call, not a silent optimisation.
 *
 * @param {string} repoRoot
 * @returns {Promise<Set<string>|null>} `null` when git could not be read
 */
async function committedAimPaths(repoRoot) {
  const out = await runGit(repoRoot, ['log', '--format=', '--name-only', '--', 'docs/aims/'])
  if (out !== null) {
    return new Set(
      out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
  }
  // The failure branch. Measured on Windows 2026-09-01: this call is 0.25s at
  // rest but 10-29s while an antivirus scanner works through a just-pulled
  // tree, against a 5s `GIT_TIMEOUT_MS` — so it is not hypothetical, and it
  // is the most expensive git call the plugin makes.
  //
  // Both probes run ONLY here, on a path the happy case never reaches, so the
  // normal run pays nothing for them.
  const head = await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  if (head !== null) return null // commits exist, so the log failed for real
  const gitDir = await runGit(repoRoot, ['rev-parse', '--git-dir'])
  if (gitDir === null) return null // git itself cannot be read
  return new Set() // git answers and HEAD is absent: genuinely no commits yet
}

/**
 * Gather the working-tree presence facts for one repo's aim nodes.
 *
 * The returned array is sparse and slug-sorted: only nodes with at least one
 * fact set appear. `null` — distinct from `[]` — means git could not be
 * read, and the fence says so in those words rather than rendering `# none`.
 * ⚠ The two used to collapse, and this docstring admitted it as "the one place
 * this layer breaks its own law", trusting the composer to state the
 * distinction above. That trust was misplaced twice over: the composer never
 * did, and the failure did not fall silent — it published every node as
 * `untracked`. **A layer that cannot observe must say so itself**; nothing
 * above it can.
 *
 * @param {string} repoRoot
 * @param {string[]} slugs slug-sorted, as `readAimSlugs` returns them
 * @returns {Promise<{slug: string, uncommitted: boolean, uncommittedAnchorChange: boolean, untracked: boolean}[]|null>} `null` when git could not be read
 */
export async function gatherWorkingDelta(repoRoot, slugs) {
  // No corpus, no facts — and no git either. Running the porcelain pass before
  // finding nothing to iterate is expensive in a repo with a large history: a
  // member repo that keeps no aims was costing ~4.7s of `git log` to say
  // `# none`. Skipping is
  // observationally identical.
  if (slugs.length === 0) return []

  // One porcelain pass for the whole directory; per-node facts derive from it.
  const status = await runGit(repoRoot, ['status', '--porcelain', '--', 'docs/aims/'])
  // `git status` succeeds in a repo with no commits, so its `null` is
  // unambiguous: git could not be read.
  if (status === null) return null
  const dirty = parsePorcelainPaths(status)
  const committedPaths = await committedAimPaths(repoRoot)
  if (committedPaths === null) return null

  const items = []
  for (const slug of slugs) {
    const rel = aimRelPath(slug)
    // `committed` is the same signal the drift layer reads: has any commit ever
    // touched this path? A staged-but-never-committed node that porcelain
    // reports as `A` rather than `??` is caught here, not by the porcelain pass.
    const committed = committedPaths.has(rel)
    const untracked = !committed
    const uncommitted = committed && dirty.has(rel)
    const uncommittedAnchorChange = uncommitted && (await workingAnchorChanged(repoRoot, rel))
    if (uncommitted || untracked) {
      items.push({ slug, uncommitted, uncommittedAnchorChange, untracked })
    }
  }
  // Slug order: presence facts carry no time dimension to "sort recent first"
  // by — inventing one would be the false order judgment the design forbids.
  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return items
}

/**
 * Render the machine-parseable fence.
 *
 * Emitted unconditionally, `# none` and all: an empty block means "no records",
 * never "computed by a binary that predates this layer". Fixed field order,
 * ` | ` delimited, one record per line.
 *
 * @param {{slug: string, uncommitted: boolean, uncommittedAnchorChange: boolean, untracked: boolean}[]} items
 * @returns {string}
 */
export function renderWorkingDeltaFence(items) {
  if (items === null) {
    return (
      [
        '```' + WORKING_DELTA_FENCE_TAG,
        '# unavailable — git could not be read for this repo.',
        '# ⚠ Absent, NOT clean: do not read this as "no working-tree changes".',
        '```',
        '',
      ].join('\n') + '\n'
    )
  }
  const lines = [
    '```' + WORKING_DELTA_FENCE_TAG,
    '# fields: slug | uncommitted | uncommitted_anchor_change | untracked',
  ]
  if (items.length === 0) {
    lines.push('# none — no uncommitted working-tree aim changes for this repo at compose time')
  } else {
    for (const it of items) {
      lines.push(
        `${it.slug} | ${it.uncommitted} | ${it.uncommittedAnchorChange} | ${it.untracked}`,
      )
    }
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
