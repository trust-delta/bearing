// Tests for the handoff mechanism — the bookkeeping half of the baton ritual.
//
// Nothing here tests authoring, because nothing in the implementation authors.
// What is tested is the ordering and the refusals: the canon's rules are all of
// the form "this must happen before that" or "this must never be written", and
// each of them is a rule a hand-executed ritual gets wrong sooner or later.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  archiveActive,
  archiveStamp,
  listArchive,
  stampComposedAt,
  stampReadAt,
  writeBaton,
  activePath,
} from '../lib/handoff.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRECOMPACT = path.join(HERE, '..', 'bin', 'precompact.mjs')

async function unit(withBaton) {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-handoff-'))
  if (withBaton !== undefined) {
    await mkdir(path.join(root, '.handoff'), { recursive: true })
    await writeFile(activePath(root), withBaton, 'utf8')
  }
  return root
}

// ── the archive name ─────────────────────────────────────────────────────────

test('the archive stamp is a legal file name on Windows too', () => {
  const s = archiveStamp(new Date('2026-08-31T11:22:33.456Z'))
  assert.equal(s, '2026-08-31T112233Z')
  assert.ok(!s.includes(':'))
})

// ── rotation happens on write, never on read ─────────────────────────────────

test('writing rotates the previous baton into the archive', async () => {
  const root = await unit('---\ncomposed-at: 2026-08-30T00:00:00Z\n---\n\nOLD\n')
  const { archived } = await writeBaton(root, '---\ntask: t\n---\n\nNEW\n')
  assert.ok(archived)
  assert.match(await readFile(archived, 'utf8'), /OLD/)
  assert.match(await readFile(activePath(root), 'utf8'), /NEW/)
  await rm(root, { recursive: true, force: true })
})

test('reading never archives — reading the same baton twice must stay possible', async () => {
  // The canon: detecting a second read is `read-at`'s job; preventing it is not
  // a goal. An archiving reader would make an intentional re-read impossible.
  const root = await unit('---\ncomposed-at: 2026-08-30T00:00:00Z\n---\n\nX\n')
  await stampReadAt(root)
  await stampReadAt(root)
  assert.deepEqual(await listArchive(root), [])
  await rm(root, { recursive: true, force: true })
})

test('the first ever write has nothing to rotate, and says so', async () => {
  const root = await unit()
  const { archived } = await writeBaton(root, 'first\n')
  assert.equal(archived, null)
  await rm(root, { recursive: true, force: true })
})

test('two hand-offs in the same second do not lose one', async () => {
  const root = await unit('A\n')
  const at = new Date('2026-08-31T11:22:33Z')
  await writeBaton(root, 'B\n', at)
  await writeBaton(root, 'C\n', at)
  const names = await readdir(path.join(root, '.handoff', 'archive'))
  assert.equal(names.length, 2)
  await rm(root, { recursive: true, force: true })
})

// ── what a writer may and may not stamp ──────────────────────────────────────

test('composed-at is stamped from the clock, replacing whatever was authored', () => {
  // It is the one field the author cannot know better than the clock, and a
  // wrong one makes the reader's "this baton is days old" line lie.
  const at = new Date('2026-08-31T11:00:00Z')
  const s = stampComposedAt('---\ncomposed-at: 1999-01-01T00:00:00Z\ntask: t\n---\n\nbody\n', at)
  assert.match(s, /composed-at: 2026-08-31T11:00:00Z/)
  assert.ok(!s.includes('1999'))
  assert.match(s, /task: t/)
})

test('read-at is stripped by the writer — a new baton has not been read', () => {
  const s = stampComposedAt('---\nread-at: 2026-01-01T00:00:00Z\ntask: t\n---\n\nbody\n')
  assert.ok(!s.includes('read-at'))
})

test('a baton authored without frontmatter is given one, not refused', () => {
  // The baton's value is its body. A missing delimiter is not worth losing it.
  const s = stampComposedAt('## Task\nsomething\n')
  assert.match(s, /^---\ncomposed-at: /)
  assert.match(s, /## Task/)
})

// ── the read side: step 2 before step 3 ──────────────────────────────────────

test('stamping returns the PREVIOUS read-at before overwriting it', async () => {
  // Stamp first and the value you were meant to report is gone.
  const root = await unit(
    '---\ncomposed-at: 2026-08-28T01:00:00Z\nread-at: 2026-08-30T02:00:00Z\n---\n\nX\n',
  )
  const r = await stampReadAt(root, new Date('2026-08-31T03:00:00Z'))
  assert.equal(r.previousReadAt, '2026-08-30T02:00:00Z')
  assert.equal(r.composedAt, '2026-08-28T01:00:00Z')
  const after = await readFile(activePath(root), 'utf8')
  assert.match(after, /read-at: 2026-08-31T03:00:00Z/)
  assert.ok(!after.includes('2026-08-30T02:00:00Z'))
  await rm(root, { recursive: true, force: true })
})

test('a first read inserts read-at directly after composed-at', async () => {
  const root = await unit('---\ncomposed-at: 2026-08-31T01:00:00Z\ntask: t\n---\n\nX\n')
  const r = await stampReadAt(root, new Date('2026-08-31T03:00:00Z'))
  assert.equal(r.previousReadAt, null)
  const after = await readFile(activePath(root), 'utf8')
  assert.match(after, /composed-at: 2026-08-31T01:00:00Z\nread-at: 2026-08-31T03:00:00Z/)
  await rm(root, { recursive: true, force: true })
})

test('a baton with no composed-at is reported unstamped, not rewritten', async () => {
  const root = await unit('no frontmatter here\n')
  const r = await stampReadAt(root)
  assert.equal(r.stamped, false)
  assert.equal(await readFile(activePath(root), 'utf8'), 'no frontmatter here\n')
  await rm(root, { recursive: true, force: true })
})

test('no baton at all yields null rather than creating one', async () => {
  const root = await unit()
  assert.equal(await stampReadAt(root), null)
  await rm(root, { recursive: true, force: true })
})

// ── the threshold trigger ────────────────────────────────────────────────────

/** A fresh id per call: the trigger's marker is durable and must not leak between runs. */
const newSessionId = () => `aimtest-${process.pid}-${Math.random().toString(36).slice(2)}`

function precompact(input) {
  try {
    execFileSync(process.execPath, [PRECOMPACT], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { code: 0, stderr: '' }
  } catch (e) {
    return { code: e.status, stderr: e.stderr ?? '' }
  }
}

test('a human running /compact is never overridden', async () => {
  // Overriding an explicit operator act to enforce a ritual meant to serve them
  // would invert the régime.
  const root = await unit('x\n')
  assert.equal(precompact({ trigger: 'manual', session_id: newSessionId(), cwd: root }).code, 0)
  await rm(root, { recursive: true, force: true })
})

test('auto-compaction is blocked once, with the authoring instruction', async () => {
  // ⚠ The session id must be unique per RUN. The trigger's marker is durable on
  // purpose — "once per session" is only true if the marker outlives the hook —
  // so a fixed id here passes the first time and fails every time after, which
  // is exactly how this test first failed.
  const root = await unit('x\n')
  const first = precompact({ trigger: 'auto', session_id: newSessionId(), cwd: root })
  assert.equal(first.code, 2)
  assert.match(first.stderr, /author a baton instead of being compacted/)
  await rm(root, { recursive: true, force: true })
})

test('it does not fire twice in one session — a standing refusal would be a cage', async () => {
  const root = await unit('x\n')
  const id = newSessionId()
  assert.equal(precompact({ trigger: 'auto', session_id: id, cwd: root }).code, 2)
  assert.equal(precompact({ trigger: 'auto', session_id: id, cwd: root }).code, 0)
  await rm(root, { recursive: true, force: true })
})

test('a project that never adopted the régime is left alone', async () => {
  // No corpus and no `.handoff/`: imposing the ritual would be the plugin
  // deciding something the operator did not.
  const root = await mkdtemp(path.join(tmpdir(), 'aim-handoff-'))
  const r = precompact({ trigger: 'auto', session_id: newSessionId(), cwd: root })
  assert.equal(r.code, 0)
  await rm(root, { recursive: true, force: true })
})

test('unparseable hook input never interferes with the session', () => {
  try {
    execFileSync(process.execPath, [PRECOMPACT], { input: 'not json', encoding: 'utf8' })
  } catch (e) {
    assert.fail(`should have exited 0, got ${e.status}`)
  }
})
