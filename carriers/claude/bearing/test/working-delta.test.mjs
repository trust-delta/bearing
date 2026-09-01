// Tests for the working-delta fence port.
//
// The pure functions are checked directly; the gather is checked against a real
// git repository, because every fact it states is a fact about git and a mock
// would only assert that the mock was written to match the code. This is the
// layer that drift-git's "a bad sensor is worse than no sensor" is aimed at.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  parsePorcelainPaths,
  renderWorkingDeltaFence,
  gatherWorkingDelta,
} from '../lib/working-delta.mjs'
import { readAimSlugs, isAimRecord, aimRelPath } from '../lib/corpus.mjs'

// ── pure: porcelain parsing ──────────────────────────────────────────────────

test('parsePorcelainPaths takes the working-tree side of a rename', () => {
  const dirty = parsePorcelainPaths(
    [
      ' M docs/aims/alpha.md',
      '?? docs/aims/beta.md',
      'R  docs/aims/old.md -> docs/aims/new.md',
      'A  docs/aims/staged.md',
      '',
    ].join('\n'),
  )
  assert.deepEqual(
    [...dirty].sort(),
    ['docs/aims/alpha.md', 'docs/aims/beta.md', 'docs/aims/new.md', 'docs/aims/staged.md'],
  )
})

test('parsePorcelainPaths drops lines too short to carry a path', () => {
  assert.equal(parsePorcelainPaths('\n\nM\n').size, 0)
})

// ── pure: fence rendering ────────────────────────────────────────────────────

test('the fence is emitted even with no records', () => {
  assert.equal(
    renderWorkingDeltaFence([]),
    '```bearing-working-delta v1\n' +
      '# fields: slug | uncommitted | uncommitted_anchor_change | untracked\n' +
      '# none — no uncommitted working-tree aim changes for this repo at compose time\n' +
      '```\n\n',
  )
})

test('records use the fixed field order, pipe delimited', () => {
  const out = renderWorkingDeltaFence([
    { slug: 'alpha', uncommitted: true, uncommittedAnchorChange: false, untracked: false },
    { slug: 'beta', uncommitted: false, uncommittedAnchorChange: false, untracked: true },
  ])
  const records = out.split('\n').filter((l) => !l.startsWith('```') && !l.startsWith('#') && l)
  assert.deepEqual(records, ['alpha | true | false | false', 'beta | false | false | true'])
})

// ── pure: corpus ─────────────────────────────────────────────────────────────

test('README and non-markdown entries are not aim records', () => {
  assert.equal(isAimRecord('alpha.md'), true)
  assert.equal(isAimRecord('README.md'), false)
  assert.equal(isAimRecord('notes.txt'), false)
})

test('aimRelPath always uses forward slashes', () => {
  assert.equal(aimRelPath('alpha'), 'docs/aims/alpha.md')
})

// ── integration: a real repository ───────────────────────────────────────────

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe', encoding: 'utf8' })
}

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-wd-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  return root
}

/** @param {string} root @param {string} slug @param {string} aimLine @param {string} body */
async function writeAim(root, slug, aimLine, body = 'x') {
  await writeFile(
    path.join(root, 'docs', 'aims', slug + '.md'),
    '---\naim: ' + aimLine + '\nstate: open\n---\n\n# IS\n\n' + body + '\n',
  )
}

test('working-delta reports presence facts against a real repo', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))

  // Three committed nodes; one stays clean, one gets a body edit, one gets an
  // anchor edit. A fourth is created but never committed.
  await writeAim(root, 'clean', 'stays untouched')
  await writeAim(root, 'body-edit', 'anchor holds still')
  await writeAim(root, 'anchor-edit', 'the original purpose')
  await writeFile(path.join(root, 'docs', 'aims', 'README.md'), '# not an aim\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'seed'])

  await writeAim(root, 'body-edit', 'anchor holds still', 'edited body')
  await writeAim(root, 'anchor-edit', 'the purpose moved')
  await writeAim(root, 'newborn', 'never committed')

  const slugs = await readAimSlugs(root)
  assert.deepEqual(slugs, ['anchor-edit', 'body-edit', 'clean', 'newborn'], 'README is excluded')

  const items = await gatherWorkingDelta(root, slugs)
  assert.deepEqual(items, [
    { slug: 'anchor-edit', uncommitted: true, uncommittedAnchorChange: true, untracked: false },
    { slug: 'body-edit', uncommitted: true, uncommittedAnchorChange: false, untracked: false },
    { slug: 'newborn', uncommitted: false, uncommittedAnchorChange: false, untracked: true },
  ])
})

test('a staged-but-never-committed node reads as untracked, not uncommitted', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))

  await writeAim(root, 'seed', 'something to commit against')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'seed'])

  // Porcelain reports this as `A `, not `??` — the untracked fact comes from the
  // absence of commit history, not from the porcelain column.
  await writeAim(root, 'staged', 'staged only')
  git(root, ['add', 'docs/aims/staged.md'])

  const items = await gatherWorkingDelta(root, await readAimSlugs(root))
  assert.deepEqual(items, [
    { slug: 'staged', uncommitted: false, uncommittedAnchorChange: false, untracked: true },
  ])
})

test('a clean repo yields no records', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'only', 'committed and clean')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'seed'])
  assert.deepEqual(await gatherWorkingDelta(root, await readAimSlugs(root)), [])
})

test('a directory that is not a git repo reads as unavailable, not as clean', async (t) => {
  // This assertion used to be `[]`, and that was the bug: `[]` renders `# none`,
  // which claims the working tree was looked at and found unchanged. Here git
  // cannot answer at all. `null` is the only honest return, and it is what the
  // fence needs in order to say so.
  const root = await mkdtemp(path.join(tmpdir(), 'aim-wd-nogit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeAim(root, 'orphan', 'no repo here')
  assert.equal(await gatherWorkingDelta(root, await readAimSlugs(root)), null)
})

test('in a repo with no commits yet, every node reads as untracked', async (t) => {
  // `git log` exits non-zero here. The batched path lookup must degrade the same
  // way the per-node original does — no observable history means untracked, not
  // an error and not a silent "committed".
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'first', 'before any commit')

  assert.deepEqual(await gatherWorkingDelta(root, await readAimSlugs(root)), [
    { slug: 'first', uncommitted: false, uncommittedAnchorChange: false, untracked: true },
  ])
})

test('a repo with no aim corpus yields no slugs', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-wd-bare-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.deepEqual(await readAimSlugs(root), [])
})

// ── regression: git that cannot be read must not become a positive claim ─────
//
// Observed 2026-09-01 on Windows. `git log --name-only -- docs/aims/` is 0.25s
// at rest but 10-29s while an antivirus scanner works through a just-pulled
// tree, and GIT_TIMEOUT_MS is 5s. The timeout returned null, null became an
// empty set of committed paths, and the fence published `untracked: true` for
// all 77 nodes of a clean corpus. drift-intra, hitting the same failure, said
// "unavailable - Absent, NOT clean". Two fences, one failure, opposite lies.

test('the unavailable fence says so, and never renders as none', () => {
  const out = renderWorkingDeltaFence(null)
  assert.ok(out.includes('unavailable'), 'must name the condition')
  assert.ok(out.includes('Absent, NOT clean'), 'must refuse the clean reading')
  assert.ok(!out.includes('# none'), 'must not borrow the clean-tree wording')
  assert.ok(!out.includes('# fields:'), 'no field header without records')
})

test('no-commits and cannot-read are told apart, not collapsed', async (t) => {
  // These two are why the failure branch probes instead of assuming. Both make
  // `git log` return null. Only one of them means "nothing is committed".
  const repo = await makeRepo()
  const bare = await mkdtemp(path.join(tmpdir(), 'aim-wd-bare-'))
  t.after(() => rm(repo, { recursive: true, force: true }))
  t.after(() => rm(bare, { recursive: true, force: true }))

  await writeAim(repo, 'fresh', 'never committed')
  const inRepo = await gatherWorkingDelta(repo, await readAimSlugs(repo))
  assert.ok(Array.isArray(inRepo), 'a working repo yields facts')
  assert.equal(inRepo.length, 1)
  assert.equal(inRepo[0].untracked, true, 'no commits yet: untracked is TRUE and earned')

  await mkdir(path.join(bare, 'docs', 'aims'), { recursive: true })
  await writeAim(bare, 'fresh', 'never committed')
  const noGit = await gatherWorkingDelta(bare, await readAimSlugs(bare))
  assert.equal(noGit, null, 'cannot read git: no claim at all')
})
