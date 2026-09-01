// `bearing-checkpoint-stale v1` fence —— 人間が「この aim は自らの code と整合して
// いる」と最後に証言した commit から、repo がどれだけ先へ動いたか。
//
// 導出元の前提:
//
//   aim⊥code drift   aim の主張は、それを実装した code が後から動くことで、aim 側は
//                    不変のまま静かに剥離しうる。この剥離は「検査する価値がある」もの
//                    として表面化でき、剥離したか否かの最終判断は `done` と同様に人間が
//                    担う
//   frontmatter の所有  frontmatter には人間が書く目的が載る
//   層の分割         安い機械検知が検査対象を可視化し、判断を要する部分だけを人間へ
//                    escalate する
//
// ここから 3 つが従い、それが設計の全てである:
//
//   1. **checkpoint は人間の act によって鋳造されるのであって、推論されない。**
//      `last-verified` は 人間が整合を証言したものであり、所有は `state:` と同じ。
//      ⚠ **不在は一級の第 3 状態である** —— まだ aim⊥code の監視下に無い —— のであって、
//      drift でも clean でもない。∴ この fence は疎である: checkpoint を持たない node は
//      何も寄与せず、推測で埋め戻されることも決して無い。
//   2. **ここが測っているのは経過であって、footprint ではない。** drift は「実装した
//      code が後から動く」ことだが、checkpoint 以後の commit 数が示すのは *repo が動いた*
//      ことだけであり、⚠ **repo が動くことは、その aim の code が動くことではない。**
//      aim 自身の code へ絞るには provenance の join が要り、この層はそれを持たない。
//      ∴ **これは弱い候補シグナルであり、そう述べなければならない。**
//   3. **判定しない。** verdict は `done` と同じく人間のものである。
//
// ⚠ **閾値を持たない。** 順序は導出できる —— より多く動いたものほど見る理由が強い。
// **だが下限は導出できない**: 数を名指す目的の文が存在せず、調整された定数は「誰も述べて
// いない判断」を根拠に候補を黙って削除する。規律が求めているのは検査面を**可視化する**
// ことであり、導出を持たない filter はそれを運任せで縮める。数は出し、重みづけは読み手が
// 行う。⚠ **候補を減らしたいなら、まず閾値を目的として書くこと。**

import { runGit } from './git.mjs'

export const CHECKPOINT_FENCE_TAG = 'bearing-checkpoint-stale v1'

/**
 * commit-ish として妥当か。`last-verified:` が SHA ではなく日付（`2026-05-15`）を
 * 持っている場合を弾く —— ⚠ この取り違えには実際の前例がある。
 */
export function isShaLike(value) {
  return typeof value === 'string' && /^[0-9a-f]{7,40}$/.test(value)
}

/**
 * 1 つの repo について checkpoint の陳腐化を集める。
 *
 * @param {string} repoRoot
 * @param {Map<string, {lastVerified: string|null}>} nodes 生きた record
 * @returns {Promise<{slug: string, checkpointSha: string, commitsSince: number}[]>}
 */
export async function gatherCheckpointStale(repoRoot, nodes) {
  const items = []
  for (const [slug, record] of nodes) {
    const sha = record.lastVerified
    // 設計として疎である: checkpoint 不在は「まだ鋳造されていない」第 3 状態であって 0 ではない。
    if (!sha) continue
    if (!isShaLike(sha)) {
      // ⚠ 壊れた checkpoint は、無い checkpoint よりも声が大きい —— 誰かが何かを鋳造
      // したのに、センサーがそれを読めない。黙って飛ばしてはならない。
      items.push({ slug, checkpointSha: sha, commitsSince: null })
      continue
    }
    const out = await runGit(repoRoot, ['rev-list', '--count', `${sha}..HEAD`])
    if (out === null) {
      // checkpoint が、この repo に無い commit を名指している（rewrite された履歴か、
      // 一度も fetch されていない履歴）。⚠ 0 ではなく「不在」である。
      items.push({ slug, checkpointSha: sha, commitsSince: null })
      continue
    }
    const n = Number.parseInt(out.trim(), 10)
    if (!Number.isFinite(n) || n === 0) continue
    items.push({ slug, checkpointSha: sha, commitsSince: n })
  }
  // 動いた順に並べる: 順序は導出できる —— より多く動いたものほど見る理由が強い ——
  // 一方、この層が意図的に適用しない「下限」の方は導出できない。
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
      '# none — この repo の aim は `last-verified` checkpoint を持たないか、以後どれも動いていない',
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
