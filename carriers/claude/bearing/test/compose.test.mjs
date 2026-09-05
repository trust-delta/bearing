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
import { mkdtempSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadDesired, renderBlock } from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR } from '../lib/corpus.mjs'
import { activePath, batonDir } from '../lib/handoff.mjs'

// ⚠ **baton の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// baton** —— を読み書きする。
process.env.BEARING_HOME = mkdtempSync(path.join(tmpdir(), 'bearing-home-'))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMPOSER = path.join(HERE, '..', 'bin', 'aim-facts.mjs')
const PLUGIN_ROOT = path.join(HERE, '..')
const { version: VERSION, law: LAW } = await loadDesired(PLUGIN_ROOT)

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

/**
 * その project で aim を採用したことにする（`CLAUDE.md` に法の block を置く）。
 *
 * ⚠ **印は corpus とは別物である。** corpus はまだ 1 枚も無くても、人間は採用を宣言できる
 * —— この 2 つを分けることが、印を入れた理由そのものである。
 */
async function withAim(root, version = VERSION, dir = DEFAULT_AIMS_DIR) {
  await writeFile(path.join(root, 'CLAUDE.md'), `# doc\n\n${renderBlock(version, LAW, dir)}\n`)
}

/**
 * **aim を採り、かつ corpus を持つ repo。**
 *
 * ⚠ **採用を fixture に畳んでいるのは、それが既定の姿だからである** —— 2026-09-05 に述語から
 * corpus が落ち、**採用していない repo は corpus が在っても黙る。** 採っていない側を測る test
 * は、この helper を使わずに自分で組むこと（すぐ下の 2 件がそれである）。
 */
async function corpusRepo(root, slugs, dir = DEFAULT_AIMS_DIR) {
  execFileSync('git', ['init', '-q', root])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-facts test'])
  await mkdir(path.join(root, ...dir.split('/')), { recursive: true })
  await withAim(root, VERSION, dir)
  for (const slug of slugs) {
    await writeFile(
      path.join(root, ...dir.split('/'), slug + '.md'),
      `---\naim: x\nstate: open\n---\n\n# PROCESS\n\n- [todo] a\n`,
    )
  }
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'corpus'])
}

test('aim を採った project では、frame は必ず注入される', async () => {
  // ⚠ frame を与えられていないエージェントには、`aim:` 行を書き換えることを止めるものが
  // 何も無い。それは**所有の分割の侵害**であって、速度の劣化ではない。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await withAim(root)
  const out = compose(root)
  assert.match(out, /# aim frame/)
  assert.match(out, /frontmatter は人間のもの/)
  await rm(root, { recursive: true, force: true })
})

test('corpus が在っても、採用していなければ 1 byte も出さない', async () => {
  // ⚠ **2026-09-05 に反転した。** それまでは「corpus が在れば印が無くても注入される」で、
  // **既に node を書いている repo を印の無さで黙らせない**ことが理由だった。⚠ **だがその
  // 推測は、共同開発の repo で team が採っていない機構を黙って喋らせる** —— corpus が在る
  // ことは*使っている証拠*であって、この機構を通したいという宣言ではない（人間の決定）。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await writeFile(path.join(root, 'docs', 'aims', 'a.md'), '---\naim: x\nstate: open\n---\n')
  assert.equal(compose(root), '')
  await rm(root, { recursive: true, force: true })
})

test('aim を採っていない project では 1 byte も出さない', async () => {
  // ⚠ **黙るとは、出力が短いことではない。** 毎セッション「この project は aim を採って
  // いない」と述べる機構こそ、user スコープが外された理由そのものである。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  assert.equal(compose(root), '')
  await rm(root, { recursive: true, force: true })
})

test('採っていない project でも、未読の baton だけは述べる', async () => {
  // ⚠ **handoff は aim ではない。** baton は `docs/aims/` に何も依存せず、どの project でも
  // 使える ∴ ここで黙るのは aim の沈黙ではなく handoff の欠落である。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  await mkdir(batonDir(root), { recursive: true })
  await writeFile(
    activePath(root),
    '---\ncomposed-at: 2026-09-03T00:00:00Z\ntask: x\n---\n\n本文\n',
  )
  const out = compose(root)
  assert.match(out, /前回どこで止まったか/)
  assert.doesNotMatch(out, /# aim frame/, "aim については 1 行も述べない")
  assert.doesNotMatch(out, /open-todo/)
  await rm(root, { recursive: true, force: true })
})

test('置かれた法の block が古ければ、その版を名指す', async () => {
  // ⚠ **block は複製である ∴ 古い複製は正常に動いて見える。** 面に出さなければ誰も
  // 気づかず、セッションは古い法を今の法だと思って読む。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await withAim(root, '0.0.1')
  const out = compose(root)
  assert.match(out, /block が古い/)
  assert.match(out, /v0\.0\.1/)
  await rm(root, { recursive: true, force: true })
})

test('人間が block を編集していれば、古さとは別物として述べる', async () => {
  // ⚠ **畳めば、その編集は「古い」として上書きされる。**
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await withAim(root)
  const f = path.join(root, 'CLAUDE.md')
  const { readFile } = await import('node:fs/promises')
  await writeFile(f, (await readFile(f, 'utf8')).replace('迷ったら', 'X 迷ったら'))
  const out = compose(root)
  assert.match(out, /人間が手を入れている/)
  assert.doesNotMatch(out, /block が古い/)
  await rm(root, { recursive: true, force: true })
})

test('no git at all is reported as a NEW project, not as an error', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await withAim(root)
  const out = compose(root)
  assert.match(out, /git repository が無い/)
  await rm(root, { recursive: true, force: true })
})

test('採用済みだが corpus が空の project は、そう述べられる', async () => {
  // ⚠ **これは「採っていない」とは別の状態である。** 前者では黙り、ここでは最初の node へ
  // 導く —— 求められる act が違う ∴ 同じ顔で出してはならない。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  await withAim(root)
  const out = compose(root)
  assert.match(out, /aim を採用済みだが/)
  // ⚠ そして `aim:` を書くのは、セッションではなく人間である。
  assert.match(out, /`aim:` を書くのは人間である/)
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
  assert.match(out, /拾うものを選ぶのは人間の act である/)
  // ⚠ **3 つ目の数も同じ視野に在る。** 正本は「観測を可能にする作業は PROCESS、判断そのものは
  // ESCALATION、そして観測と宣言は人間」と分けている ∴ 2 つだけを出す frame は分割の
  // 3 分の 1 —— しかも**最も動かない側** —— を黙って落とす。
  assert.match(out, /\*\*escalation: 0\*\*/)
  await rm(dir, { recursive: true, force: true })
})

test('a node blocked on the human is counted, and it is not a todo', async () => {
  // ⚠ **`open-todo` が 0 のまま人間で止まっている node は実在しうる。** frame が
  // 「両方 0 ＝ 誰にも番が渡っていない」と読ませていた穴が、まさにこれである。
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(root, { recursive: true })
  await corpusRepo(root, ['alpha'])
  await writeFile(
    path.join(root, 'docs', 'aims', 'blocked.md'),
    '---\naim: x\nstate: open\n---\n\n# ESCALATION\n\n- license を決める\n\n# PROCESS\n\n- [done] a\n',
  )
  const out = compose(root)
  assert.match(out, /\*\*escalation: 1\*\*/)
  assert.match(out, /\*\*open-todo: 1\*\*/)
  await rm(dir, { recursive: true, force: true })
})

test('an absent baton says so, and warns against reading silence as emptiness', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(root, { recursive: true })
  await corpusRepo(root, ['alpha'])
  const out = compose(root)
  assert.match(out, /この unit に baton は無い/)
  assert.match(out, /空の baton は空の project ではない/)
  await rm(dir, { recursive: true, force: true })
})

test('a baton is surfaced in full, with the reading procedure left to the agent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const root = path.join(dir, 'proj')
  await mkdir(batonDir(root), { recursive: true })
  await corpusRepo(root, ['alpha'])
  const file = activePath(root)
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
  await withAim(root)
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
  await withAim(root)
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  // record が在るはずの場所に directory がある: `readFile` はそこで失敗する。
  await mkdir(path.join(root, 'docs', 'aims', 'weird.md'), { recursive: true })
  const out = compose(root)
  assert.match(out, /# aim frame/)
  await rm(root, { recursive: true, force: true })
})

test('宣言された在り処の corpus が、どの面からも見える —— 渡し忘れの門', async () => {
  // ⚠ **これは機能の試験ではなく、渡し忘れを捕まえる門である。** 在り処は既定引数を
  // 持って各層へ渡る ∴ **1 箇所でも渡し忘れれば、そこだけが既定を見て黙って空を返す** ——
  // そして空の fence は「clean」に見える。**既定でない在り処で 1 度通すことだけが、
  // 全部の層に届いたことの証拠になる。**
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  const dir = 'proj/aims'
  await corpusRepo(root, ['alpha', 'beta'], dir)
  await withAim(root, VERSION, dir)
  const out = compose(root)

  // 数と fence —— どれも corpus を実際に読めていなければ出ない
  assert.match(out, /\*\*open-todo: 2\*\*/, '2 node とも読めていない')
  for (const tag of [
    'bearing-drift-intra', 'bearing-drift-inter', 'bearing-working-delta',
    'bearing-unpushed', 'bearing-checkpoint-stale',
  ]) {
    assert.match(out, new RegExp(tag), `${tag} が出ていない`)
  }
  // ⚠ **法も事実も、既定を名乗ってはならない**
  assert.match(out, /proj\/aims/)
  assert.doesNotMatch(out, /docs\/aims/, '既定の在り処を名乗っている')
  await rm(root, { recursive: true, force: true })
})

test('宣言された在り処に corpus が無ければ、どこを見たかを言う', async () => {
  // ⚠ **不在と誤設定が同じ顔で出れば、設定の誤りが健康証明として読まれる。**
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  execFileSync('git', ['init', '-q', root])
  await withAim(root, VERSION, 'proj/aims')
  const out = compose(root)
  assert.match(out, /proj\/aims/)
  await rm(root, { recursive: true, force: true })
})

test('扱えない在り処の宣言は、既定として黙って動かない', async () => {
  // ⚠ 既定へ落とせば、人間は自分の宣言が効いていると信じ続ける。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  await corpusRepo(root, ['alpha'])
  await writeFile(
    path.join(root, 'CLAUDE.md'),
    `# doc\n\n<!-- bearing:aim v${VERSION} dir=../up sha=${'0'.repeat(16)} -->\n本文\n<!-- /bearing:aim -->\n`,
  )
  const out = compose(root)
  assert.match(out, /読めない/)
  await rm(root, { recursive: true, force: true })
})

test('旧い置き場に取り残された baton は、fresh start と呼ばれない', async (t) => {
  // ⚠ **在るのに無いと報告する形は、この機構が一貫して拒んできたものである。**
  // 2026-09-03、CLI だけ塞いで面を塞ぎ忘れ、この行が実際に嘘をついた。
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await withAim(root)
  await mkdir(path.join(root, '.handoff', 'archive'), { recursive: true })
  await writeFile(path.join(root, '.handoff', 'active.md'), '---\ntask: old\n---\n\nold\n')
  const out = compose(root)
  assert.match(out, /旧い置き場に baton が取り残されている/)
  assert.match(out, /bearing-handoff\.mjs migrate/)
  assert.doesNotMatch(out, /fresh start である/)
})

test('取り残しが無ければ、これまで通り fresh start と述べる', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-compose-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await withAim(root)
  assert.match(compose(root), /fresh start である/)
})
