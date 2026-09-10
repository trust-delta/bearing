// aim⊥code の fence —— **aim の主張と、それを実現した code のズレ。**
//
// 🔴 **join は履歴の中に在る**（人間の指摘 2026-09-10）—— **`[done]` mark を書き入れた commit は、
// その mark が指す code を一緒に持っている。** ⚠ **人間が sha を書く必要が無く、既存の mark に
// 遡って効く** ∴ **`last-verified:` を要求した `checkpoint-stale` の置き換えである。**
//
// ⚠ **ここで固定するのは 2 つ**: ⑴ **join が引けること** ⑵ 🔴 **承認が効くこと** ——
// **承認が無ければ 13 node 中 11〜12 件が候補になり、警報は壁になる**（実測 2026-09-10）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  AIM_CODE_FENCE_TAG,
  codeDigest,
  gatherAimCodeStale,
  prNumbers,
  renderAimCodeFence,
  verifiedDigests,
} from '../../../carriers/claude/bearing/lib/aim-code.mjs'
import { readAimGraph } from '../../../carriers/claude/bearing/lib/corpus.mjs'

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-code-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-code test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await mkdir(path.join(root, 'src'), { recursive: true })
  return root
}

const writeNode = (root, slug, body) =>
  writeFile(
    path.join(root, 'docs', 'aims', slug + '.md'),
    ['---', 'aim: a purpose', 'state: open', '---', '', '# PROCESS', '', body, ''].join('\n'),
  )

const writeCode = (root, name, text) => writeFile(path.join(root, 'src', name), text + '\n')

const commit = (root, msg) => {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', msg])
}

const gather = async (root) => {
  const g = await readAimGraph(root)
  return gatherAimCodeStale(root, g.nodes)
}

// ── 純粋関数 ────────────────────────────────────────────────────────────────

test('codeDigest は対の並び順に依らない —— 集合の digest である', () => {
  const a = codeDigest([['a.mjs', 'dead'], ['b.mjs', 'beef']])
  const b = codeDigest([['b.mjs', 'beef'], ['a.mjs', 'dead']])
  assert.equal(a, b)
})

test('codeDigest は path も blob も見る —— どちらか片方では足りない', () => {
  const base = codeDigest([['a.mjs', 'dead']])
  assert.notEqual(base, codeDigest([['a.mjs', 'beef']]), '中身が動いても同じ digest になった')
  assert.notEqual(base, codeDigest([['b.mjs', 'dead']]), 'path が違っても同じ digest になった')
  assert.notEqual(base, codeDigest([['a.mjs', 'dead'], ['b.mjs', 'beef']]), '集合が増えても同じ')
})

test('PR 番号は [done] 行からだけ拾う', () => {
  assert.deepEqual(prNumbers('- [done] x (#52) と #53\n- [todo] #99\n見出し #1'), ['52', '53'])
})

test('検証記録の宛先を読む', () => {
  assert.deepEqual(verifiedDigests('- 検証: @ abc123abc123 —— 理由\n- 依存: [[x]]'), [
    'abc123abc123',
  ])
})

// ── 本物の repository に対して ───────────────────────────────────────────────

test('mark と一緒に commit された code が、その後動けば候補になる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')

  // ⚠ 何も動いていない時点では候補にならない。
  assert.deepEqual(await gather(root), [], '動いていないのに候補になった')

  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved afterwards')

  const items = await gather(root)
  assert.equal(items.length, 1)
  assert.equal(items[0].slug, 'alpha')
  assert.deepEqual(items[0].moved, ['src/thing.mjs'])
  assert.equal(items[0].commitsSince, 1)
})

test('🔴 承認が効く —— digest を書いた node は候補から落ちる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')

  const before = await gather(root)
  assert.equal(before.length, 1, '前提が崩れている')

  await writeNode(
    root,
    'alpha',
    `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${before[0].digest} —— 読み直したが剥離していない`,
  )
  commit(root, 'record the verification')
  assert.deepEqual(await gather(root), [], '承認が効いていない')
})

test('🔴 code が次に動けば承認は自動で失効する', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  const d = (await gather(root))[0].digest
  const body = `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${d} —— 読み直したが剥離していない`
  await writeNode(root, 'alpha', body)
  commit(root, 'record the verification')

  // ⚠ 承認をそのまま残して code をもう一度動かす。
  await writeCode(root, 'thing.mjs', 'export const one = 3')
  commit(root, 'the code moved again')

  const items = await gather(root)
  assert.equal(items.length, 1, '古い承認が新しい変更を吸収した')
  assert.notEqual(items[0].digest, d, 'digest が動いていない')
})

test('履歴が書き換えられても承認は生き残る —— 宛先が blob だから', async (t) => {
  // 🔴 **これが「repo を問わず機能する」の実体である。** ⚠ squash を再現する。
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  const d = (await gather(root))[0].digest
  await writeNode(
    root,
    'alpha',
    `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${d} —— 読み直したが剥離していない`,
  )
  commit(root, 'record the verification')

  git(root, ['reset', '--soft', 'HEAD~2'])
  commit(root, 'squashed')
  assert.deepEqual(await gather(root), [], 'squash が承認を落とした')
})

test('mark を持たない node は疎に落ちる —— 剥離でも整合でもない第 3 状態', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [todo] まだ何もしていない')
  commit(root, 'born')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  assert.deepEqual(await gather(root), [], 'mark の無い node を候補にした')
})

test('code を伴わない mark も疎に落ちる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeNode(root, 'alpha', '- [done] doc だけ直した')
  commit(root, 'docs only')
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  commit(root, 'unrelated code appears')
  assert.deepEqual(await gather(root), [], 'code を持たない mark を候補にした')
})

test('mark が code より後で書かれた場合、PR 番号が join を補う', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeNode(root, 'alpha', '- [todo] まだ')
  commit(root, 'born')
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  commit(root, 'land the code (#7)')
  // ⚠ mark は code と別の commit で書かれる ∴ 同居では引けない。
  await writeNode(root, 'alpha', '- [done] thing を作った (#7)')
  commit(root, 'record the mark afterwards')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')

  const items = await gather(root)
  assert.equal(items.length, 1, 'PR 番号による join が効いていない')
  assert.deepEqual(items[0].moved, ['src/thing.mjs'])
})

// ── fence の形 ──────────────────────────────────────────────────────────────

test('fence は測れなかったことを「剥離が無い」へ畳まない', () => {
  const out = renderAimCodeFence(null)
  assert.match(out, /unavailable/)
  assert.doesNotMatch(out, /# none/)
})

test('fence は出す列に sha を置かない —— 写させる値は digest だけ', () => {
  const out = renderAimCodeFence([
    { slug: 'alpha', digest: 'abc123abc123', code: 9, moved: ['a', 'b', 'c', 'd', 'e', 'f'], commitsSince: 3 },
  ])
  assert.match(out, /# fields: slug \| code_digest \| moved_paths \| commits_since/)
  assert.match(out, /^alpha \| abc123abc123 \| a,b,c,d,\+2 \| 3$/m)
  assert.match(out, new RegExp('```' + AIM_CODE_FENCE_TAG.replace(/ /g, ' ')))
})
