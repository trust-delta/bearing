#!/usr/bin/env node
// Artifact の DB から読み出した記録を、repo の正本へ取り込む。
//
// 🔴 **正本は repo である**（人間の決定 2026-10-29）∴ この道具が行うのは**足すことだけ**である。
// 決定は追記だけの記録 ∴ repo に既に在る記録は書き換えず、消しもしない。DB の側で人間が
// 新しく書いた記録（ページからの書き込み）を、repo へ迎え入れるための入口である。
//
// ⚠ **既に在る記録と中身が食い違えば、取り込みを丸ごと止める** —— どちらが正しいかは道具には
// 言えない。片方を黙って選べば、もう片方が消えたことは差分に現れない（不可逆かつ沈黙の形）。
//
// 入力は、エージェントが `ArtifactData` の `list` に `out_dir` を付けて読み出した dir である
// （`<dir>/<collection>/<id>.json`）。hook や node から DB は読めない ∴ 読み出しはエージェントの手で行う。
//
// 使い方: node scripts/aim-db-import.mjs <読み出した dir> [正本の root = .]

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  COLLECTIONS, DEFAULT_AIM_DB_DIR, formatRecord, readStore, validateStore,
} from '../carriers/claude/bearing/lib/aim-db.mjs'

/**
 * DB の読み出しを正本へ取り込む計画を立て、問題が無ければ書く。
 *
 * @returns {Promise<{added: Record<string, string[]>, same: number}>}
 */
export async function importDump(dumpDir, repoRoot, dir = DEFAULT_AIM_DB_DIR) {
  // 読み出しは「正本と同じ形の dir」である ∴ 同じ読み手で読む。
  const dump = await readStore(dumpDir, '.')
  if (dump.unreadable.length) throw new Error(`読み出しに読めない file が在る: ${dump.unreadable.join('、')}`)
  const repo = await readStore(repoRoot, dir)
  if (repo.unreadable.length) throw new Error(`正本に読めない file が在る: ${repo.unreadable.join('、')}`)

  const added = Object.fromEntries(COLLECTIONS.map((c) => [c, []]))
  const conflicts = []
  let same = 0
  for (const c of COLLECTIONS) {
    const have = new Map(repo.store[c].map((x) => [x.id, formatRecord(x)]))
    for (const x of dump.store[c]) {
      const text = formatRecord(x)
      if (!have.has(x.id)) added[c].push(x.id)
      else if (have.get(x.id) === text) same++
      else conflicts.push(`${c}/${x.id}`)
    }
  }
  if (conflicts.length) {
    throw new Error(`正本と中身が食い違う記録が在る（${conflicts.join('、')}）—— 何も書かなかった`)
  }
  // ⚠ **足した後の全体で形を検める** —— 新しい記録が、正本に無い node や決定を名指していれば止める。
  const merged = Object.fromEntries(COLLECTIONS.map((c) => [
    c, [...repo.store[c], ...dump.store[c].filter((x) => added[c].includes(x.id))],
  ]))
  const problems = validateStore(merged)
  if (problems.length) throw new Error(`取り込むと形が崩れる: ${problems.join('、')} —— 何も書かなかった`)

  for (const c of COLLECTIONS) {
    if (!added[c].length) continue
    await mkdir(path.join(repoRoot, dir, c), { recursive: true })
    for (const x of dump.store[c].filter((y) => added[c].includes(y.id))) {
      await writeFile(path.join(repoRoot, dir, c, `${x.id}.json`), formatRecord(x), 'utf8')
    }
  }
  return { added, same }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dumpDir, repoRoot = '.'] = process.argv.slice(2)
  if (!dumpDir) {
    process.stderr.write('使い方: node scripts/aim-db-import.mjs <読み出した dir> [正本の root]\n')
    process.exit(2)
  }
  try {
    const { added, same } = await importDump(dumpDir, repoRoot)
    for (const [c, ids] of Object.entries(added)) process.stdout.write(`${c}: ${ids.length} 件を足した\n`)
    process.stdout.write(`既に在って同一: ${same} 件\n`)
  } catch (err) {
    process.stderr.write(`aim-db-import: ${err.message}\n`)
    process.exit(1)
  }
}
