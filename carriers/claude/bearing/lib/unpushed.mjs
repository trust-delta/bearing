// `bearing-unpushed v1` fence —— commit 済だが remote に届いていない aim の変更。
//
// 導出元の前提:
//
//   知識の越境    開発で得た知識は、それを得たマシンや会話に閉じず、次に判断する人へ届く
//   事実の出所    ローカル git を ground truth とし、その履歴を最大限に使う
//
// この 2 つが、事実そのものと「なぜセッションの注意に値するか」の両方を決めている。
// HEAD と `@{upstream}` の間に座っている aim の変更は、**commit されている**（∴
// working-delta の層には出ない）が、**越境していない**（∴ 次に判断する人には見えない）
// 知識である。⚠ **これは両端から不可視になる唯一の aim 状態である**: remote はそれを
// 持たず、working tree の読み手にはそれが確定した履歴として見える。
//
// ⚠ セッションにとって重要な理由はもう 1 つある: **baton は forward に選ばれる** ∴
// 道中どう aim を触ったかを構造的に過少報告する。この fence は、baton が落とす後ろ向きの
// trace を運ぶ。
//
// upstream が無い場合（一度も push されていない branch、remote を持たない repo）に得ら
// れるのは「事実が無い」であって「事実が 0 件」ではない。`@{upstream}` が失敗し `runGit`
// が null に潰れる。⚠ 呼び出し側はこれを他の全ての場所と同様に「見に行けなかった」と
// 読まねばならない。

import { runGit } from './git.mjs'
import { readAimSlugs } from './corpus.mjs'

export const UNPUSHED_FENCE_TAG = 'bearing-unpushed v1'

const AIMS_DIR = 'docs/aims/'

/**
 * `--format=%H%x09%cI --name-only` を `{sha, date, files}` の列（新しい順）に parse する。
 *
 * ⚠ author date ではなく **committer date** を使う: この fence が測っているのは変更が
 * *この*履歴に入った時点であり、rebase や cherry-pick は「知識が越境しなくなった時点」に
 * ついて何も語らない author date をそのまま保つからである。
 */
export function parseUnpushedLog(out) {
  const commits = []
  let current = null
  for (const line of out.split(/\r?\n/)) {
    const head = line.match(/^([0-9a-f]{40})\t(.+)$/)
    if (head) {
      current = { sha: head[1], date: head[2], files: [] }
      commits.push(current)
    } else if (line.trim() !== '' && current) {
      current.files.push(line.trim())
    }
  }
  return commits
}

/**
 * 1 つの repo について未 push の aim 事実を集める。
 *
 * @param {string} repoRoot
 * @param {string[]} slugs 生きた slug。履歴の幽霊を濾すために渡す
 * @returns {Promise<{slug: string, aheadCommits: number, latestSha: string, latestDate: string}[]|null>}
 */
export async function gatherUnpushed(repoRoot, slugs) {
  if (slugs.length === 0) return []
  const live = new Set(slugs)
  const out = await runGit(repoRoot, [
    'log', '@{upstream}..HEAD', '--format=%H%x09%cI', '--name-only', '--', AIMS_DIR,
  ])
  // null は「比較対象の upstream が無い」であることも「git が失敗した」であることも
  // 同じくらいあるが、ここでは両者は同じ答えである: 事実が無い。
  if (out === null) return null

  const perSlug = new Map()
  for (const c of parseUnpushedLog(out)) {
    for (const f of c.files) {
      if (!f.startsWith(AIMS_DIR) || !f.endsWith('.md')) continue
      const slug = f.slice(AIMS_DIR.length, -3)
      // 生きた corpus と交差させる: 履歴は rename と削除が奪った path を運んでおり、
      // それを報告することは幽霊を報告することである。
      if (slug.includes('/') || !live.has(slug)) continue
      const seen = perSlug.get(slug)
      // 新しい順ゆえ、ある slug の最初の出現がその最新 commit である。
      if (seen) seen.aheadCommits++
      else perSlug.set(slug, { slug, aheadCommits: 1, latestSha: c.sha, latestDate: c.date })
    }
  }
  return [...perSlug.values()].sort((a, b) =>
    a.latestDate === b.latestDate
      ? a.slug < b.slug ? -1 : 1
      : a.latestDate < b.latestDate ? 1 : -1,
  )
}

/**
 * fence を描画する。
 *
 * ⚠ **`null`（見に行けなかった）と `[]`（見に行って、何も無かった）は同じ行を出しては
 * ならない。** 「upstream が無い」は読み手が必要としうる *repo についての*事実であり、
 * 「未 push の aim が無い」は *corpus についての*事実である。両者を潰すことは、
 * `git.mjs` が禁じている沈黙そのものである。
 */
export function renderUnpushedFence(items) {
  const lines = [
    '```' + UNPUSHED_FENCE_TAG,
    '# fields: slug | ahead_commits | latest_sha | latest_date',
  ]
  if (items === null) {
    lines.push('# none — この repo に比較対象の upstream が無い（あるいは git を読めなかった）')
  } else if (items.length === 0) {
    lines.push('# none — 構成時点で、この repo に未 push の aim commit は無い')
  } else {
    for (const it of items) {
      lines.push(`${it.slug} | ${it.aheadCommits} | ${it.latestSha.slice(0, 8)} | ${it.latestDate}`)
    }
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
