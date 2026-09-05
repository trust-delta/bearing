#!/usr/bin/env node
// boot 儀式の trigger。
//
// 未処理の baton の上で開いたセッションは、その baton に読む手順を負っている。そして
// 人間はその瞬間に、前の対話を継続するか fresh に始めるかを選ぶ。⚠ **事実が context に
// ただ座っているだけでは、そのどちらも果たされない。**
//
// ═══ なぜ SessionStart ではなく UserPromptSubmit なのか ═════════════════════
//
// ⚠ **`SessionStart` は虚空へ向けて発火する。** その stdout は context になるが、
// **context は turn ではない。** handoff の手順（`handoff` skill の `read.md`）2〜6 は**エージェントの
// act** である —— `read-at` を刻む・未 push aim を surface する・pointers を読む・現在地を
// 報告する —— そして **一度も呼ばれないエージェントは何の act も行わない。** ∴「baton が
// context に在る」と「baton が読まれた」の間に、際限のない窓が開く: 人間が入力するのに
// かかるだけの時間、しかも入力が無関係なものであれば、**手順は一度も走らないまま、事実だけが
// 届いた顔をしてそこに座り続ける。**
//
// ⚠ **plugin は turn を作れない —— だが、この儀式は turn の作成を必要としたことが無い。**
// 必要なのは、最初の turn が他の何かをする**前に**走ることであり、`UserPromptSubmit` は、
// 儀式に関係するイベントのうち**発火が定義上 turn を伴う唯一のもの**である。turn の*作成*は
// 無人運転の前提であり、それはハーネスの仕事であってこの plugin の仕事ではない。
//
// ═══ 半強制 —— 閾値 trigger と同じ形 ═══════════════════════════════════════
//
// この hook は何も書かず、何も決めない。**エージェントが確実に走っている瞬間に、義務を
// 一度だけ述べ、それ以外の全てを返す。**
//
// ⚠ **決して exit 2 しない。** ここでの exit 2 は「処理を遮断し、元の prompt を消去する」
// —— **人間が入力したものを、人間に仕えるための儀式を強制するために破壊する**
// ことであり、これは `precompact.mjs` が人間自身の `/compact` を遮断しないことで拒んで
// いるのと同じ反転である。
//
// ⚠ **セッションにつき一度だけ発火する。** 毎 prompt に立ち続ける督促は檻であり、儀式が
// 終わった後もずっと発火し続けることになる。
//
// ⚠ **baton が無ければ発火しない。** baton が無ければ未処理の*手順*も無い:
// `handoff.md` の手順 1 は「fresh start である旨を報告して終わり」で終わっており、
// SessionStart composer が既に届けた boot の事実はそれ自体で立つ。**それでも発火すれば、
// 引き継ぐものを持たないセッションに儀式を課すことになる。**

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readBaton } from '../lib/baton.mjs'
import { strandedBatons } from '../lib/handoff.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { quotePathForShell } from '../lib/shell.mjs'

// ⚠ **stdin を読む前に、ここが最初に走らねばならない。** 委譲は fd をそのまま子へ渡す
// （`stdio: 'inherit'`）ので、親が一度でも stdin を読めばその分は永久に失われる。
import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)

/**
 * この儀式が名指す handoff CLI の絶対 path。
 *
 * ⚠ **`$CLAUDE_PLUGIN_ROOT` を hook の出力に書いてはならない。** あの placeholder が inline
 * 展開されるのは hook の `command` field と skill / agent の content であって、**hook が吐く
 * text ではない** ∴ 文字列のまま届き、しかも **Bash tool の env にその変数は無い** ——
 * エージェントは `/bin/handoff.mjs` を見て落ちる。2026-09-02 から 4 セッション連続で起きた。
 *
 * ⚠ **env ではなく `import.meta.dirname` で解く。** こちらは*今走っている複製*を指す ——
 * 委譲されて working tree に居るなら working tree を名指し、env の有無に一切依らない。
 *
 * ⚠ **シェルへ載せる形の正本は `lib/shell.mjs` である** —— なぜ `JSON.stringify` では
 * 足りないか（UNC で壊れる）は、あちらに 1 度だけ書いてある。**ここへ複製しない。**
 */
const HANDOFF_CLI = quotePathForShell(path.join(import.meta.dirname, 'bearing-handoff.mjs'))


/**
 * 旧い置き場に取り残された baton についての促し。
 *
 * ⚠ **これは「読め」ではなく「移せ」である。** 機構はもうそこを読まない ∴ 読む手順を
 * 述べても実行できない。そして⚠ **移すのは人間の act である** —— エージェントは述べる
 * ところで止まる。
 */
function strandedMessage(stranded) {
  const lines = stranded.map(
    (l) => `  ${l.dir} —— active ${l.active ? 1 : 0} 本 / archive ${l.archived} 本`,
  )
  return `⚠ **旧い置き場に baton が取り残されている。** この機構はもうそこを読まない ∴
**今のこの unit は「fresh start」ではない。**

${lines.join('\n')}

移すコマンドはこれである:

    bearing-handoff.mjs migrate

⚠ **走らせるかは人間が決める。** ここで勝手に動かせば、人間は自分の baton がどこへ
行ったかを知らないまま次の対話を始めることになる —— **述べるところで止まること。**

これはセッションにつき一度だけ発火する。`
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
    // stdin が閉じない hook が、仕えるべきセッションを吊らせてはならない。
    setTimeout(() => resolve(buf), 2000).unref?.()
  })
}

/**
 * 義務を、一度だけ述べる。
 *
 * ⚠ **手順を再掲せず、CLI を名指す。** 正本は `handoff.md` であり、機械的な 4 手順は既に
 * `bin/handoff.mjs read` が持っている —— どちらをここへ複製しても、**儀式についての第 3 の
 * 記述**が木の中に置かれることになる。それは「正本は 1 つ、vendor への配置はすべて*生成物*」
 * という規則がまさに禁じているものである。
 */
function message(baton) {
  const when = baton.composedAt ? ` composed-at \`${baton.composedAt}\`` : ''
  const seen = baton.readAt
    ? `\n⚠ この baton は \`read-at: ${baton.readAt}\` を持っている —— 過去に読まれている。` +
      '報告の中で**事実として**述べること。手順を飛ばす理由にはならない' +
      '（再読は正当であり、`read-at` はそれを検出するために在るのであって、防ぐために在るのではない）。'
    : ''
  return `⚠ **未処理の baton があり、読む手順がまだ走っていない。**${when}

\`${baton.path}\`

SessionStart hook はこの baton を surface したが、\`read-at\` は**意図して刻んでいない**:
刻印は手順 3 であり、その後に手順 4〜6 が続く。そして「読まれた」と印の付いた baton を残した
ままセッションが死ねば、その baton は誰にも読まれない。**これらの手順はあなたのものであり、
このセッションの他の何もそれを行わない。**

**人間に答える前に、これを行うこと:**

  1. 帳簿の半分を走らせる（canon の手順 2〜4 —— 旧 \`read-at\` を返し、新しいものを刻み、
     aim の trace を出す）:

       node ${HANDOFF_CLI} read

  2. trace が名指す aim slug をすべて再読すること。⚠ **baton は forward に選ばれる** ∴
     道中どう aim が触られたかを過少報告する —— そして aim を読み直して得られるのは
     *到達状態*であって*変化*ではない。**その差分だけが変化を運ぶ。**

  3. baton が名指す \`Pointers\` を読むこと（canon の手順 5）。

  4. 今どこに立っていて何を拾うかを人間に伝え（手順 6）、そのうえで人間が
     実際に頼んだことへ進むこと。

正本: \`handoff\` skill が同梱する \`read.md\`（\`/bearing:handoff r\`）。⚠ **repo の中を探さないこと** —— handoff は aim と別であり、aim corpus に依存しない。これはセッションにつき一度だけ発火する。${seen}`
}

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  // parse できない入力は、セッションに干渉してよい理由にならない。
  process.exit(0)
}

const sessionId = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
const marker = path.join(os.tmpdir(), `aim-boot-ritual-${sessionId}`)
if (existsSync(marker)) process.exit(0)

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  const baton = await readBaton(unit.root)
  // ⚠ **取り残された baton も「未処理の baton」である。** 儀式が在るのは、未処理の baton が
  // 無視されないためであって、それが**どこに置かれているか**は理由ではない ∴ 旧い置き場に
  // 在るときも一度だけ述べる —— 黙れば、その baton は誰にも読まれないまま残り続ける。
  const stranded = baton ? [] : await strandedBatons(unit.root)
  if (!baton && stranded.length === 0) process.exit(0)
  mkdirSync(path.dirname(marker), { recursive: true })
  writeFileSync(marker, new Date().toISOString(), 'utf8')
  // exit 0: stdout はエージェントに見せられる。⚠ 決して exit 2 しない —— 冒頭を参照。
  process.stdout.write((baton ? message(baton) : strandedMessage(stranded)) + '\n')
} catch (err) {
  // 規則: この hook の bug でセッションを妨げることは決してしない。
  process.stderr.write(`bearing: boot-ritual hook が失敗した: ${err?.stack ?? err}\n`)
}
process.exit(0)
