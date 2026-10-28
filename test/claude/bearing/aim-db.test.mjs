// aim の記録（人間の決定とエージェントの解釈）を読み、形を検める lib の test。
//
// ⚠ **この repo の本物の記録が形を通ることも、ここで固定する** —— 記録を壊す commit を CI で止める。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  COLLECTIONS, formatRecord, readStore, validateStore,
} from '../../../carriers/claude/bearing/lib/aim-db.mjs'

const REPO = path.join(import.meta.dirname, '..', '..', '..')

/** 形の整った最小の記録の一揃い。 */
const good = () => ({
  nodes: [{ id: 'n', aim: 'x' }],
  features: [{ id: 'f', frame: 'whole', label: '目的' }],
  categories: [{ id: 'c', label: '話題' }],
  decisions: [{ id: 'n-d01', node: 'n', form: 'verbatim', quote: 'こうしましょう', summary: 's', category: 'c', feature: 'f' }],
  interpretations: [{ id: 'n-i01', node: 'n', text: 't', basis: ['n-d01'], feature: 'f' }],
})

test('formatRecord は key を並べ直し、id を本文から落とす —— 書き手ごとに差分が出ない', () => {
  const a = formatRecord({ id: 'x', z: 1, a: { d: 1, c: 2 } })
  const b = formatRecord({ a: { c: 2, d: 1 }, z: 1, id: 'x' })
  assert.equal(a, b)
  assert.doesNotMatch(a, /"id"/)
  assert.ok(a.endsWith('\n'))
})

test('形の整った記録は問題を返さない（陽性対照）', () => {
  assert.deepEqual(validateStore(good()), [])
})

test('形の崩れを名指す —— 未定義の参照、言い換えの quote、逐語の quote 欠け、不正な id', () => {
  const s = good()
  s.decisions.push({ id: 'n-d02', node: 'ghost', form: 'paraphrase', quote: '言い換えなのに引用', summary: 's' })
  s.decisions.push({ id: 'n-d03', node: 'n', form: 'verbatim', summary: 's' })
  s.interpretations.push({ id: 'n-i02', node: 'n', text: 't', basis: ['n-d99'] })
  s.features.push({ id: '../up', frame: 'nowhere', label: 'x' })
  const p = validateStore(s).join('\n')
  assert.match(p, /n-d02: 未定義の node ghost/)
  assert.match(p, /n-d02: 言い換えが quote を持つ/)
  assert.match(p, /n-d03: verbatim なのに quote が無い/)
  assert.match(p, /n-i02: 実在しない決定を名指す n-d99/)
  assert.match(p, /features\/\.\.\/up: id の形が不正/)
  assert.match(p, /未定義の枠 nowhere/)
})

test('readStore は、在り処が無いことと読めない file を分けて返す', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const none = await readStore(root)
  assert.equal(none.present, false)
  await mkdir(path.join(root, 'docs', 'aim-db', 'decisions'), { recursive: true })
  await writeFile(path.join(root, 'docs', 'aim-db', 'decisions', 'ok.json'), '{"summary":"s"}')
  await writeFile(path.join(root, 'docs', 'aim-db', 'decisions', 'broken.json'), '{')
  const r = await readStore(root)
  assert.equal(r.present, true)
  assert.deepEqual(r.store.decisions.map((x) => x.id), ['ok'])
  assert.equal(r.unreadable.length, 1)
  assert.match(r.unreadable[0], /broken\.json/)
})

test('この repo の記録は読めて、形が整っている', async () => {
  const r = await readStore(REPO)
  assert.equal(r.present, true, 'docs/aim-db が無い —— 測っていない')
  assert.deepEqual(r.unreadable, [])
  // 陽性対照: 0 件どうしの「問題なし」は検査ではない。
  for (const c of COLLECTIONS) assert.ok(r.store[c].length > 0, `${c} が 0 件`)
  assert.deepEqual(validateStore(r.store), [])
})
