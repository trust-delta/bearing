// drift 可能性 fence の test。
//
// gather は working-delta の test と同じ理由で本物の git repository に対して検査する:
// ⚠ **それが述べる事実はすべて git についての事実**であり、mock は「mock が code に一致
// するよう書かれたこと」しか assert しない。以下のいくつかは想像ではなく **corpus 自身から
// 採った regression** である —— quote された `parent:`、code span の中に引用された
// `[[…]]`、そして一度*現れた*きりの anchor。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  parseCommitLog,
  isAimPath,
  gatherDrift,
  renderIntraFence,
  renderInterFence,
} from '../lib/drift.mjs'
import { parseAimRecord, stripCodeSpans, readAimGraph } from '../lib/corpus.mjs'

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-drift-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  return root
}

/** @param {{parent?: string, state?: string, body?: string}} opts */
async function writeAim(root, slug, aimLine, opts = {}) {
  const front = ['---', 'aim: ' + aimLine]
  if (opts.parent) front.push('parent: ' + opts.parent)
  front.push('state: ' + (opts.state ?? 'open'), '---')
  await writeFile(
    path.join(root, 'docs', 'aims', slug + '.md'),
    front.join('\n') + '\n\n# IS\n\n' + (opts.body ?? 'x') + '\n',
  )
}

const commit = (root, msg) => {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', msg])
}

// ── 純粋関数: log の parse ───────────────────────────────────────────────────

test('parseCommitLog groups files under their commit, newest first', () => {
  const commits = parseCommitLog(
    ['a'.repeat(40), 'docs/aims/alpha.md', 'docs/aims/beta.md', '', 'b'.repeat(40), 'docs/aims/alpha.md', ''].join('\n'),
  )
  assert.equal(commits.length, 2)
  assert.deepEqual(commits[0].files, ['docs/aims/alpha.md', 'docs/aims/beta.md'])
  assert.deepEqual(commits[1].files, ['docs/aims/alpha.md'])
})

test('parseCommitLog ignores stray lines before any commit header', () => {
  assert.deepEqual(parseCommitLog('docs/aims/orphan.md\n\n'), [])
})

test('only top-level records under docs/aims are aim paths', () => {
  assert.equal(isAimPath('docs/aims/alpha.md'), true)
  assert.equal(isAimPath('docs/aims/README.md'), false)
  assert.equal(isAimPath('docs/aims/_guide/aim-authoring.md'), false)
  assert.equal(isAimPath('docs/aims/alpha.txt'), false)
  assert.equal(isAimPath('crates/aim-facts/src/main.rs'), false)
})

// ── 純粋関数: record を読む ──────────────────────────────────────────────────

test('a quoted parent value resolves to the same slug as an unquoted one', () => {
  // 77 node の corpus でちょうど 1 つの node がこう書いており、除去が無ければその node は
  // 木から**丸ごと脱落する**。
  const quoted = parseAimRecord('---\naim: x\nparent: "quoted-parent"\nstate: open\n---\n\nbody\n')
  const bare = parseAimRecord('---\naim: x\nparent: quoted-parent\nstate: open\n---\n\nbody\n')
  assert.equal(quoted.parent, 'quoted-parent')
  assert.equal(quoted.parent, bare.parent)
})

test('a record with no frontmatter yields no fields rather than throwing', () => {
  const r = parseAimRecord('# just a body\n')
  assert.equal(r.aim, null)
  assert.equal(r.parent, null)
  assert.deepEqual(r.links, [])
})

test('a link inside a code span is quoted notation, not a reference', () => {
  // corpus の素の一致 564 件のうち 24 件は `[[slug]]` のような記法であり、
  // そのすべてが backtick の中に座っている。
  const r = parseAimRecord('---\naim: x\n---\n\nsee [[real-node]] but `[[slug]]` is notation\n')
  assert.deepEqual(r.links, ['real-node'])
})

test('stripCodeSpans removes fenced blocks as well as inline spans', () => {
  assert.equal(stripCodeSpans('a `b` c').trim(), 'a  c')
  assert.equal(stripCodeSpans('x\n```\n[[inside]]\n```\ny').includes('[[inside]]'), false)
})

// ── 純粋関数: fence の描画 ───────────────────────────────────────────────────

test('both fences are emitted even with no candidates', () => {
  assert.equal(
    renderIntraFence([]),
    '```bearing-drift-intra v1\n' +
      '# fields: slug | anchor_commit | body_moved\n' +
      '# none — anchor が変更され、以後そのまま放置された record は無い\n' +
      '```\n\n',
  )
  assert.match(
    renderInterFence([]),
    /# none — 変更された anchor の隣接は、すべてその後に動いているか照合済みである/,
  )
})

test('an unreadable body diff renders as unknown, never as false', () => {
  // ⚠ 観測できない事実は「不在」であって「否定」ではない。
  const out = renderIntraFence([{ slug: 'alpha', commit: 'a'.repeat(40), bodyMoved: null }])
  assert.match(out, /^alpha \| aaaaaaaa \| unknown$/m)
})

test('inter records list their neighbours comma-separated, in one row per node', () => {
  const out = renderInterFence([{ slug: 'alpha', commit: 'b'.repeat(40), stale: ['beta', 'gamma'] }])
  assert.match(out, /^alpha \| bbbbbbbb \| beta,gamma$/m)
})

// ── 本物の repository に対して ───────────────────────────────────────────────

test('a node still sitting as it was born is not an intra candidate', async (t) => {
  // ⚠ **この fence 全体が懸かっている regression**: anchor に対する `-G` は file が
  // *作成*されたことにも一致する。作成は一致する行を足すからである。誕生 commit を除く前は
  // 77 node 中 44 件で発火していた。
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'a purpose never revised')
  commit(root, 'born')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.intra, [])
})

test('an anchor modified with nothing since is an intra candidate', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'first purpose')
  commit(root, 'born')
  await writeAim(root, 'alpha', 'second purpose') // anchor only; body identical
  commit(root, 'repurpose')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.intra.map((r) => r.slug), ['alpha'])
  assert.equal(facts.intra[0].bodyMoved, false)
})

test('body_moved reports the fact, and a body edit in the same commit sets it', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'first purpose')
  commit(root, 'born')
  await writeAim(root, 'alpha', 'second purpose', { body: 'a revised reading' })
  commit(root, 'repurpose with the body')

  const facts = await gatherDrift(root)
  assert.equal(facts.intra[0].bodyMoved, true)
})

test('an anchor change that has been revisited since is no longer a candidate', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'first purpose')
  commit(root, 'born')
  await writeAim(root, 'alpha', 'second purpose')
  commit(root, 'repurpose')
  await writeAim(root, 'alpha', 'second purpose', { body: 'brought back to the purpose' })
  commit(root, 'realign')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.intra, [])
})

test('a neighbour that has not moved since the anchor change is unreconciled', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', { parent: 'parent-node' })
  commit(root, 'repurpose the child alone')

  const facts = await gatherDrift(root)
  const row = facts.inter.find((r) => r.slug === 'child-node')
  assert.deepEqual(row.stale, ['parent-node'])
})

test('a neighbour that moved after the anchor change has had its chance', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', { parent: 'parent-node' })
  commit(root, 'repurpose the child alone')
  await writeAim(root, 'parent-node', 'the parent purpose', { body: 'absorbing the child' })
  commit(root, 'the parent catches up')

  const facts = await gatherDrift(root)
  assert.equal(facts.inter.find((r) => r.slug === 'child-node'), undefined)
})

test('a node created without its parent moving is an inter candidate', async (t) => {
  // ⚠ ここでは**作成が trigger であり、しかも最も多い形**である —— 変更と並んで名指され
  // ており、免除されているのは intra 側だけである。
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  commit(root, 'the parent alone')
  await writeAim(root, 'child-node', 'a new child', { parent: 'parent-node' })
  commit(root, 'add a child, touch nothing else')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.inter.find((r) => r.slug === 'child-node').stale, ['parent-node'])
})

test('a deleted node leaves no ghost record behind', async (t) => {
  // 履歴は corpus がもう持たない path を運ぶ。それを数えた結果、実在 77 に対して
  // 「anchor 履歴を持つ node」が 103 と報告された。
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'first purpose')
  await writeAim(root, 'ghost', 'a purpose later abandoned')
  commit(root, 'born')
  await writeAim(root, 'ghost', 'revised before removal')
  commit(root, 'repurpose the ghost')
  await rm(path.join(root, 'docs', 'aims', 'ghost.md'))
  commit(root, 'remove the ghost')

  const facts = await gatherDrift(root)
  const named = [...facts.intra.map((r) => r.slug), ...facts.inter.map((r) => r.slug)]
  assert.equal(named.includes('ghost'), false)
})

test('an inbound link makes the linking node a neighbour of its target', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'alpha purpose', { body: 'depends on [[beta]]' })
  await writeAim(root, 'beta', 'beta purpose')
  commit(root, 'born')

  const graph = await readAimGraph(root)
  assert.deepEqual(graph.neighbours('beta'), ['alpha'])
  assert.deepEqual(graph.neighbours('alpha'), ['beta'])
})

test('a link to a slug that does not exist is dropped, not reported', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'alpha purpose', { body: 'points at [[nowhere]]' })
  commit(root, 'born')

  const graph = await readAimGraph(root)
  assert.deepEqual(graph.neighbours('alpha'), [])
})

test('a directory that is not a git repo yields no facts, not an error', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-drift-bare-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeAim(root, 'alpha', 'a purpose')

  assert.equal(await gatherDrift(root), null)
})

test('a repo with no aim corpus yields no facts', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-drift-nocorpus-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  git(root, ['init', '-q'])

  assert.equal(await gatherDrift(root), null)
})

test('a clean corpus with no anchor history yields empty fences, not null', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'alpha', 'a purpose')
  commit(root, 'born')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts, { intra: [], inter: [], brokenCollations: [] })
})

// ── 照合記録 ────────────────────────────────────────────────────────────────
//
// ⚠ **これらが固定しているのは「注意予算に課税しない」という条項である。** 検査して変更が
// 要れば隣接が動く ∴ flag は自然に落ちる。だが**変更不要という結論は何も動かさない** ——
// 記録する場所が無ければ、機構は既に見た者へ「見よ」と言い続ける。それは可視化ではない。

test('照合済みの隣接は候補から落ちる —— 変更不要という結論は何も動かさないため', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', { parent: 'parent-node' })
  commit(root, 'repurpose the child alone')
  const anchor = git(root, ['rev-parse', 'HEAD']).trim()

  const before = await gatherDrift(root)
  assert.deepEqual(before.inter.find((r) => r.slug === 'child-node').stale, ['parent-node'])

  await writeAim(root, 'child-node', 'the child purpose, revised', {
    parent: 'parent-node',
    body: `- 照合: [[parent-node]] @ ${anchor.slice(0, 8)} —— 読んだが変更不要だった`,
  })
  commit(root, 'record the collation')

  const after = await gatherDrift(root)
  assert.equal(after.inter.find((r) => r.slug === 'child-node'), undefined)
  assert.deepEqual(after.brokenCollations, [])
})

test('照合は commit に対する証言である ∴ anchor が再び動けば効かない', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', { parent: 'parent-node' })
  commit(root, 'repurpose the child alone')
  const anchor = git(root, ['rev-parse', 'HEAD']).trim()
  const collation = `- 照合: [[parent-node]] @ ${anchor.slice(0, 8)} —— 読んだが変更不要だった`
  await writeAim(root, 'child-node', 'the child purpose, revised', {
    parent: 'parent-node',
    body: collation,
  })
  commit(root, 'record the collation')

  // ⚠ 古い照合を残したまま anchor をもう一度動かす —— 一度書いた行が以後すべての変更を
  // 黙って吸収してはならない。
  await writeAim(root, 'child-node', 'the child purpose, revised again', {
    parent: 'parent-node',
    body: collation,
  })
  commit(root, 'repurpose the child once more')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.inter.find((r) => r.slug === 'child-node').stale, ['parent-node'])
})

test('読めない照合記録は候補を消さず、そのまま声になる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', {
    parent: 'parent-node',
    // ⚠ 日付を書く取り違えには前例がある（`last-verified` で実際に起きた）。
    body: '- 照合: [[parent-node]] @ 2026-09-02 —— 日付を書いてしまった',
  })
  commit(root, 'repurpose the child alone')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.inter.find((r) => r.slug === 'child-node').stale, ['parent-node'])
  assert.deepEqual(facts.brokenCollations, [
    { slug: 'child-node', neighbour: 'parent-node', sha: '2026-09-02', why: 'sha ではない' },
  ])
})

test('aim 履歴に無い commit を名指した照合も読めない扱いになる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeAim(root, 'parent-node', 'the parent purpose')
  await writeAim(root, 'child-node', 'the child purpose', { parent: 'parent-node' })
  commit(root, 'born')
  await writeAim(root, 'child-node', 'the child purpose, revised', {
    parent: 'parent-node',
    body: '- 照合: [[parent-node]] @ ' + 'f'.repeat(40) + ' —— 在りもしない commit',
  })
  commit(root, 'repurpose the child alone')

  const facts = await gatherDrift(root)
  assert.deepEqual(facts.inter.find((r) => r.slug === 'child-node').stale, ['parent-node'])
  assert.equal(facts.brokenCollations[0].why, 'aim 履歴に無い')
})

test('読めない記録は候補の一覧より先に出る —— 一覧を先に信じさせないため', () => {
  const out = renderInterFence(
    [{ slug: 'alpha', commit: 'b'.repeat(40), stale: ['beta'] }],
    [{ slug: 'alpha', neighbour: 'gamma', sha: 'nope', why: 'sha ではない' }],
  )
  const lines = out.split('\n')
  const warn = lines.findIndex((l) => l.startsWith('# ⚠ 読めない照合記録'))
  const row = lines.findIndex((l) => l.startsWith('alpha |'))
  assert.ok(warn !== -1 && row !== -1)
  assert.ok(warn < row, '読めない記録は候補行より前に出ること')
})

test('fenced block の中の照合は記録ではなく引用である', () => {
  const record = parseAimRecord(
    ['---', 'aim: x', '---', '', '# DAG', '', '```', '- 照合: [[quoted]] @ abcdef1', '```', '',
     '- 照合: [[real]] @ abcdef1', ''].join('\n'),
  )
  assert.deepEqual(record.collations, [{ slug: 'real', sha: 'abcdef1' }])
})
