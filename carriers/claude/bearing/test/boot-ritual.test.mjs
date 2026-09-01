// boot 儀式 trigger（`UserPromptSubmit`）の test。
//
// ⚠ **この hook が直す対象は、想像ではなく実測されたものである**: `SessionStart` は baton を
// context に置くが turn を開始しない ∴ `_guide/handoff.md` § 読む の手順 2〜6 ——
// すべてエージェントの act —— は、人間がたまたま入力するまで走らず、入力が無関係なもので
// あれば一度も走らなかった。以下は**半強制の 2 つの半分**を assert する:
// 義務をちょうど一度だけ述べること、そして 人間が入力したものに決して触れないこと。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOOK = path.join(HERE, '..', 'bin', 'boot-ritual.mjs')

/** この suite の他のどの実行とも衝突しない session id。 */
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
    assert.match(r.stdout, /未処理の baton があり/)
    assert.ok(r.stdout.includes(path.join(root, '.handoff', 'active.md')))
    // ⚠ 手順を再掲せず、正本と帳簿 CLI を指す —— 木の中に儀式についての第 3 の記述が
    // 置かれることは、「正本は 1 つ」の規則が禁じている複製である。
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
    assert.match(first.stdout, /未処理の baton があり/)
    assert.equal(second.stdout, '')
    assert.equal(second.status, 0)
    // ⚠ 同じ workspace の別セッションは**別の対話**であり、それ自身の促しを負われている。
    const other = run({ session_id: freshSession(), cwd: root })
    assert.match(other.stdout, /未処理の baton があり/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('it never exits 2 — the human’s prompt is never erased', async () => {
  const root = await unitWithBaton()
  try {
    // UserPromptSubmit での exit 2 は「処理を遮断し、元の prompt を消去する」。⚠ 人間に
    // 仕えるための儀式を強制するために 人間が入力したものを破壊することは、
    // `precompact.mjs` も拒んでいる反転である。
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
    // 正本: 再読は正当であり、`read-at` はそれを**検出する**ために在るのであって
    // **防ぐ**ために在るのではない。∴ 事実は述べられ、手順はなお立つ。
    assert.match(r.stdout, /2026-08-31T13:25:09Z/)
    assert.match(r.stdout, /過去に読まれている/)
    assert.match(r.stdout, /未処理の baton があり/)
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
