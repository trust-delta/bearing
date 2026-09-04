// 消費する repo の `_guide/` へ canon を置く。
//
// ═══ なぜ道具が置くのか ═════════════════════════════════════════════════════
//
// ⚠ **`_guide/README.md` は長らく「plugin は自分では置かない」と述べていた** —— 置くかどうかは
// その repo が規律を採るかどうかの判断であり、道具が代行してよいものではない、という理由で
// ある。⚠ **だがその理由は `with-aim` には掛からない**（人間の決定 2026-09-04）——
// **`with-aim` を打つことがその判断そのものだからである。** CLI 自身が marker を「opt-in の
// 宣言」と呼んでいる ∴ あの瞬間、判断は既に下されており、置くことは代行にならない。
//
// ⚠ **そして「人間が手で置く」道には腐る経路が在った。** 同梱の複製は
// `~/.claude/plugins/cache/<owner>/<plugin>/<version>/skills/aim/…` に在り、**path が version を
// 含む。cache は旧版を消さない**（2026-09-04、1 台に 8 版が並んでいた。最古 `0.4.0`）∴ 手で
// 辿らせれば、**黙って古い canon を置く日が来る** —— [[ambient-display]] と [[human-domain]] が
// 2 度名指した腐り方である。道具が置けば、人間は version を 1 度も見ない。
//
// ═══ 置くが、潰さない ═══════════════════════════════════════════════════════
//
// ⚠ **既に在って中身が違う file は触らない。** 置いた後の `_guide/` は**その repo の doc**で
// あり、人間が直しているかもしれない。上書きは編集を黙って消す ∴ **述べて止まる** ——
// `/bearing:statusline-setup` が既存の面を上書きせず止まるのと同じ律である。
//
// ⚠ **比較の前に改行を正規化する。** `core.autocrlf=true` の機体では checkout が CRLF へ
// 変換する（2026-09-04 に [[observation-provenance]] が実測）∴ 素朴な比較は**中身が同じ file を
// 「違う」と呼ぶ** —— そして「違う」は人間を呼び出す合図なので、偽陽性はそのまま雑音になる。

/**
 * 消費する repo の `_guide/` が持つべき正本と、plugin 内での在り処。
 *
 * ⚠ **`gen/claude-plugin.sh` が「中立正本」と呼ぶ 3 枚と同じ集合である** —— あちらが carrier
 * へ同梱する集合をそのまま使う。⚠ **`frame.md` と `README.md` は入らない**: 前者は
 * SessionStart hook と `CLAUDE.md` の block が運ぶ（消費する側が file として持つ必要は無い）、
 * 後者は `_guide/` を*著述する側*の doc である。
 */
export const CANON_FILES = [
  { name: 'aim-authoring.md', from: ['skills', 'aim', 'aim-authoring.md'] },
  { name: 'aim-facts.md', from: ['skills', 'aim', 'aim-facts.md'] },
  { name: 'handoff.md', from: ['skills', 'handoff-r', 'handoff.md'] },
]

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

/** 改行を正規化する。⚠ **CRLF の checkout を「違う」と呼ばないため。** */
export const normalizeEol = (text) => text.split('\r\n').join('\n')

/**
 * 1 枚の処置。
 * @param {{present: boolean, same: boolean}} state
 * @returns {'place'|'unchanged'|'differs'} place=置く / unchanged=既に同じ / differs=触らない
 */
export function planCanonFile({ present, same }) {
  if (!present) return 'place'
  return same ? 'unchanged' : 'differs'
}

/**
 * 全枚の計画。
 * @param {Array<{name: string, present: boolean, same: boolean}>} entries
 */
export function planCanon(entries) {
  const plan = entries.map((e) => ({ name: e.name, action: planCanonFile(e) }))
  return {
    plan,
    place: plan.filter((p) => p.action === 'place').map((p) => p.name),
    unchanged: plan.filter((p) => p.action === 'unchanged').map((p) => p.name),
    differs: plan.filter((p) => p.action === 'differs').map((p) => p.name),
  }
}

/**
 * 計画を人間の言葉にする。
 * ⚠ **「何もしなかった」を無言で表さない** —— 3 枚とも既に同じでも、そう述べる。
 * @param {ReturnType<typeof planCanon>} p
 * @param {string} dir 置き先（repo 相対）
 * @param {boolean} applied 実際に書いたか（`--check` では false）
 */
export function describeCanon(p, dir, applied) {
  const out = []
  if (p.place.length > 0) {
    out.push(applied
      ? `canon を ${dir} へ置いた: ${p.place.join('、')}`
      : `canon が ${dir} に無い: ${p.place.join('、')}`)
  }
  if (p.unchanged.length > 0) out.push(`canon は既に同じ: ${p.unchanged.join('、')}`)
  if (p.differs.length > 0) {
    // ⚠ **触らないことと、その理由を同じ息で述べる。** 「違う」とだけ言えば、読み手は
    // 道具が直したのか放置したのかを画面から読み取れない。
    out.push(`⚠ ${dir} に在るが中身が違う（触っていない）: ${p.differs.join('、')}`)
    out.push('  —— 置いた後の `_guide/` はその repo の doc である ∴ 編集を黙って消さない。')
    out.push('  差分を見て、採るなら手で置き換えること。')
  }
  return out
}

/** 原子的に書く。⚠ **他人の repo に半分書いた canon を残さない。** */
async function writeAtomic(file, text) {
  const tmp = `${file}.bearing-tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

/**
 * canon の現況を読み、`write` なら**在らない枚だけ**置く。
 *
 * ⚠ **IO をここに置くのは、これが試験したい当のものだからである** —— bin 側に置くと、
 * 試験は bin を import することになり、そこでは top-level の委譲が走る。
 *
 * @param {string} pluginRoot plugin root（委譲後は checkout の working tree）
 * @param {string} guideDir 置き先の `_guide` の絶対 path
 * @param {boolean} write 実際に書くか（`--check` では false）
 * @returns {Promise<{plan: ReturnType<typeof planCanon>, missing: string[]}>}
 *   `missing` = 同梱物が読めなかった枚。⚠ **「置かなかった」と「置く元が無かった」を
 *   同じ沈黙にしない** ∴ 呼ぶ側へ別の欄で返す。
 */
export async function syncCanon(pluginRoot, guideDir, write) {
  const entries = []
  const missing = []
  for (const f of CANON_FILES) {
    let src
    try {
      src = await readFile(path.join(pluginRoot, ...f.from), 'utf8')
    } catch {
      missing.push(f.name)
      continue
    }
    let present = false
    let same = false
    try {
      const cur = await readFile(path.join(guideDir, f.name), 'utf8')
      present = true
      same = normalizeEol(cur) === normalizeEol(src)
    } catch {
      /* 在らず */
    }
    entries.push({ name: f.name, present, same, src })
  }

  const plan = planCanon(entries)
  if (write && plan.place.length > 0) {
    await mkdir(guideDir, { recursive: true })
    for (const e of entries) if (!e.present) await writeAtomic(path.join(guideDir, e.name), e.src)
  }
  return { plan, missing }
}
