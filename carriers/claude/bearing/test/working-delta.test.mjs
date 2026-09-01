// working-delta fence の test。
//
// 純粋関数は直接検査し、gather は本物の git repository に対して検査する。⚠ **それが述べる
// 事実はすべて git についての事実**であり、mock は「mock が code に一致するよう書かれた
// こと」しか assert しないからである。**「悪いセンサーはセンサーが無いことに劣る」が
// 狙っているのは、この層である。**

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

// ── 純粋関数: porcelain の parse ─────────────────────────────────────────────

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

// ── 純粋関数: fence の描画 ───────────────────────────────────────────────────

test('the fence is emitted even with no records', () => {
  assert.equal(
    renderWorkingDeltaFence([]),
    '```bearing-working-delta v1\n' +
      '# fields: slug | uncommitted | uncommitted_anchor_change | untracked\n' +
      '# none — 構成時点で、この repo の working tree に未 commit の aim 変更は無い\n' +
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

// ── 純粋関数: corpus ─────────────────────────────────────────────────────────

test('README and non-markdown entries are not aim records', () => {
  assert.equal(isAimRecord('alpha.md'), true)
  assert.equal(isAimRecord('README.md'), false)
  assert.equal(isAimRecord('notes.txt'), false)
})

test('aimRelPath always uses forward slashes', () => {
  assert.equal(aimRelPath('alpha'), 'docs/aims/alpha.md')
})

// ── 統合: 本物の repository ──────────────────────────────────────────────────

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

  // commit 済 node が 3 つ。1 つは clean のまま、1 つは body を編集、1 つは anchor を編集。
  // 4 つ目は作成されるが一度も commit されない。
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

  // porcelain はこれを `??` ではなく `A ` として報告する —— ⚠ **untracked という事実は
  // commit 履歴の不在から来るのであって、porcelain の列から来るのではない。**
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
  // ⚠ **この assertion はかつて `[]` であり、それが bug だった**: `[]` は `# none` を
  // 描画し、それは「working tree を見に行って、変化が無かった」と主張する。ここでは git は
  // そもそも答えられない。**`null` が唯一正直な返り値**であり、fence がその旨を述べるために
  // 必要とするものである。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-wd-nogit-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeAim(root, 'orphan', 'no repo here')
  assert.equal(await gatherWorkingDelta(root, await readAimSlugs(root)), null)
})

test('in a repo with no commits yet, every node reads as untracked', async (t) => {
  // ここで `git log` は非 0 で終了する。batch 化された path 探索は、node ごとの原型と
  // 同じように degrade せねばならない —— **観測できる履歴が無いことは untracked を意味する
  // のであって、error でも、黙った「commit 済」でもない。**
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

// ── regression: 読めない git が、肯定的な主張に化けてはならない ──────────────
//
// 2026-09-01 に Windows で観測。`git log --name-only -- docs/aims/` は平時 0.25 秒だが、
// pull 直後の tree をウイルス対策がスキャンしている間は 10〜29 秒かかり、GIT_TIMEOUT_MS は
// 5 秒である。timeout が null を返し、null が「commit 済 path の空集合」になり、fence は
// clean な corpus の 77 node すべてを `untracked: true` として出荷した。⚠ **同じ失敗に
// 当たった drift-intra の方は「unavailable —— clean ではなく不在」と述べた。fence が 2 枚、
// 失敗は 1 つ、嘘は正反対。**

test('the unavailable fence says so, and never renders as none', () => {
  const out = renderWorkingDeltaFence(null)
  assert.ok(out.includes('unavailable'), 'must name the condition')
  assert.ok(out.includes('clean ではなく「不在」である'), 'must refuse the clean reading')
  assert.ok(!out.includes('# none'), 'must not borrow the clean-tree wording')
  assert.ok(!out.includes('# fields:'), 'no field header without records')
})

test('no-commits and cannot-read are told apart, not collapsed', async (t) => {
  // ⚠ **失敗分岐が仮定せずに probe するのは、この 2 つのためである。** どちらも
  // `git log` に null を返させる。**だが「何も commit されていない」を意味するのは片方だけ
  // である。**
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
