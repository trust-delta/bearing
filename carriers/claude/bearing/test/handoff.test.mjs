// handoff 機構の test —— baton 儀式のうち**帳簿である半分**。
//
// ⚠ **ここには authoring の test が 1 つも無い。実装が何も著さないからである。**
// test されるのは**順序と拒否**である: 正本の規則はすべて「これはあれより前に起きねば
// ならない」か「これは決して書かれてはならない」の形をしており、そのどれもが、手で実行
// される儀式が遅かれ早かれ間違える規則である。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { mkdtempSync, existsSync } from 'node:fs'
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
  archiveDir,
  batonDir,
  bearingHome,
  unitSlug,
} from '../lib/handoff.mjs'

// ⚠ **baton の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// baton** —— を読み書きする。`activePath` 等は呼ばれた時点の env を見る ∴ import より後、
// 最初の fixture より前にここで倒しておけば足りる。
process.env.BEARING_HOME = mkdtempSync(path.join(tmpdir(), 'bearing-home-'))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRECOMPACT = path.join(HERE, '..', 'bin', 'precompact.mjs')

async function unit(withBaton) {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-handoff-'))
  if (withBaton !== undefined) {
    await mkdir(batonDir(root), { recursive: true })
    await writeFile(activePath(root), withBaton, 'utf8')
  }
  return root
}

// ── archive の名 ─────────────────────────────────────────────────────────────

test('the archive stamp is a legal file name on Windows too', () => {
  const s = archiveStamp(new Date('2026-08-31T11:22:33.456Z'))
  assert.equal(s, '2026-08-31T112233Z')
  assert.ok(!s.includes(':'))
})

// ── 退避は「書く」ときに起こり、「読む」ときには決して起こらない ─────────────

test('writing rotates the previous baton into the archive', async () => {
  const root = await unit('---\ncomposed-at: 2026-08-30T00:00:00Z\n---\n\nOLD\n')
  const { archived } = await writeBaton(root, '---\ntask: t\n---\n\nNEW\n')
  assert.ok(archived)
  assert.match(await readFile(archived, 'utf8'), /OLD/)
  assert.match(await readFile(activePath(root), 'utf8'), /NEW/)
  await rm(root, { recursive: true, force: true })
})

test('reading never archives — reading the same baton twice must stay possible', async () => {
  // 正本: 二度目の読みを**検出する**のが `read-at` の仕事であり、**防ぐ**ことは目的では
  // ない。⚠ archive する読み手は、意図的な再読を不可能にしてしまう。
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
  const names = await readdir(archiveDir(root))
  assert.equal(names.length, 2)
  await rm(root, { recursive: true, force: true })
})

// ── 書く側が刻んでよいもの・いけないもの ─────────────────────────────────────

test('composed-at is stamped from the clock, replacing whatever was authored', () => {
  // これは著者が時計よりよく知りえない唯一の field であり、誤った値は読む側の
  // 「この baton は数日前のものです」という行を嘘にする。
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
  // baton の価値は body に在る。区切りが 1 つ足りないことは、それを失う理由にならない。
  const s = stampComposedAt('## Task\nsomething\n')
  assert.match(s, /^---\ncomposed-at: /)
  assert.match(s, /## Task/)
})

// ── 読む側: 手順 3 より前に手順 2 ────────────────────────────────────────────

test('stamping returns the PREVIOUS read-at before overwriting it', async () => {
  // ⚠ 先に刻めば、報告すべきだった値は消えている。
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

// ── 閾値 trigger ─────────────────────────────────────────────────────────────

/** 呼び出しごとに新しい id: trigger の marker は永続なので、実行間で漏れてはならない。 */
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
  // ⚠ 人間に仕えるための儀式を強制するために人間の明示的な act を上書きする
  // ことは、体制そのものを反転させる。
  const root = await unit('x\n')
  assert.equal(precompact({ trigger: 'manual', session_id: newSessionId(), cwd: root }).code, 0)
  await rm(root, { recursive: true, force: true })
})

test('auto-compaction is blocked once, with the authoring instruction', async () => {
  // ⚠ **session id は実行ごとに一意でなければならない。** trigger の marker は意図して
  // 永続である ——「セッションにつき一度」は marker が hook より長生きしてはじめて真になる
  // —— ∴ ここで固定 id を使うと初回だけ通り、以後は毎回落ちる。**この test が最初に落ちた
  // のはまさにそれである。**
  const root = await unit('x\n')
  const first = precompact({ trigger: 'auto', session_id: newSessionId(), cwd: root })
  assert.equal(first.code, 2)
  assert.match(first.stderr, /圧縮される代わりに baton を著すこと/)
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
  // corpus も `.handoff/` も無い: ⚠ ここで儀式を課すことは、**人間が決めていない
  // ことを plugin が決める**ことになる。
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

// ── 置き場 —— repo の外、unit ごと ───────────────────────────────────────────

test('unit slug は読める名と path の hash を両方持つ —— 名だけでは一意にならない', () => {
  const a = unitSlug('/home/x/works/api')
  const b = unitSlug('/home/x/other/api')
  assert.match(a, /^api-[0-9a-f]{8}$/)
  assert.match(b, /^api-[0-9a-f]{8}$/)
  // ⚠ **同名 repo が黙って同じ baton を共有する形は、baton が無いことより悪い** ——
  // 別の対話の baton を読むことになる。
  assert.notEqual(a, b)
})

test('unit slug は同じ path に対して安定である —— 揺れれば baton は毎回行方不明になる', () => {
  assert.equal(unitSlug('/home/x/works/api'), unitSlug('/home/x/works/api/'))
})

test('baton は repo の外に置かれる —— unit root の下に何も作らない', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-handoff-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeBaton(root, '---\ntask: x\n---\n\nbody\n')
  // ⚠ **これがこの移設の全てである。** repo の中に生まれなければ、`git add` で痕跡に
  // なりようがない —— ignore に頼らず、構造として保たれる。
  assert.equal(existsSync(path.join(root, '.handoff')), false)
  assert.ok(activePath(root).startsWith(process.env.BEARING_HOME))
  assert.equal(existsSync(activePath(root)), true)
})

test('BEARING_HOME が家を移す —— 移せなければ test が人間の baton を触る', () => {
  assert.equal(
    bearingHome({ BEARING_HOME: '/elsewhere' }, '/home/x'),
    '/elsewhere',
  )
  assert.equal(bearingHome({}, '/home/x'), path.join('/home/x', '.bearing'))
})

// ── 移行 —— 述べるが、動かさない ─────────────────────────────────────────────

const runCli = (root, verb) =>
  execFileSync(process.execPath, [path.join(HERE, '..', 'bin', 'handoff.mjs'), verb], {
    cwd: root, encoding: 'utf8', env: { ...process.env },
  })

async function legacyUnit() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-legacy-'))
  await mkdir(path.join(root, '.handoff', 'archive'), { recursive: true })
  await writeFile(path.join(root, '.handoff', 'active.md'), '---\ntask: old\n---\n\nold\n')
  await writeFile(path.join(root, '.handoff', 'archive', '2026-01-01T000000Z.md'), 'archived\n')
  return root
}

test('旧い置き場に残った baton は、読むときに述べられる —— 黙れば「fresh start」と嘘をつく', async (t) => {
  const root = await legacyUnit()
  t.after(() => rm(root, { recursive: true, force: true }))
  const out = runCli(root, 'read')
  assert.match(out, /旧い置き場に baton が残っている/)
  assert.match(out, /handoff\.mjs migrate/)
})

test('migrate は移し、旧い dir 自体は残す —— 人間の repo の中を我々の都合で消さない', async (t) => {
  const root = await legacyUnit()
  t.after(() => rm(root, { recursive: true, force: true }))
  const out = runCli(root, 'migrate')
  assert.match(out, /移した: 2 本/)
  assert.equal(existsSync(activePath(root)), true)
  assert.equal(existsSync(path.join(archiveDir(root), '2026-01-01T000000Z.md')), true)
  assert.equal(existsSync(path.join(root, '.handoff')), true)
  // 移し終えれば、次の read はもう述べない。
  assert.doesNotMatch(runCli(root, 'read'), /旧い置き場に baton が残っている/)
})

test('migrate は移動先に在るものを黙って潰さない', async (t) => {
  const root = await legacyUnit()
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(activePath(root), '---\ntask: new\n---\n\nnew\n')
  const out = runCli(root, 'migrate')
  assert.match(out, /移さなかった: 1 本/)
  assert.match(await readFile(activePath(root), 'utf8'), /task: new/)
})
