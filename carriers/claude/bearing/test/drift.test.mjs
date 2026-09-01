// Tests for the drift-possibility fences.
//
// The gather is checked against a real git repository for the same reason the
// working-delta tests are: every fact it states is a fact about git, and a mock
// would only assert that the mock was written to match the code. Several of
// these cases are regressions taken from the corpus itself rather than
// imagined — the quoted `parent:`, the `[[…]]` quoted inside a code span, and
// an anchor that only ever *appeared*.

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

// ── pure: log parsing ────────────────────────────────────────────────────────

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
  assert.equal(isAimPath('docs/aims/_guide/producer-guide.md'), false)
  assert.equal(isAimPath('docs/aims/alpha.txt'), false)
  assert.equal(isAimPath('crates/aim-facts/src/main.rs'), false)
})

// ── pure: reading a record ───────────────────────────────────────────────────

test('a quoted parent value resolves to the same slug as an unquoted one', () => {
  // Exactly one node in the 77-node corpus writes it this way, and without the
  // strip that node drops out of the tree entirely.
  const quoted = parseAimRecord('---\naim: x\nparent: "operator-single-producer"\nstate: open\n---\n\nbody\n')
  const bare = parseAimRecord('---\naim: x\nparent: operator-single-producer\nstate: open\n---\n\nbody\n')
  assert.equal(quoted.parent, 'operator-single-producer')
  assert.equal(quoted.parent, bare.parent)
})

test('a record with no frontmatter yields no fields rather than throwing', () => {
  const r = parseAimRecord('# just a body\n')
  assert.equal(r.aim, null)
  assert.equal(r.parent, null)
  assert.deepEqual(r.links, [])
})

test('a link inside a code span is quoted notation, not a reference', () => {
  // 24 of the corpus's 564 bare matches are metasyntax like `[[slug]]`, and
  // every one sits inside backticks.
  const r = parseAimRecord('---\naim: x\n---\n\nsee [[real-node]] but `[[slug]]` is notation\n')
  assert.deepEqual(r.links, ['real-node'])
})

test('stripCodeSpans removes fenced blocks as well as inline spans', () => {
  assert.equal(stripCodeSpans('a `b` c').trim(), 'a  c')
  assert.equal(stripCodeSpans('x\n```\n[[inside]]\n```\ny').includes('[[inside]]'), false)
})

// ── pure: fence rendering ────────────────────────────────────────────────────

test('both fences are emitted even with no candidates', () => {
  assert.equal(
    renderIntraFence([]),
    '```bearing-drift-intra v1\n' +
      '# fields: slug | anchor_commit | body_moved\n' +
      '# none — no record has had its anchor modified and been left untouched since\n' +
      '```\n\n',
  )
  assert.match(renderInterFence([]), /# none — every neighbour of a changed anchor has moved since/)
})

test('an unreadable body diff renders as unknown, never as false', () => {
  // A fact we cannot observe is absent, not negative.
  const out = renderIntraFence([{ slug: 'alpha', commit: 'a'.repeat(40), bodyMoved: null }])
  assert.match(out, /^alpha \| aaaaaaaa \| unknown$/m)
})

test('inter records list their neighbours comma-separated, in one row per node', () => {
  const out = renderInterFence([{ slug: 'alpha', commit: 'b'.repeat(40), stale: ['beta', 'gamma'] }])
  assert.match(out, /^alpha \| bbbbbbbb \| beta,gamma$/m)
})

// ── against a real repository ────────────────────────────────────────────────

test('a node still sitting as it was born is not an intra candidate', async (t) => {
  // The regression this whole fence turns on: `-G` on the anchor matches a file
  // being CREATED, because creation adds a line that matches. Before excluding
  // the birth commit this fired for 44 of 77 nodes.
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
  // Creation IS a trigger here, and the common one — drift-git names it
  // alongside modification, and only the intra side is exempt.
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
  // History carries paths the corpus no longer has. Counting them reported 103
  // nodes with anchor history against the 77 that existed.
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
  assert.deepEqual(facts, { intra: [], inter: [] })
})
