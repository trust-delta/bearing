// `bearing-working-delta v1` fence —— working tree の presence 層。
//
// この層が述べること: working tree の変更は、安い機械センサーが何も判定せずに見られる
// 2 つのうちの 1 つである。**presence を報告し、それ以外は何もしない。**
//
// ⚠ 下に「Open decision」と印を付けた箇所が 2 つある。どちらも、直せば **fence が何を
// 述べるかが変わる** —— それは contract の変更であって cleanup ではない ∴ 黙って手を
// 入れず、その場に旗を立てたまま残してある。判断は operator のものである。
//
// ⚠ **presence のみ。ここは何の順序も付けない**: working tree には commit の timestamp が
// 無く、順序を出せばこの設計が禁じている偽の順序判断を製造することになる。commit された
// 瞬間に node の事実はこの層から消え、commit 側の層が持つ本物の順序判断が引き継ぐ。

import { runGit } from './git.mjs'
import { aimRelPath } from './corpus.mjs'

export const WORKING_DELTA_FENCE_TAG = 'bearing-working-delta v1'

/**
 * `git status --porcelain` の出力を、dirty な repo 相対 path の集合に parse する。
 *
 * 各行は `XY <path>`、rename なら `XY <old> -> <new>` —— 効くのは working tree 側
 * （最後の区間）である。3 での slice は status の 2 桁とその後の空白を落としている。
 *
 * ⚠ **Open decision.** git は空白や非 ASCII を含む path を quote する
 * （`"docs/aims/a b.md"`）が、ここは unquote しない ∴ **そういう node は「異常」ではなく
 * 「clean」と読まれる —— 黙った false negative である。** guide により aim の slug は
 * lowercase kebab-case なので、この corpus では該当が生じない。これを残しているのは
 * 慎重さではなく範囲の問題である: 直すと fence の述べることが変わり、それは operator に
 * 見える contract の変更であって、黙って行う cleanup ではない。
 *
 * @param {string} out
 * @returns {Set<string>}
 */
export function parsePorcelainPaths(out) {
  const dirty = new Set()
  for (const line of out.split('\n')) {
    // status の prefix より短い行は path を運んでいない。
    if (line.length < 3) continue
    const rest = line.slice(3).trim()
    const path = rest.split(' -> ').pop().trim()
    dirty.add(path)
  }
  return dirty
}

/**
 * working tree（staged ＋ unstaged、HEAD との比較）は、この path の `aim:` 行を変えるか。
 *
 * `+++` / `---` の file header が false positive を起こすことはない: 先頭 1 byte を剥ぐと
 * `++ …` / `-- …` が残り、`aim:` にはならない。
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
 * `docs/aims/` 配下で、いずれかの commit が一度でも触った repo 相対 path の全体。
 *
 * これを node ごとに `git log -1 -- <path>` で問う形は、aim node の数だけ process を
 * 起こす —— その規模の corpus で 76 回、Windows で約 11 秒、hook の 20 秒 timeout に
 * 十分近い。directory に対する 1 回の `git log` が、全 node について同じ問いに答える。
 * ⚠ どちらの形も rename を追わない（`--follow` 無し）: node の履歴はいずれにせよ現在の
 * path から始まる。
 *
 * ⚠ **git が返す `null` は、1 つの仮面を被った 2 つの異なる事実である。** その 2 つを
 * 区別することが、下の失敗分岐の仕事の全てである。commit が 1 つも無い repo では
 * `git log` が非 0 で終了する —— そこでは全 node が正当に untracked である。だが timeout
 * や spawn 失敗でも同じ `null` が返り、そのとき我々は**何も知らない**。後者を前者に潰した
 * 結果、clean な corpus の 77 node 全部が `untracked: true` として出荷された
 * （2026-09-01 に観測）。⚠ **これは `git.mjs` が禁じる嘘の肯定形であり、あの契約が明文化
 * していたのは否定形（「null を drift 無しと読むな」）だけだった。**
 *
 * ⚠ **Open decision.** ここはまだ履歴全体を歩いており、それが残っているコストである。
 * `git ls-tree -r HEAD --name-only docs/aims/` なら tree を 1 つ読むだけで遥かに速いが、
 * **微妙に違う問いに答える** ——「この path は HEAD に在るか」であって「いずれかの commit が
 * 触ったか」ではない。両者は「削除され、commit されないまま再作成された node」で食い違う:
 * 一方はそれを committed かつ dirty と呼び、他方は untracked と呼ぶ。**fence がどちらの
 * 問いを立てるべきかは operator の判断であって、黙って行う最適化ではない。**
 *
 * @param {string} repoRoot
 * @returns {Promise<Set<string>|null>} git を読めなかったときは `null`
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
  // 失敗分岐。⚠ Windows で 2026-09-01 に実測: この呼び出しは平時 0.25 秒だが、pull 直後の
  // tree をウイルス対策がスキャンしている間は 10〜29 秒かかり、`GIT_TIMEOUT_MS` は 5 秒
  // である ∴ **これは仮定の話ではなく、plugin が行う git 呼び出しの中で最も高価である。**
  //
  // 2 つの probe はここでのみ走る（正常系が決して到達しない path）∴ 通常の実行はこれらに
  // 何のコストも払わない。
  const head = await runGit(repoRoot, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  if (head !== null) return null // commit は在る ∴ log は本当に失敗した
  const gitDir = await runGit(repoRoot, ['rev-parse', '--git-dir'])
  if (gitDir === null) return null // git 自体が読めない
  return new Set() // git は答え、HEAD が無い: 本当にまだ commit が無い
}

/**
 * 1 つの repo の aim node について、working tree の presence 事実を集める。
 *
 * 返る配列は疎で slug 順である: 少なくとも 1 つの事実が立っている node だけが現れる。
 * `null` は —— `[]` とは別物として —— git が読めなかったことを意味し、fence は `# none` を
 * 描画せずその旨をその言葉で述べる。⚠ **かつてこの 2 つは潰れており**、この docstring は
 * それを「この層が自らの法を破る唯一の場所」と認めた上で、区別を述べる仕事を composer に
 * 委ねていた。**その信頼は二重に誤っていた**: composer は一度も述べなかったし、失敗は沈黙
 * すらしなかった —— 全 node を `untracked` として出荷した。
 * ⚠ **観測できない層は、自分でそう言わねばならない。** その上の誰にも代われない。
 *
 * @param {string} repoRoot
 * @param {string[]} slugs `readAimSlugs` が返すとおりの slug 順
 * @returns {Promise<{slug: string, uncommitted: boolean, uncommittedAnchorChange: boolean, untracked: boolean}[]|null>} git を読めなかったときは `null`
 */
export async function gatherWorkingDelta(repoRoot, slugs) {
  // corpus が無ければ事実も無い —— git も呼ばない。反復する対象が無いと分かる前に
  // porcelain pass を走らせるのは、履歴の大きい repo では高価である: aim を持たない
  // member repo が `# none` と言うためだけに約 4.7 秒の `git log` を払っていた。
  // 飛ばしても観測上は同一である。
  if (slugs.length === 0) return []

  // directory 全体に対する porcelain pass を 1 回。node ごとの事実はそこから導く。
  const status = await runGit(repoRoot, ['status', '--porcelain', '--', 'docs/aims/'])
  // `git status` は commit の無い repo でも成功する ∴ その `null` は曖昧でない:
  // git が読めなかったということである。
  if (status === null) return null
  const dirty = parsePorcelainPaths(status)
  const committedPaths = await committedAimPaths(repoRoot)
  if (committedPaths === null) return null

  const items = []
  for (const slug of slugs) {
    const rel = aimRelPath(slug)
    // `committed` は drift 層が読むのと同じ信号である: いずれかの commit がこの path を
    // 一度でも触ったか。stage されただけで一度も commit されていない node —— porcelain が
    // `??` ではなく `A` として報告するもの —— はここで捕まる。porcelain pass ではない。
    const committed = committedPaths.has(rel)
    const untracked = !committed
    const uncommitted = committed && dirty.has(rel)
    const uncommittedAnchorChange = uncommitted && (await workingAnchorChanged(repoRoot, rel))
    if (uncommitted || untracked) {
      items.push({ slug, uncommitted, uncommittedAnchorChange, untracked })
    }
  }
  // slug 順である: presence の事実は「新しい順」に並べるための時間軸を持たない ——
  // それを発明することは、この設計が禁じる偽の順序判断そのものになる。
  items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return items
}

/**
 * 機械可読な fence を描画する。
 *
 * ⚠ **`# none` も含め、無条件に出す**: 空の block は「record が無い」を意味するので
 * あって、「計算されなかった」を意味しない。field 順は固定、区切りは ` | `、1 行 1 record。
 *
 * @param {{slug: string, uncommitted: boolean, uncommittedAnchorChange: boolean, untracked: boolean}[]} items
 * @returns {string}
 */
export function renderWorkingDeltaFence(items) {
  if (items === null) {
    return (
      [
        '```' + WORKING_DELTA_FENCE_TAG,
        '# unavailable — この repo の git を読めなかった。',
        '# ⚠ clean ではなく「不在」である: これを「working tree に変更が無い」と読まないこと。',
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
    lines.push('# none — 構成時点で、この repo の working tree に未 commit の aim 変更は無い')
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
