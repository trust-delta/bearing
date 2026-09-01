// SessionStart composer の test —— 決して破ってはならない 2 つの規則。
//
// これは**あらゆる** project の**あらゆる**セッションの開始時に走る ∴ 不変条件は出力の質に
// ついてではない。**セッションを決して妨げないこと**と、**不在が健康証明として読まれるのを
// 決して許さないこと**である。両方とも本物の process 越しに本物の script に対して assert する。
// 「exit 0」と「stdout が context である」は module についてではなく process についての事実
// だからである。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMPOSER = path.join(HERE, '..', 'bin', 'aim-facts.mjs')

/** `cwd` で composer を走らせ、stdout を返す。終了コードで throw することは決して無い。 */
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
  // ⚠ frame を与えられていないエージェントには、`aim:` 行を書き換えることを止めるものが
  // 何も無い。それは**所有の分割の侵害**であって、速度の劣化ではない。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const outEmpty = compose(root)
  assert.match(outEmpty, /# aim frame/)
  assert.match(outEmpty, /frontmatter は人間のもの/)
  await rm(root, { recursive: true, force: true })
})

test('no git at all is reported as a NEW project, not as an error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const out = compose(root)
  assert.match(out, /git repository が無い/)
  await rm(root, { recursive: true, force: true })
})

test('git without a corpus is reported as an EXISTING project to attach to', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  const out = compose(root)
  assert.match(out, /git は在るが .docs\/aims\/. が無い/)
  // ⚠ そして設置は、セッションが頼まれずに行うことでは**明示的に**ない。
  assert.match(out, /頼まれずにあなたが行うもの/)
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
  // 数は事実であり、composer はそれに順位を付けるのではなく、事実としてそう述べねばならない。
  assert.match(out, /拾うものを選ぶのは 人間の act である/)
  await rm(dir, { recursive: true, force: true })
})

test('an absent baton says so, and warns against reading silence as emptiness', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(root, { recursive: true })
  await corpusRepo(root, ['alpha'])
  const out = compose(root)
  assert.match(out, /.\.handoff\/active\.md. に baton は無い/)
  assert.match(out, /空の baton は空の project ではない/)
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
  assert.match(out, /は\*\*刻んでいない\*\*/)
  // hook はそこへ書いていてはならない。
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
  assert.match(out, /PROCESS 記法の anomaly/)
  assert.match(out, /数えられていない/)
  await rm(dir, { recursive: true, force: true })
})

test('an unreadable corpus still exits 0 and still frames the session', async () => {
  // 規則 1: ここにあるどれも、情報を与えるべき当のセッションを妨げてはならない。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  // record が在るはずの場所に directory がある: `readFile` はそこで失敗する。
  await mkdir(path.join(root, 'docs', 'aims', 'weird.md'), { recursive: true })
  const out = compose(root)
  assert.match(out, /# aim frame/)
  await rm(root, { recursive: true, force: true })
})
