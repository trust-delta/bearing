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
  moveFile,
  unitSlug,
  recordUnitRoot,
  checkUnitRoot,
  unitRootRecordPath,
  recordSession,
  readSession,
  sessionRecordPath,
  transcriptDir,
  transcriptPath,
  stampTranscript,
} from '../../../carriers/claude/bearing/lib/handoff.mjs'
import { readBaton } from '../../../carriers/claude/bearing/lib/baton.mjs'

// ⚠ **baton の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// baton** —— を読み書きする。`activePath` 等は呼ばれた時点の env を見る ∴ import より後、
// 最初の fixture より前にここで倒しておけば足りる。
process.env.BEARING_HOME = mkdtempSync(path.join(tmpdir(), 'bearing-home-'))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRECOMPACT = path.join(HERE, '..', '..', '..', 'carriers', 'claude', 'bearing', 'bin', 'precompact.mjs')

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

test('unit slug は unit root の path を平坦化したものである —— Claude Code と同じ形', () => {
  // ⚠ **理由は一意性ではなく馴染みである**（人間が 2026-09-03 に決定）—— 人間が自力で
  // archive を見に行くとき、`~/.claude/projects/` で見慣れた形なら path から unit を読める。
  //
  // ⚠ **resolver を明示して、両 platform の形をどちらの platform からも検査する。**
  // 2026-09-04 まで、ここは POSIX 形を暗黙に前提にしており **win32 では常に赤かった**
  // ——「CI が緑」は「その platform で通った」でしかない（`purpose-drift`）。
  assert.equal(unitSlug('/home/x/works/api', path.posix.resolve), '-home-x-works-api')
  // ⚠ **win32 では drive letter が付く。** 実測: この repo の unit は
  // `D--trust-project-bearing` であり、Claude Code 自身の `~/.claude/projects/` と一致する。
  assert.equal(unitSlug('C:\\works\\api', path.win32.resolve), 'C--works-api')
  // ⚠ 別の場所の同名 repo は、別の unit になる。
  assert.notEqual(
    unitSlug('/home/x/works/api', path.posix.resolve),
    unitSlug('/home/x/other/api', path.posix.resolve),
  )
})

test('英数字以外はすべて潰す —— Claude Code の `~/.claude/projects/` と同じ規則である', () => {
  assert.equal(unitSlug('/home/x/my repo', path.posix.resolve), '-home-x-my-repo')
  // ⚠ 実測: `/home/trustdelta/.claude` は `-home-trustdelta--claude` になっている。
  assert.equal(unitSlug('/home/x/.claude', path.posix.resolve), '-home-x--claude')
  // ⚠ win32 の `\` と `:` も同じ規則に含まれる。
  assert.equal(unitSlug('C:\\w\\my repo', path.win32.resolve), 'C--w-my-repo')
})

test('⚠ 平坦化は単射でない —— 衝突は「起きない」ではなく「述べる」で塞ぐ', () => {
  // ⚠ **この test は欠陥を固定している。** 人間は一意性より読めることを選んだ ∴ ここで
  // 等しくなること自体は仕様である。**衝突したときに黙らないこと**が別に要る。
  assert.equal(unitSlug('/w/a.b', path.posix.resolve), unitSlug('/w/a-b', path.posix.resolve))
})

test('unit slug は同じ path に対して安定である —— 揺れれば baton は毎回行方不明になる', () => {
  assert.equal(
    unitSlug('/home/x/works/api', path.posix.resolve),
    unitSlug('/home/x/works/api/', path.posix.resolve),
  )
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
  execFileSync(process.execPath, [path.join(HERE, '..', '..', '..', 'carriers', 'claude', 'bearing', 'bin', 'bearing-handoff.mjs'), verb], {
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

// ── 移動 —— device を跨ぐ ───────────────────────────────────────────────────
//
// ⚠ **この対は実機の故障から来ている**（2026-09-04）: repo が `D:`、home が `C:` の
// Windows 機で `migrate` が `EXDEV` で落ちた。⚠ **同一 device の test 環境では EXDEV を
// 起こせない** ∴ 落ち方だけを注入して、**分岐が在ること**を固定する。

const exdev = () => {
  const e = new Error('EXDEV: cross-device link not permitted')
  e.code = 'EXDEV'
  return e
}

test('moveFile は device を跨げる —— rename が EXDEV なら copy して消す', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-move-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const from = path.join(dir, 'a.md')
  const to = path.join(dir, 'b.md')
  await writeFile(from, 'baton\n')

  await moveFile(from, to, { rename: async () => { throw exdev() } })

  assert.equal(await readFile(to, 'utf8'), 'baton\n')
  assert.equal(existsSync(from), false) // ⚠ **copy して残せば、2 つの baton が並ぶ。**
})

test('moveFile は EXDEV 以外を呑まない —— 落ちたことを落ちたと述べる', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-move-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const from = path.join(dir, 'a.md')
  await writeFile(from, 'baton\n')

  await assert.rejects(
    () => moveFile(from, path.join(dir, 'b.md'), {
      rename: async () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e },
    }),
    /EACCES/,
  )
  assert.equal(existsSync(from), true)
})

test('moveFile は跨いだ先でも、既に在るものを潰さない', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-move-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const from = path.join(dir, 'a.md')
  const to = path.join(dir, 'b.md')
  await writeFile(from, 'old\n')
  await writeFile(to, 'new\n')

  await assert.rejects(() => moveFile(from, to, { rename: async () => { throw exdev() } }))
  assert.equal(await readFile(to, 'utf8'), 'new\n')
  assert.equal(existsSync(from), true)
})

// ── dir の持ち主 —— 平坦化が単射でないことへの応答 ─────────────────────────────
//
// 🔴 **`/w/a.b` と `/w/a-b` は同じ dir 名を得る。** 名前の側では塞がない（読めることを取った
// 帰結である）∴ 検出だけが残された手であり、これらはその検出を固定する。

test('the owner record is written once and never overwritten', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'unit-a-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  assert.equal(await recordUnitRoot(root), 'written')
  // ⚠ **2 度目は保持する** —— 上書きは、衝突の唯一の証拠を我々の手で消す act である。
  assert.equal(await recordUnitRoot(root), 'kept')
  assert.equal((await readFile(unitRootRecordPath(root), 'utf8')).trim(), path.resolve(root))
})

test('a collision is named, not silently handed over', async (t) => {
  // 陽性対照つき: この 2 つが同じ dir 名になることを、まず確かめる。
  const base = await mkdtemp(path.join(tmpdir(), 'collide-'))
  t.after(() => rm(base, { recursive: true, force: true }))
  const first = path.join(base, 'a.b')
  const second = path.join(base, 'a-b')
  await mkdir(first, { recursive: true })
  await mkdir(second, { recursive: true })
  assert.equal(unitSlug(first), unitSlug(second), '前提: この 2 つは同じ dir 名を得る')

  await writeBaton(first, '---\ncomposed-at: x\n---\n\n本文\n')
  assert.equal((await checkUnitRoot(first)).state, 'match')

  const trespass = await checkUnitRoot(second)
  assert.equal(trespass.state, 'mismatch')
  assert.equal(trespass.recorded, path.resolve(first))
  assert.equal(trespass.actual, path.resolve(second))

  // ⚠ **baton は隠さない。** 在るものを無いと報告する形は、この機構が一貫して拒んできた。
  const baton = await readBaton(second)
  assert.ok(baton, 'baton は返る —— 「無い」に畳んではならない')
  assert.equal(baton.unitRoot.state, 'mismatch')
})

test('a dir predating the record is unknown, never a collision', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'unit-old-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  // 記録を書かずに baton dir だけ作る —— 2026-09-06 より前に生まれた dir の形。
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(activePath(root), '---\ncomposed-at: x\n---\n\n本文\n', 'utf8')

  const check = await checkUnitRoot(root)
  assert.equal(check.state, 'absent')
  assert.equal(check.recorded, null)
  assert.equal((await readBaton(root)).unitRoot.state, 'absent')
})

test('an unreadable owner record is not collapsed into a match', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'unit-blank-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await recordUnitRoot(root)
  await writeFile(unitRootRecordPath(root), '   \n', 'utf8')
  assert.equal((await checkUnitRoot(root)).state, 'unreadable')
})

// ══ transcript の pointer ═══════════════════════════════════════════════════
//
// 🔴 **なぜ機械が刻むのか。** native な圧縮は transcript を*貼らず*、**絶対 path 1 本と
// 「何を取りに行く欄か」の 1 行**を置いていた（実測 2026-09-11、対象: 本 repo の圧縮要約 ——
// transcript 6,431,899 字に対し要約 18,033 字 ＝ 0.28%）。⚠ **baton にはその欄が無く、代わりに
// `~/.claude/projects/<平坦化した cwd>/<session-id>.jsonl` という *形* が書かれていた**
// —— **`<session-id>` が未解決 ∴ 読む側は開けない。**
//
// 🔴 **`session_id` が transcript の file 名そのものであることは実測した**（2026-09-12、
// この機体に残る marker 46 件すべてに対応する `<id>.jsonl` が在った）。⚠ **dir 名の規則は
// 向こうのものを我々が真似ている** ∴ **導いた path は必ず実在を確かめる。**

test('session の記録は読み戻せる', async () => {
  const root = await unit()
  await recordSession(root, 'abc-123')
  assert.equal(await readSession(root), 'abc-123')
})

test('session の記録は上書きする —— unit-root と違い、答えるのは「いま」だからである', async () => {
  // ⚠ **`unit-root` は決して上書きしない**（衝突の唯一の証拠を守るため）。🔴 **こちらは逆で
  // なければならない** —— 保存すれば、baton に刻まれる transcript が前のセッションのものになる。
  const root = await unit()
  await recordSession(root, 'first')
  await recordSession(root, 'second')
  assert.equal(await readSession(root), 'second')
})

test('session の記録は、中身が同じなら書き直さない', async () => {
  // ⚠ **この record を書く hook は prompt ごとに走る** —— 毎回 write すれば、何も変わって
  // いない file の mtime が動き続ける。
  const root = await unit()
  await recordSession(root, 'same')
  const before = (await import('node:fs/promises')).stat
  const t1 = (await before(sessionRecordPath(root))).mtimeMs
  await new Promise((r) => setTimeout(r, 15))
  await recordSession(root, 'same')
  assert.equal((await before(sessionRecordPath(root))).mtimeMs, t1)
})

test('session の記録は空と unknown を拒む', async () => {
  const root = await unit()
  assert.equal(await recordSession(root, ''), null)
  assert.equal(await recordSession(root, 'unknown'), null)
  assert.equal(await readSession(root), null)
})

test('transcript の path は実在を確かめてから返す —— 解決しない path を返さない', async () => {
  // 🔴 **ここが向こうの規則の変化に対する唯一の防壁である。** dir 名の規則は Claude Code の
  // ものを真似ており、**向こうが変えれば黙って外れる** ∴ **在ることを毎回確かめ直す。**
  const home = await mkdtemp(path.join(tmpdir(), 'fake-home-'))
  const cwd = '/w/x'
  await mkdir(transcriptDir(cwd, home), { recursive: true })
  await writeFile(path.join(transcriptDir(cwd, home), 'live-id.jsonl'), '{}\n', 'utf8')
  assert.equal(await transcriptPath(cwd, 'live-id', home), path.join(transcriptDir(cwd, home), 'live-id.jsonl'))
  assert.equal(await transcriptPath(cwd, 'missing-id', home), null, '無い file の path を返してはならない')
  assert.equal(await transcriptPath(cwd, 'unknown', home), null)
  assert.equal(await transcriptPath(cwd, '', home), null)
})

test('transcript は composed-at の直後に刻まれ、著者が書いた値は除去される', async () => {
  // ⚠ **`read-at` と同じ扱いである** —— 機械が知っている事実であって著述ではない。
  const out = stampTranscript('---\ncomposed-at: X\ntranscript: 著者が書いた嘘\ntask: T\n---\n\nbody', '/real.jsonl')
  assert.match(out, /^---\ncomposed-at: X\ntranscript: \/real\.jsonl\ntask: T\n---/)
  assert.doesNotMatch(out, /著者が書いた嘘/)
})

test('刻めないときは欄そのものを置かない —— 開けない path は欄が無いことより悪い', async () => {
  const out = stampTranscript('---\ncomposed-at: X\ntranscript: 古い\n---\n\nbody', null)
  assert.doesNotMatch(out, /transcript:/)
  assert.match(out, /composed-at: X/)
  // frontmatter が無い baton は、そもそも刻む場所が無い ∴ 触らない。
  assert.equal(stampTranscript('no frontmatter', '/x.jsonl'), 'no frontmatter')
})

test('writeBaton は記録された session から transcript を刻む', async () => {
  const root = await unit()
  const home = await mkdtemp(path.join(tmpdir(), 'fake-home-'))
  // ⚠ **`transcriptPath` は `os.homedir()` を既定に取る** ∴ writeBaton 経由では実機の home を
  // 見る —— **実機に在るはずがない id を使い、「刻めないときは欄を置かない」側を固定する。**
  await recordSession(root, 'nonexistent-session-id')
  const { transcript, sessionId } = await writeBaton(root, '---\ntask: T\n---\n\nbody')
  assert.equal(sessionId, 'nonexistent-session-id')
  assert.equal(transcript, null)
  const baton = await readBaton(root)
  assert.equal(baton.transcript, null, '解決しない path を刻んではならない')
  assert.ok(baton.composedAt, 'composed-at は刻まれ続ける')
  assert.ok(home)
})

test('verb を省いた呼び出しは read へ倒れず、何も刻まない', async () => {
  // 🔴 **2026-09-12 に踏んだ。** `node -e 'import("./bearing-handoff.mjs")'` で構文を確かめた
  // ところ `process.argv[2]` が `undefined` になり、**既定の `read` が走って封印中の baton に
  // 「誰も読んでいない既読」を刻んだ**（`read-at: 2026-09-12T00:15:34Z`）。⚠ **canon の
  // 「この経路は書かれていても除去する」に従って戻した。**
  // ⚠ **裸の呼び出しは canon のどこにも書かれていない** —— documented なのは
  // `read` / `write` / `migrate` だけである ∴ **既定は契約ではなく実装の偶然だった。**
  // 🔴 **尺は「不可逆性 × 沈黙」である** —— 引数を落としただけで、確認も無く、黙って起きた。
  const root = await unit('---\ncomposed-at: 2020-01-01T00:00:00Z\ntask: T\n---\n\nbody\n')
  const cli = path.join(HERE, '..', '..', '..', 'carriers', 'claude', 'bearing', 'bin', 'bearing-handoff.mjs')
  let code = 0
  let stderr = ''
  try {
    execFileSync(process.execPath, [cli], {
      cwd: root,
      env: { ...process.env, BEARING_HOME: process.env.BEARING_HOME },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    code = err.status
    stderr = String(err.stderr ?? '')
  }
  assert.equal(code, 2, 'verb が無い呼び出しは 2 で落ちる')
  assert.match(stderr, /verb が無い/)
  assert.match(stderr, /取り消せない/, 'なぜ倒さないのかを述べる —— 述べなければ次に誰かが既定へ戻す')
  const text = await readFile(activePath(root), 'utf8')
  assert.doesNotMatch(text, /read-at:/, 'baton に触れてはならない')
})
