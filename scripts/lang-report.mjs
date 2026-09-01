#!/usr/bin/env node
// 言語混在の測定 —— `docs/aims/operator-language.md` が要求する「測る手段」。
//
// ⚠ **これは警告であって門ではない。** あの node の前提（混在より統一の方が指示の質が高い）は
// **まだ実測されていない** ∴ 規律を硬い門にするのは早い。ここが供給するのは、混在が入り込んだ
// ときに**気づける**という一点だけである。
//
// ⚠ **この測定は heuristic であり、自分の限界を述べる義務がある。** 引用された英語の術語と、
// 英語の散文とを区別できない —— `git`・`HEAD`・`working tree` のような語は日本語の文の中に
// 正当に現れる。∴ 出るのは**候補**であって違反ではない。数えられなかったものを 0 に倒さない。
//
// 判別線は目的の node が引いたとおり「人が読む文か、機械が parse する token か」である ∴
// 識別子・fence の tag と field 名・値・slug・test 名は測定から外す。

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const JA = /[぀-ヿ㐀-鿿]/
const JA_G = /[぀-ヿ㐀-鿿]/g
const EN_G = /[A-Za-z]/g

/** 日本語であることが期待される層。ここ以外は測るが、候補は挙げない。 */
const JA_LAYERS = [
  { name: 'aim node', test: (f) => f.startsWith('docs/aims/') && !f.startsWith('docs/aims/_guide/') },
  { name: 'canon (_guide)', test: (f) => f.startsWith('docs/aims/_guide/') },
  { name: 'skills (carrier)', test: (f) => f.includes('/skills/') },
  { name: 'bin + lib', test: (f) => /\/(bin|lib)\/.*\.mjs$/.test(f) },
  { name: 'README (日本語正本)', test: (f) => /(^|\/)README\.md$/.test(f) },
]

/** 英語であることが正しい層 —— 測るが、候補は挙げない。 */
const EN_OK = [
  { name: 'README.en (翻訳)', test: (f) => /(^|\/)README\.en\.md$/.test(f) },
  { name: 'test (名は英語のまま)', test: (f) => f.includes('/test/') },
]

function tracked() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
}

function ratio(text) {
  const ja = (text.match(JA_G) || []).length
  const en = (text.match(EN_G) || []).length
  return { ja, en, pct: ja + en ? Math.round((ja * 100) / (ja + en)) : 0 }
}

/**
 * `.mjs` から、人が読むために書かれた行だけを取り出す —— コメントと、長い文字列 literal。
 *
 * ⚠ 識別子と短い literal は落とす。`'utf8'` や `'rev-parse'` を英語の散文と数えれば、
 * この道具は自分が測るべきでないものを測ることになる。
 */
function proseLines(text) {
  const out = []
  // ⚠ JSDoc の型注釈は散文ではない。`@param {{a: string, b: number}}` は複数行に折り返され、
  // その継続行は英単語の連なりに見える —— 実測で 2 件の誤検出を出した。tag に入ったら、
  // 空の `*` 行か block の終わりまで散文とみなさない。
  let inTypeTag = false
  text.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim()
    if (/^\*?\s*@(param|returns?|type|typedef)\b/.test(trimmed)) inTypeTag = true
    else if (inTypeTag && (/^\*\/?$/.test(trimmed) || trimmed === '' || /\*\/$/.test(trimmed))) {
      inTypeTag = false
    }
    if (inTypeTag) return

    const isComment = /^(\/\/|\*|\/\*)/.test(trimmed)
    // 4 語以上の英単語が連なる文字列 literal だけを散文とみなす。
    const literal = /['"`][^'"`]*\b[A-Za-z]{2,}\b(\s+\b[A-Za-z']{2,}\b){3,}[^'"`]*['"`]/.test(line)
    if (isComment || literal) out.push({ no: i + 1, line: trimmed })
  })
  return out
}

/** 英語の散文に見え、日本語を 1 文字も含まない行。 */
function englishProse(lines) {
  return lines.filter((l) => {
    if (JA.test(l.line)) return false
    // JSDoc の型注釈と区切り線は散文ではない。
    if (/^\*?\s*@(param|returns?|type|typedef)\b/.test(l.line)) return false
    if (/^(\/\/|\*)?[\s─═*/-]*$/.test(l.line)) return false
    const words = (l.line.match(/\b[A-Za-z']{2,}\b/g) || []).length
    return words >= 4
  })
}

const files = tracked()
const layerOf = (f) => {
  for (const l of [...JA_LAYERS, ...EN_OK]) if (l.test(f)) return l.name
  return 'その他'
}
const expectJa = new Set(JA_LAYERS.map((l) => l.name))

const byLayer = new Map()
const candidates = []

for (const f of files) {
  let text
  try {
    text = readFileSync(f, 'utf8')
  } catch {
    continue // 読めない file は測らない。読めなかったと数えるほうが、0 と数えるより正しい。
  }
  const name = layerOf(f)
  const r = ratio(text)
  const acc = byLayer.get(name) ?? { ja: 0, en: 0, files: 0 }
  byLayer.set(name, { ja: acc.ja + r.ja, en: acc.en + r.en, files: acc.files + 1 })

  if (expectJa.has(name) && /\.mjs$/.test(f)) {
    for (const hit of englishProse(proseLines(text))) candidates.push({ f, ...hit })
  }
}

console.log('# 言語の測定 —— 混在の候補と、層ごとの比率\n')
console.log('層ごとの日本語比率（日本語文字 /（日本語文字＋英字））:\n')
for (const [name, a] of byLayer) {
  const pct = a.ja + a.en ? Math.round((a.ja * 100) / (a.ja + a.en)) : 0
  const mark = expectJa.has(name) ? '日本語期待' : '　　　　　'
  console.log(`  ${String(pct).padStart(3)}%  ${mark}  ${name}  (${a.files} file)`)
}

console.log('')
if (candidates.length === 0) {
  console.log('日本語が期待される `.mjs` の散文層に、英語の散文候補は無い。')
} else {
  console.log(`⚠ 英語の散文候補 ${candidates.length} 件（日本語が期待される層の \`.mjs\`）:\n`)
  for (const c of candidates.slice(0, 40)) {
    console.log(`  ${c.f}:${c.no}  ${c.line.slice(0, 100)}`)
  }
  if (candidates.length > 40) console.log(`  … 他 ${candidates.length - 40} 件`)
}

console.log(
  '\n⚠ これは heuristic である。引用された英語の術語と英語の散文を区別できない ∴ 上に出るのは' +
    '\n  **候補**であって違反ではない。逆に、日本語を 1 文字でも含む英語の行はここに出ない。' +
    '\n  この道具は門ではなく、混在に**気づく**ためだけに在る。',
)

// ⚠ 常に 0 で終わる。門にしないという判断は operator のものであり、ここで覆さない。
process.exit(0)
