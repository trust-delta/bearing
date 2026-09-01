// `# PROCESS` —— どの手段が実装済かを述べる mark と、未実装をなお抱えた node の数。
//
// 導出元の前提:
//
//   進捗の可視化    `# PROCESS` で表現される実装手順は、単位ごとの実装済・未実装を
//                   エージェントが**事実として安く**把握・記載し、人間が進捗を確認できる
//   backlog への注意  aim は開発の駆動力であり、エージェントは aim の未実装の手段に注意を
//                   払う必要がある
//   dead の意味     `state: dead` は、その目的そのものを「やらないことに決めた」場合
//
// ⚠ **記法を決める目的の文は存在しない。**「実装済・未実装」は 2 つの状態を名指すだけで、
// それがどう書かれるかについては何も言わない。∴ **拠り所は corpus だけ**であり、77 node
// 全数で実測した: `-` bullet が 296/296、小文字の `done`/`todo` のみ、字下げ 0 のみ、
// 全てが `# PROCESS` の直下、PROCESS 節の中の深い見出しは 0 件。
//
// ⚠ **形を測ったことは、形を強制する免許にはならない。** 今日の corpus に一致するほど
// 厳格な parser は、明日書かれる `* [todo]` を**黙って取り落とす**。黙って落とされた todo は
// 「悪いセンサー」であり、⚠ **数だけは権威に見えるので、センサーが無いことより悪い。**
// 寛容な parser は逆側で失敗する: 逸脱を黙って吸収し、corpus は誰にも告げられないまま
// 2 つの記法へ分裂する。
//
// ∴ **どちらの沈黙も採らない。** 観測された形を mark として parse し、mark に**見えて**
// その形でないものは、どこにも数えずに **anomaly として報告する。** 数は正直なまま、
// 逸脱は可視なまま保たれる。
//
// dead の除外は `state: dead` の意味から従う: 追わないと決めた目的に未実装の手段は無く、
// 在るのは放棄された手段だけである。
//
// ═══ mark が尽きた先にあるもの ══════════════════════════════════════════════
//
// ⚠ **`[todo]` は エージェントが自力で完了を確認できる形でのみ書かれる**（正本の「todo の完了
// 条件」）∴ `open-todo` は **エージェントの残務**であって、人間待ちを含まない。
//
// ∴ **mark が在り、その全てが `[done]` の node には固有の意味がある**: エージェントが尽くし、
// 残っているのは**人間の観測と `state:` の宣言だけ**である。これを `open-todo: 0` として
// 沈黙させると、⚠ **体制が人間へ番を渡した瞬間が、どこにも現れなくなる。**
// `renderAwaitingFence` はその瞬間を可視化する —— **可視化するだけで、判定はしない。**
//
// ⚠ **mark が 1 つも無い純 IS の node はここに入らない。** あちらはまだ何も約束していない
// のであって、尽くしたのではない。両者を同じ「todo 0 件」として畳んではならない。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { aimRelPath, parseAimRecord, readAimSlugs } from './corpus.mjs'

export const AWAITING_FENCE_TAG = 'bearing-awaiting-observation v1'

/**
 * corpus が書いているとおりの mark: 行頭・`-` bullet・小文字の語。
 *
 * ⚠ **括弧の後に空白を要求してはならない。** この parser の最初の版はそれを要求し、
 * 実在する mark を 3 件取り落とした —— どれも `- [todo]（…` という形で、全角括弧が
 * 括弧に直付けされていた。3 件の実在項目が backlog から消え、anomaly 一覧に現れた。
 * **token は括弧そのものであり、その後に続くのは散文である。そして日本語の散文は
 * ASCII 空白を負う義理がない。**
 */
const MARK = /^- \[(done|todo)\]/
/**
 * 読み手が mark と呼ぶであろう全て。意図して `MARK` より広い —— これは、厳格な形なら
 * 床に落としていたものを掬い上げる網である。
 */
const MARK_ISH = /^(\s*)([-*+])\s+\[([A-Za-z]+)\]/

/** fence の開閉: 行頭、字下げは最大 3 空白（CommonMark）。 */
const FENCE_LINE = /^ {0,3}(```+|~~~+)/

/**
 * 1 行の**中で**の inline code span を剥ぐ。
 *
 * ⚠ **corpus 全体向けの `stripCodeSpans` をここで使ってはならない。** あれは document
 * 全体に対する 1 つの global 正規表現で fenced block を除くため、**行を削除し併合する** ——
 * そしてこの parser の仕事は丸ごと行構造である。さらに悪いことに、あの fenced block の
 * pattern は inline span の中の行途中に現れる ``` に一致する（`` ` ```bearing-drift ` ``、
 * この corpus が実際に書いている形）ので、幻の fence を開き、下方のどこかにある次の ```
 * までを丸呑みした。実測: それだけで、実在する `# PROCESS` の mark が節の外に在ると報告
 * された。同じ法を、構造を壊さない粒度で当てている。
 */
const stripInlineCode = (line) => line.replace(/`[^`]*`/g, '')

/**
 * record の body を `# PROCESS` 節とそれ以外に分ける。
 *
 * 節は `# ` 見出しから次の `# ` 見出しまで走る。`aim-authoring.md` は body の section を
 * top-level で与えている（`# IS`・`# PROCESS`・`# HISTORY`・`# DAG`）∴ PROCESS 内の `## `
 * は corpus が使っていない深い level である —— **推測せず anomaly として報告する。**
 *
 * @param {string} body
 * @returns {{process: {line: string, no: number}[], outside: {line: string, no: number}[], nestedHeading: string|null}}
 */
export function splitProcess(body) {
  const process = []
  const outside = []
  let inProcess = false
  let inFence = false
  let hasHeading = false
  let nestedHeading = null
  body.split(/\r?\n/).forEach((raw, i) => {
    // まず fence の状態: fenced block の中の見出しや mark は引用であって主張ではない
    // —— `stripCodeSpans` が運ぶのと同じ法を、行を失わずに当てられる場所で追っている。
    if (FENCE_LINE.test(raw)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const line = stripInlineCode(raw)
    if (/^#\s/.test(line)) {
      inProcess = /^#\s+PROCESS\s*$/.test(line)
      if (inProcess) hasHeading = true
      return
    }
    if (inProcess && /^#{2,}\s/.test(line)) nestedHeading ??= line.trim()
    ;(inProcess ? process : outside).push({ line, no: i + 1 })
  })
  return { process, outside, nestedHeading, hasHeading }
}

/**
 * 1 つの record body の mark を parse する。
 *
 * @param {string} body
 * @returns {{done: number, todo: number, anomalies: {kind: string, line: string, no: number}[]}}
 */
export function parseProcessMarks(body) {
  const { process, outside, nestedHeading, hasHeading } = splitProcess(body)
  let done = 0
  let todo = 0
  const anomalies = []
  if (nestedHeading) {
    anomalies.push({ kind: 'nested-heading', line: nestedHeading, no: 0 })
  }
  for (const { line, no } of process) {
    const strict = line.match(MARK)
    if (strict) {
      if (strict[1] === 'done') done++
      else todo++
      continue
    }
    const loose = line.match(MARK_ISH)
    if (!loose) continue
    const [, indent, bullet, word] = loose
    const kind =
      indent.length > 0 ? 'indented'
      : bullet !== '-' ? 'bullet'
      : /^(done|todo)$/i.test(word) ? 'case'
      : 'unknown-mark'
    anomalies.push({ kind, line: line.trim(), no })
  }
  // `# PROCESS` の外にある mark は第 3 の沈黙である: 進捗として書かれ、何にも読まれない。
  for (const { line, no } of outside) {
    if (MARK_ISH.test(line)) {
      anomalies.push({ kind: 'outside-process', line: line.trim(), no })
    }
  }
  // ⚠ **読める mark を 1 つも持たない `# PROCESS` 見出しは `unknown` であり、`unknown` を
  // 「やることが無い」へ畳んではならない。** これは drift のような硬い git 計算ではなく
  // 柔らかい散文の parse である ∴ **読めなかったときは読めなかったと述べる** ——
  // 捏造された `done` より正直な `unknown` が勝つ。この非対称が、この層に与えられている
  // 権限の全てである。
  const unknown = hasHeading && done === 0 && todo === 0
  return { done, todo, unknown, anomalies }
}

/**
 * 1 つの repo の backlog 事実。
 *
 * ⚠ **`openTodoNodes` が数えるのは node であって mark ではない** —— 前提が求めている
 * のは「未実装の手段を抱えた aim に注意を払う」ことであり、open な mark を 9 個持つ aim も、
 * 注意を払うべき aim としては 1 つである。
 *
 * @param {string} repoRoot
 * @returns {Promise<{openTodoNodes: number, unknownNodes: string[], anomalies: {slug: string, kind: string, line: string, no: number}[]}>}
 */
export async function gatherBacklog(repoRoot) {
  const slugs = await readAimSlugs(repoRoot)
  let openTodoNodes = 0
  const unknownNodes = []
  const awaitingNodes = []
  const anomalies = []
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug)), 'utf8')
    } catch {
      continue
    }
    const record = parseAimRecord(text)
    const marks = parseProcessMarks(record.body)
    for (const a of marks.anomalies) anomalies.push({ slug, ...a })
    if (record.state === 'dead') continue
    if (marks.unknown) unknownNodes.push(slug)
    if (marks.todo > 0) openTodoNodes++
    // ⚠ all-done かつ未解決 ＝ **人間の番**。mark が在り、その全てが `[done]` で、人間が
    // まだ `state: done` を宣言していない node。`no-process`（mark が 1 つも無い純 IS）は
    // 入らない —— あちらはまだ何も約束していない。
    else if (marks.done > 0 && record.state !== 'done') {
      awaitingNodes.push({ slug, doneMarks: marks.done, state: record.state ?? 'unset' })
    }
  }
  return { openTodoNodes, unknownNodes, awaitingNodes, anomalies }
}

/**
 * `bearing-awaiting-observation v1` —— エージェントが尽くし、人間の観測を待っている aim。
 *
 * ⚠ **これは「終わった aim」の一覧ではない。** エージェントの側の終点は「目的が満たされたこと」
 * ではなく「人間が観測できるようになったこと」であり、ここに挙がるのは後者に達した node で
 * ある。⚠ **満足したかの宣言は 人間の act（`state: done`）であって、この fence は
 * それを一切先取りしない。**
 *
 * ⚠ **prose ではなく fence で出す理由**: これは数ではなく **slug を運ぶ record** である。
 * 正本は「fence を parse せよ、prose を scrape するな」と定めており、行動の対象になる slug を
 * 言い回しの変わりうる散文に置けば、読み手は scrape を強いられる。
 */
export function renderAwaitingFence(items) {
  const lines = [
    '```' + AWAITING_FENCE_TAG,
    '# fields: slug | done_marks | state',
  ]
  if (items.length === 0) {
    lines.push('# none — エージェントが尽くして観測待ちになっている aim は無い')
  } else {
    for (const it of items) lines.push(`${it.slug} | ${it.doneMarks} | ${it.state}`)
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
