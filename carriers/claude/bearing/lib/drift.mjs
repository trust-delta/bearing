// The drift-possibility fences — derived from the `aim:` statements, not ported.
//
// Three statements settle the shape between them:
//
//   aim-upkeep    安い機械検知によって検査対象を可視化し、高コストであるエージェント
//                 によって検査実施および自明な保守を行い、判断が必要な部分のみを人間
//                 にエスカレーションする
//   drift-git     既存Aimの変更や新規Aimの作成によって、同Aim内あるいはAim同士で ...
//                 この「drift可能性」は ... git履歴から得られる事実に基づいて機械的に
//                 安く表面化できる
//   git-local-fact-source  ローカルgitをground-truthとし、その履歴（commit・行レベル
//                 の timestamp / diff / blame）は ... 最大限活用する
//
// So this layer only makes candidates VISIBLE. It never grades them and never
// says a node has drifted — drift-git says "drift 可能性", the grading is the
// agent's and the judgment is the human's. Two kinds, because drift-git names
// two, and they do not share a trigger:
//
//   intra — the body against its own anchor. Only a *modified* anchor opens
//           this gap; at birth the body is written with the anchor.
//   inter — the neighbours. Here creation IS a trigger, and the common one: a
//           child added without its parent moving.
//
// Both narrow the same way, and the rule carries no tuned constant: a neighbour
// that moved at or after the change has had its chance to absorb it, so only
// the strictly older ones are candidates. Measured on this corpus, the trigger
// and the narrowing compose from 57 candidate nodes (287 pairs) down to 15 (59).

import { runGit } from './git.mjs'
import { aimRelPath, readAimGraph } from './corpus.mjs'

export const INTRA_FENCE_TAG = 'bearing-drift-intra v1'
export const INTER_FENCE_TAG = 'bearing-drift-inter v1'

const AIMS_DIR = 'docs/aims/'
const FENCE = '`'.repeat(3)

/**
 * Parse `--format=%H --name-only` into commits, newest first.
 *
 * Batch, not per file: the per-node form costs one process per node, and this
 * answers the same question for the whole corpus in one.
 */
export function parseCommitLog(out) {
  const commits = []
  let current = null
  for (const line of out.split(/\r?\n/)) {
    if (/^[0-9a-f]{40}$/.test(line)) {
      current = { sha: line, files: [] }
      commits.push(current)
    } else if (line.trim() !== '' && current) {
      current.files.push(line.trim())
    }
  }
  return commits
}

/** Is this path a live aim record? `_guide/` and README are not records. */
export function isAimPath(p) {
  return (
    p.startsWith(AIMS_DIR) &&
    p.endsWith('.md') &&
    !p.slice(AIMS_DIR.length).includes('/') &&
    !p.endsWith('/README.md')
  )
}

const slugOfPath = (p) => p.slice(AIMS_DIR.length, -3)

/**
 * Did any line outside the frontmatter change in this commit?
 *
 * `git-local-fact-source` licenses line-level diff explicitly. Only candidates
 * are asked, never the whole corpus — the batch passes have already narrowed 77
 * to a handful, which is what makes a per-node call affordable.
 *
 * ⚠ What this can honestly report is whether body LINES moved, not whether the
 * body was brought back to the purpose. A one-line re-parent note moves a line
 * and realigns nothing. The grading belongs to the agent; this states the fact.
 */
export async function bodyMovedIn(repoRoot, sha, slug) {
  const out = await runGit(repoRoot, ['show', '--format=', '-U0', sha, '--', aimRelPath(slug)])
  if (out === null) return null
  for (const line of out.split(/\r?\n/)) {
    if (!/^[+-]/.test(line) || /^(\+\+\+|---)/.test(line)) continue
    const content = line.slice(1)
    if (/^(aim|parent|state):/.test(content) || content.trim() === '---') continue
    return true
  }
  return false
}

/**
 * Gather both kinds of candidate: two batch passes over git, then one call per
 * intra candidate.
 *
 * Every git failure collapses to `null`, and a caller must read that as "no
 * facts", never as "no drift" — the contract `git.mjs` states, and the only
 * asymmetry this layer is granted.
 */
export async function gatherDrift(repoRoot) {
  const graph = await readAimGraph(repoRoot)
  if (graph === null) return null

  const anyOut = await runGit(repoRoot, ['log', '--format=%H', '--name-only', '--', AIMS_DIR])
  // --diff-filter=AM, with M derived from it by excluding each node's birth.
  // `-G` on the anchor alone does NOT separate an anchor being changed from one
  // appearing: creating a file adds a line that matches, so every node still
  // sitting as it was born would fire. Measured on this corpus: 44 candidates
  // of 77 before this, 3 after.
  const ancOut = await runGit(repoRoot, [
    'log', '--format=%H', '--name-only', '--diff-filter=AM', '-G', '^aim:', '--', AIMS_DIR,
  ])
  if (anyOut === null || ancOut === null) return null

  const anyLog = parseCommitLog(anyOut)
  const ancLog = parseCommitLog(ancOut)
  const live = graph.nodes
  const order = new Map()
  anyLog.forEach((c, i) => order.set(c.sha, i))

  // Intersect git with the CURRENT corpus. History carries paths the corpus no
  // longer has — renames and deletions — and counting them reports on ghosts:
  // 103 nodes "with anchor history" against the 77 that exist.
  const touchedIn = new Map()
  for (const c of anyLog) {
    const slugs = c.files.filter(isAimPath).map(slugOfPath).filter((s) => live.has(s))
    touchedIn.set(c.sha, new Set(slugs))
  }
  const newestPerSlug = (log) => {
    const m = new Map()
    for (const c of log) {
      for (const f of c.files) {
        if (!isAimPath(f)) continue
        const s = slugOfPath(f)
        if (live.has(s) && !m.has(s)) m.set(s, c.sha)
      }
    }
    return m
  }
  const birthPerSlug = (log) => {
    const m = new Map()
    for (const c of log) {
      for (const f of c.files) {
        if (!isAimPath(f)) continue
        const s = slugOfPath(f)
        if (live.has(s)) m.set(s, c.sha) // newest-first, so the last write is the oldest commit
      }
    }
    return m
  }
  const lastTouch = newestPerSlug(anyLog)
  const lastAnchorTouch = newestPerSlug(ancLog)
  const birth = birthPerSlug(anyLog)

  const intra = []
  const inter = []
  for (const slug of [...live.keys()].sort()) {
    const anchor = lastAnchorTouch.get(slug)
    if (!anchor) continue

    // intra: a MODIFIED anchor (not the birth commit) with nothing since.
    if (anchor !== birth.get(slug) && lastTouch.get(slug) === anchor) {
      intra.push({ slug, commit: anchor, bodyMoved: await bodyMovedIn(repoRoot, anchor, slug) })
    }

    // inter: neighbours strictly older than the anchor touch — no chance yet.
    const anchorOrder = order.get(anchor)
    const co = touchedIn.get(anchor) ?? new Set()
    const stale = graph.neighbours(slug).filter((n) => {
      if (co.has(n)) return false
      const seen = lastTouch.get(n)
      return seen !== undefined && order.get(seen) > anchorOrder
    })
    if (stale.length > 0) inter.push({ slug, commit: anchor, stale: stale.sort() })
  }
  return { intra, inter }
}

const short = (sha) => sha.slice(0, 8)

export function renderIntraFence(items) {
  const lines = [FENCE + INTRA_FENCE_TAG, '# fields: slug | anchor_commit | body_moved']
  if (items.length === 0) {
    lines.push('# none — no record has had its anchor modified and been left untouched since')
  } else {
    for (const it of items) {
      const moved = it.bodyMoved === null ? 'unknown' : String(it.bodyMoved)
      lines.push(`${it.slug} | ${short(it.commit)} | ${moved}`)
    }
  }
  lines.push(FENCE, '')
  return lines.join('\n') + '\n'
}

export function renderInterFence(items) {
  const lines = [
    FENCE + INTER_FENCE_TAG,
    '# fields: slug | anchor_commit | unreconciled_neighbours (comma-separated)',
  ]
  if (items.length === 0) {
    lines.push('# none — every neighbour of a changed anchor has moved since')
  } else {
    for (const it of items) {
      lines.push(`${it.slug} | ${short(it.commit)} | ${it.stale.join(',')}`)
    }
  }
  lines.push(FENCE, '')
  return lines.join('\n') + '\n'
}
