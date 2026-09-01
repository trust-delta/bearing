// unit の walk の test —— cwd から、1 つのセッションが対象とする repo の集合へ。
//
// git に面した test と同じ理由で本物の directory tree に対して検査する: ⚠ **この walk が
// 述べるのは filesystem についての事実**であり、mock は「mock が code に一致すること」しか
// assert しない。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { resolveUnit, MAX_REPOS } from '../lib/unit.mjs'

/** walk が探すのは `.git` **directory** である —— 見つかるにはそれで足りる。 */
async function repo(root, rel) {
  await mkdir(path.join(root, rel, '.git'), { recursive: true })
}

async function tree() {
  return await mkdtemp(path.join(tmpdir(), 'aim-unit-'))
}

test('cwd itself being a repo makes it the unit, and the primary', async () => {
  const root = await tree()
  await repo(root, '.')
  const u = await resolveUnit(root)
  assert.equal(u.repos.length, 1)
  assert.equal(u.repos[0].root, root)
  assert.equal(u.repos[0].primary, true)
  await rm(root, { recursive: true, force: true })
})

test('plural is normal: every repo below cwd joins the unit', async () => {
  const root = await tree()
  await repo(root, 'alpha')
  await repo(root, 'beta')
  const u = await resolveUnit(root)
  assert.deepEqual(u.repos.map((r) => r.label).sort(), ['alpha', 'beta'])
  await rm(root, { recursive: true, force: true })
})

test('the walk prunes on hit — a repo inside a repo is that repo’s business', async () => {
  const root = await tree()
  await repo(root, 'outer')
  await repo(root, 'outer/vendored')
  const u = await resolveUnit(root)
  assert.deepEqual(u.repos.map((r) => r.label), ['outer'])
  await rm(root, { recursive: true, force: true })
})

test('the walk never climbs — a session inside a member repo is about that repo', async () => {
  // cwd が project を定義する。⚠ 上にある wrapper を見つけにいくことは、
  // **どこから始めるかという operator の選択を上書きする**ことになる。
  const root = await tree()
  await repo(root, 'alpha')
  await repo(root, 'beta')
  const u = await resolveUnit(path.join(root, 'alpha'))
  assert.deepEqual(u.repos.map((r) => r.label), ['alpha'])
  await rm(root, { recursive: true, force: true })
})

test('a wrapper named for its repo makes that repo primary', async () => {
  const root = await tree()
  const wrapper = path.join(root, 'workspace')
  await mkdir(wrapper, { recursive: true })
  await repo(wrapper, 'workspace')
  await repo(wrapper, 'workspace-core')
  const u = await resolveUnit(wrapper)
  assert.equal(u.repos[0].label, 'workspace')
  assert.equal(u.repos[0].primary, true)
  assert.equal(u.repos.find((r) => r.label === 'workspace-core').primary, false)
  await rm(root, { recursive: true, force: true })
})

test('node_modules and build output are never descended into', async () => {
  const root = await tree()
  await repo(root, 'node_modules/some-dep')
  await repo(root, 'target/vendor')
  await repo(root, 'real')
  const u = await resolveUnit(root)
  assert.deepEqual(u.repos.map((r) => r.label), ['real'])
  await rm(root, { recursive: true, force: true })
})

test('a cwd with no git at all yields an empty unit, not an error', async () => {
  const root = await tree()
  await mkdir(path.join(root, 'src'), { recursive: true })
  await writeFile(path.join(root, 'src', 'a.txt'), 'x')
  const u = await resolveUnit(root)
  assert.deepEqual(u.repos, [])
  assert.equal(u.truncated, null)
  await rm(root, { recursive: true, force: true })
})

test('hitting the repo cap is REPORTED, never silently applied', async () => {
  // ⚠ **完全に見える切り詰められた unit は「悪いセンサー」である**: 下流の事実はすべて
  // 部分的なのに、それを述べるものが何も無い。
  const root = await tree()
  for (let i = 0; i < MAX_REPOS + 2; i++) await repo(root, `r${String(i).padStart(2, '0')}`)
  const u = await resolveUnit(root)
  assert.equal(u.repos.length, MAX_REPOS)
  assert.equal(u.truncated, 'count')
  await rm(root, { recursive: true, force: true })
})

test('a repo deeper than the depth cap is missed, and the truncation says so', async () => {
  const root = await tree()
  await repo(root, 'a/b/c/d/e/deep')
  const u = await resolveUnit(root)
  assert.deepEqual(u.repos, [])
  assert.equal(u.truncated, 'depth')
  await rm(root, { recursive: true, force: true })
})
