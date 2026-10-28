// aim の記録（人間の決定とエージェントの解釈）を repo から読み、形を検める。
//
// 置き場は `docs/aim-db/<collection>/<id>.json` —— **1 件 1 file** である（人間の決定
// 2026-10-29: 正本は repo）。⚠ **1 件 1 file にしたのは、並行する会話が衝突しないため**
// である —— hub の作業窓は会話ごとに worktree を切る ∴ 2 つの会話が 1 つの file の末尾へ
// 追記すれば、merge のたびに衝突する。file を分ければ、別々の記録は決して同じ行に触れない。
//
// ⚠ **file 名が id である** ∴ 本文に `id` を持たせない —— 2 箇所に置けば、片方だけが動く日が来る。
// この形は `ArtifactData` の `list` に `out_dir` を付けて読み出した形と同じである。

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

/** 記録の既定の在り処。 */
export const DEFAULT_AIM_DB_DIR = 'docs/aim-db'

/** 記録が持つ collection。⚠ 並びは読み手に見せる順でもある。 */
export const COLLECTIONS = ['nodes', 'features', 'categories', 'decisions', 'interpretations']

/** 固定の枠。機能は repo ごとに `features` が持ち、枠だけはどの repo でも同じ。 */
export const FRAMES = [
  ['whole', '全体'],
  ['make', '作る'],
  ['record', '記録する'],
  ['output', '出力する'],
]

/** 決定の `form`。`verbatim` は人間の言葉そのもの、`pinned` は目的として固定された `aim:` の文。 */
export const DECISION_FORMS = ['verbatim', 'paraphrase', 'pinned']

/** id として使える形。⚠ file 名になる ∴ path を登れる字（`/`・`..`）を通さない。 */
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/**
 * 1 件を file の本文へ。key を並べ直し、末尾に改行を置く。
 *
 * ⚠ **並びを固定しないと、中身が同じでも書き手ごとに差分が出る** —— git の差分で「何が
 * 足されたか」を読むための形である。
 */
export function formatRecord(body) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v
  const { id: _drop, ...rest } = body
  return JSON.stringify(sort(rest), null, 2) + '\n'
}

/**
 * repo の記録を読む。
 *
 * ⚠ **在り処が無いことと、読めない file が在ることを分けて返す** —— 前者は「この repo は
 * まだ記録を持たない」であり、後者は壊れた記録である。壊れた記録を黙って飛ばせば、
 * 在る決定を無いと読ませる。
 *
 * @returns {Promise<{present: boolean, store: Record<string, object[]>, unreadable: string[]}>}
 */
export async function readStore(repoRoot, dir = DEFAULT_AIM_DB_DIR) {
  const base = path.join(repoRoot, dir)
  const store = Object.fromEntries(COLLECTIONS.map((c) => [c, []]))
  const unreadable = []
  let present = false
  for (const c of COLLECTIONS) {
    let names
    try {
      names = (await readdir(path.join(base, c))).filter((n) => n.endsWith('.json')).sort()
    } catch {
      continue // collection の dir が無いのは、まだ 1 件も無いことである。
    }
    present = true
    for (const n of names) {
      const id = n.slice(0, -'.json'.length)
      try {
        const body = JSON.parse(await readFile(path.join(base, c, n), 'utf8'))
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object ではない')
        store[c].push({ id, ...body })
      } catch (err) {
        unreadable.push(`${c}/${n}: ${err.message}`)
      }
    }
  }
  return { present, store, unreadable }
}

/**
 * 記録の形を検める。返すのは問題の一覧であり、空なら形は整っている。
 *
 * ⚠ **見るのは形と参照だけである** —— 決定の中身が正しいかは、人間にしか言えない。
 */
export function validateStore(store) {
  const problems = []
  const ids = (c) => new Set(store[c].map((x) => x.id))
  const nodes = ids('nodes')
  const features = ids('features')
  const categories = ids('categories')
  const decisions = ids('decisions')
  const frames = new Set(FRAMES.map(([k]) => k))
  for (const c of COLLECTIONS) {
    for (const x of store[c]) if (!ID.test(x.id)) problems.push(`${c}/${x.id}: id の形が不正`)
  }
  for (const n of store.nodes) {
    if (!n.aim) problems.push(`nodes/${n.id}: aim が無い`)
    if (n.feature && !features.has(n.feature)) problems.push(`nodes/${n.id}: 未定義の機能 ${n.feature}`)
  }
  for (const f of store.features) {
    if (!frames.has(f.frame)) problems.push(`features/${f.id}: 未定義の枠 ${f.frame}`)
    if (!f.label) problems.push(`features/${f.id}: label が無い`)
  }
  const common = (c, x) => {
    if (!nodes.has(x.node)) problems.push(`${c}/${x.id}: 未定義の node ${x.node}`)
    if (x.feature && !features.has(x.feature)) problems.push(`${c}/${x.id}: 未定義の機能 ${x.feature}`)
    if (x.category && !categories.has(x.category)) problems.push(`${c}/${x.id}: 未定義の分類 ${x.category}`)
  }
  for (const d of store.decisions) {
    common('decisions', d)
    if (!DECISION_FORMS.includes(d.form)) problems.push(`decisions/${d.id}: 未定義の form ${d.form}`)
    if ((d.form === 'verbatim' || d.form === 'pinned') && !d.quote) {
      problems.push(`decisions/${d.id}: ${d.form} なのに quote が無い`)
    }
    if (d.form === 'paraphrase' && d.quote) problems.push(`decisions/${d.id}: 言い換えが quote を持つ`)
    if (!d.summary) problems.push(`decisions/${d.id}: summary が無い`)
  }
  for (const i of store.interpretations) {
    common('interpretations', i)
    if (!i.text) problems.push(`interpretations/${i.id}: text が無い`)
    for (const b of i.basis ?? []) {
      if (!decisions.has(b)) problems.push(`interpretations/${i.id}: 実在しない決定を名指す ${b}`)
    }
  }
  return problems
}
