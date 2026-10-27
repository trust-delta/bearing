// unpushed・sha 判定の各層の test。（baton の層は 2026-10-27、handoff の退役とともに外した。）
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

import { gatherUnpushed, renderUnpushedFence, parseUnpushedLog } from '../../../carriers/claude/bearing/lib/unpushed.mjs'
import { isShaLike } from '../../../carriers/claude/bearing/lib/git.mjs'

// ⚠ **unit の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// 記録** —— を読み書きする。
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

// ── sha の判定 ───────────────────────────────────────────────────────────────
//
// ⚠ **かつてここは `checkpoint-stale` の節だった。** 🔴 **あの fence は 2026-09-10 に退役した**
// （人間の決定。`last-verified:` ＝ **人間が sha を書く frontmatter の field** であり、**host の
// merge 慣習がそれを書き換える** ∴ **repo を問わず機能しない**）—— **置き換えは
// `bearing-aim-code-stale`**（`test/claude/bearing/aim-code.test.mjs`）。
// ⚠ **判定だけは残る** —— **日付を書く取り違えの形は field が消えても残り、照合記録の旧い形
// （commit sha）が今もこれを通る。**

test('isShaLike rejects a date — the retired field used to carry dates', () => {
  assert.equal(isShaLike('9d9cb31'), true)
  assert.equal(isShaLike('2026-05-15'), false)
  assert.equal(isShaLike(null), false)
})
