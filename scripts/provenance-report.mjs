#!/usr/bin/env node
// 出所の測定 —— `docs/aims/observation-provenance.md` が要求する「日付を持たない実測を、
// 候補として挙げる」手段。
//
// ⚠ **これは報告であって門ではない。** heuristic は**引用と断定を区別できない** ——
// 「観測は不在の証拠ではない」のような一般論にも「観測」の語は現れる ∴ ここに出るのは
// **候補**であって違反ではない。`scripts/lang-report.mjs` が「CI で毎回走り、候補を報告し、
// 落とさない」形の前例を持つ。
//
// 🔴 **これは外部の系が動いたことを検知するものではない —— それは原理的に不可能である。**
// 検知できるのは*我々の書き方*だけであり、**書き方が直っていれば、次に踏んだ人が日付を見て
// 自分で疑える。** その一点のためだけに在る。
//
// ⚠ **file の集合は `git ls-files` から採る。** glob は深さを暗黙に決め打ち、`--include` で
// dir を絞れば repo root の `CLAUDE.md` を落とす —— この repo の `CLAUDE.md` が名指しで
// 禁じている形である。

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** 出所を主張する語。目的の node が名指している 2 つに限る。 */
export const CLAIM = /実測|観測/

/**
 * 日付とみなす形。`YYYY-MM-DD` がこの repo の既定だが、月までの粒度と和文表記も拾う。
 *
 * ⚠ **広く取るのは、検出したいのが「日付が無いこと」だからである** —— 日付の*書式*が
 * 揃っているかは別の問いであり、それをここで測れば、書式違いが出所の欠落として出る。
 */
export const DATED = /\d{4}-\d{2}(-\d{2})?|\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日/

/** 測る対象: aim corpus の record と、repo root の `CLAUDE.md`。 */
export const inScope = (f) =>
  (f.startsWith('docs/aims/') && f.endsWith('.md') && !f.endsWith('/README.md')) || f === 'CLAUDE.md'

/**
 * repo root。⚠ **cwd に依らせない。**
 *
 * 🔴 **`git ls-files` は cwd 相対に列挙する** —— CI はこの repo の test を
 * `carriers/claude/bearing` で走らせる ∴ そこから呼べば `docs/aims/` も `CLAUDE.md` も
 * 視界に入らず、**この道具は 0 件を報告して緑のまま通る**（2026-09-06、CI と同じ走らせ方で
 * 実際に踏んだ。拾えたのは陽性対照の assert である）。⚠ **`CLAUDE.md` が名指している
 * 「深さを暗黙に決め打つ道具を既定にしない」の、この script における形。**
 */
function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function tracked(root) {
  return execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

/**
 * 散文の単位へ割る。空行で切り、⚠ **箇条書きの項目でも切る。**
 *
 * 🔴 **list を 1 段落に畳んではならない。** markdown の list は連続行である ∴ 空行だけで
 * 切れば `- [done]` が 10 個並んだ `# PROCESS` が丸ごと 1 単位になり、**どれか 1 つが日付を
 * 持てば残り 9 つの欠落が消える**（初版は実際にそうなり、行番号も list の先頭を指していた）。
 * この repo では bullet 1 つが 1 つの記録である ∴ **bullet が単位である。**
 *
 * ⚠ **fence の中は測らない** —— あそこは機械が読む欄であり、人が読む散文ではない。
 *
 * @returns {{no: number, text: string}[]} 単位の開始行と本文
 */
export function paragraphs(text) {
  const lines = text.split(/\r?\n/)
  const out = []
  let buf = []
  let start = 0
  let inFence = false
  const flush = () => {
    if (buf.length > 0) out.push({ no: start + 1, text: buf.join('\n') })
    buf = []
  }
  lines.forEach((line, i) => {
    if (/^\s{0,3}```/.test(line)) {
      flush()
      inFence = !inFence
      return
    }
    if (inFence) return
    if (line.trim() === '') return flush()
    // bullet / 番号付き項目 / 見出し / 表の行は、それぞれが単位を開く。
    if (/^\s{0,3}([-*+]|\d+\.)\s|^\s{0,3}#{1,6}\s|^\s{0,3}\|/.test(line)) flush()
    if (buf.length === 0) start = i
    buf.push(line)
  })
  flush()
  return out
}

/** 主張の語が最初に現れた行（1 起点）。⚠ 単位の先頭ではなく、**そこ**を指す。 */
export function claimLine(unit) {
  const lines = unit.text.split('\n')
  const i = lines.findIndex((l) => CLAIM.test(l))
  return { no: unit.no + (i < 0 ? 0 : i), line: lines[i < 0 ? 0 : i].trim() }
}

/**
 * 走らせて報告する。⚠ **import しただけでは走らない** —— test が純粋関数だけを触れる
 * ようにするためであり、`classify-paths.mjs` が同じ形を採っている。
 */
export function report(log = console.log) {
  const console_ = { log }
  const root = repoRoot()
  const files = tracked(root).filter(inScope)
  const candidates = []
  let claims = 0

  for (const f of files) {
    let text
    try {
      text = readFileSync(path.join(root, f), 'utf8')
    } catch {
      // ⚠ 読めなかったものを 0 と数えない。測れなかったことは、無いことではない。
      console_.log(`⚠ 読めなかった: ${f}`)
      continue
    }
    for (const p of paragraphs(text)) {
      if (!CLAIM.test(p.text)) continue
      claims++
      if (DATED.test(p.text)) continue
      candidates.push({ f, ...claimLine(p) })
    }
  }

  console_.log('# 出所の測定 —— 日付を持たない実測／観測の候補\n')
  console_.log(`測った file: ${files.length}   「実測」「観測」を含む段落: ${claims}\n`)

  if (claims === 0) {
    // ⚠ **陽性対照が取れない状態を、健全さとして報告しない。** 1 件も拾えないなら、
    // 測っているのは対象ではなく道具である。
    console_.log('⚠ **1 段落も拾えなかった。** 対象が無いのか、この道具が壊れているのかを')
    console_.log('  区別できない —— **健全であるとは読まないこと。**')
  } else if (candidates.length === 0) {
    console_.log(`「実測」「観測」を含む ${claims} 段落は、すべて日付を持っている。`)
  } else {
    console_.log(`⚠ 日付を持たない候補 ${candidates.length} 件 / ${claims} 段落中:\n`)
    for (const c of candidates.slice(0, 40)) {
      console_.log(`  ${c.f}:${c.no}  ${c.line.slice(0, 110)}`)
    }
    if (candidates.length > 40) console_.log(`  … 他 ${candidates.length - 40} 件`)
  }

  console_.log(
    '\n⚠ これは heuristic である。**引用と断定を区別できない** ∴ 上に出るのは候補であって' +
      '\n  違反ではない —— 「観測は不在の証拠ではない」のような一般論も同じ語を含む。' +
      '\n⚠ **外部の系が変わったことは、この道具には原理的に見えない。** 見えるのは我々の' +
      '\n  書き方だけであり、書き方が直っていれば、次に踏んだ人が日付を見て自分で疑える。',
  )

  // ⚠ 常に 0 で終わる。門にしないという判断は目的の node のものであり、ここで覆さない。
  return 0
}

// CLI: 直接呼ばれたときだけ走る。
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('provenance-report.mjs')) {
  process.exit(report())
}
