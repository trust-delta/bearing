// Tests for the `# PROCESS` mark parser and the open-todo count.
//
// The notation cases are REGRESSIONS TAKEN FROM THE CORPUS, not imagined ones.
// Both of the parser's first two cuts were wrong in ways only the corpus could
// reveal, and each is pinned below:
//
//   - `- [todo]（任意）…` — a full-width paren butted against the bracket. The
//     first cut demanded an ASCII space and silently dropped 3 real marks; the
//     count read 41 against the control group's 44.
//   - a mid-line ``` inside an inline code span. The first cut reused the
//     corpus-wide `stripCodeSpans`, whose global fenced-block regex opened a
//     phantom fence there and swallowed lines down to the next ``` — reporting
//     a real `# PROCESS` mark as living outside the section.
//
// Both failures were silent under-counting, which is exactly the failure mode
// `drift-git` names: a bad sensor is worse than no sensor, because the number
// still looks authoritative.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { splitProcess, parseProcessMarks, gatherBacklog } from '../lib/process.mjs'

const body = (...lines) => lines.join('\n')

// ── the observed form ────────────────────────────────────────────────────────

test('counts the form the corpus uses: `-` bullet, lowercase, zero indent', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '- [done] a', '- [todo] b', '- [todo] c'))
  assert.equal(r.done, 1)
  assert.equal(r.todo, 2)
  assert.deepEqual(r.anomalies, [])
})

test('regression: a mark needs no ASCII space after the bracket', () => {
  // Three of these exist in the corpus. Demanding the space cost 3 of 44.
  const r = parseProcessMarks(body('# PROCESS', '', '- [todo]（任意）boot baseline にも件数を surface'))
  assert.equal(r.todo, 1)
  assert.deepEqual(r.anomalies, [])
})

test('regression: a mid-line ``` in an inline span does not open a fence', () => {
  // Real corpus nodes write exactly this shape. A global fenced-block regex
  // swallows the mark on the NEXT line; a line-oriented scanner does not.
  const r = parseProcessMarks(
    body(
      '# PROCESS',
      '',
      '- [done] the fence is named ` ```bearing-drift ` in prose',
      '- [todo] this line must still be counted',
      '',
      '# HISTORY',
    ),
  )
  assert.equal(r.done, 1)
  assert.equal(r.todo, 1)
  assert.deepEqual(r.anomalies, [])
})

// ── section scoping ──────────────────────────────────────────────────────────

test('marks are scoped to `# PROCESS`; a later `# ` heading ends it', () => {
  const s = splitProcess(body('# IS', 'x', '# PROCESS', '- [todo] a', '# DAG', 'y'))
  assert.equal(s.process.length, 1)
  assert.match(s.process[0].line, /\[todo\] a/)
})

test('a real fenced block hides its contents from the parser', () => {
  // A mark inside a fence is quoted, not asserted — the corpus-wide law,
  // applied where it cannot cost a line.
  const r = parseProcessMarks(
    body('# PROCESS', '', '- [todo] real', '', '```markdown', '- [todo] an example', '```', ''),
  )
  assert.equal(r.todo, 1)
  assert.deepEqual(r.anomalies, [])
})

// ── the anomalies: neither silently absorbed nor silently ignored ────────────

test('a `*` bullet is reported, not counted', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '* [todo] written the other way'))
  assert.equal(r.todo, 0)
  assert.equal(r.anomalies.length, 1)
  assert.equal(r.anomalies[0].kind, 'bullet')
})

test('an indented mark is reported, not counted', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '  - [todo] nested under something'))
  assert.equal(r.todo, 0)
  assert.equal(r.anomalies[0].kind, 'indented')
})

test('an upper-case mark is reported, not counted', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '- [TODO] shouting'))
  assert.equal(r.todo, 0)
  assert.equal(r.anomalies[0].kind, 'case')
})

test('an unknown mark word is reported', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '- [wip] a third state nobody declared'))
  assert.equal(r.anomalies[0].kind, 'unknown-mark')
})

test('a mark outside `# PROCESS` is reported — it is progress nothing reads', () => {
  const r = parseProcessMarks(body('# IS', '- [todo] stranded', '# PROCESS', '- [todo] real'))
  assert.equal(r.todo, 1)
  assert.equal(r.anomalies.length, 1)
  assert.equal(r.anomalies[0].kind, 'outside-process')
})

test('a deeper heading inside PROCESS is reported — the corpus has none', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '## phase 1', '', '- [todo] a'))
  assert.equal(r.todo, 1)
  assert.equal(r.anomalies[0].kind, 'nested-heading')
})

// ── the count ────────────────────────────────────────────────────────────────

async function corpus(nodes) {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-process-'))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  for (const [slug, state, marks] of nodes) {
    await writeFile(
      path.join(root, 'docs', 'aims', slug + '.md'),
      `---\naim: x\nstate: ${state}\n---\n\n# PROCESS\n\n${marks.join('\n')}\n`,
    )
  }
  return root
}

test('open-todo counts NODES with at least one todo, not marks', async () => {
  const root = await corpus([
    ['a', 'open', ['- [todo] one', '- [todo] two', '- [todo] three']],
    ['b', 'open', ['- [done] finished']],
  ])
  const r = await gatherBacklog(root)
  assert.equal(r.openTodoNodes, 1)
  await rm(root, { recursive: true, force: true })
})

test('`state: dead` nodes are excluded — an abandoned purpose has no backlog', async () => {
  const root = await corpus([
    ['a', 'open', ['- [todo] live']],
    ['b', 'dead', ['- [todo] abandoned']],
    ['c', 'done', ['- [todo] given up on, but the node is not dead']],
  ])
  const r = await gatherBacklog(root)
  // `aim-resolution-outcome`: in a `done` node an unimplemented mark reads as
  // 諦め — but only `dead` retracts the purpose, and only that is excluded here.
  assert.equal(r.openTodoNodes, 2)
  await rm(root, { recursive: true, force: true })
})

test('a repo with no corpus yields zero, not an error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-process-'))
  const r = await gatherBacklog(root)
  assert.equal(r.openTodoNodes, 0)
  assert.deepEqual(r.anomalies, [])
  await rm(root, { recursive: true, force: true })
})

test('anomalies carry their slug so the operator can find them', async () => {
  const root = await corpus([['a', 'open', ['* [todo] wrong bullet']]])
  const r = await gatherBacklog(root)
  assert.equal(r.openTodoNodes, 0)
  assert.equal(r.anomalies[0].slug, 'a')
  await rm(root, { recursive: true, force: true })
})

// ── the four-value read: `unknown` must not fold into "nothing to do" ────────

test('a PROCESS heading with no readable mark is `unknown`, not zero', () => {
  const r = parseProcessMarks(body('# PROCESS', '', 'まだ手段を書いていない。', ''))
  assert.equal(r.unknown, true)
  assert.equal(r.todo, 0)
})

test('no PROCESS heading at all is `no-process`, a normal state — not `unknown`', () => {
  const r = parseProcessMarks(body('# IS', '', 'a pure IS node.'))
  assert.equal(r.unknown, false)
})

test('unknown nodes are named so the operator can see what was unreadable', async () => {
  const root = await corpus([
    ['readable', 'open', ['- [todo] a']],
    ['unreadable', 'open', ['なにも mark がない']],
  ])
  const r = await gatherBacklog(root)
  assert.equal(r.openTodoNodes, 1)
  assert.deepEqual(r.unknownNodes, ['unreadable'])
  await rm(root, { recursive: true, force: true })
})
