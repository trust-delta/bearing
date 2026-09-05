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
// ═══ carrier の md は正本である（2026-09-05 に反転した）═══════════════════════
//
// ⚠ **2026-09-05 まで `carriers/**/{skills,templates,commands}/**` は `original/` からの生成物
// だった** ∴ ここでは「docs 由来の生成物」として扱い、同期の検証を呼び出し側へ要求していた。
// **人間が `original/` を畳み、carrier を正本にした** —— 生成は純粋な複製でしかなく、複製が
// 複製であることを守るためだけに門を 3 つ持っていたからである（`CONTRIBUTING.md`）。
// ∴ carrier の md は**ただの docs** になった。
//
// ═══ 置かれた複製という罠 ═══════════════════════════════════════════════════
//
// ⚠ **代わりに、罠は `.claude/skills/` へ移った。** あそこは `setup-aim` が
// `carriers/claude/bearing/templates/aim/` から**置いた複製**であり、**bearing は自分の消費者の
// 1 つである** ∴ 正本を直せば置かれた複製も routinely 動く。素朴な path 判定はこれを code と
// 呼び、正当な docs 直プッシュを弾く。
//
// ここでは `.claude/skills/**` を「docs 由来」として扱うが、⚠ **それが許されるのは、置かれた
// 複製が正本と同期しており、かつ他に code が動いていないときだけである。** 同期の検証は
// 呼び出し側が行う（`test/placed-skill-sync.test.mjs` が byte 同一を見る）—— この file は path
// しか見ないと述べておく。
//
// ⚠ **`CLAUDE.md` は「一部だけ生成物」だが `docs` に置く。** marker の内側は
// `/bearing:setup-aim` が置く法の block で、外側は人が書いた repo 固有の規律である ∴
// **docs の変更が routinely 書き換えることはない**（置き直すのは人間の act）—— 上の
// `.claude/skills/**` とはそこが違う。⚠ **block が古くなる問題は残る** ∴ 検めるのは
// `bearing-setup-aim.mjs --check` であって、この file ではない。

/** docs の allowlist。ここに一致しないものは code。 */
const DOCS = [
  /^docs\//, //                      aim node
  /(^|\/)carriers\/[^/]+\/[^/]+\/(skills|templates|commands)\//, // 配布する規律の正本（md のみ）
  /(^|\/)README(\.[a-z]{2})?\.md$/, // 日本語正本と翻訳
  /(^|\/)CLAUDE\.md$/, //          repo 共通の初期注入プロンプト（人間の決定 2026-09-04）
  /(^|\/)CONTRIBUTING\.md$/, //     開発に加わる人向け（日本語のみ）
  /(^|\/)LICENSE(\.[a-z]+)?$/i,
]

/** 置かれた複製。docs 扱いだが、正本との同期の検証を呼び出し側に要求する。 */
const GENERATED = [/^\.claude\/skills\//]

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
    /** PR が必須か。⚠ 置かれた複製だけが動いた場合は false —— ただし同期の検証が前提。 */
    needsPullRequest: code.length > 0,
    /** 置かれた複製が動いた ∴ 呼び出し側は正本との同期を確かめねばならない。 */
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
  list('置かれた複製（docs 由来 — 正本との同期が前提）', r.generated)
  list('code', r.code)

  console.log('')
  if (r.needsPullRequest) {
    console.log('⚠ **code を含む ∴ PR が必須である。** main への直プッシュは規則違反になる。')
    process.exit(1)
  }
  console.log('docs のみ ∴ main への直プッシュが可能である。')
  if (r.needsSyncCheck) {
    console.log(
      '⚠ ただし置かれた複製が動いている。`carriers/claude/bearing/templates/` の正本と' +
        '一致していることを確かめること —— この判定は path しか見ていない。',
    )
  }
  process.exit(0)
}
