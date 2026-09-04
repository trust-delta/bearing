// 消費する repo の `_guide/` へ canon を置き、我々が置いたままなら最新へ追随させる。
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
// 含む。cache は旧版を消さない**（実測 2026-09-04、1 台に 8 版。最古 `0.4.0`）∴ 手で辿らせれば、
// **黙って古い canon を置く日が来る** —— [[ambient-display]] と [[human-domain]] が 2 度名指した
// 腐り方である。道具が置けば、人間は version を 1 度も見ない。
//
// ═══ 「人間が直した」と「版が古い」を分ける ═════════════════════════════════
//
// ⚠ **最初の実装は、この 2 つを「中身が違う」の一語に畳んでいた**（2026-09-04、人間が指摘）。
// **`CLAUDE.md` の block は同じ問題を既に解いている** —— marker が版と本文 sha を運ぶので、
// `edited`（人間が手を入れた）と `stale`（版が古い）は別の状態として述べられる。∴ **同じ repo の
// 中で、片方だけが解かれていた。**
//
// ⚠ **canon の file に marker を挿す道は採れない。** 挿せば canon の中身が書き換わり、
// **bearing 自身の `_guide/`（正本・marker 無し）と食い違う** —— bearing に `with-aim` を打つと、
// 自分の正本へ marker を挿そうとする形になる。∴ **足場は file の外に置く** ＝ manifest である。
// **正本は 1 byte も動かない。**
//
// ⚠ **manifest が記録するのは「我々が最後に置いた sha」だけである。** file がその sha のままなら
// 我々のもの ∴ **黙って最新へ更新してよい**（人間の決定 2026-09-04）。ずれていれば人間が
// 直している ∴ **触らない。** 記録が無ければ**由来不明**であり、これも触らない ——
// ⚠ **「我々のではない」と「我々のだが古い」を同じ扱いにしないことが、この機構の全部である。**
//
// ═══ 置くが、潰さない ═══════════════════════════════════════════════════════
//
// ⚠ **比較の前に改行を正規化する。** `core.autocrlf=true` の機体では checkout が CRLF へ
// 変換する（2026-09-04 に [[observation-provenance]] が実測）∴ 素朴な比較は**中身が同じ file を
// 「違う」と呼ぶ** —— そして「違う」は人間を呼び出す合図なので、偽陽性はそのまま雑音になる。

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { bodySha } from './claude-md.mjs'

/**
 * 消費する repo の `_guide/` が持つべき正本と、plugin 内での在り処。
 *
 * ⚠ **入るのは *aim の* canon だけである。** ここは `with-aim` ＝ **aim の opt-in** が置く
 * 場所であり、置いたものは aim を採った repo にしか届かない。
 *
 * ⚠ **∴ `handoff.md` は入らない**（人間が 2026-09-04 に正した）—— **handoff は aim と明確に
 * 分離されており、`with-aim` 無しで動かねばならない。** ここへ入れれば、**handoff の canon が
 * aim の採用に依存する**ことになり、その分離を実装が破る。⚠ **そして入れる必要も無い**:
 * `handoff-r` / `handoff-w` の skill は自分の同梱物を裸の名で指しており、**repo 側の
 * `_guide/handoff.md` を 1 度も要求しない**（実測 2026-09-04）。
 *
 * ⚠ **`frame.md` と `README.md` も入らない**: 前者は SessionStart hook と `CLAUDE.md` の block が
 * 運び、後者は `_guide/` を*著述する側*の doc である。
 */
export const CANON_FILES = [
  { name: 'aim-authoring.md', from: ['skills', 'aim', 'aim-authoring.md'] },
  { name: 'aim-facts.md', from: ['skills', 'aim', 'aim-facts.md'] },
]

/** 我々が置いたものを記録する台帳。⚠ **canon の外に置く**（上の見出しを見よ）。 */
export const MANIFEST = '.bearing-canon.json'

/** 改行を正規化する。⚠ **CRLF の checkout を「違う」と呼ばないため。** */
export const normalizeEol = (text) => text.split('\r\n').join('\n')

/**
 * 1 枚の状態。
 *
 * ⚠ **`current` を先に見る。** 中身が正本と同じなら、manifest が何と言おうと最新である ——
 * **手で正しく置いた repo を「由来不明」と呼んではならない**（呼べば、正しい状態が警告を
 * 出し続ける）。
 *
 * @param {{present: boolean, fileSha: string|null, sourceSha: string, recordedSha: string|null}} s
 * @returns {'place'|'current'|'stale'|'edited'|'unknown'}
 */
export function classifyCanonFile({ present, fileSha, sourceSha, recordedSha }) {
  if (!present) return 'place'
  if (fileSha === sourceSha) return 'current'
  if (recordedSha == null) return 'unknown' // 我々が置いた記録が無い ∴ 由来が分からない
  return recordedSha === fileSha ? 'stale' : 'edited'
}

/**
 * 全枚の計画。⚠ **書くのは `place` と `stale` だけ** —— `edited` と `unknown` は触らない。
 * @param {Array<{name: string, present: boolean, fileSha: string|null, sourceSha: string, recordedSha: string|null}>} entries
 */
export function planCanon(entries) {
  const plan = entries.map((e) => ({ name: e.name, action: classifyCanonFile(e) }))
  const of = (a) => plan.filter((p) => p.action === a).map((p) => p.name)
  const groups = {
    place: of('place'), current: of('current'), stale: of('stale'),
    edited: of('edited'), unknown: of('unknown'),
  }
  return { plan, ...groups, write: [...groups.place, ...groups.stale] }
}

/**
 * 計画を人間の言葉にする。
 * ⚠ **5 つの状態を 5 つの文で述べる** —— 畳めば、読み手は何が起きたのかを画面から
 * 読み取れない。⚠ **「何もしなかった」も無言で表さない。**
 *
 * @param {ReturnType<typeof planCanon>} p
 * @param {string} dir 置き先（repo 相対）
 * @param {boolean} applied 実際に書いたか（`--check` では false）
 */
export function describeCanon(p, dir, applied) {
  const out = []
  const join = (xs) => xs.join('、')
  if (p.place.length > 0) {
    out.push(applied ? `canon を ${dir} へ置いた: ${join(p.place)}`
                     : `canon が ${dir} に無い: ${join(p.place)}`)
  }
  if (p.stale.length > 0) {
    // ⚠ **更新できる根拠を同じ息で述べる** —— 「古い」だけでは、なぜ黙って書き換えてよいのかが
    // 読み手に伝わらない。
    out.push(applied ? `canon を最新へ更新した（置いたときのまま ∴ 上書きが安全）: ${join(p.stale)}`
                     : `canon の版が古い（置いたときのまま ∴ 更新できる）: ${join(p.stale)}`)
  }
  if (p.current.length > 0) out.push(`canon は既に最新: ${join(p.current)}`)
  if (p.edited.length > 0) {
    out.push(`⚠ 人間が手を入れている（触っていない）: ${join(p.edited)}`)
    out.push('  —— 置いた後の `_guide/` はその repo の doc である ∴ 編集を黙って消さない。')
  }
  if (p.unknown.length > 0) {
    out.push(`⚠ 由来が分からない（触っていない）: ${join(p.unknown)}`)
    out.push('  —— 我々が置いた記録が無く、中身も今の正本と違う ∴ 古い版か、別経路で置かれたもの。')
  }
  if (p.edited.length + p.unknown.length > 0) out.push('  差分を見て、採るなら手で置き換えること。')
  return out
}

/** 台帳を読む。⚠ **壊れていたら「無い」に畳まず、そう返す**（壊れた記録は無い記録より声が大きい）。 */
export async function readManifest(guideDir) {
  let raw
  try {
    raw = await readFile(path.join(guideDir, MANIFEST), 'utf8')
  } catch {
    return { files: {}, version: null, broken: false, present: false }
  }
  try {
    const j = JSON.parse(raw)
    const files = j?.files
    if (!files || typeof files !== 'object') throw new Error('files が無い')
    return { files, version: j.version ?? null, broken: false, present: true }
  } catch {
    return { files: {}, version: null, broken: true, present: true }
  }
}

/** 原子的に書く。⚠ **他人の repo に半分書いた canon を残さない。** */
async function writeAtomic(file, text) {
  const tmp = `${file}.bearing-tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

/**
 * canon の現況を読み、`write` なら **`place` と `stale` の枚だけ**置く。
 *
 * ⚠ **IO をここに置くのは、これが試験したい当のものだからである** —— bin 側に置くと、
 * 試験は bin を import することになり、そこでは top-level の委譲が走る。
 *
 * @param {string} pluginRoot plugin root（委譲後は checkout の working tree）
 * @param {string} guideDir 置き先の `_guide` の絶対 path
 * @param {boolean} write 実際に書くか（`--check` では false）
 * @param {string} version 台帳へ記録する plugin の版
 * @returns {Promise<{plan, missing: string[], manifest}>}
 *   `missing` = 同梱物が読めなかった枚。⚠ **「置かなかった」と「置く元が無かった」を
 *   同じ沈黙にしない** ∴ 別の欄で返す。
 */
export async function syncCanon(pluginRoot, guideDir, write, version = 'unknown') {
  const manifest = await readManifest(guideDir)
  const entries = []
  const missing = []

  for (const f of CANON_FILES) {
    let source
    try {
      source = await readFile(path.join(pluginRoot, ...f.from), 'utf8')
    } catch {
      missing.push(f.name)
      continue
    }
    const sourceSha = bodySha(source)
    let present = false
    let fileSha = null
    try {
      fileSha = bodySha(await readFile(path.join(guideDir, f.name), 'utf8'))
      present = true
    } catch {
      /* 在らず */
    }
    // ⚠ **台帳が壊れているときは、記録が無いのと同じに扱う** —— 読めない記録を根拠に
    // 他人の file を上書きしてはならない。壊れていること自体は呼ぶ側が述べる。
    const recordedSha = manifest.broken ? null : (manifest.files[f.name] ?? null)
    entries.push({ name: f.name, present, fileSha, sourceSha, recordedSha, source })
  }

  const plan = planCanon(entries)

  if (write && (plan.write.length > 0 || (entries.length > 0 && !manifest.present))) {
    await mkdir(guideDir, { recursive: true })
    const toWrite = new Set(plan.write)
    for (const e of entries) if (toWrite.has(e.name)) await writeAtomic(path.join(guideDir, e.name), e.source)

    // ⚠ **台帳に記録するのは、我々の手元に在ると言い切れる枚だけである。** `edited` と
    // `unknown` は前の記録をそのまま残す —— 今の正本の sha を書けば、**次の実行がそれを
    // 「我々のまま」と読んで人間の編集を踏む。**
    const files = { ...(manifest.broken ? {} : manifest.files) }
    for (const e of entries) {
      const action = plan.plan.find((p) => p.name === e.name).action
      if (action === 'place' || action === 'stale' || action === 'current') files[e.name] = e.sourceSha
    }
    await writeAtomic(
      path.join(guideDir, MANIFEST),
      `${JSON.stringify({ version, files }, null, 2)}\n`,
    )
  }

  return { plan, missing, manifest }
}
