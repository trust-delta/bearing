#!/usr/bin/env node
// 変更された path を「docs」と「code」に分ける —— 直プッシュ可否を決める唯一の判定。
//
// 規則（人間が 2026-09-01 に定めた）: **非コードのドキュメント系は main へ直プッシュ可。
// コードを含む場合は PR 必須。**
//
// ⚠ **この判定は 1 箇所にしか無い。** pre-push hook（行為の瞬間に止める側）と CI guard
// （着地後に赤くする側）が別々に path を判定すれば、**両者は必ず乖離し、しかも乖離は
// 黙って起きる** —— hook が通した push を CI が違反と呼ぶ日が来る。∴ 両方がこの file を呼ぶ。
//
// ═══ docs は allowlist である（既定は deny）═══════════════════════════════════
//
// ⚠ **知らない path は code として扱う。** 逆にすると、新しく増えた種類の file が黙って
// 直プッシュ可になる —— 「悪いセンサーはセンサーが無いことに劣る」の、この規則における形。
// 過剰に PR を要求する方は目に見えて直せるが、取りこぼしは見えない。
//
// ═══ 生成物という罠 ═════════════════════════════════════════════════════════
//
// ⚠ **`carriers/**/skills/**` は `docs/aims/_guide/` からの生成物である**（`gen/claude-plugin.sh`）
// ∴ **canon を直しただけの docs 変更が、routinely `skills/**` を書き換える。** 素朴な path
// 判定はこれを code と呼び、正当な docs 直プッシュを弾く。
//
// ここでは `skills/**` を「docs 由来」として扱うが、⚠ **それが許されるのは、生成物が正本と
// 同期しており、かつ他に code が動いていないときだけである。** 同期の検証は呼び出し側が
// 行う（CI は再生成して diff を取る）—— この file は path しか見ないと述べておく。
//
// ⚠ **`CLAUDE.md` は「一部だけ生成物」だが `docs` に置く。** marker の内側は
// `/bearing:with-aim` が置く法の block で、外側は人が書いた repo 固有の規律である ∴
// **docs の変更が routinely 書き換えることはない**（置き直すのは人間の act）—— 上の
// `skills/**` とはそこが違う。⚠ **block が古くなる問題は残る** ∴ 検めるのは
// `bearing-with-aim.mjs --check` であって、この file ではない。

/** docs の allowlist。ここに一致しないものは code。 */
const DOCS = [
  /^docs\//, //                      aim node と canon
  /(^|\/)README(\.[a-z]{2})?\.md$/, // 日本語正本と翻訳
  /(^|\/)CLAUDE\.md$/, //          repo 共通の初期注入プロンプト（人間の決定 2026-09-04）
  /(^|\/)CONTRIBUTING\.md$/, //     開発に加わる人向け（日本語のみ）
  /(^|\/)LICENSE(\.[a-z]+)?$/i,
]

/** docs 由来の生成物。docs 扱いだが、同期の検証を呼び出し側に要求する。 */
const GENERATED = [/(^|\/)carriers\/[^/]+\/[^/]+\/skills\//]

export function classify(paths) {
  const docs = []
  const generated = []
  const code = []
  for (const p of paths) {
    if (GENERATED.some((re) => re.test(p))) generated.push(p)
    else if (DOCS.some((re) => re.test(p))) docs.push(p)
    else code.push(p)
  }
  return {
    docs,
    generated,
    code,
    /** PR が必須か。⚠ 生成物だけが動いた場合は false —— ただし同期の検証が前提。 */
    needsPullRequest: code.length > 0,
    /** 生成物が動いた ∴ 呼び出し側は正本との同期を確かめねばならない。 */
    needsSyncCheck: generated.length > 0,
  }
}

// CLI: path を stdin から 1 行 1 件で受け、判定を出す。exit 1 = PR 必須。
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('classify-paths.mjs')) {
  const chunks = []
  process.stdin.setEncoding('utf8')
  for await (const c of process.stdin) chunks.push(c)
  const paths = chunks.join('').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)

  if (paths.length === 0) {
    console.log('変更された path が無い。')
    process.exit(0)
  }

  const r = classify(paths)
  const list = (label, xs) => {
    if (xs.length === 0) return
    console.log(`\n${label}（${xs.length}）:`)
    for (const p of xs.slice(0, 30)) console.log(`  ${p}`)
    if (xs.length > 30) console.log(`  … 他 ${xs.length - 30} 件`)
  }
  list('docs', r.docs)
  list('生成物（docs 由来 — 正本との同期が前提）', r.generated)
  list('code', r.code)

  console.log('')
  if (r.needsPullRequest) {
    console.log('⚠ **code を含む ∴ PR が必須である。** main への直プッシュは規則違反になる。')
    process.exit(1)
  }
  console.log('docs のみ ∴ main への直プッシュが可能である。')
  if (r.needsSyncCheck) {
    console.log(
      '⚠ ただし生成物が動いている。`gen/claude-plugin.sh --plugin` を走らせた結果と' +
        '一致していることを確かめること —— この判定は path しか見ていない。',
    )
  }
  process.exit(0)
}
