// aim の記録の控え —— Artifact の DB から読み出した dir を、repo の JSON Lines へ書き出す。
//
// ⚠ **固定するのは「黙って減らさない」と「差分が安定する」の 2 つである。** 決定は追記だけの
// 記録 ∴ 読み出しの途中切れで控えを上書きすれば、消えたことが git の差分に埋もれる。
//
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'aim-db-export.mjs')
const present = await access(SCRIPT).then(() => true, () => false)
const load = () => import(pathToFileURL(SCRIPT).href)
const SKIP = 'scripts/ が無い —— cache から走っている'

/** `ArtifactData` の `list` + `out_dir` と同じ形の読み出しを作る。 */
async function dump(root, collections) {
  for (const [name, docs] of Object.entries(collections)) {
    await mkdir(path.join(root, name), { recursive: true })
    for (const [id, body] of Object.entries(docs)) {
      await writeFile(path.join(root, name, `${id}.json`), JSON.stringify(body))
    }
  }
}
const full = (decisions) => ({
  nodes: { bearing: { aim: 'x', state: 'open' } },
  features: { 'whole-purpose': { frame: 'whole', label: '目的と範囲' } },
  categories: { purpose: { label: '目的' } },
  decisions,
  interpretations: { 'bearing-i01': { text: 't', basis: ['bearing-d01'] } },
})

test('id 順・key 順の 1 文書 1 行になる —— DB の返す順で差分が出ない', async (t) => {
  if (!present) return t.skip(SKIP)
  const { toJsonl } = await load()
  const a = toJsonl([{ id: 'b', z: 1, a: 2 }, { id: 'a', y: { d: 1, c: 2 } }])
  const b = toJsonl([{ a: 2, id: 'b', z: 1 }, { y: { c: 2, d: 1 }, id: 'a' }])
  assert.equal(a, b)
  assert.equal(a, '{"id":"a","y":{"c":2,"d":1}}\n{"a":2,"id":"b","z":1}\n')
})

test('5 つの collection を書き出し、件数を述べる', async (t) => {
  if (!present) return t.skip(SKIP)
  const { exportDb } = await load()
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await dump(path.join(root, 'in'), full({ 'bearing-d01': { quote: '逐語' }, 'bearing-d02': { quote: '二' } }))
  const plan = await exportDb(path.join(root, 'in'), path.join(root, 'out'))
  assert.deepEqual(plan.decisions, { before: 0, after: 2 })
  const text = await readFile(path.join(root, 'out', 'decisions.jsonl'), 'utf8')
  assert.equal(text.trim().split('\n').length, 2)
  assert.match(text, /"id":"bearing-d01"/)
})

test('🔴 件数が減る書き出しは拒み、控えに触れない —— 決定は追記だけの記録である', async (t) => {
  if (!present) return t.skip(SKIP)
  const { exportDb } = await load()
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await dump(path.join(root, 'a'), full({ 'bearing-d01': {}, 'bearing-d02': {} }))
  await exportDb(path.join(root, 'a'), path.join(root, 'out'))
  const before = await readFile(path.join(root, 'out', 'decisions.jsonl'), 'utf8')
  // 読み出しの途中切れを模す: 決定が 1 件しか無い。
  await dump(path.join(root, 'b'), full({ 'bearing-d01': {} }))
  await assert.rejects(exportDb(path.join(root, 'b'), path.join(root, 'out')), /件数が減る（decisions 2→1）/)
  assert.equal(await readFile(path.join(root, 'out', 'decisions.jsonl'), 'utf8'), before, '拒んだのに控えが書き換わった')
  // 明示すれば通る（DB 側で意図して消した場合）。
  const plan = await exportDb(path.join(root, 'b'), path.join(root, 'out'), { allowShrink: true })
  assert.deepEqual(plan.decisions, { before: 2, after: 1 })
})

test('collection の読み出しが丸ごと無ければ書かない —— 0 件と「読んでいない」を畳まない', async (t) => {
  if (!present) return t.skip(SKIP)
  const { exportDb } = await load()
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const partial = full({ 'bearing-d01': {} })
  delete partial.interpretations
  await dump(path.join(root, 'in'), partial)
  await assert.rejects(exportDb(path.join(root, 'in'), path.join(root, 'out')), /interpretations の読み出しが無い/)
  await assert.rejects(access(path.join(root, 'out', 'decisions.jsonl')), '一部だけ書かれている')
})
