#!/usr/bin/env node
// aim の記録（Artifact の DB）を、repo の控えへ書き出す。
//
// 正本は Artifact の DB であり、この控えは**そこから作り直す写し**である（人間の決定
// 2026-10-28: 「1 のあと 2 をしてコミットプッシュ」—— 2 が「repo への控え」）。手で直さない。
// 控えが担うのは 2 つ: ⑴ DB が消えたときの保険（DB は Artifact を削除すると消える。
// 実測ではなく、Artifact の db 型定義の読み 2026-10-28）⑵ git の履歴で「いつ何が足されたか」を
// 辿れること。
//
// 入力は、エージェントが `ArtifactData` の `list` に `out_dir` を付けて読み出した dir である
// （`<dir>/<collection>/<id>.json`、中身は文書の本文そのもの）。hook や node から DB は
// 読めない ∴ 読み出しはエージェントの手で行い、ここは機械的な整形だけを持つ。
//
// 使い方: node scripts/aim-db-export.mjs <読み出した dir> [書き出し先 = docs/aim-db]
//         --allow-shrink を付けたときだけ、件数が減る書き出しを許す。

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 控えに写す collection。⚠ 1 つでも読み出しが欠けていれば書かない（下の `exportDb`）。 */
export const COLLECTIONS = ['nodes', 'features', 'categories', 'decisions', 'interpretations']

/** key を並べ直した複製。⚠ 並びを固定しないと、中身が同じでも DB の返す順で差分が出る。 */
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
  }
  return v
}

/** 1 collection を、id 順・1 文書 1 行の JSON Lines にする。 */
export function toJsonl(docs) {
  return docs
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((d) => JSON.stringify(sortKeys(d)))
    .join('\n') + (docs.length ? '\n' : '')
}

async function readCollection(dir, name) {
  const files = (await readdir(path.join(dir, name))).filter((f) => f.endsWith('.json'))
  const docs = []
  for (const f of files) {
    const body = JSON.parse(await readFile(path.join(dir, name, f), 'utf8'))
    docs.push({ id: f.slice(0, -'.json'.length), ...body })
  }
  return docs
}

async function countLines(file) {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).length
  } catch {
    return 0 // 控えがまだ無いのは、初回の書き出しとして正常である。
  }
}

/**
 * 読み出した dir から控えを書く。
 *
 * 🔴 **件数が減る書き出しは、明示されない限り拒む。** 決定は追記だけの記録である ∴ 減るのは
 * 読み出しの途中切れ（`list` の頁を取り損ねた等）か、DB 側の喪失である。どちらも、控えを
 * 黙って上書きすれば**消えたことが git の差分の中に埋もれる** —— 不可逆かつ沈黙の形である。
 * ⚠ collection の dir が丸ごと無い場合も同じ理由で拒む（0 件と「読んでいない」を畳まない）。
 *
 * @returns {Promise<Record<string, {before: number, after: number}>>}
 */
export async function exportDb(dumpDir, outDir, { allowShrink = false } = {}) {
  const plan = {}
  const bodies = {}
  for (const name of COLLECTIONS) {
    let docs
    try {
      docs = await readCollection(dumpDir, name)
    } catch (err) {
      throw new Error(`${name} の読み出しが無い（${err.code ?? err.message}）—— 控えは書かなかった`)
    }
    const file = path.join(outDir, `${name}.jsonl`)
    plan[name] = { before: await countLines(file), after: docs.length }
    bodies[file] = toJsonl(docs)
  }
  const shrunk = Object.entries(plan).filter(([, p]) => p.after < p.before)
  if (shrunk.length && !allowShrink) {
    const what = shrunk.map(([n, p]) => `${n} ${p.before}→${p.after}`).join('、')
    throw new Error(`件数が減る（${what}）—— 読み出しの途中切れか DB 側の喪失を疑うこと。控えは書かなかった`)
  }
  await mkdir(outDir, { recursive: true })
  for (const [file, body] of Object.entries(bodies)) await writeFile(file, body, 'utf8')
  return plan
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const allowShrink = args.includes('--allow-shrink')
  const [dumpDir, outDir = 'docs/aim-db'] = args.filter((a) => !a.startsWith('--'))
  if (!dumpDir) {
    process.stderr.write('使い方: node scripts/aim-db-export.mjs <読み出した dir> [書き出し先] [--allow-shrink]\n')
    process.exit(2)
  }
  try {
    const plan = await exportDb(dumpDir, outDir, { allowShrink })
    for (const [n, p] of Object.entries(plan)) process.stdout.write(`${n}: ${p.before} → ${p.after}\n`)
  } catch (err) {
    process.stderr.write(`aim-db-export: ${err.message}\n`)
    process.exit(1)
  }
}
