// The `tmai-aim-checkpoint-stale v1` fence — how far the repo has moved past
// the commit at which an operator last attested an aim's coherence with its
// code.
//
// Derived from:
//
//   aim-code-drift    Aimの主張は、それを実装したコードが後から動くことで、Aim側は
//                     不変のまま静かに剥離しうる。このaim⊥code driftは検査価値がある
//                     ものとして表面化でき、剥離したか否かの最終判断は、doneと同様に
//                     人間が担う。
//   aim-frontmatter   frontmatterには ... 人間が書く ... 目的が記載される
//   aim-upkeep        安い機械検知によって検査対象を可視化し ... 判断が必要な部分のみ
//                     を人間にエスカレーションする
//
// Three things follow and they are the whole design:
//
//   1. **The checkpoint is minted by a human act, never inferred.** `last-
//      verified` is the operator attesting coherence, the same ownership
//      `state` has. Absence is a FIRST-CLASS third state — not yet under
//      aim⊥code watch — and is neither drift nor clean. So the fence is sparse:
//      a node with no checkpoint contributes nothing, and is never backfilled
//      with a guess.
//   2. **What this measures is wall-clock, not footprint.** "実装したコードが
//      後から動く" is the drift; commits since the checkpoint are only evidence
//      that the repo moved, and the repo moving is not the aim's code moving.
//      Narrowing to the aim's own code needs the provenance join that
//      `aim-provenance-sync` owns and this layer does not have. ∴ this is a
//      WEAK candidate signal and must say so.
//   3. **It does not judge.** `aim-code-drift` gives the human the verdict, as
//      with `done`.
//
// ⚠ **No threshold.** Ordering is derivable — more movement is more reason to
// look. A floor is not: no aim statement names a number, and a tuned constant
// silently deletes candidates on the strength of nobody's stated judgment. The
// discipline asks for the inspection surface to be made VISIBLE, and a filter
// with no derivation shrinks it by luck. The count is emitted and the reader
// weighs it. **If fewer candidates are wanted, write the threshold down as a
// purpose first.**

import { runGit } from './git.mjs'

export const CHECKPOINT_FENCE_TAG = 'tmai-aim-checkpoint-stale v1'

/**
 * A plausible commit-ish. Guards against a `last-verified:` holding a date
 * (`2026-05-15`) rather than a SHA — the archived decision records use that
 * field for dates, so the confusion has a real precedent in this repo.
 */
export function isShaLike(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value)
}

/**
 * Gather checkpoint staleness for one repo.
 *
 * @param {string} repoRoot
 * @param {Map<string, {lastVerified: string|null}>} nodes live records
 * @returns {Promise<{slug: string, checkpointSha: string, commitsSince: number}[]>}
 */
export async function gatherCheckpointStale(repoRoot, nodes) {
  const items = []
  for (const [slug, record] of nodes) {
    const sha = record.lastVerified
    // Sparse by design: no checkpoint is the un-minted third state, not a zero.
    if (!sha) continue
    if (!isShaLike(sha)) {
      // A malformed checkpoint is louder than a missing one — someone minted
      // something and the sensor cannot read it. Never silently skipped.
      items.push({ slug, checkpointSha: sha, commitsSince: null })
      continue
    }
    const out = await runGit(repoRoot, ['rev-list', '--count', `${sha}..HEAD`])
    if (out === null) {
      // The checkpoint names a commit this repo does not have (a rewritten or
      // never-fetched history). Absent, not zero.
      items.push({ slug, checkpointSha: sha, commitsSince: null })
      continue
    }
    const n = Number.parseInt(out.trim(), 10)
    if (!Number.isFinite(n) || n === 0) continue
    items.push({ slug, checkpointSha: sha, commitsSince: n })
  }
  // Most-moved-first: the ordering IS derivable — more movement is more reason
  // to look — unlike the floor this deliberately does not apply.
  items.sort((a, b) => (b.commitsSince ?? Infinity) - (a.commitsSince ?? Infinity))
  return items
}

export function renderCheckpointFence(items) {
  const lines = [
    '```' + CHECKPOINT_FENCE_TAG,
    '# fields: slug | checkpoint_sha | commits_since',
  ]
  if (items.length === 0) {
    lines.push(
      '# none — no aim in this repo carries a `last-verified` checkpoint, or none has moved since',
    )
  } else {
    for (const it of items) {
      const n = it.commitsSince === null ? 'unreadable' : it.commitsSince
      lines.push(`${it.slug} | ${it.checkpointSha} | ${n}`)
    }
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
