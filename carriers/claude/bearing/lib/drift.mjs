// drift 可能性の fence —— 目的から導出したものであって、移植ではない。
//
// 形を決めているのは 3 つの前提である:
//
//   層の分割    安い機械検知が検査対象を可視化し、高コストなエージェントが検査と
//               自明な保守を行い、判断を要する部分だけを人間へ escalate する
//   drift の源  既存 aim の変更、あるいは新規 aim の作成によって、同一 aim 内でも
//               aim 同士でも不整合が生じうる。この「可能性」は git 履歴から得られる
//               事実だけで機械的・安価に表面化できる
//   事実の出所  ローカル git を ground truth とし、その履歴（commit・行レベルの
//               timestamp / diff / blame）を最大限に使う
//
// ∴ この層は候補を**可視化するだけ**である。採点もしなければ、ある node が drift した
// と述べることもしない —— 述べられるのは「drift の可能性」までで、採点はエージェントの、
// 判断は人間の仕事である。種類が 2 つあるのは、不整合の生じ方が 2 通りあるからで、
// ⚠ **2 つは trigger を共有しない**:
//
//   intra — body と、それ自身の anchor との間。⚠ anchor が*変更*されたときにのみ
//           この隙間が開く。誕生時には body は anchor と一緒に書かれている。
//   inter — 隣接との間。⚠ こちらは*作成*も trigger であり、しかもそれが最も多い形
//           である —— 親を動かさずに子を足す、という形。
//
// 絞り込みは両者で同じであり、調整された定数を含まない: 変更と同時か、それより後に
// 動いた隣接は、その変更を吸収する機会を既に得ている ∴ 厳密に古いものだけが候補になる。
// 実測では、trigger と絞り込みの合成で候補 57 node（287 対）が 15 node（59 対）になった。

import { runGit } from './git.mjs'
import { aimRelPath, readAimGraph } from './corpus.mjs'

export const INTRA_FENCE_TAG = 'bearing-drift-intra v1'
export const INTER_FENCE_TAG = 'bearing-drift-inter v1'

const AIMS_DIR = 'docs/aims/'
const FENCE = '`'.repeat(3)

/**
 * `--format=%H --name-only` の出力を commit の列（新しい順）に parse する。
 *
 * ⚠ file 単位ではなく batch である: node ごとに呼ぶ形は node 数だけ process を起こす。
 * これは同じ問いを corpus 全体について 1 回で答える。
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

/** この path は生きた aim record か。`_guide/` と README は record ではない。 */
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
 * この commit で frontmatter の外の行が動いたか。
 *
 * 行レベルの diff は事実の出所として明示的に許されている。⚠ 問うのは候補だけで、
 * corpus 全体には決して問わない —— batch pass が既に 77 を数個まで絞っており、
 * それが node ごとの呼び出しを成立させている。
 *
 * ⚠ **ここが正直に報告できるのは body の*行*が動いたかであって、body が目的へ引き戻
 * されたかではない。** 1 行の re-parent メモは行を動かすが、何も整合させない。採点は
 * エージェントの仕事であり、ここは事実を述べるだけである。
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
 * 2 種類の候補を集める: git への batch pass 2 回、そのあと intra 候補 1 件につき 1 回。
 *
 * ⚠ **git の失敗はすべて `null` に潰れる。呼び出し側はこれを「事実が無い」と読まねば
 * ならず、「drift が無い」と読んではならない** —— `git.mjs` が述べている契約であり、
 * この層に許された唯一の非対称である。
 */
export async function gatherDrift(repoRoot) {
  const graph = await readAimGraph(repoRoot)
  if (graph === null) return null

  const anyOut = await runGit(repoRoot, ['log', '--format=%H', '--name-only', '--', AIMS_DIR])
  // --diff-filter=AM を取り、そこから各 node の誕生を除くことで M を導く。
  // ⚠ anchor に対する `-G` だけでは、anchor が*変更された*ことと*出現した*ことを分離
  // できない: file の作成は一致する行を足すので、誕生したままの node が全部発火する。
  // 実測: これを入れる前は 77 中 44 候補、入れた後は 3 候補。
  const ancOut = await runGit(repoRoot, [
    'log', '--format=%H', '--name-only', '--diff-filter=AM', '-G', '^aim:', '--', AIMS_DIR,
  ])
  if (anyOut === null || ancOut === null) return null

  const anyLog = parseCommitLog(anyOut)
  const ancLog = parseCommitLog(ancOut)
  const live = graph.nodes
  const order = new Map()
  anyLog.forEach((c, i) => order.set(c.sha, i))

  // git を*現在の* corpus と交差させる。⚠ 履歴は corpus がもう持たない path を運ぶ
  // ——  rename と削除 —— のでそれを数えると幽霊を報告することになる: 実在 77 に対し
  // 「anchor 履歴を持つ node」が 103 になった。
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
        if (live.has(s)) m.set(s, c.sha) // 新しい順ゆえ、最後の書き込みが最古の commit
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

    // intra: anchor が*変更*され（誕生 commit ではなく）、以後何も無いもの。
    if (anchor !== birth.get(slug) && lastTouch.get(slug) === anchor) {
      intra.push({ slug, commit: anchor, bodyMoved: await bodyMovedIn(repoRoot, anchor, slug) })
    }

    // inter: anchor が触られた時点より厳密に古い隣接 —— まだ機会を得ていないもの。
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
    lines.push('# none — anchor が変更され、以後そのまま放置された record は無い')
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
    lines.push('# none — 変更された anchor の隣接は、すべてその後に動いている')
  } else {
    for (const it of items) {
      lines.push(`${it.slug} | ${short(it.commit)} | ${it.stale.join(',')}`)
    }
  }
  lines.push(FENCE, '')
  return lines.join('\n') + '\n'
}
