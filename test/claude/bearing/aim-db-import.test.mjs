// aim の記録の取り込み —— Artifact の DB から読み出した dir を、repo の正本へ足す。
//
// ⚠ **固定するのは「足すだけで、書き換えない」の 1 つである**（人間の決定 2026-10-29: 正本は
// repo）。決定は追記だけの記録 ∴ 正本と食い違う記録が来たら、何も書かずに止まる。
//
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'aim-db-import.mjs')
const present = await access(SCRIPT).then(() => true, () => false)
const load = () => import(pathToFileURL(SCRIPT).href)
const SKIP = 'scripts/ が無い —— cache から走っている'

/** `<root>/<collection>/<id>.json` の形で記録を置く（DB の読み出しと正本は同じ形）。 */
async function put(root, collections) {
  for (const [c, docs] of Object.entries(collections)) {
    await mkdir(path.join(root, c), { recursive: true })
    for (const [id, body] of Object.entries(docs)) await writeFile(path.join(root, c, `${id}.json`), JSON.stringify(body))
  }
}
const base = {
  nodes: { bearing: { aim: 'x', state: 'open' } },
  features: { 'whole-purpose': { frame: 'whole', label: '目的と範囲' } },
  categories: { purpose: { label: '目的' } },
}
const decision = (summary) => ({ node: 'bearing', form: 'paraphrase', summary, category: 'purpose', feature: 'whole-purpose' })

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repo = path.join(root, 'repo')
  await put(path.join(repo, 'docs', 'aim-db'), { ...base, decisions: { 'bearing-d01': decision('一') } })
  return { root, repo }
}

test('DB にだけ在る記録を足し、既に在って同一の記録は数えるだけ', async (t) => {
  if (!present) return t.skip(SKIP)
  const { importDump } = await load()
  const { root, repo } = await setup(t)
  await put(path.join(root, 'dump'), { ...base, decisions: { 'bearing-d01': decision('一'), 'bearing-d02': decision('二') } })
  const r = await importDump(path.join(root, 'dump'), repo)
  assert.deepEqual(r.added.decisions, ['bearing-d02'])
  const text = await readFile(path.join(repo, 'docs', 'aim-db', 'decisions', 'bearing-d02.json'), 'utf8')
  assert.match(text, /"summary": "二"/)
  assert.doesNotMatch(text, /"id"/, 'file 名が id である ∴ 本文に id を持たせない')
})

test('🔴 正本と食い違う記録が来たら、何も書かずに止まる —— 決定は書き換えない', async (t) => {
  if (!present) return t.skip(SKIP)
  const { importDump } = await load()
  const { root, repo } = await setup(t)
  await put(path.join(root, 'dump'), { ...base, decisions: { 'bearing-d01': decision('書き換えられた一'), 'bearing-d02': decision('二') } })
  await assert.rejects(importDump(path.join(root, 'dump'), repo), /食い違う記録が在る（decisions\/bearing-d01）/)
  await assert.rejects(access(path.join(repo, 'docs', 'aim-db', 'decisions', 'bearing-d02.json')), '止まったのに新しい記録が書かれた')
})

test('DB に無い記録を、正本から消さない', async (t) => {
  if (!present) return t.skip(SKIP)
  const { importDump } = await load()
  const { root, repo } = await setup(t)
  await put(path.join(root, 'dump'), { ...base })
  await importDump(path.join(root, 'dump'), repo)
  await access(path.join(repo, 'docs', 'aim-db', 'decisions', 'bearing-d01.json'))
})

test('足すと形が崩れる記録（存在しない node を名指す）は、何も書かずに止まる', async (t) => {
  if (!present) return t.skip(SKIP)
  const { importDump } = await load()
  const { root, repo } = await setup(t)
  await put(path.join(root, 'dump'), { decisions: { 'ghost-d01': { ...decision('幽霊'), node: 'ghost' } } })
  await assert.rejects(importDump(path.join(root, 'dump'), repo), /未定義の node ghost/)
})
