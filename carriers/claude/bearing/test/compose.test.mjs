// Tests for the SessionStart composer — the two rules it may never break.
//
// This runs at the start of EVERY session in EVERY project, so the invariants
// are not about output quality; they are about never obstructing a session and
// never letting an absence read as a clean bill of health. Both are asserted
// against the real script through a real process, because "exit 0" and "stdout
// is the context" are facts about the process, not about the module.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMPOSER = path.join(HERE, '..', 'bin', 'aim-facts.mjs')

/** Run the composer in `cwd`, returning stdout. Never throws on exit code. */
function compose(cwd, env = {}) {
  return execFileSync(process.execPath, [COMPOSER], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

async function corpusRepo(root, slugs) {
  execFileSync('git', ['init', '-q', root])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  for (const slug of slugs) {
    await writeFile(
      path.join(root, 'docs', 'aims', slug + '.md'),
      `---\naim: x\nstate: open\n---\n\n# PROCESS\n\n- [todo] a\n`,
    )
  }
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'corpus'])
}

test('the frame is always injected — a session is never left un-framed', async () => {
  // An un-framed agent has nothing stopping it from rewriting an `aim:` line,
  // which is a VIOLATION of the ownership split, not a degradation of speed.
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const outEmpty = compose(root)
  assert.match(outEmpty, /# aim frame/)
  assert.match(outEmpty, /frontmatter は人間のもの/)
  await rm(root, { recursive: true, force: true })
})

test('no git at all is reported as a NEW project, not as an error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const out = compose(root)
  assert.match(out, /No git repository at or below this cwd/)
  await rm(root, { recursive: true, force: true })
})

test('git without a corpus is reported as an EXISTING project to attach to', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  const out = compose(root)
  assert.match(out, /Git is here but no .docs\/aims\/. is/)
  // And provisioning is explicitly NOT something the session does unasked.
  assert.match(out, /not yours to perform unasked/)
  await rm(root, { recursive: true, force: true })
})

test('a corpus yields the fences and the open-todo count', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(root, { recursive: true })
  await corpusRepo(root, ['alpha', 'beta'])
  const out = compose(root)
  assert.match(out, /```bearing-drift-intra v1/)
  assert.match(out, /```bearing-drift-inter v1/)
  assert.match(out, /```bearing-working-delta v1/)
  assert.match(out, /```bearing-unpushed v1/)
  assert.match(out, /```bearing-checkpoint-stale v1/)
  assert.match(out, /\*\*open-todo: 2\*\*/)
  // The count is a fact, and the composer must say so rather than rank it.
  assert.match(out, /the pick is the operator/)
  await rm(dir, { recursive: true, force: true })
})

test('an absent baton says so, and warns against reading silence as emptiness', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(root, { recursive: true })
  await corpusRepo(root, ['alpha'])
  const out = compose(root)
  assert.match(out, /No baton at .\.handoff\/active\.md./)
  assert.match(out, /An empty baton is not an empty project/)
  await rm(dir, { recursive: true, force: true })
})

test('a baton is surfaced in full, with the reading procedure left to the agent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(path.join(root, '.handoff'), { recursive: true })
  await corpusRepo(root, ['alpha'])
  const file = path.join(root, '.handoff', 'active.md')
  const baton = '---\ncomposed-at: 2026-08-31T11:00:00Z\ntask: t\n---\n\n## Settled\nA THING WE SETTLED\n'
  await writeFile(file, baton)
  const out = compose(root)
  assert.match(out, /A THING WE SETTLED/)
  assert.match(out, /has NOT stamped .read-at./)
  // The hook must not have written to it.
  const { readFile } = await import('node:fs/promises')
  assert.equal(await readFile(file, 'utf8'), baton)
  await rm(dir, { recursive: true, force: true })
})

test('a corpus deviating from its own notation is surfaced, not silently dropped', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  execFileSync('git', ['init', '-q', root])
  await writeFile(
    path.join(root, 'docs', 'aims', 'a.md'),
    '---\naim: x\nstate: open\n---\n\n# PROCESS\n\n* [todo] written the other way\n',
  )
  const out = compose(root)
  assert.match(out, /\*\*open-todo: 0\*\*/)
  assert.match(out, /PROCESS notation anomal/)
  assert.match(out, /counted NOWHERE/)
  await rm(dir, { recursive: true, force: true })
})

test('an unreadable corpus still exits 0 and still frames the session', async () => {
  // Rule 1: nothing here may obstruct the session it exists to inform.
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  // A directory where a record is expected: `readFile` fails on it.
  await mkdir(path.join(root, 'docs', 'aims', 'weird.md'), { recursive: true })
  const out = compose(root)
  assert.match(out, /# aim frame/)
  await rm(root, { recursive: true, force: true })
})
