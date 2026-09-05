// setup-surface —— 面へ辿り着く手段を、version で腐らない形にする。
//
// ⚠ **ここで守っているのは「人間が握る path に version が入らない」ことである。** cache path は
// version を含み、cache は旧版を消さない ∴ 面を直接 bookmark すれば bump 後も黙って古い面が開く。
// ⚠ **statusline の shim と違い、これは橋渡しではなく複製である** —— browser は HTML を開くだけで、
// 開かれた HTML は自分がどの版かを解決できない ∴ 古さは黙る。**その黙りを `--check` が観測可能に
// する**、というのがこの test が固定している形である。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { compare, PLACED, SURFACE } from '../bin/bearing-setup-surface.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const BIN = path.join(ROOT, 'bin', 'bearing-setup-surface.mjs')
const SOURCE = path.join(ROOT, SURFACE)

const fresh = async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-surface-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** ⚠ **委譲を塞ぐ** —— 通れば走るのは working tree であって、この test が指した root ではない。 */
const run = (configDir, ...args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, BEARING_DELEGATED: '1' },
  })

test('置く先は CLAUDE_CONFIG_DIR の下の固定名であり、version を含まない', async (t) => {
  const dir = await fresh(t)
  const r = run(dir)
  assert.equal(r.status, 0, r.stderr)
  const dest = path.join(dir, PLACED)
  assert.ok(r.stdout.includes(dest), `置き先を述べていない: ${r.stdout}`)
  // ⚠ **人間が bookmark するのはこの 1 行である** ∴ ここに version が入れば、この node の
  // 目的そのものが果たされない。
  assert.ok(!/\d+\.\d+\.\d+/.test(dest), `置き先が版を含む: ${dest}`)
  assert.equal(await compare(SOURCE, dest), 'same')
})

test('置いた 1 枚は面と byte 同一である —— 複製であって、要約ではない', async (t) => {
  const dir = await fresh(t)
  run(dir)
  const a = await readFile(path.join(dir, PLACED))
  const b = await readFile(SOURCE)
  assert.ok(a.equals(b), '置いた 1 枚が面と違う')
})

test('毎回置き直す —— 既に在っても、それは古い複製かもしれない', async (t) => {
  const dir = await fresh(t)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, PLACED), '<html>古い版</html>\n', 'utf8')
  const r = run(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.equal(await compare(SOURCE, path.join(dir, PLACED)), 'same', '古い 1 枚が残った')
  assert.match(r.stdout, /置き直した/)
})

test('--check は 3 値を分ける —— 不在・同一・違う', async (t) => {
  const dir = await fresh(t)
  const dest = path.join(dir, PLACED)

  // ⚠ **「不在」と「違う」を同じ答えに畳まない** —— まだ置いていない人間と、古い 1 枚を
  // 開き続けている人間が、同じ言葉を受け取ることになる。
  const absent = run(dir, '--check')
  assert.equal(absent.status, 1)
  assert.match(absent.stdout, /置かれていない/)

  run(dir)
  const same = run(dir, '--check')
  assert.equal(same.status, 0)
  assert.match(same.stdout, /byte 同一/)

  await writeFile(dest, '<html>人間が直した版</html>\n', 'utf8')
  const differs = run(dir, '--check')
  assert.equal(differs.status, 1)
  assert.match(differs.stdout, /違う/)
  // ⚠ **理由を 1 つに決めつけない。** 分けるには台帳が要り、それは棄却された形である。
  assert.match(differs.stdout, /分けられない/)
})

test('--check は 1 byte も書かない —— 検めることと置くことは別の act である', async (t) => {
  const dir = await fresh(t)
  const r = run(dir, '--check')
  assert.equal(r.status, 1)
  assert.equal(await compare(SOURCE, path.join(dir, PLACED)), 'absent', '--check が置いた')
})

test('到達範囲について、測っていないことを測ったように述べない', async (t) => {
  const dir = await fresh(t)
  const out = run(dir).stdout
  // ⚠ Chromium 限定は FSA の対応状況からの引き継ぎであって、我々の実測ではない。
  assert.match(out, /我々の実測ではない/)
  // ⚠ picker の拒否は人間が実機で踏んだ観測であり、日付を伴わねばならない。
  assert.match(out, /2026-09-04/)
})

test('置いたものを消さない —— home に在るものを我々の都合で消さない', async (t) => {
  const dir = await fresh(t)
  const out = run(dir).stdout
  assert.match(out, /消すときは手で/)
  // ⚠ `--remove` を持たないことが設計である ∴ 未知の引数でも黙って消えたりしない。
  const r = run(dir, '--remove')
  assert.equal(await compare(SOURCE, path.join(dir, PLACED)), 'same', '未知の引数で消えた')
  assert.equal(r.status, 0)
})

test('面が同梱されていなければ、置いたふりをしない', async (t) => {
  const dir = await fresh(t)
  // 面を持たない root を作り、bin だけを指す。⚠ **install が壊れている形である。**
  const fakeRoot = await mkdtemp(path.join(tmpdir(), 'bearing-noface-'))
  t.after(() => rm(fakeRoot, { recursive: true, force: true }))
  await mkdir(path.join(fakeRoot, 'bin'), { recursive: true })
  await mkdir(path.join(fakeRoot, 'lib'), { recursive: true })
  for (const f of ['bearing-setup-surface.mjs', 'bearing-statusline.mjs']) {
    await writeFile(path.join(fakeRoot, 'bin', f), await readFile(path.join(ROOT, 'bin', f), 'utf8'), 'utf8')
  }
  await writeFile(path.join(fakeRoot, 'lib', 'delegate.mjs'), await readFile(path.join(ROOT, 'lib', 'delegate.mjs'), 'utf8'), 'utf8')

  const r = spawnSync(process.execPath, [path.join(fakeRoot, 'bin', 'bearing-setup-surface.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: dir, BEARING_DELEGATED: '1' },
  })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /install が壊れている/)
  assert.equal(await compare(SOURCE, path.join(dir, PLACED)), 'absent', '面が無いのに置いた')
})
