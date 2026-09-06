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
import { aimRelPath, readAimGraph, DEFAULT_AIMS_DIR } from './corpus.mjs'
// ⚠ 判定を再実装しない: 「sha として妥当か」の正本は checkpoint 側に既に在り、二重に
// 書けば片方だけが直る日が来る。
import { isShaLike } from './checkpoint.mjs'

export const INTRA_FENCE_TAG = 'bearing-drift-intra v1'
export const INTER_FENCE_TAG = 'bearing-drift-inter v1'

// ⚠ **在り処は project が宣言する** ∴ ここに焼かない（既定は `corpus.mjs` が持つ）。
const dirPrefix = (dir) => `${dir}/`
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
export function isAimPath(p, dir = DEFAULT_AIMS_DIR) {
  const prefix = dirPrefix(dir)
  return (
    p.startsWith(prefix) &&
    p.endsWith('.md') &&
    !p.slice(prefix.length).includes('/') &&
    !p.endsWith('/README.md')
  )
}

const slugOfPath = (p, dir) => p.slice(dirPrefix(dir).length, -3)

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
export async function bodyMovedIn(repoRoot, sha, slug, dir = DEFAULT_AIMS_DIR) {
  const out = await runGit(repoRoot, ['show', '--format=', '-U0', sha, '--', aimRelPath(slug, dir)])
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
export async function gatherDrift(repoRoot, dir = DEFAULT_AIMS_DIR) {
  const graph = await readAimGraph(repoRoot, dir)
  if (graph === null) return null

  const anyOut = await runGit(repoRoot, ['log', '--format=%H', '--name-only', '--', dirPrefix(dir)])
  // --diff-filter=AM を取り、そこから各 node の誕生を除くことで M を導く。
  // ⚠ anchor に対する `-G` だけでは、anchor が*変更された*ことと*出現した*ことを分離
  // できない: file の作成は一致する行を足すので、誕生したままの node が全部発火する。
  // 実測: これを入れる前は 77 中 44 候補、入れた後は 3 候補。
  const ancOut = await runGit(repoRoot, [
    'log', '--format=%H', '--name-only', '--diff-filter=AM', '-G', '^aim:', '--', dirPrefix(dir),
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
    const slugs = c.files
      .filter((f) => isAimPath(f, dir))
      .map((f) => slugOfPath(f, dir))
      .filter((s) => live.has(s))
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
  const brokenCollations = []
  // ⚠ **絞り込みが何件に対して働いたかを数える。** 候補 0 件には出自の異なる 2 つが
  // 畳まれている ——「見たが残らなかった」と「見るものが無かった」であり、後者では
  // **絞り込みは一度も走っていない** ∴ 沈黙を「健全」と読ませてはならない。
  let intraScanned = 0
  let interScanned = 0
  for (const slug of [...live.keys()].sort()) {
    const anchor = lastAnchorTouch.get(slug)
    if (!anchor) continue

    // intra: anchor が*変更*され（誕生 commit ではなく）、以後何も無いもの。
    const anchorChanged = anchor !== birth.get(slug)
    if (anchorChanged) intraScanned++
    if (anchorChanged && lastTouch.get(slug) === anchor) {
      intra.push({ slug, commit: anchor, bodyMoved: await bodyMovedIn(repoRoot, anchor, slug) })
    }

    // inter: anchor が触られた時点より厳密に古い隣接 —— まだ機会を得ていないもの。
    const anchorOrder = order.get(anchor)
    const co = touchedIn.get(anchor) ?? new Set()
    const { collated, broken } = readCollations(live.get(slug), order)
    for (const b of broken) brokenCollations.push({ slug, ...b })
    const neighbours = graph.neighbours(slug)
    // ⚠ **隣接を持たない node は、この種のズレを原理的に生じえない** ∴ 絞り込みの母数に
    // 入れない —— 入れれば「見た」と数えたことになる。
    if (neighbours.length > 0) interScanned++
    const stale = neighbours.filter((n) => {
      if (co.has(n)) return false
      // ⚠ **照合済みの対は候補ではない。** 「検査したが変更不要だった」は何も動かさない
      // ∴ file の移動だけを見る絞り込みでは永久に落ちず、**既に見た者へ「見よ」と言い
      // 続ける**。それは可視化ではなく、注意予算への課税である。
      const at = collated.get(n)
      if (at !== undefined && at <= anchorOrder) return false
      const seen = lastTouch.get(n)
      return seen !== undefined && order.get(seen) > anchorOrder
    })
    if (stale.length > 0) inter.push({ slug, commit: anchor, stale: stale.sort() })
  }
  return { intra, inter, brokenCollations, scanned: { intra: intraScanned, inter: interScanned } }
}

/**
 * 1 つの node の照合記録を、aim 履歴の順序へ解決する。
 *
 * ⚠ **読めない記録は suppression に使わず、そのまま声にする。** 誰かが証言を鋳造したのに
 * センサーが読めない —— これは記録が無い状態より悪く、黙って飛ばせば「照合したのに flag が
 * 消えない」という、原因の見えない不信だけが残る（`checkpoint.mjs` が同じ理由で同じ形を
 * 採っている）。
 *
 * ⚠ **短縮 sha が複数に一致したら読めない扱いである。** 曖昧な証言は証言ではない。
 */
function readCollations(record, order) {
  const collated = new Map()
  const broken = []
  for (const c of record?.collations ?? []) {
    // ⚠ **`neighbour` へ改名して持つ。** 記録の `slug` は*隣接*の名であり、呼び出し側は
    // そこへ*この node* の名を足す —— 同じ key 名のまま spread すると、node の名が隣接の
    // 名に黙って潰れ、fence が「誰の記録が読めないのか」を取り違えて述べる。
    if (!isShaLike(c.sha)) {
      broken.push({ neighbour: c.slug, sha: c.sha, why: 'sha ではない' })
      continue
    }
    const hits = order.has(c.sha) ? [c.sha] : [...order.keys()].filter((f) => f.startsWith(c.sha))
    if (hits.length !== 1) {
      // ⚠ 0 件は「aim を触っていない commit を書いた」場合を含む —— 照合には fence が
      // 出した anchor_commit をそのまま書くこと、が canon の求めである。
      broken.push({
        neighbour: c.slug,
        sha: c.sha,
        why: hits.length === 0 ? 'aim 履歴に無い' : '短縮 sha が曖昧',
      })
      continue
    }
    const at = order.get(hits[0])
    // 同じ隣接に複数の照合が在れば、最も新しいもの（order が小さい）が効く。
    const prev = collated.get(c.slug)
    collated.set(c.slug, prev === undefined ? at : Math.min(prev, at))
  }
  return { collated, broken }
}

const short = (sha) => sha.slice(0, 8)

/**
 * 候補 0 件の 1 行を組む。
 *
 * 🔴 **「ズレ無し」と「噛む履歴が無い」は、同じ空欄で出してはならない。** 履歴の浅い
 * corpus では絞り込みが一度も走らないのに、fence は「すべて照合済みである」と述べて
 * いた —— ⚠ **沈黙が健全さの証言に化ける形**であり、この機構が他の面で一貫して拒んで
 * きたものと同じである。
 *
 * ⚠ **`scanned` を知らない呼び出しは、どちらとも述べない。** 知らないことを「ズレ無し」
 * へ畳むのは、`bodyMoved` の `null` を `false` へ畳むのと同じ嘘である。
 *
 * @param {number|null} scanned 絞り込みが働いた母数。`null` は「記録されていない」
 * @param {string} empty 母数が 0 のときの理由
 * @param {string} clean 母数が 1 以上あり、そのうえで残らなかったときの理由
 */
function noneLine(scanned, empty, clean) {
  if (scanned === null || scanned === undefined) {
    return '# none — 絞り込みが何件に対して働いたかが記録されていない ∴ ズレ無しとは読めない'
  }
  return `# none — ${scanned === 0 ? empty : clean}`
}

/**
 * @param {{slug: string, commit: string, bodyMoved: boolean|null}[]} items
 * @param {number|null} scanned `gatherDrift` の `scanned.intra`
 */
export function renderIntraFence(items, scanned = null) {
  const lines = [FENCE + INTRA_FENCE_TAG, '# fields: slug | anchor_commit | body_moved']
  if (items.length === 0) {
    lines.push(
      noneLine(
        scanned,
        'anchor が変更された record がまだ 1 つも無い ∴ この種のズレはまだ生じえない',
        'anchor が変更され、以後そのまま放置された record は無い',
      ),
    )
  } else {
    for (const it of items) {
      const moved = it.bodyMoved === null ? 'unknown' : String(it.bodyMoved)
      lines.push(`${it.slug} | ${short(it.commit)} | ${moved}`)
    }
  }
  lines.push(FENCE, '')
  return lines.join('\n') + '\n'
}

/**
 * @param {{slug: string, commit: string, stale: string[]}[]} items
 * @param {{slug: string, slug2?: string, sha: string, why: string}[]} broken 読めない照合記録
 * @param {number|null} scanned `gatherDrift` の `scanned.inter`
 */
export function renderInterFence(items, broken = [], scanned = null) {
  const lines = [
    FENCE + INTER_FENCE_TAG,
    '# fields: slug | anchor_commit | unreconciled_neighbours (comma-separated)',
  ]
  // ⚠ **読めない照合記録は、候補の一覧より先に出す。** 候補が減っていること自体がこの
  // 記録に依存しており、記録が読めないなら「減っていない」ではなく「減ったかどうかが
  // 分からない」が正しい —— それを一覧の後ろに置くと、読み手は先に一覧を信じる。
  for (const b of broken) {
    lines.push(`# ⚠ 読めない照合記録: ${b.slug} が [[${b.neighbour}]] @ ${b.sha} —— ${b.why}`)
  }
  if (items.length === 0) {
    lines.push(
      noneLine(
        scanned,
        'anchor 履歴と隣接の両方を持つ record がまだ無い ∴ この種のズレはまだ生じえない',
        '変更された anchor の隣接は、すべてその後に動いているか照合済みである',
      ),
    )
  } else {
    for (const it of items) {
      lines.push(`${it.slug} | ${short(it.commit)} | ${it.stale.join(',')}`)
    }
  }
  lines.push(FENCE, '')
  return lines.join('\n') + '\n'
}
