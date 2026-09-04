// `with-aim` が canon を置く振る舞いの test。
//
// ⚠ **ここで守っているのは 2 つである。** ⑴ **法を置いた repo に、法が指す canon が在る**
// —— 置かれた法の第 1 条は `<corpus>/_guide/aim-authoring.md` を指しており、無ければその条は
// 最初から満たせない。⑵ **既に在るものを潰さない** —— 置いた後の `_guide/` はその repo の
// doc であり、人間が直しているかもしれない。
//
// ⚠ **比較は改行を正規化してから行う。** `core.autocrlf=true` の機体では checkout が CRLF へ
// 変える ∴ 素朴な比較は**中身が同じ file を「違う」と呼ぶ** —— そして「違う」は人間を呼び出す
// 合図なので、偽陽性はそのまま雑音になる。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  CANON_FILES, normalizeEol, planCanonFile, planCanon, describeCanon, syncCanon,
} from '../lib/canon.mjs'

const PLUGIN_ROOT = path.join(import.meta.dirname, '..')
const fresh = () => mkdtemp(path.join(tmpdir(), 'bearing-canon-'))

// ── 計画（純関数）─────────────────────────────────────────────────────────────

test('在らなければ置く／同じなら何もしない／違えば触らない', () => {
  assert.equal(planCanonFile({ present: false, same: false }), 'place')
  assert.equal(planCanonFile({ present: true, same: true }), 'unchanged')
  assert.equal(planCanonFile({ present: true, same: false }), 'differs')
})

test('計画は 3 つの欄に分かれる —— 混ぜない', () => {
  const p = planCanon([
    { name: 'a', present: false, same: false },
    { name: 'b', present: true, same: true },
    { name: 'c', present: true, same: false },
  ])
  assert.deepEqual(p.place, ['a'])
  assert.deepEqual(p.unchanged, ['b'])
  assert.deepEqual(p.differs, ['c'])
})

test('CRLF の checkout を「違う」と呼ばない', () => {
  const lf = '---\naim: x\n---\n本文\n'
  assert.equal(normalizeEol(lf.split('\n').join('\r\n')), lf)
})

test('何もしなかったことも述べる —— 無言で表さない', () => {
  const p = planCanon([{ name: 'a', present: true, same: true }])
  const out = describeCanon(p, 'docs/aims/_guide', true).join('\n')
  assert.match(out, /既に同じ/)
  assert.match(out, /a/)
})

test('触らなかったときは、触っていないことと理由を同じ息で述べる', () => {
  const p = planCanon([{ name: 'a', present: true, same: false }])
  const out = describeCanon(p, 'docs/aims/_guide', true).join('\n')
  assert.match(out, /触っていない/)
  assert.match(out, /その repo の doc/)
})

// ── 実際に置く ───────────────────────────────────────────────────────────────

test('同梱の canon は、この repo の `_guide/` と byte 同一である', async () => {
  // ⚠ **ここが崩れると、消費する repo に置かれるのは canon ではなく、その複製の亡霊になる。**
  for (const f of CANON_FILES) {
    const bundled = await readFile(path.join(PLUGIN_ROOT, ...f.from), 'utf8')
    const source = await readFile(
      path.join(PLUGIN_ROOT, '..', '..', '..', 'docs', 'aims', '_guide', f.name), 'utf8')
    assert.equal(normalizeEol(bundled), normalizeEol(source), `${f.name} が正本と違う`)
  }
})

test('空の repo に、法が指す canon が置かれる', async () => {
  const dir = await fresh()
  const guide = path.join(dir, 'docs', 'aims', '_guide')
  const { plan, missing } = await syncCanon(PLUGIN_ROOT, guide, true)

  assert.deepEqual(missing, [])
  assert.deepEqual(plan.place, CANON_FILES.map((f) => f.name))
  for (const f of CANON_FILES) {
    const placed = await readFile(path.join(guide, f.name), 'utf8')
    const src = await readFile(path.join(PLUGIN_ROOT, ...f.from), 'utf8')
    assert.equal(placed, src, `${f.name} が同梱物と一致しない`)
  }
  // ⚠ **法の第 1 条が指す file がそこに在る**、が守りたかったことである。
  await readFile(path.join(guide, 'aim-authoring.md'), 'utf8')
})

test('2 度打っても何も起きない（冪等）', async () => {
  const dir = await fresh()
  const guide = path.join(dir, 'docs', 'aims', '_guide')
  await syncCanon(PLUGIN_ROOT, guide, true)
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true)
  assert.deepEqual(plan.place, [])
  assert.deepEqual(plan.differs, [])
  assert.equal(plan.unchanged.length, CANON_FILES.length)
})

test('人間が直した canon を黙って踏まない', async () => {
  const dir = await fresh()
  const guide = path.join(dir, 'docs', 'aims', '_guide')
  await mkdir(guide, { recursive: true })
  const mine = '# 私が直した canon\n'
  await writeFile(path.join(guide, 'aim-authoring.md'), mine, 'utf8')

  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true)
  assert.deepEqual(plan.differs, ['aim-authoring.md'])
  assert.equal(await readFile(path.join(guide, 'aim-authoring.md'), 'utf8'), mine)
  // ⚠ **残りは置かれる** —— 1 枚が違うことは、他の 2 枚を置かない理由にならない。
  assert.equal(plan.place.length, CANON_FILES.length - 1)
})

test('`--check` の側（write=false）は 1 byte も書かない', async () => {
  const dir = await fresh()
  const guide = path.join(dir, 'docs', 'aims', '_guide')
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, false)
  assert.equal(plan.place.length, CANON_FILES.length)
  await assert.rejects(() => readFile(path.join(guide, 'aim-authoring.md'), 'utf8'))
})

test('CRLF で置かれた canon は「違う」ではなく「同じ」と読まれる', async () => {
  // ⚠ **本機は `core.autocrlf=true` である** ∴ これは仮想の形ではない。
  const dir = await fresh()
  const guide = path.join(dir, 'docs', 'aims', '_guide')
  await mkdir(guide, { recursive: true })
  for (const f of CANON_FILES) {
    const src = await readFile(path.join(PLUGIN_ROOT, ...f.from), 'utf8')
    await writeFile(path.join(guide, f.name), src.split('\n').join('\r\n'), 'utf8')
  }
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true)
  assert.deepEqual(plan.differs, [], 'CRLF を「違う」と呼んだ')
  assert.equal(plan.unchanged.length, CANON_FILES.length)
})
