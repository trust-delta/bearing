#!/usr/bin/env node
// aim の規律を、この project へ **opt-in で** 取り付ける —— 初期セットアップ。
//
// 置くのは 2 つ: project-root の `CLAUDE.md` の末尾へ marker 付きの法の block、そして
// `.claude/skills/aim/` へ aim skill（plugin の `templates/aim/` の複製）。
//
// ═══ 置いたところで責任が終わる ═════════════════════════════════════════════
//
// ⚠ **置いたものは、置いた瞬間からその repo のものである**（人間の決定 2026-09-05）。track するか・
// 直すか・古いままにするか・clone した誰もが読めるようにするかは repo の policy であり、plugin は
// 関与しない ∴ **この CLI は置いたものを追随させない** —— 2 度目に打っても、既に在る
// `.claude/skills/aim/` には触らず、在ることを述べて止まる。block だけは marker に版と本文 sha を
// 持つので、人間が中を編集していなければ置き直せる。
//
// ⚠ **先行の手段はこの逆を採り、1 日で行き詰まった。** canon を `docs/aims/_guide/` へ置き、台帳で
// 「我々が置いたまま」なら最新へ追随させていた —— 5 状態・台帳・CRLF 正規化比較のすべてが、
// **置いたものを我々のものと見た**ことから生じた費用である（`docs/aims/adoption-declaration.md`
// の `# HISTORY`）。
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
} from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR, normalizeAimsDir } from '../lib/corpus.mjs'

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

/**
 * aim skill を `.claude/skills/aim/` へ置く。⚠ **既に在れば 1 byte も触らない** —— 置いた後は
 * その repo のものであり、2 度目の `setup-aim` はそれを「我々のもの」として扱えない。中身が古い
 * かどうかも見ない: 古さは repo のものである。
 *
 * @param {string} root plugin root
 * @param {string} projectDir
 * @returns {Promise<{action: 'placed'|'kept', dir: string, missing: string[]}>}
 */
export async function placeSkill(root, projectDir) {
  const dest = path.join(projectDir, SKILL_DIR)
  if (await exists(dest)) return { action: 'kept', dir: dest, missing: [] }
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
  return { action: 'placed', dir: dest, missing }
}

function sayPlaced(r) {
  if (r.action === 'kept') {
    log(`${SKILL_DIR} は既に在る ∴ 触らない —— 置いた後はこの repo のものである。`)
    return
  }
  log(`aim skill を置いた: ${SKILL_DIR}（${TEMPLATE_FILES.filter((f) => !r.missing.includes(f)).join('・')}）`)
  if (r.missing.length > 0) {
    log(`⚠ 同梱の template が読めない: ${r.missing.join('、')} —— この plugin の install が壊れている。`)
  }
  log('⚠ 置いた瞬間からこの repo のものである。track するか・直すか・古いままにするかは、この repo が決める。')
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
    const s = inspect(before, desired)
    log(`状態: ${s.state} —— ${s.detail}`)
    log(`今の法: v${desired.version} sha=${bodySha(desired.law)}`)
    // ⚠ **skill は在るか無いかを述べるだけで、exit code は動かさない** —— この終了値は
    // *法の block* についての判定であり、そこへ別の軸を混ぜれば、呼ぶ側は何が赤いのか分からない。
    log((await exists(path.join(projectDir, SKILL_DIR)))
      ? `aim skill: 在る（${SKILL_DIR}）—— 中身はこの repo のものであり、この実行は見ない。`
      : `aim skill: 無い（${SKILL_DIR}）—— setup-aim が置く。`)
    return s.state === 'broken' || s.state === 'edited' ? 1 : 0
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
    log('⚠ hook はこの project で黙るようになる（corpus はそのまま残っている）。')
    // ⚠ **skill は消さない。** opt-in を外すことと、その repo が持つものを捨てることは別の act である。
    log(`⚠ ${SKILL_DIR} は残す —— 置いた後はこの repo のものである。`)
    return 0
  }

  const plan = planApply(before, desired)
  if (plan.action === 'refuse') {
    log(`置き直さない: ${plan.reason}`)
    return 1
  }
  if (plan.action === 'unchanged') {
    log(plan.reason)
  } else {
    await writeAtomic(target, plan.text)
    log(`${plan.reason}（v${desired.version} / 法は ${desired.law.split('\n').length} 行）`)
    log('⚠ marker は HTML コメント ∴ context には乗らない。中身の法だけが載る。')
  }
  // ⚠ **法が最新であることは、skill が在ることを意味しない。** 版の更新のために打ち直した
  // 人間が、ここで初めて skill を得ることは在りうる ∴ `unchanged` でも置く。
  sayPlaced(await placeSkill(root, projectDir))
  log('外すときは: bearing-setup-aim.mjs --remove')
  return 0
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-setup-aim.mjs') {
  process.exit(await main(process.argv.slice(2)))
}
