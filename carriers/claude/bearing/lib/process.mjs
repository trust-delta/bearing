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
// ⚠ **`[todo]` はエージェントが自力で完了を確認できる形でのみ書かれる**（正本の「todo の完了
// 条件」）∴ `open-todo` は **エージェントの残務**であって、人間待ちを含まない。
//
// ∴ **mark が在り、その全てが `[done]` の node には固有の意味がある**: エージェントが尽くし、
// 残っているのは**人間の観測と `state:` の宣言だけ**である。これを `open-todo: 0` として
// 沈黙させると、⚠ **体制が人間へ番を渡した瞬間が、どこにも現れなくなる。**
// `renderAwaitingFence` はその瞬間を可視化する —— **可視化するだけで、判定はしない。**
//
// ⚠ **mark が 1 つも無い純 IS の node はここに入らない。** あちらはまだ何も約束していない
// のであって、尽くしたのではない。両者を同じ「todo 0 件」として畳んではならない。
//
// ═══ 番が人間へ渡る、もう 1 つの形 ═════════════════════════════════════════════
//
// 正本は 3 つを分けている ——「**観測を可能にする作業は PROCESS、判断そのものは ESCALATION、
// そして観測と宣言は人間**」。⚠ **このうち面を持たない 1 つが `# ESCALATION` だった** ——
// `[todo]` は `open-todo` に、尽きた mark は `awaiting-observation` に出るのに、**「人間が
// 判断しなければ誰も進めない」だけが、どの数にも fence にも現れなかった。**
//
// ⚠ **∴ 既に書かれていた読み方が偽になっていた**（`aim-facts.md`）: 「open-todo と awaiting が
// 両方 0 なら、エージェントにも人間にも番が渡っていない」—— `# ESCALATION` を持つ node は
// **両方 0 のまま人間で止まっている。** これは足りない機能ではなく、**数が嘘をつく経路**
// であり、「悪いセンサーは無いセンサーに劣る」の 3 つ目の形である。
//
// ⚠ **数えるだけで、判定も順位付けもしない。** escalation が todo より重いかどうかは
// **注意予算をどう割くかの判断**であり、それ自体が人間の act である ∴ 機械は「幾つあるか」
// までしか言わない —— `open-todo` に課されているのと同じ規律が、そのままここにも効く。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { aimRelPath, parseAimRecord, readAimSlugs, DEFAULT_AIMS_DIR } from './corpus.mjs'

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
 * body を 1 度だけ走査し、各行がどの top-level 節に属するかを付けて返す。
 *
 * 節は `# ` 見出しから次の `# ` 見出しまで走る。`aim-authoring.md` は body の section を
 * top-level で与えている（`# IS`・`# ESCALATION`・`# PROCESS`・`# HISTORY`・`# DAG`）∴
 * 節の中の `## ` は corpus が使っていない深い level である —— **推測せず anomaly として
 * 報告する。**
 *
 * ⚠ **走査が 1 つしかないことに意味がある。** 「fenced block の中の見出しは引用であって
 * 主張ではない」は `# PROCESS` だけに効く法ではない —— 2 枚目の scanner を書けば、その法は
 * 片方にだけ効き、もう片方は fence の中に例示された `# ESCALATION` を実在として数える。
 * ⚠ **そして数えたことは誰にも告げられない**（`bin/aim-facts.mjs` の 5 枚の fence は、まさに
 * この corpus 自身の doc が例として書いている形である）。
 *
 * @param {string} body
 * @returns {{rows: {line: string, no: number, section: string|null}[], nested: Map<string,string>, headings: Set<string>}}
 */
function scanSections(body) {
  const rows = []
  const nested = new Map()
  const headings = new Set()
  let section = null
  let inFence = false
  body.split(/\r?\n/).forEach((raw, i) => {
    // まず fence の状態: fenced block の中の見出しや mark は引用であって主張ではない
    // —— `stripCodeSpans` が運ぶのと同じ法を、行を失わずに当てられる場所で追っている。
    if (FENCE_LINE.test(raw)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const line = stripInlineCode(raw)
    const heading = line.match(/^#\s+(.*?)\s*$/)
    if (heading) {
      section = heading[1]
      headings.add(section)
      return
    }
    if (section && /^#{2,}\s/.test(line) && !nested.has(section)) nested.set(section, line.trim())
    rows.push({ line, no: i + 1, section })
  })
  return { rows, nested, headings }
}

/**
 * record の body を `# PROCESS` 節とそれ以外に分ける。
 *
 * @param {string} body
 * @returns {{process: {line: string, no: number}[], outside: {line: string, no: number}[], nestedHeading: string|null, hasHeading: boolean}}
 */
export function splitProcess(body) {
  const { rows, nested, headings } = scanSections(body)
  return {
    process: rows.filter((r) => r.section === 'PROCESS'),
    outside: rows.filter((r) => r.section !== 'PROCESS'),
    nestedHeading: nested.get('PROCESS') ?? null,
    hasHeading: headings.has('PROCESS'),
  }
}

/**
 * `# ESCALATION` —— 正本が **「Go だけでは進めない ＝ 人間の判断が要る」点のみ**と定める節。
 *
 * ⚠ **これは `[todo]` の反対側である。** `[todo]` はエージェントが自力で閉じられるものだけを
 * 書く節であり、閉じられないと分かったものは `# ESCALATION` へ出される（正本の「todo の
 * 完了条件」の表がそう指示している）∴ **2 つは同じ 1 つの分割の両側であって、別々の関心では
 * ない。** 片側だけを数える面は、分割の半分を黙って捨てる。
 *
 * ⚠ **見出しだけ在って中身が無いものを「在る」と数えてはならない。** 数は「人間の判断を
 * 待っている node」として読まれる ∴ 空の見出しをそこへ入れれば、**読みに行っても何も
 * 書かれていない**ものを待たせることになる。⚠ **かといって黙って落とすのは、`# PROCESS` の
 * `unknown` を 0 に倒すのと同じ嘘である** —— どちらの沈黙も採らず、別の名で述べる。
 *
 * @param {string} body
 * @returns {{blocked: boolean, empty: boolean}}
 */
export function parseEscalation(body) {
  const { rows, headings } = scanSections(body)
  if (!headings.has('ESCALATION')) return { blocked: false, empty: false }
  const hasContent = rows.some((r) => r.section === 'ESCALATION' && r.line.trim() !== '')
  return { blocked: hasContent, empty: !hasContent }
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
 * 注意を払うべき aim としては 1 つである。⚠ **`escalationNodes` も同じ単位で数える** ——
 * こちらが求めているのは「人間の判断を待って止まっている aim に注意を払う」ことであり、
 * 1 つの node が判断待ちを 3 つ抱えていても、**人間が向き合う node としては 1 つ**である。
 *
 * @param {string} repoRoot
 * @returns {Promise<{openTodoNodes: number, escalationNodes: string[], escalationEmptyNodes: string[], unknownNodes: string[], anomalies: {slug: string, kind: string, line: string, no: number}[]}>}
 */
export async function gatherBacklog(repoRoot, dir = DEFAULT_AIMS_DIR) {
  const slugs = await readAimSlugs(repoRoot, dir)
  let openTodoNodes = 0
  const unknownNodes = []
  const awaitingNodes = []
  const escalationNodes = []
  const escalationEmptyNodes = []
  const anomalies = []
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug, dir)), 'utf8')
    } catch {
      continue
    }
    const record = parseAimRecord(text)
    const marks = parseProcessMarks(record.body)
    for (const a of marks.anomalies) anomalies.push({ slug, ...a })
    if (record.state === 'dead') continue
    // ⚠ **除外が `dead` 1 つだけであることは、todo と揃っている** —— 目的を撤回した node に
    // 待つべき判断は無いが、`state: done` の node に残った escalation は**述べるべき食い違い**
    // であって、我々が黙って畳んでよいものではない（解決の宣言も、既決を IS へ畳むのも、
    // どちらも人間とエージェントの act であって、この数える層の act ではない）。
    const esc = parseEscalation(record.body)
    if (esc.blocked) escalationNodes.push(slug)
    else if (esc.empty) escalationEmptyNodes.push(slug)
    if (marks.unknown) unknownNodes.push(slug)
    if (marks.todo > 0) openTodoNodes++
    // ⚠ all-done かつ未解決 ＝ **人間の番**。mark が在り、その全てが `[done]` で、人間が
    // まだ `state: done` を宣言していない node。`no-process`（mark が 1 つも無い純 IS）は
    // 入らない —— あちらはまだ何も約束していない。
    else if (marks.done > 0 && record.state !== 'done') {
      awaitingNodes.push({ slug, doneMarks: marks.done, state: record.state ?? 'unset' })
    }
  }
  return {
    openTodoNodes,
    escalationNodes,
    escalationEmptyNodes,
    unknownNodes,
    awaitingNodes,
    anomalies,
  }
}

/**
 * `bearing-awaiting-observation v1` —— エージェントが尽くし、人間の観測を待っている aim。
 *
 * ⚠ **これは「終わった aim」の一覧ではない。** エージェントの側の終点は「目的が満たされたこと」
 * ではなく「人間が観測できるようになったこと」であり、ここに挙がるのは後者に達した node で
 * ある。⚠ **満足したかの宣言は人間の act（`state: done`）であって、この fence は
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
