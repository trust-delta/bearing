// `# PROCESS` の mark parser と open-todo 数の test。
//
// ⚠ **記法の case は想像ではなく、corpus から採った regression である。** この parser の
// 最初の 2 版はどちらも、corpus にしか暴けない形で誤っていた。以下はそれぞれを固定している:
//
//   - `- [todo]（任意）…` —— 括弧に直付けされた全角括弧。最初の版は ASCII 空白を要求し、
//     実在する mark を 3 件黙って落とした。数は対照群の 44 に対して 41 と読めた。
//   - inline code span の中の、行途中の ```。最初の版は corpus 全体向けの
//     `stripCodeSpans` を再利用しており、その global な fenced block 正規表現がそこで幻の
//     fence を開き、次の ``` までの行を飲み込んだ —— 実在する `# PROCESS` の mark を
//     「節の外に在る」と報告した。
//
// ⚠ **どちらの失敗も黙った数え落としであり、それはまさに「悪いセンサーはセンサーが無いこと
// に劣る」という失敗の様態である** —— 数だけは依然として権威に見えるからだ。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  splitProcess,
  parseProcessMarks,
  gatherBacklog,
  renderAwaitingFence,
} from '../lib/process.mjs'

const body = (...lines) => lines.join('\n')

// ── 観測された形 ─────────────────────────────────────────────────────────────

test('counts the form the corpus uses: `-` bullet, lowercase, zero indent', () => {
  const r = parseProcessMarks(body('# PROCESS', '', '- [done] a', '- [todo] b', '- [todo] c'))
  assert.equal(r.done, 1)
  assert.equal(r.todo, 2)
  assert.deepEqual(r.anomalies, [])
})

test('regression: a mark needs no ASCII space after the bracket', () => {
  // corpus にこれが 3 件在る。空白を要求したことで 44 件中 3 件を失った。
  const r = parseProcessMarks(body('# PROCESS', '', '- [todo]（任意）boot baseline にも件数を surface'))
  assert.equal(r.todo, 1)
  assert.deepEqual(r.anomalies, [])
})

test('regression: a mid-line ``` in an inline span does not open a fence', () => {
  // 実在の corpus node がまさにこの形を書いている。global な fenced block 正規表現は
  // **次の行**の mark を飲み込むが、行指向の scanner は飲み込まない。
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

// ── 節の scope ───────────────────────────────────────────────────────────────

test('marks are scoped to `# PROCESS`; a later `# ` heading ends it', () => {
  const s = splitProcess(body('# IS', 'x', '# PROCESS', '- [todo] a', '# DAG', 'y'))
  assert.equal(s.process.length, 1)
  assert.match(s.process[0].line, /\[todo\] a/)
})

test('a real fenced block hides its contents from the parser', () => {
  // fence の中の mark は引用であって主張ではない —— corpus 全体に効く法を、行を失わずに
  // 当てられる場所で当てている。
  const r = parseProcessMarks(
    body('# PROCESS', '', '- [todo] real', '', '```markdown', '- [todo] an example', '```', ''),
  )
  assert.equal(r.todo, 1)
  assert.deepEqual(r.anomalies, [])
})

// ── anomaly: 黙って吸収もせず、黙って無視もしない ────────────────────────────

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

// ── 数 ───────────────────────────────────────────────────────────────────────

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
  // `done` の node では未実装の mark は「諦め」と読まれる —— ⚠ **だが目的を撤回するのは
  // `dead` だけであり、ここで除外されるのもそれだけである。**
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

// ── 4 値の読み: `unknown` を「やることが無い」へ畳んではならない ─────────────

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

// ── 番が人間へ渡る瞬間 ───────────────────────────────────────────────────────
//
// ⚠ `[todo]` は producer が自力で完了を確認できる形でのみ書かれる ∴ mark が尽きた node は
// 「producer が尽くした ∴ 人間の観測待ち」を意味する。**この瞬間が可視化されなければ、
// 誰も観測に来ない** —— open-todo が 0 になるだけでは、番が渡ったことは誰にも見えない。

test('a node whose marks are all done is awaiting the human, not finished', async () => {
  const root = await corpus([
    ['exhausted', 'open', ['- [done] a', '- [done] b']],
    ['still-working', 'open', ['- [done] a', '- [todo] b']],
  ])
  const r = await gatherBacklog(root)
  assert.equal(r.openTodoNodes, 1)
  assert.deepEqual(r.awaitingNodes, [{ slug: 'exhausted', doneMarks: 2, state: 'open' }])
  await rm(root, { recursive: true, force: true })
})

test('a node the operator already resolved is not awaiting anything', async () => {
  const root = await corpus([['settled', 'done', ['- [done] a']]])
  const r = await gatherBacklog(root)
  // ⚠ 宣言は済んでいる。ここへ挙げ続けるのは、operator の act を無かったことにする。
  assert.deepEqual(r.awaitingNodes, [])
  await rm(root, { recursive: true, force: true })
})

test('a dead node is awaiting nothing — the purpose was retracted', async () => {
  const root = await corpus([['abandoned', 'dead', ['- [done] a']]])
  const r = await gatherBacklog(root)
  assert.deepEqual(r.awaitingNodes, [])
  await rm(root, { recursive: true, force: true })
})

test('a pure IS node is not awaiting — it promised nothing to exhaust', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-process-'))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeFile(
    path.join(root, 'docs', 'aims', 'pure.md'),
    '---\naim: x\nstate: open\n---\n\n# IS\n\nまだ手段を書いていない。\n',
  )
  const r = await gatherBacklog(root)
  // ⚠ `no-process` と `all-done` を同じ「todo 0 件」として畳んではならない。
  assert.equal(r.openTodoNodes, 0)
  assert.deepEqual(r.awaitingNodes, [])
  await rm(root, { recursive: true, force: true })
})

test('an unreadable PROCESS is not awaiting — `unknown` must not become `all-done`', async () => {
  const root = await corpus([['unreadable', 'open', ['なにも mark がない']]])
  const r = await gatherBacklog(root)
  assert.deepEqual(r.unknownNodes, ['unreadable'])
  // ⚠ 読めなかったものを「尽くした」に倒せば、捏造された `[done]` と同じ嘘になる。
  assert.deepEqual(r.awaitingNodes, [])
  await rm(root, { recursive: true, force: true })
})

test('the fence is emitted even with no records, and says which silence it is', () => {
  const out = renderAwaitingFence([])
  assert.match(out, /^```bearing-awaiting-observation v1\n/)
  assert.match(out, /# fields: slug \| done_marks \| state/)
  assert.match(out, /# none — producer が尽くして観測待ちになっている aim は無い/)
})

test('records render one per line, in the fixed field order', () => {
  const out = renderAwaitingFence([
    { slug: 'a', doneMarks: 3, state: 'open' },
    { slug: 'b', doneMarks: 1, state: 'open' },
  ])
  assert.match(out, /\na \| 3 \| open\n/)
  assert.match(out, /\nb \| 1 \| open\n/)
})
