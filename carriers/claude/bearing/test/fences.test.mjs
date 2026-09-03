// unpushed・checkpoint-stale・baton の各層の test。
//
// git に面したものは、本物の upstream を持つ本物の repository に対して走る: ⚠
// `@{upstream}..HEAD` が何を意味するかは **git の ref graph についての事実**であり、
// mock 越しにそれを assert しても mock を assert するだけである。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'

import { gatherUnpushed, renderUnpushedFence, parseUnpushedLog } from '../lib/unpushed.mjs'
import { gatherCheckpointStale, renderCheckpointFence, isShaLike } from '../lib/checkpoint.mjs'
import { readBaton } from '../lib/baton.mjs'
import { activePath, batonDir } from '../lib/handoff.mjs'

// ⚠ **baton の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// baton** —— を読み書きする。
process.env.BEARING_HOME = mkdtempSync(path.join(tmpdir(), 'bearing-home-'))

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

async function makeRepoWithUpstream() {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-fences-'))
  const origin = path.join(dir, 'origin.git')
  const work = path.join(dir, 'work')
  execFileSync('git', ['init', '-q', '--bare', origin])
  execFileSync('git', ['clone', '-q', origin, work])
  git(work, ['config', 'user.email', 'test@example.invalid'])
  git(work, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(work, 'docs', 'aims'), { recursive: true })
  return { dir, work }
}

async function writeAim(root, slug, extraFront = '') {
  await writeFile(
    path.join(root, 'docs', 'aims', slug + '.md'),
    `---\naim: x\nstate: open\n${extraFront}---\n\n# PROCESS\n\n- [todo] a\n`,
  )
}

const commit = (root, msg) => {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', msg])
}

// ── unpushed ─────────────────────────────────────────────────────────────────

test('parseUnpushedLog reads the committer date, tab-separated', () => {
  const commits = parseUnpushedLog(
    ['a'.repeat(40) + '\t2026-08-31T10:00:00+09:00', 'docs/aims/x.md', ''].join('\n'),
  )
  assert.equal(commits.length, 1)
  assert.equal(commits[0].date, '2026-08-31T10:00:00+09:00')
  assert.deepEqual(commits[0].files, ['docs/aims/x.md'])
})

test('an aim committed but not pushed is surfaced; a pushed one is not', async () => {
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'pushed')
  commit(work, 'first')
  git(work, ['push', '-q', '-u', 'origin', 'HEAD'])
  await writeAim(work, 'local-only')
  commit(work, 'second')

  const items = await gatherUnpushed(work, ['pushed', 'local-only'])
  assert.deepEqual(items.map((i) => i.slug), ['local-only'])
  assert.equal(items[0].aheadCommits, 1)
  await rm(dir, { recursive: true, force: true })
})

test('repeated touches of one node count as ahead_commits, latest first', async () => {
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'seed')
  commit(work, 'first')
  git(work, ['push', '-q', '-u', 'origin', 'HEAD'])
  await writeAim(work, 'moving')
  commit(work, 'a')
  await writeFile(path.join(work, 'docs', 'aims', 'moving.md'), '---\naim: y\nstate: open\n---\n\nb\n')
  commit(work, 'b')

  const items = await gatherUnpushed(work, ['seed', 'moving'])
  assert.equal(items.length, 1)
  assert.equal(items[0].aheadCommits, 2)
  assert.equal(items[0].latestSha, git(work, ['rev-parse', 'HEAD']).trim())
  await rm(dir, { recursive: true, force: true })
})

test('history’s ghosts are filtered against the live corpus', async () => {
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'seed')
  commit(work, 'first')
  git(work, ['push', '-q', '-u', 'origin', 'HEAD'])
  await writeAim(work, 'deleted-later')
  commit(work, 'add')
  await rm(path.join(work, 'docs', 'aims', 'deleted-later.md'))
  commit(work, 'remove')

  // path は `@{upstream}..HEAD` の至る所に在るが、その node はもう存在しない。
  const items = await gatherUnpushed(work, ['seed'])
  assert.deepEqual(items, [])
  await rm(dir, { recursive: true, force: true })
})

test('no upstream yields null — "could not look", not "nothing there"', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-fences-'))
  execFileSync('git', ['init', '-q', root])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeAim(root, 'a')
  commit(root, 'only')

  assert.equal(await gatherUnpushed(root, ['a']), null)
  // ⚠ そして両者は同じ行を描画してはならない。
  assert.match(renderUnpushedFence(null), /upstream が無い/)
  assert.match(renderUnpushedFence([]), /未 push の aim commit は無い/)
  await rm(root, { recursive: true, force: true })
})

// ── checkpoint-stale ─────────────────────────────────────────────────────────

test('isShaLike rejects a date — the archived records use this field for dates', () => {
  assert.equal(isShaLike('9d9cb31'), true)
  assert.equal(isShaLike('2026-05-15'), false)
  assert.equal(isShaLike(null), false)
})

test('a node with no checkpoint contributes nothing — absence is a third state', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-cp-'))
  execFileSync('git', ['init', '-q', root])
  const nodes = new Map([['a', { lastVerified: null }]])
  assert.deepEqual(await gatherCheckpointStale(root, nodes), [])
  await rm(root, { recursive: true, force: true })
})

test('commits_since is measured from the checkpoint, and zero is not reported', async () => {
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'a')
  commit(work, 'one')
  const base = git(work, ['rev-parse', 'HEAD']).trim()
  const atBase = await gatherCheckpointStale(work, new Map([['a', { lastVerified: base }]]))
  assert.deepEqual(atBase, []) // clean: the repo has not moved

  await writeFile(path.join(work, 'other.txt'), 'x')
  commit(work, 'two')
  await writeFile(path.join(work, 'other.txt'), 'y')
  commit(work, 'three')
  const moved = await gatherCheckpointStale(work, new Map([['a', { lastVerified: base }]]))
  assert.equal(moved.length, 1)
  assert.equal(moved[0].commitsSince, 2)
  await rm(dir, { recursive: true, force: true })
})

test('a malformed or unknown checkpoint is louder than a missing one', async () => {
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'a')
  commit(work, 'one')
  const bad = await gatherCheckpointStale(
    work,
    new Map([
      ['dated', { lastVerified: '2026-05-15' }],
      ['unknown', { lastVerified: 'deadbee' }],
    ]),
  )
  assert.equal(bad.length, 2)
  assert.ok(bad.every((b) => b.commitsSince === null))
  assert.match(renderCheckpointFence(bad), /unreadable/)
  await rm(dir, { recursive: true, force: true })
})

test('no tuned floor: a single commit of movement is still a candidate', async () => {
  // 対照群は 10 未満をすべて落とす。⚠ **数を名指す目的の文は存在せず、導出を持たない
  // filter は検査面を運任せで縮める。**
  const { dir, work } = await makeRepoWithUpstream()
  await writeAim(work, 'a')
  commit(work, 'one')
  const base = git(work, ['rev-parse', 'HEAD']).trim()
  await writeFile(path.join(work, 'other.txt'), 'x')
  commit(work, 'two')
  const items = await gatherCheckpointStale(work, new Map([['a', { lastVerified: base }]]))
  assert.equal(items[0].commitsSince, 1)
  await rm(dir, { recursive: true, force: true })
})

// ── the baton ────────────────────────────────────────────────────────────────

test('a baton at the canonical path is read, with its front matter', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-baton-'))
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(
    activePath(root),
    '---\ncomposed-at: 2026-08-31T11:00:00Z\ntask: wiring the hook\n---\n\n## ▶ Task\nx\n',
  )
  const b = await readBaton(root)
  assert.equal(b.composedAt, '2026-08-31T11:00:00Z')
  assert.equal(b.task, 'wiring the hook')
  assert.equal(b.readAt, null)
  await rm(root, { recursive: true, force: true })
})

test('a previously-read baton reports its read-at rather than hiding it', async () => {
  // 正本: 事実を 1 行で述べる。読むことを拒まない。警告もしない。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-baton-'))
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(
    activePath(root),
    '---\ncomposed-at: 2026-08-28T01:00:00Z\nread-at: 2026-08-30T02:00:00Z\n---\n\nx\n',
  )
  const b = await readBaton(root)
  assert.equal(b.readAt, '2026-08-30T02:00:00Z')
  await rm(root, { recursive: true, force: true })
})

test('reading does NOT stamp read-at — that is step 3 of a procedure with 4-6 after it', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-baton-'))
  await mkdir(batonDir(root), { recursive: true })
  const file = activePath(root)
  const original = '---\ncomposed-at: 2026-08-31T11:00:00Z\n---\n\nx\n'
  await writeFile(file, original)
  await readBaton(root)
  const { readFile } = await import('node:fs/promises')
  assert.equal(await readFile(file, 'utf8'), original)
  await rm(root, { recursive: true, force: true })
})

test('no baton, and an empty baton, are both a fresh start', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-baton-'))
  assert.equal(await readBaton(root), null)
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(activePath(root), '\n\n')
  assert.equal(await readBaton(root), null)
  await rm(root, { recursive: true, force: true })
})
