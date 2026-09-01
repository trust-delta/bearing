// Tests for the staleness trigger (`PostToolBatch`) and the digest it gates on.
//
// The invariant that matters most is NOT that it reports a change — it is that
// it stays quiet when nothing a session could act on has changed. Editing an
// aim body is the most common thing a session does to the corpus, and a hook
// that re-injected the same numbers after every one of those edits would make
// the surface unreadable, which is the failure `aim-upkeep` rules out by
// putting the machine layer at *visibility*.
//
// Every fact asserted here is a fact about a real git repository, for the same
// reason the drift tests are: a mock would only prove the mock matches the code.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { factsDigest, deltaStatePath } from '../lib/corpus-signature.mjs'
import { renderCorpusDelta } from '../lib/corpus-delta.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(HERE, '..', 'bin', 'corpus-delta.mjs')

let seq = 0
const freshSession = () => `test-${process.pid}-${Date.now()}-${seq++}`
const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

function run(input) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

/** The injected context, or null when the hook stayed silent. */
function context(r) {
  if (r.stdout.trim() === '') return null
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolBatch')
  return parsed.hookSpecificOutput.additionalContext
}

const node = (aim, process_) =>
  `---\naim: ${aim}\nparent: root\nstate: open\n---\n\n# IS\n\nsomething\n\n# PROCESS\n\n${process_}\n`

/** A unit directory holding one repo that carries a corpus. */
async function unit() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-delta-'))
  const repo = path.join(root, 'repo')
  await mkdir(path.join(repo, 'docs', 'aims'), { recursive: true })
  git(repo, ['init', '-q', '-b', 'main'])
  git(repo, ['config', 'user.email', 'test@example.invalid'])
  git(repo, ['config', 'user.name', 'test'])
  await writeFile(path.join(repo, 'docs', 'aims', 'alpha.md'), node('alpha', '- [todo] one'))
  await writeFile(path.join(repo, 'docs', 'aims', 'beta.md'), node('beta', '- [done] two'))
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-qm', 'seed'])
  return { root, repo, aims: path.join(repo, 'docs', 'aims') }
}

// ── the digest: the line between "bytes moved" and "facts changed" ───────────

test('the facts digest ignores how a body was phrased', () => {
  const a = { label: 'r', working: [], backlog: { openTodoNodes: 3, unknownNodes: [], anomalies: [] } }
  const b = { label: 'r', working: [], backlog: { openTodoNodes: 3, unknownNodes: [], anomalies: [] } }
  assert.equal(factsDigest([a]), factsDigest([b]))
})

test('the facts digest moves when the open-todo count does', () => {
  const base = { label: 'r', working: [], backlog: { openTodoNodes: 3, unknownNodes: [], anomalies: [] } }
  const more = { label: 'r', working: [], backlog: { openTodoNodes: 4, unknownNodes: [], anomalies: [] } }
  assert.notEqual(factsDigest([base]), factsDigest([more]))
})

test('the facts digest does not depend on repo or record order', () => {
  const r1 = { label: 'a', working: [{ slug: 'x', uncommitted: true }], backlog: {} }
  const r2 = { label: 'b', working: [], backlog: {} }
  assert.equal(factsDigest([r1, r2]), factsDigest([r2, r1]))
})

// ── the renderer never judges ────────────────────────────────────────────────

test('the count is surfaced with the instruction not to triage it', () => {
  const body = renderCorpusDelta({
    repos: [{ label: 'r', working: [], backlog: { openTodoNodes: 7, unknownNodes: [], anomalies: [] } }],
    moved: [],
    hadBaseline: true,
  })
  assert.match(body, /open-todo: 7/)
  assert.match(body, /do not triage it/)
})

test('a unit with no corpus renders nothing at all', () => {
  assert.equal(renderCorpusDelta({ repos: [], moved: [], hadBaseline: true }), '')
})

// ── the hook, against a real repo ────────────────────────────────────────────

test('a directory with no corpus is silent — the discipline was never adopted', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-delta-'))
  try {
    const r = run({ session_id: freshSession(), cwd: root })
    assert.equal(r.status, 0)
    assert.equal(context(r), null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('with no baseline it reports the corpus and says the baseline is absent', async () => {
  const u = await unit()
  try {
    const body = context(run({ session_id: freshSession(), cwd: u.root }))
    // Absent must never render as clean — the same rule the composer follows
    // when it fails.
    assert.match(body, /No boot baseline was recorded/)
    assert.match(body, /open-todo: 1/)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('a second batch with nothing moved is silent', async () => {
  const u = await unit()
  const session = freshSession()
  try {
    assert.notEqual(context(run({ session_id: session, cwd: u.root })), null)
    assert.equal(context(run({ session_id: session, cwd: u.root })), null)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('⚠ a second body edit to an already-dirty node is silent', async () => {
  const u = await unit()
  const session = freshSession()
  try {
    // ⚠ The FIRST edit is a fact change: the node goes from clean to
    // uncommitted, and the working-delta fence gains a record. What must be
    // silent is every edit after that — the node is still uncommitted, the
    // anchor still unmoved, the count still the same. That is the shape of an
    // ordinary session maintaining an aim body, and it is the case that would
    // otherwise re-inject an identical report on every batch.
    await writeFile(path.join(u.aims, 'alpha.md'), node('alpha', '- [todo] one').replace('something', 'first'))
    assert.notEqual(context(run({ session_id: session, cwd: u.root })), null)

    await writeFile(path.join(u.aims, 'alpha.md'), node('alpha', '- [todo] one').replace('something', 'second'))
    assert.equal(context(run({ session_id: session, cwd: u.root })), null)

    await writeFile(path.join(u.aims, 'alpha.md'), node('alpha', '- [todo] one').replace('something', 'third'))
    assert.equal(context(run({ session_id: session, cwd: u.root })), null)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('a new node carrying a [todo] moves the count and is reported', async () => {
  const u = await unit()
  const session = freshSession()
  try {
    run({ session_id: session, cwd: u.root })
    await writeFile(path.join(u.aims, 'gamma.md'), node('gamma', '- [todo] three'))
    const body = context(run({ session_id: session, cwd: u.root }))
    assert.match(body, /open-todo: 2/)
    assert.match(body, /gamma \| false \| false \| true/)
    assert.doesNotMatch(body, /No boot baseline/)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('an aim commit moves HEAD and the history fences are recomputed, not just flagged', async () => {
  const u = await unit()
  const session = freshSession()
  try {
    run({ session_id: session, cwd: u.root })
    await writeFile(path.join(u.aims, 'gamma.md'), node('gamma', '- [todo] three'))
    git(u.repo, ['add', '-A'])
    git(u.repo, ['commit', '-qm', 'add gamma'])
    const body = context(run({ session_id: session, cwd: u.root }))
    assert.match(body, /HEAD moved over/)
    // Recomputed for real — not a "these are stale, go and refresh" note, which
    // would turn a fact the régime owes the session into an errand.
    assert.match(body, /bearing-drift-intra v1/)
    assert.match(body, /bearing-unpushed v1/)
    assert.match(body, /bearing-checkpoint-stale v1/)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('a commit that touches no aim does not masquerade as an aim change', async () => {
  const u = await unit()
  const session = freshSession()
  try {
    run({ session_id: session, cwd: u.root })
    await writeFile(path.join(u.repo, 'src.txt'), 'code\n')
    git(u.repo, ['add', '-A'])
    git(u.repo, ['commit', '-qm', 'unrelated'])
    assert.equal(context(run({ session_id: session, cwd: u.root })), null)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})

test('it never obstructs the turn, whatever it is handed', async () => {
  // Exit 2 on PostToolBatch stops the agentic loop outright.
  assert.equal(run('not json').status, 0)
  assert.equal(run('').status, 0)
  assert.equal(run({ session_id: freshSession(), cwd: '/nonexistent-path-xyz' }).status, 0)
})

test('the state file is keyed per session, so two sessions do not read each other', async () => {
  const u = await unit()
  const a = freshSession()
  const b = freshSession()
  try {
    run({ session_id: a, cwd: u.root })
    // b has its own (absent) baseline and is owed the report of its own.
    assert.match(context(run({ session_id: b, cwd: u.root })), /No boot baseline/)
    assert.notEqual(deltaStatePath(a), deltaStatePath(b))
    const state = JSON.parse(await readFile(deltaStatePath(a), 'utf8'))
    assert.ok(state.sig && state.facts)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})
