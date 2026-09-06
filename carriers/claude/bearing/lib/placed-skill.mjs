// 置かれた aim skill の刻印 —— **「古い」と「手を入れた」を分けるための、版と指紋。**
//
// ═══ なぜ刻むのか ═══════════════════════════════════════════════════════════
//
// 🔴 **block は marker の sha で「人間が編集した」を確実に読めるが、置かれた skill にはその手段が
// 無かった** ∴ `setup-aim` は「一致しない」までしか言えず、**古いだけの複製も、手を入れた複製と
// 同じ扱いで止めていた**（2026-09-07 の実装）。⚠ **区別できないものは捨てられない** —— だから
// 揃え直すのに `--update` が要り、**触っていない repo にまで「捨ててよいか」を問うていた。**
//
// ⚠ **これは台帳ではない**（台帳は棄却済み。`docs/aims/adoption-declaration.md` の `# HISTORY`）
// —— **状態機械も、別 file の記録も、「我々のものかどうか」の追跡も持たない。** 置いたものが今も
// 置いたままかを、**置かれた file 自身に書いてある 1 行だけで**答える。
//
// ═══ どこへ刻むか —— 実測で決めた ═══════════════════════════════════════════
//
// 🔴 **`SKILL.md` の frontmatter は context に載らない**（実測 2026-09-07、対象: Claude Code
// 2.1.263、1 台）—— skill を読み込ませると、注入されるのは `---` の後の本文だけである。
// ⚠ **未知の field は skill を壊さず、`claude plugin validate` も警告 0 で通る**（✅ 陽性対照:
// `description` を `descriptio` へ崩すと「No description in frontmatter」と警告する ∴ **あの
// validator は確かに skill の frontmatter を読んでいる。何でも通す緑ではない**）。
//
// ⚠ **対して HTML コメントは、skill の本文では除かれない** —— `CLAUDE.md` の marker と違う
// （あちらは docs が「block-level の HTML コメントは注入前に除かれる」と明記している）∴ **本文へ
// 刻めば token を食う。**
//
// 🔴 **∴ 刻印は `SKILL.md` の frontmatter 1 箇所、対象は 3 枚である。**
//
// ⚠ **`aim-authoring.md` / `aim-facts.md` へ個別に刻む形は採らなかった。** あの 2 枚は
// frontmatter を持たない plain markdown であり、**エージェントが `Read` で開く file** ∴ 何を足して
// も context に載る。⚠ **そして版番号だけでは「古い」と分からない** —— 今の版を知らなければ比較
// できず、比較するのは CLI であり、**CLI は 3 枚とも読む。** ∴ 自己記述の価値は費用に見合わない。
// ⚠ **さらに 3 箇所に版が住めば、食い違いうる 3 つになる** —— この repo が繰り返し避けてきた形で
// ある。**1 箇所に列挙すれば、食い違いようがない。**
//
// ═══ 刻印が解かないもの ═════════════════════════════════════════════════════
//
// ⚠ **刻印は、これから置くものにしか付かない。** 既に置かれた skill には無い ∴ **刻印を持たない
// 複製は「区別できない」のままである** —— そこは今までどおり止まる。
//
// ⚠ **そして「版が上がることが corpus の書き換えを伴う」は、刻印では消えない** —— **更新するか
// を決めるのは使う側である**（人間の決定 2026-09-07）。**刻印が変えるのは、我々が何を述べられる
// かであって、誰が決めるかではない。**

import { bodySha } from './claude-md.mjs'

/** frontmatter に置く key。⚠ **`bearing-` で始める** —— 他人の field と衝突しない。 */
export const STAMP_KEY = 'bearing-placed'

/**
 * 刻印の値を組み立てる。
 *
 * ⚠ **YAML の plain scalar に収まる形にする** —— `[` で始めない、`: ` を含めない。**この repo は
 * 2026-09-03 に flow sequence で frontmatter を丸ごと落としており**（`test/carrier-frontmatter.
 * test.mjs`）、**同じ轍を刻印で踏まない。**
 *
 * @param {string} version
 * @param {Record<string, string>} shas file 名 → 指紋
 * @returns {string}
 */
export const renderStamp = (version, shas) =>
  `v${version} ${Object.entries(shas).map(([f, s]) => `${f}=${s}`).join(' ')}`

/**
 * 刻印を読む。⚠ **無ければ `null`** —— **「刻印が無い」と「刻印が古い」は別の事実である。**
 *
 * @param {string} text `SKILL.md` の全文
 * @returns {{version: string, shas: Record<string, string>}|null}
 */
export function parseStamp(text) {
  const line = frontmatterLines(text).find((l) => l.startsWith(`${STAMP_KEY}:`))
  if (!line) return null
  const value = line.slice(STAMP_KEY.length + 1).trim()
  const [head, ...rest] = value.split(/\s+/)
  if (!head?.startsWith('v')) return null
  const shas = {}
  for (const pair of rest) {
    const at = pair.indexOf('=')
    // ⚠ **読めない対は黙って捨てる** —— だが**版だけは返す**: 壊れた刻印は、刻印の不在ではない。
    if (at > 0) shas[pair.slice(0, at)] = pair.slice(at + 1)
  }
  return { version: head.slice(1), shas }
}

/**
 * 刻印の行を落とす。⚠ **比較はこの結果に対して行う** —— さもなくば **我々が書いた 1 行のせいで、
 * 置いたそのものが「一致しない」になる。**
 *
 * @param {string} text
 * @returns {string}
 */
export function stripStamp(text) {
  const { start, end, lines } = frontmatterSpan(text)
  if (start === -1) return text
  // ⚠ **末尾改行を足し直さない** —— `split` は末尾改行を最後の空要素として既に運んでいる。
  // **この repo は 2026-09-05 に同じ轍を踏んでいる**（`with-aim` が置いて外すたび、他人の file の
  // 末尾が 1 行ずつ伸びた。`docs/aims/bearing.md`）∴ round-trip の試験で固定する。
  const kept = lines.filter((l, i) => !(i > start && i < end && l.startsWith(`${STAMP_KEY}:`)))
  return kept.join('\n')
}

/**
 * 刻印を差し込む（既に在れば置き換える）。
 *
 * ⚠ **frontmatter が無い file には刻まない** —— 我々が YAML の header を新設すれば、**その file の
 * 読まれ方そのものを変えてしまう。** 呼ぶ側が `SKILL.md` にだけ使う。
 *
 * @param {string} text
 * @param {string} stamp
 * @returns {string}
 */
export function withStamp(text, stamp) {
  const base = stripStamp(text)
  const { start, end, lines } = frontmatterSpan(base)
  if (start === -1) return base
  const next = [...lines.slice(0, end), `${STAMP_KEY}: ${stamp}`, ...lines.slice(end)]
  return next.join('\n')
}

/** file の指紋。⚠ **block と同じ関数を使う** —— 指紋の採り方が 2 つ在れば、2 つとも信用できない。 */
export const skillSha = bodySha

const frontmatterSpan = (text) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // ⚠ **1 行目が `---` でなければ frontmatter は無い** —— 途中に現れる `---` は区切り線である。
  if (lines[0] !== '---') return { start: -1, end: -1, lines }
  const end = lines.indexOf('---', 1)
  return end === -1 ? { start: -1, end: -1, lines } : { start: 0, end, lines }
}

const frontmatterLines = (text) => {
  const { start, end, lines } = frontmatterSpan(text)
  return start === -1 ? [] : lines.slice(start + 1, end)
}
