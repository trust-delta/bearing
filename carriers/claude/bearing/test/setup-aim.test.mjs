// setup-aim —— 置き、置いたところで責任が終わる。**そして block と skill は 1 組である。**
//
// ⚠ **ここで守っているのは「置いた後はその repo のもの」である**（人間の決定 2026-09-05）。
// 2 度目の `setup-aim` が既に在る `.claude/skills/aim/` に 1 byte も触らないこと、そして置くものが
// template と byte 同一であることを固定する。⚠ **先行の手段（canon を `_guide/` へ置き台帳で追随
// させる）はこの逆を採り、1 日で行き詰まった** —— `docs/aims/adoption-declaration.md` の `# HISTORY`。
//
// 🔴 **2026-09-07、人間が「古さは repo のもの」の射程を確定させた** —— **「block だけ更新する」は
// あの決定の実装ではない。更新するなら両方、しないならどちらも維持であり、どちらにするかは aim を
// 使う側が決める**（理由: 版の更新は**手元の aim node の書き換えを伴いうる**）。∴ 下半分は
// **「片方だけが動かない」ことを固定する。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { spawnSync } from 'node:child_process'

import { placeSkill, inspectSkill, TEMPLATE_FILES, SKILL_DIR, chooseDir } from '../bin/bearing-setup-aim.mjs'

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

// ── block と skill は 1 組である ─────────────────────────────────────────────
//
// 🔴 **固定するのは「片方だけが動かない」ことである。**
//
// ⚠ **これは仮定ではなく踏んだ形である**（実測 2026-09-07、対象: この checkout）—— 0.20.0 の
// 3 枚を置いた repo に今の `setup-aim` を打つと、**block は v0.21.0 へ置き直され、skill は 0 byte
// のまま、`--check` は exit 0 で `状態: current` と述べた。** 🔴 **そして 0.21.0 の実質は skill 側に
// しか無かった** ∴ **あの「更新」は、その版が持っていたものを 1 文字も運んでいなかった。**

/** ⚠ 委譲を塞ぐ —— 通れば走るのは working tree であって、この test が指した root ではない。 */
const run = (dir, ...args) =>
  spawnSync(process.execPath, [path.join(ROOT, 'bin', 'bearing-setup-aim.mjs'), ...args], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, BEARING_DELEGATED: '1' },
  })

/** 正本と違う 3 枚を置く。⚠ **中身は問わない** —— 「一致しない」ことだけが要る。 */
const withOldSkill = async (dir) => {
  await mkdir(path.join(dir, SKILL_DIR), { recursive: true })
  for (const f of TEMPLATE_FILES) await writeFile(path.join(dir, SKILL_DIR, f), '# 古い版\n')
}

test('inspectSkill —— 無ければ absent、置いた直後は same', async (t) => {
  const dir = await fresh(t)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'absent')
  await placeSkill(ROOT, dir)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
})

test('1 枚でも違えば differs で、その file を名指す', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir)
  await writeFile(path.join(dir, SKILL_DIR, 'aim-authoring.md'), '# 古い版\n')
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'differs')
  assert.deepEqual(sk.differing, ['aim-authoring.md'])
})

test('欠けている 1 枚も differs —— 半分置かれた skill を「在る」に畳まない', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir)
  await rm(path.join(dir, SKILL_DIR, 'aim-facts.md'))
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'differs')
  assert.deepEqual(sk.differing, ['aim-facts.md'])
})

test('CRLF の checkout を「違い」にしない —— git が変換しただけである', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir)
  for (const f of TEMPLATE_FILES) {
    const at = path.join(dir, SKILL_DIR, f)
    await writeFile(at, (await readFile(at, 'utf8')).replace(/\n/g, '\r\n'))
  }
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
})

test('skill が正本と違うなら、block も動かない —— 踏んだ形', async (t) => {
  const dir = await fresh(t)
  // まず両方を今の版で置く（＝ 揃った消費者）
  assert.equal(run(dir).status, 0)
  const placedBlock = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  // そこへ「古い版の skill」を持ち込む（＝ 実測で見た形。block は current、skill だけが古い）
  await withOldSkill(dir)

  const r = run(dir)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /一致しない/)
  assert.match(r.stdout, /CLAUDE\.md も触っていない/)
  // 🔴 **block は 1 byte も動いていない。**
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), placedBlock)
  // そして skill も捨てられていない。
  assert.equal(await readFile(path.join(dir, SKILL_DIR, 'SKILL.md'), 'utf8'), '# 古い版\n')
})

test('--update は両方を今の版へ揃え、corpus の書き換えを述べる', async (t) => {
  const dir = await fresh(t)
  await withOldSkill(dir)
  const r = run(dir, '--update')
  assert.equal(r.status, 0)
  for (const f of TEMPLATE_FILES) {
    assert.equal(
      await readFile(path.join(dir, SKILL_DIR, f), 'utf8'),
      await readFile(path.join(ROOT, 'templates', 'aim', f), 'utf8'),
      `${f} が正本と一致しない`,
    )
  }
  assert.match(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), /bearing:aim/)
  // ⚠ **版が上がったことを黙って済ませない** —— それが「使う側が決める」の理由である。
  assert.match(r.stdout, /手元の aim node/)
})

// ⚠ **この 1 本は、直す前も緑だった**（変異試験 2026-09-07）—— 旧い code も refuse を skill の
// 前で return していた。∴ **これが固定するのは新しい挙動ではなく、組の判定を足しても壊れない
// ことである。** 拾ったのは運ではなく網であるが、**網に掛かったものは無かったと書く。**
test('block を人間が編集していたら、skill も置かれない', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  await rm(path.join(dir, SKILL_DIR), { recursive: true })
  const text = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  await writeFile(path.join(dir, 'CLAUDE.md'), `${text}\n人間が足した 1 行\n`.replace('# aim frame', '# aim frame（手を入れた）'))

  const r = run(dir)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /も触っていない/)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'absent')
})

test('--check は、block が current でも skill が違えば赤い —— 踏んだ形', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  // ✅ 陽性対照 —— 揃っていれば緑である
  const green = run(dir, '--check')
  assert.equal(green.status, 0)
  assert.match(green.stdout, /aim skill: 同梱の正本と一致する/)

  await withOldSkill(dir)
  const red = run(dir, '--check')
  assert.equal(red.status, 1)
  assert.match(red.stdout, /状態: current/)
  assert.match(red.stdout, /aim skill: 正本と一致しない/)
})

test('採っていない repo の --check は赤くない —— 未採用は異常ではない', async (t) => {
  const dir = await fresh(t)
  const r = run(dir, '--check')
  assert.equal(r.status, 0)
  assert.match(r.stdout, /状態: absent/)
})
