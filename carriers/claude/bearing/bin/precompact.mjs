#!/usr/bin/env node
// 閾値 trigger。
//
// 導出元の前提:
//
//   閾値での発火人間が予め定めた地点（context 使用率など）を元に、**半強制的に**会話
//                   引き継ぎを行える
//   引き継ぎの主体エージェントのネイティブな圧縮・リセット**ではなく**、セッションを跨ぐ
//                   context 伝達のために固有の会話引き継ぎ機構を備える
//
// ═══ なぜこの hook で、context 使用率の監視ではないのか ═════════════════════
//
// 前提が言う「context 使用率など」は、その地点の**例**であって機構ではない。そして監視す
// べき百分率は存在しない: plugin は時計も polling も持たず、context メーターを見る術も持た
// ない。**持っているのは、ハーネスが「これから圧縮する」と一度だけ告げること**である ——
// ⚠ **そしてそれは閾値の代理ではなく、閾値そのものである。** 監視者が見張っていたはずの
// 同じ信号に基づいて、ハーネスが選んだ地点だからだ。
//
// 便利だからではない: この機構が在るのは、まさに native な圧縮を**置き換える**ためであり、
// 圧縮が軌跡を**不可視に**捨てるからである。∴ **ハーネスが圧縮を決めた瞬間こそ、体制が
// 「代わりに baton を著すべきだ」と言う瞬間である。** ここで発火するのは導出であって、
// 欠けているメーターの代用ではない。
//
// ═══ 半強制 —— 「半」が何に解決されるか ════════════════════════════════════
//
// ⚠ 述べておくべき本物の緊張がある: 前提は閾値 trigger を求めるが、`handoff.md` は
// 「これは人間が呼ぶものであって、閾値で自動発火させるものではない」と言う。
// **「半」強制** —— trigger を書かれているとおりに読めば、両立する。この hook は baton を
// 書かないし、何も決めない。**沈黙の破棄を差し止め、選択を返すだけである**:
//
//   - 圧縮を遮断する（セッションは圧縮されないまま続く）
//   - 今 baton を著すよう、セッションに告げる
//   - 人間が確認して land するか、あるいは人間が「不要」と言い、次の圧縮は
//     そのまま進む
//
// **強制されているのは「破棄が静かには起こりえない」という半分だけである。** その後は
// すべて強制されていない。
//
// ⚠ **`manual` は決して遮断しない。** `/compact` を走らせた人間は、その act を自ら行って
// いる。**人に仕えるための儀式を強制するために、人の明示的な act を上書きすることは、
// 体制そのものの反転である。** 傍受するのは `auto` だけ。
//
// ⚠ **セッションにつき一度だけ発火する。** 毎回遮断すれば、続行を決めたセッションを閉じ
// 込めることになる —— context は決して圧縮されず、セッションは代わりに天井で死ぬ。
// **1 度の中断は促しであり、立ち続ける拒否は檻である。**

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { readAimSlugs } from '../lib/corpus.mjs'
import { readDeclaration, isEngaged } from '../lib/claude-md.mjs'
import os from 'node:os'
import path from 'node:path'
import { resolveUnit } from '../lib/unit.mjs'
import { batonDir } from '../lib/handoff.mjs'
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
 * そもそもこの規律はここに適用されるのか。
 *
 * baton が既に在るか、aim が有効か。⚠ **どちらも無ければ、この project は体制を採ったことが
 * 無く、その儀式を課すことは「人間が決めていないことを plugin が決める」ことになる。**
 *
 * ⚠ **2 つの条件は対等ではない。** baton が在ることは **handoff 自身の証拠**であり、
 * **handoff は aim に依存しない** ∴ **aim を降りても、baton が在れば発火し続ける** ——
 * ここで黙らせることは aim の沈黙ではなく **handoff の欠落**になる。
 *
 * ⚠ **一方 corpus が在ることは aim の証拠でしかない** ∴ 降りる宣言に従う。
 * `lib/claude-md.mjs` の `isEngaged` を通す —— **結論を組み直せば面ごとに姿が食い違う。**
 */
async function inScope(unit) {
  if (existsSync(batonDir(unit.root))) return true
  let hasCorpus = false
  for (const repo of unit.repos) {
    if ((await readAimSlugs(repo.root, repo.aimsDir)).length > 0) {
      hasCorpus = true
      break
    }
  }
  return isEngaged({ ...(await readDeclaration(unit.root)), hasCorpus })
}

const MESSAGE = `⚠ 自動圧縮を**一度だけ**遮断した。この対話が静かに破棄されることを防ぐためである。

**ここが閾値の地点である: 圧縮される代わりに baton を著すこと。**
native な圧縮は反応的で不可視であり、**何が落ちたかを誰も選んでいない**。handoff の方法は
まさにそれを置き換えるために在り、その価値は authoring の judgment にある: 何を残し、
何を「git と docs/aims/ から再導出できる」として省くか。

今これを行うこと:
  1. \`handoff\` skill の \`write.md\` に従う（\`/bearing:handoff w\`）。
  2. 何を残し何を省いたかを 1〜2 行で人間に見せ、**land する前に**訂正させること。
  3. land はこれで:  node ${HANDOFF_CLI} write < <著した.md>

人間が続行を選ぶなら、そう述べて続けること —— これはこのセッションで二度と発火せず、
次の自動圧縮はそのまま進む。`

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  // parse できない入力は、セッションに干渉してよい理由にならない。
  process.exit(0)
}

// ⚠ 人間自身の `/compact` はその人の act である。決して上書きしない。
if (input.trigger !== 'auto') process.exit(0)

const sessionId = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
const marker = path.join(os.tmpdir(), `aim-precompact-${sessionId}`)
if (existsSync(marker)) process.exit(0)

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  if (!(await inScope(unit))) process.exit(0)
  mkdirSync(path.dirname(marker), { recursive: true })
  writeFileSync(marker, new Date().toISOString(), 'utf8')
} catch {
  // 予期しないことが起きたら、セッションには圧縮させる。bug で妨げることは決してしない。
  process.exit(0)
}

// exit 2 はハーネスの「stderr を model に見せ、かつ遮断する」である。⚠ 将来の build が
// これで遮断しなくなっても、**message は model に届く** —— 中断が生き残らなくても促しは
// 生き残る。そしてそちらが重要な方の半分である。
process.stderr.write(MESSAGE + '\n')
process.exit(2)
