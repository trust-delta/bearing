#!/usr/bin/env node
// aim の規律を、この project へ **opt-in で** 取り付ける。
//
// ═══ なぜ project ごとの opt-in なのか ═════════════════════════════════════
//
// **bearing は 1 つの単位ではない。** handoff の 2 枚と statusline の 1 行目は `docs/aims/`
// に何も依存せず**どの project でも使える**が、aim の規律は corpus を前提にし、**採っていない
// repo では邪魔になる**。∴ plugin 本体は user スコープで全 project に載せ、**aim の規律だけを
// ここで opt-in にする。**
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

import { readFile, writeFile, rename, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)

import {
  planApply, planRemove, inspect, loadDesired, bodySha, declaredAimsDir,
} from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR, normalizeAimsDir } from '../lib/corpus.mjs'
import { syncCanon, describeCanon, MANIFEST } from '../lib/canon.mjs'

const log = (...a) => console.log(...a)

/**
 * この実行が使う corpus の在り処を決める。
 *
 * 順序は **`--dir` → 既に置かれた block の宣言 → 既定**。⚠ **既に宣言が在るのに既定へ
 * 落としてはならない** —— 落とせば、`with-aim` を版の更新のために打ち直しただけの人間の
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

/** canon を置き（または現況を述べ）、結果を人間の言葉にして出す。 */
async function reportCanon(root, projectDir, aimsDir, write, version) {
  const rel = `${aimsDir}/_guide`
  const guideDir = path.join(projectDir, ...aimsDir.split('/'), '_guide')
  const { plan, missing, manifest } = await syncCanon(root, guideDir, write, version)
  // ⚠ **壊れた台帳は「無い」に畳まない。** 畳めば、人間は「なぜ更新されないのか」を
  // 探すことになる —— 答えは画面に無い。
  if (manifest.broken) {
    log(`⚠ ${rel}/${MANIFEST} が読めない —— 記録が無いものとして扱った（上書きはしない）。`)
  }
  for (const line of describeCanon(plan, rel, write)) log(line)
  if (missing.length > 0) {
    log(`⚠ 同梱の canon が読めない: ${missing.join('、')} —— この plugin の install が壊れている。`)
  }
}

async function main(argv) {
  const root = path.join(import.meta.dirname, '..')
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const target = path.join(projectDir, TARGET)

  // ⚠ **解決した先を必ず述べる。** 2 つの hook が cwd を別々に解決して corpus を見失った
  // 実績が在る（[[bearing]] の `[todo]`）∴ 書き先を黙って決めない。
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

  // ⚠ **既定で置く**（人間の決定 2026-09-04）—— `with-aim` を打つことが opt-in の判断
  // そのものであり、置くことは判断の代行にならない。断る道は残す。
  const wantCanon = !argv.includes('--no-canon')

  if (await exists(path.join(projectDir, ALT))) {
    log(`⚠ ${ALT} も在るが触らない —— compaction 後に再注入されると docs が述べるのは`)
    log('  project-root の CLAUDE.md だけである。')
  }

  if (argv.includes('--check')) {
    const s = inspect(before, desired)
    log(`状態: ${s.state} —— ${s.detail}`)
    log(`今の法: v${desired.version} sha=${bodySha(desired.law)}`)
    // ⚠ **canon は述べるだけで、exit code は動かさない** —— この終了値は*法の block*に
    // ついての判定であり、そこへ別の軸を混ぜれば、呼ぶ側は何が赤いのか分からなくなる。
    if (wantCanon) await reportCanon(root, projectDir, chosen.dir, false, desired.version)
    else log('⚠ --no-canon ∴ `_guide/` を見ていない —— canon が在るかどうかを、この実行は述べない。')
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
    // ⚠ **canon は消さない。** 置いた後の `_guide/` はその repo の doc であり、opt-in を
    // 外すことと、その repo が持つ doc を捨てることは別の act である。
    log(`⚠ ${chosen.dir}/_guide は残す —— 置いた後の canon はこの repo の doc である。`)
    return 0
  }

  const plan = planApply(before, desired)
  if (plan.action === 'refuse') {
    log(`置き直さない: ${plan.reason}`)
    return 1
  }
  if (plan.action === 'unchanged') {
    log(plan.reason)
    // ⚠ **法が最新であることは、canon が在ることを意味しない。** 版の更新のために打ち直した
    // 人間が、ここで初めて canon を得ることは在りうる ∴ この分岐でも置く。
    if (wantCanon) await reportCanon(root, projectDir, chosen.dir, true, desired.version)
    else log('⚠ --no-canon ∴ `_guide/` を見ていない —— canon が在るかどうかを、この実行は述べない。')
    return 0
  }
  await writeAtomic(target, plan.text)
  log(`${plan.reason}（v${desired.version} / 法は ${desired.law.split('\n').length} 行）`)
  log('⚠ marker は HTML コメント ∴ context には乗らない。中身の法だけが載る。')
  // ⚠ **法を置いた息で canon も置く。** 置かれた法の第 1 条は
  // `<corpus>/_guide/aim-authoring.md` を指しており、**無ければその条は最初から満たせない。**
  if (wantCanon) await reportCanon(root, projectDir, chosen.dir, true, desired.version)
  else log('⚠ --no-canon ∴ `_guide/` を見ていない —— canon が在るかどうかを、この実行は述べない。')
  log('外すときは: bearing-with-aim.mjs --remove')
  return 0
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-with-aim.mjs') {
  process.exit(await main(process.argv.slice(2)))
}
