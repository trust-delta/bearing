// Tests for the boot-ritual trigger (`UserPromptSubmit`).
//
// What this hook exists to fix was measured, not imagined: `SessionStart` puts
// the baton in context but starts no turn, so `_guide/handoff.md` § 読む steps
// 2-6 — all agent acts — never ran until a human happened to type, and never at
// all if what they typed was unrelated. These assert the two halves of 半強制:
// it states the obligation exactly
// once, and it never touches what the operator typed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(HERE, '..', 'bin', 'boot-ritual.mjs')

/** A session id no other run of this suite can collide with. */
let seq = 0
const freshSession = () => `test-${process.pid}-${Date.now()}-${seq++}`

function run(input) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

async function unitWithBaton(front = 'composed-at: 2026-08-31T13:07:56Z') {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-ritual-'))
  await mkdir(path.join(root, '.handoff'), { recursive: true })
  await writeFile(
    path.join(root, '.handoff', 'active.md'),
    `---\n${front}\ntask: pick up the measurement\n---\n\n## ▶ Task\n\nkeep going\n`,
    'utf8',
  )
  return root
}

test('with no baton there is nothing outstanding, so it stays silent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-ritual-'))
  try {
    const r = run({ session_id: freshSession(), cwd: root })
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an outstanding baton is surfaced with the procedure that owns it', async () => {
  const root = await unitWithBaton()
  try {
    const r = run({ session_id: freshSession(), cwd: root })
    assert.equal(r.status, 0)
    assert.match(r.stdout, /baton is outstanding/)
    assert.ok(r.stdout.includes(path.join(root, '.handoff', 'active.md')))
    // It points at the canon and the bookkeeping CLI rather than restating the
    // procedure — a third account of the ritual in the tree is the duplication
    // `neutral-source-vendor-carrier` forbids.
    assert.match(r.stdout, /_guide\/handoff\.md/)
    assert.match(r.stdout, /bin\/handoff\.mjs read/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('it fires once per session, and the marker is what makes that true', async () => {
  const root = await unitWithBaton()
  const session = freshSession()
  try {
    const first = run({ session_id: session, cwd: root })
    const second = run({ session_id: session, cwd: root })
    assert.match(first.stdout, /baton is outstanding/)
    assert.equal(second.stdout, '')
    assert.equal(second.status, 0)
    // ⚠ A different session in the same workspace is a different conversation
    // and is owed the prompt of its own.
    const other = run({ session_id: freshSession(), cwd: root })
    assert.match(other.stdout, /baton is outstanding/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('it never exits 2 — the operator’s prompt is never erased', async () => {
  const root = await unitWithBaton()
  try {
    // Exit 2 on UserPromptSubmit "blocks processing, erases the original
    // prompt". Destroying what the operator typed to enforce a ritual meant to
    // serve them is the inversion `precompact.mjs` also refuses.
    assert.equal(run({ session_id: freshSession(), cwd: root }).status, 0)
    assert.equal(run({ session_id: freshSession(), cwd: '/nonexistent-path-xyz' }).status, 0)
    assert.equal(run('not json at all').status, 0)
    assert.equal(run('').status, 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a baton that was already read says so, and is still handed over', async () => {
  const root = await unitWithBaton(
    'composed-at: 2026-08-31T13:07:56Z\nread-at: 2026-08-31T13:25:09Z',
  )
  try {
    const r = run({ session_id: freshSession(), cwd: root })
    // The canon: re-reading is legitimate, and `read-at` exists to detect it,
    // not to prevent it. So the fact is stated and the procedure still stands.
    assert.match(r.stdout, /2026-08-31T13:25:09Z/)
    assert.match(r.stdout, /read before/)
    assert.match(r.stdout, /baton is outstanding/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an empty baton file is an absent baton, not an outstanding one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-ritual-'))
  try {
    await mkdir(path.join(root, '.handoff'), { recursive: true })
    await writeFile(path.join(root, '.handoff', 'active.md'), '   \n', 'utf8')
    assert.equal(run({ session_id: freshSession(), cwd: root }).stdout, '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
