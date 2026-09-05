// setup-aim —— 置き、置いたところで責任が終わる。
//
// ⚠ **ここで守っているのは「置いた後はその repo のもの」である**（人間の決定 2026-09-05）。
// 2 度目の `setup-aim` が既に在る `.claude/skills/aim/` に 1 byte も触らないこと、そして置くものが
// template と byte 同一であることを固定する。⚠ **先行の手段（canon を `_guide/` へ置き台帳で追随
// させる）はこの逆を採り、1 日で行き詰まった** —— `docs/aims/adoption-declaration.md` の `# HISTORY`。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { placeSkill, TEMPLATE_FILES, SKILL_DIR, chooseDir } from '../bin/bearing-setup-aim.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const fresh = async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-setup-aim-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('空の project へは template を byte 同一で置く', async (t) => {
  const dir = await fresh(t)
  const r = await placeSkill(ROOT, dir)
  assert.equal(r.action, 'placed')
  assert.deepEqual(r.missing, [])
  for (const f of TEMPLATE_FILES) {
    assert.equal(
      await readFile(path.join(dir, SKILL_DIR, f), 'utf8'),
      await readFile(path.join(ROOT, 'templates', 'aim', f), 'utf8'),
      `${f} が template と違う`,
    )
  }
})

test('frame.md は置かない —— 6 箇条は block と hook が運ぶ', async (t) => {
  assert.ok(!TEMPLATE_FILES.includes('frame.md'))
  const dir = await fresh(t)
  await placeSkill(ROOT, dir)
  assert.deepEqual((await readdir(path.join(dir, SKILL_DIR))).sort(), [...TEMPLATE_FILES].sort())
})

test('既に在れば 1 byte も触らない —— 置いた後はその repo のもの', async (t) => {
  const dir = await fresh(t)
  const dest = path.join(dir, SKILL_DIR)
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'この repo が直した版\n')
  const r = await placeSkill(ROOT, dir)
  assert.equal(r.action, 'kept')
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'この repo が直した版\n')
  // ⚠ 足りない枚を補うことも「触る」である —— 何を持つかは repo が決めている。
  assert.deepEqual(await readdir(dest), ['SKILL.md'])
})

test('置く SKILL.md は project skill として登録される形（name: aim）である', async () => {
  const s = await readFile(path.join(ROOT, 'templates', 'aim', 'SKILL.md'), 'utf8')
  assert.match(s, /^---\nname: aim\n/)
})

test('template の SKILL.md は corpus の在り処を決め打ちにせず、block の dir= を指す', async () => {
  // ⚠ `--dir` で在り処を変えた repo でも、置かれた skill が既定を正本と呼ばないため。
  const s = await readFile(path.join(ROOT, 'templates', 'aim', 'SKILL.md'), 'utf8')
  assert.ok(s.includes('dir='))
})

test('chooseDir は --dir → 既に置かれた宣言 → 既定 の順', () => {
  assert.deepEqual(chooseDir(['--dir', 'proj/aims'], ''), { dir: 'proj/aims', from: 'flag' })
  assert.equal(chooseDir([], '').from, 'default')
  assert.ok(chooseDir(['--dir', '../x'], '').error, '拒むべき path を通した')
})
