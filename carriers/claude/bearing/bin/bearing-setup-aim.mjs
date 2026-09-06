#!/usr/bin/env node
// aim の規律を、この project へ **opt-in で** 取り付ける —— 初期セットアップ。
//
// 置くのは 2 つ: project-root の `CLAUDE.md` の末尾へ marker 付きの法の block、そして
// `.claude/skills/aim/` へ aim skill（plugin の `templates/aim/` の複製）。
//
// ═══ block と skill は 1 組である ═══════════════════════════════════════════
//
// 🔴 **この CLI が書き込むのは、実行後に block と skill の両方が今の版になるときだけである。**
// **片方だけが動くことは無い。**
//
// ⚠ **置いたものは、置いた瞬間からその repo のものである**（人間の決定 2026-09-05）。track するか・
// 直すか・古いままにするかは repo の policy であり、plugin は関与しない。⚠ **だが「古さは repo の
// もの」は「block だけ更新する」という意味ではない**（人間の決定 2026-09-07）—— **更新するなら
// 両方、しないならどちらも維持であり、どちらにするかは aim を使う側が決める。**
//
// 🔴 **理由は保有 corpus である** —— 版が上がることは doc の差し替えではなく、**手元の aim node の
// 書き換えを伴いうる act** である。⚠ **実例が在る**: 0.21.0 は `# OBSERVATION` の欄を導入し、
// 既存 node の判断待ちを `# ESCALATION` へ移す作業を生んだ。
//
// ⚠ **2026-09-07 まで、実装は block だけを追随させていた。** 実測（同日、対象: この checkout）——
// 0.20.0 の 3 枚を置いた repo に打つと、block は v0.21.0 へ置き直され、skill は 0 byte のまま、
// `--check` は **exit 0 で `状態: current`** と述べた。🔴 **そして 0.21.0 の実質は
// `aim-authoring.md` と `aim-facts.md` にしか無く、`frame.md`（＝ block の法）は 1 行も動いて
// いない** ∴ **あの「更新」は、その版が持っていたものを 1 文字も運んでいなかった。**
//
// ═══ 止める規準 ═══════════════════════════════════════════════════════════
//
// 🔴 **消えるのが「我々が置いたそのもの」なら、打った act で足りる。消えるものが手元の何かかも
// しれないなら、止めて人間に出す。** ⚠ **これは block が既に持っていた規則を skill へ広げたもの
// であって、新しい法ではない。**
//
// - **block** —— marker の sha が本文と一致すれば置き直す。一致しなければ **人間が手を入れた**と
//   読んで拒む。
// - **skill** —— 同梱の正本と一致すれば触る必要が無い。一致しなければ **止まる** —— ⚠ **「版が
//   古い」のか「人間が手を入れた」のかを区別する手段が、こちらには無いからである**（台帳は棄却
//   済み。`docs/aims/adoption-declaration.md` の `# HISTORY`）∴ 区別できないものを黙って捨てない。
//   捨ててよいと述べるのが `--update` であり、⚠ **それは block と skill の両方に効く。**
//
// ⚠ **改行だけは正規化して比べる。** CRLF の checkout では git が変換しただけで「一致しない」に
// なり、**同じ轍を block の sha で既に踏んでいる**（`docs/aims/bearing.md`）。⚠ **これは台帳では
// ない** —— 状態も記録も持たず、見るのは byte だけである。
//
// ═══ 書き先は実行した project である ═══════════════════════════════════════
//
// これは scope の選択ではなく、置くものの性質による —— aim の採用はその repo の corpus についての
// 宣言ゆえ、repo にしか置けない。`setup-statusline` が home にしか置けないのと対である。
//
// ═══ なぜ project ごとの opt-in なのか ═════════════════════════════════════
//
// **bearing は 1 つの単位ではない。** handoff と statusline の 1 行目は corpus に何も依存せず
// **どの project でも使える**が、aim の規律は corpus を前提にし、**採っていない repo では邪魔に
// なる**。∴ aim の規律だけをここで opt-in にする。
//
// ⚠ **置かれた marker は識別子であると同時に opt-in の宣言である。** hook はこれを読み、
// **採っていない repo では完全に黙る** —— 毎セッション「この project は aim を採っていない」と
// 述べる機構は、まさに人間が 2026-09-02 に user スコープを外した理由そのものだからである。
//
// ═══ 置き先を `./CLAUDE.md` に限る理由 ═════════════════════════════════════
//
// docs は `./.claude/CLAUDE.md` も project instructions と認めるが、**compaction 後の再注入の
// 表は "Project-root CLAUDE.md" としか書いておらず、あちらが含まれるか読み取れない。**
// ⚠ **法は消えないことが取り柄で置いている** ∴ **確実な方だけを使う。** あちらが在っても
// 触らず、在ることだけを述べる（人間の file を我々の都合で動かさない）。
//
// ⚠ **stdin を読む前に委譲する**（他の bin と同じ理由。ここは stdin を読まないが、規律を
// 破る例外を 1 つ作れば、次に読む者はどれが例外かを毎回確かめねばならない）。

import { readFile, writeFile, rename, access, mkdir, copyFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)

import {
  planApply, planRemove, inspect, loadDesired, bodySha, declaredAimsDir,
  findDeclined,
} from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR, normalizeAimsDir, readAimSlugs } from '../lib/corpus.mjs'

const log = (...a) => console.log(...a)

/**
 * この実行が使う corpus の在り処を決める。
 *
 * 順序は **`--dir` → 既に置かれた block の宣言 → 既定**。⚠ **既に宣言が在るのに既定へ
 * 落としてはならない** —— 落とせば、`setup-aim` を版の更新のために打ち直しただけの人間の
 * corpus が、**黙って既定へ引っ越したことにされる。**
 *
 * @param {string[]} argv
 * @param {string} text 現在の `CLAUDE.md`
 * @returns {{dir: string, from: 'flag'|'declared'|'default'}|{error: string}}
 */
export function chooseDir(argv, text) {
  const at = argv.indexOf('--dir')
  if (at !== -1) {
    const raw = argv[at + 1]
    const dir = normalizeAimsDir(raw)
    if (dir === null) {
      return {
        error:
          `--dir に渡された「${raw ?? ''}」は在り処として使えない。` +
          ' repo 相対の path であること（先頭の `/`・`..`・glob・drive letter は受け付けない）。',
      }
    }
    return { dir, from: 'flag' }
  }
  const declared = declaredAimsDir(text)
  if (declared.declared) return { dir: declared.dir, from: 'declared' }
  return { dir: DEFAULT_AIMS_DIR, from: 'default' }
}

/** 我々が書く先。⚠ **1 箇所である**（上の見出しコメントを見よ）。 */
export const TARGET = 'CLAUDE.md'
const ALT = path.join('.claude', 'CLAUDE.md')

/** aim skill を置く先（project 相対）。置いた後はその repo のものである。 */
export const SKILL_DIR = path.join('.claude', 'skills', 'aim')

/**
 * 置く template。⚠ **`frame.md` は入らない** —— 6 箇条は `CLAUDE.md` の block と SessionStart
 * hook が運ぶ ∴ ここにも置けば同じ規則が 3 箇所に住み、複製した側から先に古くなる。
 */
export const TEMPLATE_FILES = ['SKILL.md', 'aim-authoring.md', 'aim-facts.md']

const exists = async (p) => {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** 原子的に書く。⚠ **他人の `CLAUDE.md` を半分書いた状態で残さない。** */
async function writeAtomic(file, text) {
  const tmp = `${file}.bearing-tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

/** 改行だけ揃えて比べる。⚠ **CRLF の checkout で、git が変換しただけの差を「違い」にしない。** */
const lf = (t) => t.replace(/\r\n/g, '\n')

/**
 * 置かれた 3 枚が、同梱の正本と一致するか。
 *
 * ⚠ **状態も台帳も持たない** —— 見るのは中身だけである（台帳は棄却済み。見出しコメントを見よ）。
 * ⚠ **欠けている 1 枚も「一致しない」の 1 つ**として数える —— **半分だけ置かれた skill は、
 * 古い skill より静かに壊れている。**
 *
 * @param {string} root plugin root
 * @param {string} projectDir
 * @returns {Promise<{state: 'absent'|'same'|'differs'|'unreadable',
 *   differing: string[], unreadable: string[]}>}
 */
export async function inspectSkill(root, projectDir) {
  const dest = path.join(projectDir, SKILL_DIR)
  if (!(await exists(dest))) return { state: 'absent', differing: [], unreadable: [] }
  const differing = []
  const unreadable = []
  for (const f of TEMPLATE_FILES) {
    let want
    try {
      want = await readFile(path.join(root, 'templates', 'aim', f), 'utf8')
    } catch {
      // ⚠ 「置かれたものが違う」と「置く元が無い」を同じ言葉にしない —— 後者はこの plugin の壊れである。
      unreadable.push(f)
      continue
    }
    let got
    try {
      got = await readFile(path.join(dest, f), 'utf8')
    } catch {
      differing.push(f)
      continue
    }
    if (lf(got) !== lf(want)) differing.push(f)
  }
  if (unreadable.length > 0) return { state: 'unreadable', differing, unreadable }
  return { state: differing.length === 0 ? 'same' : 'differs', differing, unreadable }
}

/**
 * aim skill を `.claude/skills/aim/` へ置く。
 *
 * ⚠ **既定では、既に在れば 1 byte も触らない。** `overwrite` は**呼ぶ側が組として判定したとき
 * だけ**渡される —— ⚠ **この関数は単独では「捨ててよいか」を知りえない。**
 *
 * @param {string} root plugin root
 * @param {string} projectDir
 * @param {{overwrite?: boolean}} [opts]
 * @returns {Promise<{action: 'placed'|'replaced'|'kept', dir: string, missing: string[]}>}
 */
export async function placeSkill(root, projectDir, { overwrite = false } = {}) {
  const dest = path.join(projectDir, SKILL_DIR)
  const existed = await exists(dest)
  if (existed && !overwrite) return { action: 'kept', dir: dest, missing: [] }
  await mkdir(dest, { recursive: true })
  const missing = []
  for (const f of TEMPLATE_FILES) {
    try {
      await copyFile(path.join(root, 'templates', 'aim', f), path.join(dest, f))
    } catch {
      // ⚠ 「置かなかった」と「置く元が無かった」を同じ沈黙にしない。
      missing.push(f)
    }
  }
  return { action: existed ? 'replaced' : 'placed', dir: dest, missing }
}

function sayPlaced(r) {
  if (r.action === 'kept') {
    log(`${SKILL_DIR} は既に同梱の正本と一致する ∴ 触らない。`)
    return
  }
  log(r.action === 'replaced'
    ? `aim skill を置き直した: ${SKILL_DIR} —— **置かれていた 3 枚は捨てた。**`
    : `aim skill を置いた: ${SKILL_DIR}（${TEMPLATE_FILES.filter((f) => !r.missing.includes(f)).join('・')}）`)
  if (r.missing.length > 0) {
    log(`⚠ 同梱の template が読めない: ${r.missing.join('、')} —— この plugin の install が壊れている。`)
  }
  log('⚠ 置いた瞬間からこの repo のものである。track するか・直すか・古いままにするかは、この repo が決める。')
}

/** 置かれた skill の状態を、そのまま述べる。⚠ **畳まない** —— 4 つは別々の事実である。 */
function sayInspected(sk) {
  if (sk.state === 'absent') {
    log(`aim skill: 無い（${SKILL_DIR}）—— setup-aim が置く。`)
    return
  }
  if (sk.state === 'unreadable') {
    log(`aim skill: 同梱の正本が読めない（${sk.unreadable.join('、')}）—— この plugin の install が壊れている。`)
    return
  }
  if (sk.state === 'same') {
    log(`aim skill: 同梱の正本と一致する（${SKILL_DIR}）。`)
    return
  }
  log(`aim skill: 正本と一致しない（${sk.differing.join('、')}）—— 版が古いか、この repo が手を入れたか。`)
  log('  ⚠ どちらであるかを、この機構は区別できない。両方を今の版へ揃えるのは --update である。')
}

async function main(argv) {
  const root = path.join(import.meta.dirname, '..')
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const target = path.join(projectDir, TARGET)

  // ⚠ **解決した先を必ず述べる。** 2 つの hook が cwd を別々に解決して corpus を見失った
  // 実績が在る ∴ 書き先を黙って決めない。
  log(`対象: ${target}`)

  const before = (await exists(target)) ? await readFile(target, 'utf8') : ''

  const chosen = chooseDir(argv, before)
  if (chosen.error) {
    log(chosen.error)
    return 1
  }
  const desired = await loadDesired(root, chosen.dir)
  log(
    `corpus の在り処: ${chosen.dir}` +
      (chosen.from === 'flag' ? '（--dir）' : chosen.from === 'declared' ? '（既に置かれた宣言）' : '（既定）'),
  )

  if (await exists(path.join(projectDir, ALT))) {
    log(`⚠ ${ALT} も在るが触らない —— compaction 後に再注入されると docs が述べるのは`)
    log('  project-root の CLAUDE.md だけである。')
  }

  if (argv.includes('--check')) {
    // ⚠ **旧い「降りる宣言」が在れば述べる —— だが状態としては扱わない。** 2026-09-05 に
    // 述語から corpus が落ち、**採用していないことがそのまま沈黙を意味するようになった** ∴
    // あの行はもう既定と同じことしか言っていない。**黙って無視もしない**: 置いた人間は
    // それが今も効いていると信じうる。
    if (findDeclined(before)) {
      log('⚠ 旧い「降りる宣言」が在る（`<!-- bearing:aim declined -->`）—— 今は既定と同じ意味である。')
      log('  採用していない project は、その行が無くても黙る。--remove で掃除できる。')
    }
    const s = inspect(before, desired)
    const sk = await inspectSkill(root, projectDir)
    log(`状態: ${s.state} —— ${s.detail}`)
    log(`今の法: v${desired.version} sha=${bodySha(desired.law)}`)
    sayInspected(sk)
    // 🔴 **この終了値は「組」についての判定である。**
    //
    // ⚠ **2026-09-07 まで、ここは *block だけ* を見ていた** —— 「skill は在るか無いかを述べる
    // だけで exit code は動かさない。別の軸を混ぜれば、呼ぶ側は何が赤いのか分からない」と
    // 述べていた。🔴 **その理由は軸が 2 つ在ることに乗っていた。** block と skill が 1 組に
    // なった今、**軸は 1 つである** ∴ **どちらかが今の版でなければ赤い。** 何が赤いのかは、
    // 上の 3 行が名指す。
    //
    // ⚠ **採っていない repo は赤くしない**（`absent`）—— **採用していないことは異常ではなく、
    // この機構が最も守ってきた既定である。**
    if (s.state === 'absent') return 0
    return s.state === 'current' && sk.state === 'same' ? 0 : 1
  }

  // ⚠ **消えた flag を黙って無視してはならない。** `--decline` は 2026-09-05 に撤去された ——
  // 素通りさせれば adopt の経路へ落ち、**降りるつもりで打った repo が採用される**（意味が
  // ちょうど反転する）。⚠ **黙って何もしないのも駄目である**: 打った人間は降りたと信じる。
  if (argv.includes('--decline')) {
    log('⚠ --decline は撤去された（2026-09-05）—— 述語から corpus が落ち、')
    log('  **採用していない project は、それだけで黙る**ようになったからである。')
    log('  降りるには: bearing-setup-aim.mjs --remove （採用の宣言を外す）')
    log('  ⚠ 何も書き換えていない。')
    return 1
  }

  if (argv.includes('--remove')) {
    const plan = planRemove(before)
    if (plan.action === 'refuse') {
      log(`外さない: ${plan.reason}`)
      return 1
    }
    if (plan.action === 'absent') {
      log(plan.reason)
      return 0
    }
    await writeAtomic(target, plan.text)
    log(plan.reason)
    // ⚠ **今は断言してよい。** 2026-09-05 まで述語は `corpus 在り || marker 在り` であり、
    // **corpus を持つ repo は block を外しても黙らなかった** ∴ ここは述べ分けを必要としていた。
    // 述語が `adopted` だけになった今、**外すことはそのまま黙ることである。**
    log('⚠ hook も面も、この project で黙るようになる。')
    const slugs = await readAimSlugs(projectDir, chosen.dir).catch(() => [])
    if (slugs.length > 0) {
      log(`（${chosen.dir} の aim node ${slugs.length} 枚はそのまま —— 外すことは corpus を捨てることではない。`)
      log('  statusline の 2 行目だけは「aim 未採用」と述べ続ける。）')
    }
    // ⚠ **skill は消さない。** opt-in を外すことと、その repo が持つものを捨てることは別の act である。
    log(`⚠ ${SKILL_DIR} は残す —— 置いた後はこの repo のものである。`)
    return 0
  }

  // ⚠ **採るとき、旧い「降りる宣言」は落とす** —— 意味としては既に無害だが、採用の block と
  // 並べば**読み手には矛盾した 2 文が見える。** 黙って落とさず、述べてから落とす。
  let base = before
  if (findDeclined(before)) {
    const undo = planRemove(before)
    base = undo.text ?? before
    log('⚠ 旧い「降りる宣言」が在ったので外した —— 採用の宣言と並べば読み手が矛盾を読む。')
  }

  // ── 組として判定する ───────────────────────────────────────────────────────
  //
  // 🔴 **どちらか一方でも動かせないなら、両方動かさない**（見出しコメントを見よ）。⚠ **判定を
  // すべて済ませてから書く** —— 先に block を書いてから skill で止まれば、**止まったのに片方が
  // 動いた状態が残る。**
  const plan = planApply(base, desired)
  const sk = await inspectSkill(root, projectDir)
  const update = argv.includes('--update')

  if (plan.action === 'refuse') {
    log(`置き直さない: ${plan.reason}`)
    log(`⚠ ${SKILL_DIR} も触っていない —— block と skill は 1 組である。`)
    return 1
  }
  if (sk.state === 'unreadable') {
    log(`⚠ 同梱の template が読めない: ${sk.unreadable.join('、')} —— この plugin の install が壊れている。`)
    log('⚠ CLAUDE.md も触っていない —— block と skill は 1 組である。')
    return 1
  }
  if (sk.state === 'differs' && !update) {
    log(`${SKILL_DIR} が同梱の正本と一致しない: ${sk.differing.join('、')}`)
    log('⚠ 「版が古い」のか「この repo が手を入れた」のかを、この機構は区別できない ∴ 黙って捨てない。')
    log('⚠ CLAUDE.md も触っていない —— **更新するなら両方、しないならどちらも維持**である。')
    log('  両方を今の版へ揃える（置かれた 3 枚は捨てられる）: bearing-setup-aim.mjs --update')
    log('  ⚠ 版が上がることは、手元の aim node の書き換えを伴いうる。')
    return 1
  }

  // ここから先は、block も skill も今の版へ動かせる ∴ **両方書く。**
  if (plan.action === 'unchanged' && base === before) {
    log(plan.reason)
  } else {
    await writeAtomic(target, plan.action === 'unchanged' ? base : plan.text)
    log(`${plan.reason}（v${desired.version} / 法は ${desired.law.split('\n').length} 行）`)
    log('⚠ marker は HTML コメント ∴ context には乗らない。中身の法だけが載る。')
  }
  // ⚠ **法が最新であることは、skill が在ることを意味しない。** 版の更新のために打ち直した
  // 人間が、ここで初めて skill を得ることは在りうる ∴ `unchanged` でも置く。
  const placed = await placeSkill(root, projectDir, { overwrite: sk.state === 'differs' })
  sayPlaced(placed)
  // 🔴 **版が動いたなら、手元の corpus を見よと述べる** —— **これが「使う側が決める」の理由
  // そのものである**（人間の決定 2026-09-07）: 版の更新は doc の差し替えではない。
  if (plan.action === 'update' || placed.action === 'replaced') {
    log('⚠ 版が上がった ∴ 手元の aim node が今の法に合っているかを見ること —— 版の更新は corpus の書き換えを伴いうる。')
  }
  log('外すときは: bearing-setup-aim.mjs --remove')
  return 0
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-setup-aim.mjs') {
  process.exit(await main(process.argv.slice(2)))
}
