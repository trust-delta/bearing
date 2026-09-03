// 陳腐化 trigger（`PostToolBatch`）と、それが門として使う digest の test。
//
// ⚠ **最も重要な不変条件は「変化を報告すること」ではない** —— **セッションが行動できる何も
// 変わっていないときに黙っていること**である。aim の body を編集することはセッションが
// corpus に対して行う最も普通のことであり、そのたびに同じ数を再注入する hook は面を
// 読めなくする。それは機械層を*可視化*の位置に置く規律が排している失敗である。
//
// ここで assert される事実はすべて**本物の git repository についての事実**である。drift の
// test と同じ理由で: mock は「mock が code に一致すること」しか証明しない。

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

/** 注入された context。hook が黙ったままなら null。 */
function context(r) {
  if (r.stdout.trim() === '') return null
  const parsed = JSON.parse(r.stdout)
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolBatch')
  return parsed.hookSpecificOutput.additionalContext
}

const node = (aim, process_) =>
  `---\naim: ${aim}\nparent: root\nstate: open\n---\n\n# IS\n\nsomething\n\n# PROCESS\n\n${process_}\n`

/** corpus を持つ repo を 1 つ抱えた unit directory。 */
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

// ── digest: 「byte が動いた」と「事実が変わった」の間の線 ────────────────────

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

test('the facts digest moves when escalation changes hands but the count does not', () => {
  // ⚠ **これが escalation を数ではなく slug で digest に入れる理由である。** 1 つが片付き、
  // 別の 1 つが生まれたセッションでは総数が動かない ∴ 数だけを入れれば、**判断待ちの中身が
  // 入れ替わったちょうどその瞬間に**第 2 の門が「事実は変わっていない」と判定して黙る。
  const one = { label: 'r', working: [], backlog: { escalationNodes: ['a'], anomalies: [] } }
  const other = { label: 'r', working: [], backlog: { escalationNodes: ['b'], anomalies: [] } }
  assert.notEqual(factsDigest([one]), factsDigest([other]))
  // ⚠ 順序は事実ではない —— 同じ集合を別の順で採っただけで「動いた」と述べてはならない。
  const ab = { label: 'r', working: [], backlog: { escalationNodes: ['a', 'b'], anomalies: [] } }
  const ba = { label: 'r', working: [], backlog: { escalationNodes: ['b', 'a'], anomalies: [] } }
  assert.equal(factsDigest([ab]), factsDigest([ba]))
})

test('the facts digest does not depend on repo or record order', () => {
  const r1 = { label: 'a', working: [{ slug: 'x', uncommitted: true }], backlog: {} }
  const r2 = { label: 'b', working: [], backlog: {} }
  assert.equal(factsDigest([r1, r2]), factsDigest([r2, r1]))
})

// ── renderer は決して判定しない ──────────────────────────────────────────────

test('the count is surfaced with the instruction not to triage it', () => {
  const body = renderCorpusDelta({
    repos: [{ label: 'r', working: [], backlog: { openTodoNodes: 7, unknownNodes: [], anomalies: [] } }],
    moved: [],
    hadBaseline: true,
  })
  assert.match(body, /open-todo: 7/)
  assert.match(body, /triage も ranking も/)
})

test('escalation is surfaced mid-session too — that is where a todo becomes one', () => {
  // ⚠ **自力で閉じられないと分かった todo を `# ESCALATION` へ出すのは、走っている
  // セッションである。** そのとき `open-todo` は 1 減る ∴ boot 時にしか出さなければ、
  // **減った分がどこへ行ったのかを誰も知らないまま**進むことになる。
  const body = renderCorpusDelta({
    repos: [
      {
        label: 'r',
        working: [],
        backlog: {
          openTodoNodes: 1,
          escalationNodes: ['blocked-a', 'blocked-b'],
          escalationEmptyNodes: ['hollow'],
          unknownNodes: [],
          anomalies: [],
        },
      },
    ],
    moved: [],
    hadBaseline: true,
  })
  assert.match(body, /escalation: 2/)
  // ⚠ 空の見出しは数に入らず、しかし黙って落ちもしない。
  assert.match(body, /中身が空の node が 1 件.*r\/hollow/s)
})

test('a backlog with no escalation field renders 0, not `undefined`', () => {
  // ⚠ **古い形の backlog を渡されても、面は数を偽らない。** `undefined` がそのまま文字列に
  // なれば、読み手はそこに事実が無いことすら知りようがない。
  const body = renderCorpusDelta({
    repos: [{ label: 'r', working: [], backlog: { openTodoNodes: 1, unknownNodes: [], anomalies: [] } }],
    moved: [],
    hadBaseline: true,
  })
  assert.match(body, /escalation: 0/)
  assert.ok(!body.includes('undefined'))
})

test('a unit with no corpus renders nothing at all', () => {
  assert.equal(renderCorpusDelta({ repos: [], moved: [], hadBaseline: true }), '')
})

// ── hook を本物の repo に対して ──────────────────────────────────────────────

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
    // ⚠ 不在が clean として描画されてはならない —— composer が失敗したときに従うのと
    // 同じ規則である。
    assert.match(body, /boot 時の baseline が記録されていない/)
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
    // ⚠ **最初の**編集は事実の変化である: node は clean から未 commit へ移り、
    // working-delta fence は record を 1 つ得る。**黙らねばならないのはそれ以降の編集
    // すべて**である —— node はなお未 commit、anchor はなお動かず、数もなお同じ。それが
    // aim の body を保守する普通のセッションの形であり、放っておけば batch ごとに同一の
    // 報告を再注入することになる場合である。
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
    assert.doesNotMatch(body, /boot 時の baseline が記録されていない/)
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
    assert.match(body, /HEAD が動いた/)
    // ⚠ **本当に再計算する** ——「これらは陳腐化した、更新してこい」という覚書ではない。
    // それは**体制がセッションに負っている事実を、お使いに変えてしまう。**
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
  // PostToolBatch での exit 2 は agentic loop を丸ごと止める。
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
    // b は自分自身の（不在の）baseline を持ち、自分自身の報告を負われている。
    assert.match(context(run({ session_id: b, cwd: u.root })), /boot 時の baseline が記録されていない/)
    assert.notEqual(deltaStatePath(a), deltaStatePath(b))
    const state = JSON.parse(await readFile(deltaStatePath(a), 'utf8'))
    assert.ok(state.sig && state.facts)
  } finally {
    await rm(u.root, { recursive: true, force: true })
  }
})
