#!/usr/bin/env node
// 合成した消費者 —— **出荷 layout の carrier を消費者の前に立たせ、何を言うかを検める。**
//
// ⚠ **これは `node --test` とは別の層である。** あちらは*関数*を検め、ここは**出荷物が
// 消費者の前で何を言うか**を検める。`docs/aims/consumer-evidence.md` が理由を持つ:
// この repo は正本を持つがゆえに、消費者の異常な状態を原理的に持てない —— `docs/aims/` も
// `CLAUDE.md` の block も、ここでは*置かれたもの*ではなく*著述されたもの*である。
//
// ═══ 何をもって「出荷 layout」と呼ぶか ═════════════════════════════════════
//
// marketplace entry の source は `./carriers/claude/bearing` であり、cache へ複製されるのは
// **その subtree だけ**である（実測 2026-09-03）∴ ここでは *tracked な file だけ*を、mode ごと、
// **checkout の外の temp dir へ**写して出荷 copy とする。⚠ **checkout の外へ出すことが要点で
// ある** —— `original/` も `docs/aims/` も `.git` も伴わない場所に立たせなければ、*path に依る
// 振る舞い*は測れず、そこが cache と working tree の唯一のずれである（`lib/delegate.mjs`）。
//
// ⚠ **これは cache そのものではない。** 本物の cache は released commit の clone であり、ここが
// 組むのは checkout からの複製である ∴ **marketplace の複製が実際にこの subtree と一致するか
// は、この job の外に在る。** 覆っていない範囲として最後に述べる。
//
// ═══ 委譲を通したら証拠にならない ═════════════════════════════════════════
//
// 通せば走るのは working tree であって出荷物ではない。ここは 2 つで塞ぐ: `BEARING_DELEGATED`
// を立てること、そして**合成消費者が carrier の manifest を持たないこと**（`chooseDelegate` は
// `<projectDir>/carriers/claude/bearing/.claude-plugin/plugin.json` を読めなければ必ず null を
// 返す）。⚠ **前者だけでは足りない** —— env は消えうるが、後者は構造である。
//
// ═══ cwd を消費者へ倒さないと、この job は bearing 自身を測る ═══════════════
//
// ⚠ **hook は `process.cwd()` から unit を解決する**（`bin/aim-facts.mjs`、`cwd` が project と
// いう目的の文の帰結）—— `CLAUDE_PROJECT_DIR` でも stdin の `cwd` でもない。⚠ **2026-09-05、
// この job を書く途中で実際に踏んだ**: cwd を倒さずに走らせたところ、hook は「採っていない
// 消費者」について **bearing 自身の open-todo 9 を報告した。** ∴ 肯定側の検査は**合成消費者を
// 名指していること**まで見る —— 「空でないこと」だけを見る門は、bearing を測りながら緑になる。

import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, copyFile, chmod, stat, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.join(import.meta.dirname, '..')
const CARRIER = path.join('carriers', 'claude', 'bearing')

const results = []
/** 1 件の検査。⚠ **throw も失敗である** —— 落ちた検査を「走らなかった」に畳まない。 */
async function check(name, fn) {
  try {
    const note = await fn()
    results.push({ name, ok: true, note: note ?? '' })
  } catch (err) {
    results.push({ name, ok: false, note: err?.message ?? String(err) })
  }
}
function must(cond, message) {
  if (!cond) throw new Error(message)
}

// ── 出荷 copy を組む ────────────────────────────────────────────────────────

/**
 * tracked な carrier subtree を、checkout の外へ mode ごと写す。
 *
 * ⚠ **working tree ではなく index が知っている file だけを写す。** commit されていない file が
 * 出荷物に見えれば、この job は届かないものを検めることになる。
 */
async function buildShipped(dest) {
  const ls = spawnSync('git', ['-C', ROOT, 'ls-files', '-z', '--', CARRIER], { encoding: 'buffer' })
  must(ls.status === 0, `git ls-files が失敗した: ${ls.stderr?.toString() ?? ''}`)
  const files = ls.stdout.toString('utf8').split('\0').filter(Boolean)
  must(files.length > 0, 'carrier に tracked file が 1 つも無い')
  for (const f of files) {
    const rel = path.relative(CARRIER, f)
    const to = path.join(dest, rel)
    await mkdir(path.dirname(to), { recursive: true })
    await copyFile(path.join(ROOT, f), to)
    await chmod(to, (await stat(path.join(ROOT, f))).mode & 0o777)
  }
  return files.length
}

// ── 合成消費者 ──────────────────────────────────────────────────────────────

const GIT_ID = [
  '-c', 'user.email=consumer@example.invalid',
  '-c', 'user.name=synthetic consumer',
  '-c', 'commit.gpgsign=false',
  '-c', 'init.defaultBranch=main',
]

function git(cwd, ...args) {
  const r = spawnSync('git', [...GIT_ID, '-C', cwd, ...args], { encoding: 'utf8' })
  must(r.status === 0, `git ${args.join(' ')} が失敗した: ${r.stderr}`)
  return r.stdout
}

/** 空の消費者 repo。⚠ **git が在ることは前提にしてよい** —— 無ければ検査そのものが成立しない。 */
async function consumer(base, name, { corpus = false } = {}) {
  const dir = path.join(base, name)
  await mkdir(dir, { recursive: true })
  git(dir, 'init', '-q')
  await writeFile(path.join(dir, 'README.md'), `# ${name}\n`, 'utf8')
  if (corpus) {
    await mkdir(path.join(dir, 'docs', 'aims'), { recursive: true })
    await writeFile(
      path.join(dir, 'docs', 'aims', 'root.md'),
      '---\naim: 合成した消費者が持つ唯一の目的\nparent: null\nstate: open\n---\n\n# IS\n\n合成である。\n\n# PROCESS\n\n- [todo] 合成した残務が 1 つ\n',
      'utf8',
    )
  }
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'synthetic consumer')
  return dir
}

// ── 出荷物を、消費者として走らせる ──────────────────────────────────────────

let seq = 0
/**
 * 出荷 copy の bin を 1 本走らせる。
 *
 * ⚠ **`cwd` は必ず消費者である**（上の見出しコメント）。⚠ **session id は毎回新しい** ——
 * `precompact` は `os.tmpdir()` の marker で「セッションにつき一度」を守る ∴ 使い回せば
 * 2 度目以降は黙り、その沈黙は検査の成功に見える。
 */
function runBin(env0, shipped, bin, { cwd, args = [], input = {} } = {}) {
  const payload = typeof input === 'string'
    ? input
    : JSON.stringify({ session_id: `consumer-check-${process.pid}-${seq++}`, cwd, source: 'startup', trigger: 'auto', ...input })
  const r = spawnSync(process.execPath, [path.join(shipped, 'bin', bin), ...args], {
    cwd,
    input: payload,
    encoding: 'utf8',
    env: { ...env0, CLAUDE_PROJECT_DIR: cwd },
    timeout: 60_000,
  })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 置かれた block の**本文**（marker の 2 行を除く）。⚠ marker は HTML コメント ∴ context に乗らない。 */
function blockBody(text) {
  const lines = text.split('\n')
  const from = lines.findIndex((l) => /^<!--\s*bearing:aim\s/.test(l))
  const to = lines.findIndex((l) => /^<!--\s*\/bearing:aim\s*-->/.test(l))
  must(from !== -1 && to > from, 'CLAUDE.md に bearing:aim の block が 1 組見つからない')
  return lines.slice(from + 1, to).join('\n')
}

const listing = async (dir) => (await readdir(dir)).sort()

// ── 本体 ────────────────────────────────────────────────────────────────────

async function main() {
  const base = await mkdtemp(path.join(tmpdir(), 'bearing-consumer-'))
  const shipped = path.join(base, 'shipped')
  const keep = process.argv.includes('--keep')

  const head = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' })
  console.log('# 合成した消費者 —— 出荷物が消費者の前で何を言うか')
  console.log('')
  console.log(`観測: ${new Date().toISOString()} · node ${process.version} · ${process.platform}/${process.arch}`)
  console.log(`対象: ${CARRIER} @ ${(head.stdout || '(不明)').trim()} を tracked file だけ写した複製`)
  console.log(`置き場: ${base}`)
  console.log('')

  const count = await buildShipped(shipped)
  const manifest = JSON.parse(await readFile(path.join(shipped, '.claude-plugin', 'plugin.json'), 'utf8'))
  console.log(`出荷 copy: ${count} file · plugin ${manifest.name} v${manifest.version}`)
  console.log('')

  const env0 = {
    ...process.env,
    // ⚠ 委譲の guard。構造の側の塞ぎは「消費者が carrier manifest を持たない」ことである。
    BEARING_DELEGATED: '1',
    // ⚠ **人間の実 baton と実 settings を触らせない。** 倒さなければ、この job は
    // `~/.bearing/` と `~/.claude/settings.json` を書き換える。
    BEARING_HOME: path.join(base, 'bearing-home'),
    CLAUDE_CONFIG_DIR: path.join(base, 'claude-config'),
  }
  await mkdir(env0.BEARING_HOME, { recursive: true })
  await mkdir(env0.CLAUDE_CONFIG_DIR, { recursive: true })

  const plain = await consumer(base, 'plain')
  const adopted = await consumer(base, 'adopted', { corpus: true })
  const hasMd = await consumer(base, 'has-claude-md')
  const hasSkill = await consumer(base, 'has-skill')
  const withBaton = await consumer(base, 'with-baton')

  const setupAim = (cwd, ...args) => runBin(env0, shipped, 'bearing-setup-aim.mjs', { cwd, args })

  // ── A. 前提 ───────────────────────────────────────────────────────────────

  await check('出荷 copy は checkout の外に立ち、original/ も corpus も伴わない', async () => {
    must(!shipped.startsWith(ROOT + path.sep), '出荷 copy が checkout の中に在る')
    for (const forbidden of ['original', 'docs', '.git']) {
      const there = await stat(path.join(shipped, forbidden)).then(() => true, () => false)
      must(!there, `出荷 copy が ${forbidden}/ を伴っている —— cache には無いものである`)
    }
    return `${count} file、${shipped}`
  })

  await check('委譲は構造的に起こりえない —— 消費者は carrier の manifest を持たない', async () => {
    for (const c of [plain, adopted, hasMd, hasSkill, withBaton]) {
      const there = await stat(path.join(c, CARRIER, '.claude-plugin', 'plugin.json')).then(() => true, () => false)
      must(!there, `${path.basename(c)} が carrier manifest を持つ —— 委譲が起きうる`)
    }
    must(env0.BEARING_DELEGATED === '1', 'guard が立っていない')
    return 'guard ＋ manifest 不在の 2 重'
  })

  // ── B. setup-aim —— 置き、置いたところで責任が終わる ──────────────────────

  await check('⑴ 素の消費者へ block と .claude/skills/aim/ を置く', async () => {
    const r = setupAim(plain)
    must(r.status === 0, `exit=${r.status} ${r.stderr}`)
    must(/末尾へ置いた/.test(r.stdout), `置いたと述べていない: ${r.stdout}`)
    const md = await readFile(path.join(plain, 'CLAUDE.md'), 'utf8')
    must(/^<!-- bearing:aim /m.test(md), 'block が置かれていない')
    return (await listing(path.join(plain, '.claude', 'skills', 'aim'))).join('・')
  })

  await check('⑵ block の本文は禁じた字を 1 つも持たず、`aim` skill を名指す', async () => {
    const body = blockBody(await readFile(path.join(plain, 'CLAUDE.md'), 'utf8'))
    // ⚠ **どれも「版で腐る」か「plugin が repo の開示を肩代わりする」形である**
    //（`docs/aims/adoption-declaration.md`、人間の決定 2026-09-05）。
    for (const forbidden of ['_guide', 'plugins/cache', 'claude plugin install', '{{', 'CLAUDE_PLUGIN_ROOT']) {
      must(!body.includes(forbidden), `法の本文が「${forbidden}」を含む`)
    }
    must(!/v\d+\.\d+\.\d+/.test(body), '法の本文が版を名乗っている —— bump で腐る')
    must(body.includes('`aim` skill'), '法が `aim` skill を名指していない —— 読み手をどこへも送らない')
    return `${body.split('\n').length} 行、禁じた字 0 件`
  })

  await check('⑶ 置かれた 3 枚は出荷 template と byte 同一で、frame.md は置かれない', async () => {
    const dir = path.join(plain, '.claude', 'skills', 'aim')
    const placed = await listing(dir)
    must(!placed.includes('frame.md'), 'frame.md が置かれている —— 同じ 6 箇条が 3 箇所に住む')
    for (const f of placed) {
      const a = await readFile(path.join(dir, f))
      const b = await readFile(path.join(shipped, 'templates', 'aim', f))
      must(a.equals(b), `${f} が出荷 template と byte 同一でない`)
    }
    return placed.join('・')
  })

  await check('⑷ 2 度目は 1 byte も触らない —— 置いた後はこの repo のもの', async () => {
    const dir = path.join(plain, '.claude', 'skills', 'aim')
    const md = path.join(plain, 'CLAUDE.md')
    const before = { md: await readFile(md, 'utf8'), mt: (await stat(md)).mtimeMs, skill: {} }
    for (const f of await listing(dir)) {
      before.skill[f] = { text: await readFile(path.join(dir, f), 'utf8'), mt: (await stat(path.join(dir, f))).mtimeMs }
    }
    const r = setupAim(plain)
    must(r.status === 0, `exit=${r.status}`)
    must(/既に在る ∴ 触らない/.test(r.stdout), `触らないと述べていない: ${r.stdout}`)
    must(await readFile(md, 'utf8') === before.md, 'CLAUDE.md の中身が動いた')
    must((await stat(md)).mtimeMs === before.mt, 'CLAUDE.md が書き直された（mtime が動いた）')
    for (const [f, was] of Object.entries(before.skill)) {
      must(await readFile(path.join(dir, f), 'utf8') === was.text, `${f} の中身が動いた`)
      must((await stat(path.join(dir, f))).mtimeMs === was.mt, `${f} が書き直された（mtime が動いた）`)
    }
    return '中身も mtime も不変'
  })

  await check('⑸ --check は current・skill 在り・exit 0', async () => {
    const r = setupAim(plain, '--check')
    must(r.status === 0, `exit=${r.status}`)
    must(/状態: current/.test(r.stdout), `current と述べていない: ${r.stdout}`)
    must(/aim skill: 在る/.test(r.stdout), 'skill が在ると述べていない')
    return '状態 current'
  })

  await check('⑹ --remove は block を外し、skill は残す', async () => {
    const r = setupAim(plain, '--remove')
    must(r.status === 0, `exit=${r.status}`)
    must(/block を外した/.test(r.stdout), `外したと述べていない: ${r.stdout}`)
    const md = await readFile(path.join(plain, 'CLAUDE.md'), 'utf8')
    must(!/bearing:aim/.test(md), 'block が残っている')
    const placed = await listing(path.join(plain, '.claude', 'skills', 'aim'))
    must(placed.length === 3, `skill が消えた（残り ${placed.length} 枚）—— 採用を外すことと持ち物を捨てることは別の act である`)
    return `skill ${placed.length} 枚が残った`
  })

  await check('⑼ 既に CLAUDE.md が在れば、人間の本文を保って末尾へ 1 組だけ置く', async () => {
    const md = path.join(hasMd, 'CLAUDE.md')
    const original = '# この repo の規律\n\n人間が書いた行。\n'
    await writeFile(md, original, 'utf8')
    const r = setupAim(hasMd)
    must(r.status === 0, `exit=${r.status}`)
    const after = await readFile(md, 'utf8')
    must(after.startsWith(original), '人間の本文が動いた')
    must(after.match(/^<!-- bearing:aim /gm)?.length === 1, 'block が 1 組でない')
    const back = setupAim(hasMd, '--remove')
    must(back.status === 0, `--remove exit=${back.status}`)
    must(await readFile(md, 'utf8') === original, '--remove が原文へ戻さなかった')
    return '置いて外して byte 同一'
  })

  await check('⑽ 既に .claude/skills/aim/ が在れば、潰さず補わず、述べて止まる', async () => {
    const dir = path.join(hasSkill, '.claude', 'skills', 'aim')
    await mkdir(dir, { recursive: true })
    const mine = 'この repo が自分で直した版\n'
    await writeFile(path.join(dir, 'SKILL.md'), mine, 'utf8')
    const r = setupAim(hasSkill)
    must(r.status === 0, `exit=${r.status}`)
    must(/既に在る ∴ 触らない/.test(r.stdout), `述べて止まっていない: ${r.stdout}`)
    must(await readFile(path.join(dir, 'SKILL.md'), 'utf8') === mine, 'この repo の版が潰された')
    // ⚠ **足りない枚を補うことも「触る」である** —— 何を持つかはこの repo が決めている。
    must((await listing(dir)).length === 1, '足りない枚が補われた')
    return '1 枚のまま'
  })

  await check('採っていない repo で --check は absent と述べ、exit 0 で終わる', async () => {
    const r = setupAim(withBaton, '--check')
    must(r.status === 0, `exit=${r.status} —— 未採用は broken でも edited でもない`)
    must(/状態: absent/.test(r.stdout), `absent と述べていない: ${r.stdout}`)
    must(/aim skill: 無い/.test(r.stdout), 'skill が無いと述べていない')
    return '状態 absent'
  })

  // ── C. hook —— 採用の宣言で黙り、述べる ──────────────────────────────────

  const HOOKS = ['aim-facts.mjs', 'boot-ritual.mjs', 'corpus-delta.mjs', 'precompact.mjs']

  await check('⑺ 採っておらず baton も無い repo で、hook 4 枚は 1 byte も出さない', async () => {
    const said = []
    for (const h of HOOKS) {
      const r = runBin(env0, shipped, h, { cwd: plain })
      if (r.stdout.length + r.stderr.length > 0) said.push(`${h}: ${r.stdout.length}+${r.stderr.length} byte`)
      must(r.status === 0, `${h} が exit=${r.status} で終わった`)
    }
    must(said.length === 0, `黙るべき hook が述べた: ${said.join('、')}`)
    return '4 枚とも 0 byte / exit 0'
  })

  await check('採った repo で aim-facts は述べ、しかも**その合成消費者を名指す**', async () => {
    const s = setupAim(adopted)
    must(s.status === 0, `setup-aim exit=${s.status}`)
    const r = runBin(env0, shipped, 'aim-facts.mjs', { cwd: adopted })
    must(r.status === 0, `exit=${r.status}`)
    must(r.stdout.length > 0, '採ったのに黙った')
    // ⚠ **ここが cwd の取り違えを捕まえる唯一の門である。**
    must(/# aim facts —— unit: adopted/.test(r.stdout), `別の unit を測っている: ${r.stdout.slice(0, 200)}`)
    must(/\*\*open-todo: 1\*\*/.test(r.stdout), '合成 corpus の残務 1 を数えていない —— 他所の corpus を読んでいる')
    must(!r.stdout.includes(ROOT), 'bearing 自身の path が出力に出ている')
    return 'unit: adopted / open-todo: 1'
  })

  await check('採った repo で precompact は exit 2 の stderr で遮断する', async () => {
    const r = runBin(env0, shipped, 'precompact.mjs', { cwd: adopted, input: { trigger: 'auto' } })
    must(r.status === 2, `exit=${r.status} —— 遮断は exit 2 である`)
    must(/一度だけ.*遮断/.test(r.stderr), `遮断を述べていない: ${r.stderr.slice(0, 200)}`)
    must(r.stdout === '', 'stdout へ書いた —— PreCompact の経路は stderr である')
    return `stderr ${r.stderr.length} byte`
  })

  await check('人間が呼んだ圧縮（manual）は決して遮断しない', async () => {
    const r = runBin(env0, shipped, 'precompact.mjs', { cwd: adopted, input: { trigger: 'manual' } })
    must(r.status === 0, `exit=${r.status} —— 人の act を我々の儀式で上書きしない`)
    must(r.stdout === '' && r.stderr === '', `manual で述べた: ${r.stdout}${r.stderr}`)
    return '沈黙 / exit 0'
  })

  await check('唯一の例外 —— 採っていない repo でも、未読の baton は述べる', async () => {
    const baton = '---\ncomposed-at: 2026-01-01T00:00:00Z\ntask: 合成した baton\n---\n\n## ▶ Task\n\n合成である。\n'
    const w = runBin(env0, shipped, 'bearing-handoff.mjs', { cwd: withBaton, args: ['write'], input: baton })
    must(w.status === 0, `baton を書けなかった: ${w.stderr}`)
    const boot = runBin(env0, shipped, 'boot-ritual.mjs', { cwd: withBaton })
    must(boot.stdout.length > 0, '採っていない repo で baton の未読を黙った —— 在るのに無いと報告する形である')
    const facts = runBin(env0, shipped, 'aim-facts.mjs', { cwd: withBaton })
    must(facts.stdout.length > 0, 'aim-facts が baton を黙った —— hook と面は同じ例外を持つ')
    return `boot-ritual ${boot.stdout.length} byte / aim-facts ${facts.stdout.length} byte`
  })

  await check('その例外は baton に閉じる —— aim の fence も open-todo も出さない', async () => {
    const r = runBin(env0, shipped, 'aim-facts.mjs', { cwd: withBaton })
    for (const leak of ['open-todo', 'escalation:', 'bearing-drift-intra', 'bearing-awaiting-observation', '# aim frame']) {
      must(!r.stdout.includes(leak), `採っていない repo へ「${leak}」が漏れた`)
    }
    must(/baton:/.test(r.stdout), 'baton を名指していない')
    return 'baton のみ'
  })

  // ── D. statusline —— 装着した 1 行が、その形のまま走る ────────────────────

  await check('⑻ setup-statusline が shim と 1 行を置き、書いたその 1 行がシェルで走る', async () => {
    const r = runBin(env0, shipped, 'bearing-setup-statusline.mjs', { cwd: adopted })
    must(r.status === 0, `exit=${r.status} ${r.stderr}`)
    must(/shim を置いた/.test(r.stdout), 'shim を置いたと述べていない')
    // ⚠ **この 1 行が、2026-09-04 に面を黙って消した形の門である**（`lib/shell.mjs`）。
    must(!/シェルで走らない/.test(r.stdout), `書いた 1 行が走らなかった: ${r.stdout}`)
    const settings = JSON.parse(await readFile(path.join(env0.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8'))
    must(settings.statusLine?.type === 'command', 'settings に statusLine が無い')
    must(!/\d+\.\d+\.\d+/.test(settings.statusLine.command), '装着した 1 行が版を含む —— bump で腐る')
    return settings.statusLine.command
  })

  await check('shim をその 1 行のまま走らせると、面を 1 行描く', async () => {
    const cmd = JSON.parse(await readFile(path.join(env0.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8')).statusLine.command
    const r = spawnSync(cmd, {
      shell: true, cwd: adopted, encoding: 'utf8', timeout: 60_000, env: env0,
      input: JSON.stringify({ cwd: adopted, workspace: { current_dir: adopted } }),
    })
    must(r.status === 0, `exit=${r.status} ${r.stderr}`)
    must((r.stdout ?? '').trim().length > 0, '面が何も描かなかった —— statusline は失敗を描かない ∴ 画面からは黙って消える')
    return (r.stdout ?? '').trim().split('\n')[0]
  })

  // ── E. 面 —— 人間が握る path に version が入らない ────────────────────────

  await check('面へ辿り着く path は home の固定名で、version を含まない', async () => {
    const r = runBin(env0, shipped, 'bearing-setup-surface.mjs', { cwd: adopted })
    must(r.status === 0, `exit=${r.status} ${r.stderr}`)
    const dest = path.join(env0.CLAUDE_CONFIG_DIR, 'bearing-aim.html')
    must(r.stdout.includes(dest), `置き先を述べていない: ${r.stdout}`)
    // ⚠ **これが人間の bookmark になる 1 行である** —— ここに版が入れば、cache が旧版を
    // 消さない以上、bump 後も黙って古い面が開く。
    must(!/\d+\.\d+\.\d+/.test(dest), `置き先が版を含む: ${dest}`)
    must(/file:\/\//.test(r.stdout), 'browser で開く URL を述べていない')
    const placed = await readFile(dest)
    const source = await readFile(path.join(shipped, 'surface', 'aim.html'))
    must(placed.equals(source), '置いた 1 枚が出荷された面と byte 同一でない')
    return `${placed.length} byte、${path.basename(dest)}`
  })

  await check('面の --check は、置いた直後に byte 同一と述べ exit 0 で終わる', async () => {
    const r = runBin(env0, shipped, 'bearing-setup-surface.mjs', { cwd: adopted, args: ['--check'] })
    must(r.status === 0, `exit=${r.status} ${r.stdout}`)
    must(/byte 同一/.test(r.stdout), `同一と述べていない: ${r.stdout}`)
    return 'byte 同一'
  })

  await check('出荷された command は、実在して裸で呼べる bin だけを名指す', async () => {
    // ⚠ **誰も名指さない道具は誰も走らせない道具である**（`original/README.md`）—— 逆に、
    // 在らない道具を名指す command は、人間を `command not found` へ送る。
    const dir = path.join(shipped, 'commands')
    const named = []
    for (const f of await listing(dir)) {
      const text = await readFile(path.join(dir, f), 'utf8')
      for (const m of text.matchAll(/^\s*(bearing-[A-Za-z0-9-]+\.mjs)\b/gm)) {
        const bin = path.join(shipped, 'bin', m[1])
        const st = await stat(bin).catch(() => null)
        must(st !== null, `${f} が名指す ${m[1]} が同梱されていない`)
        // ⚠ **名前と exec bit は対である** —— `bearing-` を冠した名は「裸で呼んでよい」という
        // 約束であり、exec bit が無ければその約束は `Permission denied` で破れる。
        must((st.mode & 0o111) !== 0, `${m[1]} に exec bit が無い —— 裸で呼べば Permission denied`)
        named.push(m[1])
      }
    }
    must(named.length > 0, 'command が bin を 1 つも名指していない')
    return [...new Set(named)].join('・')
  })

  // ── 報告 ─────────────────────────────────────────────────────────────────

  const failed = results.filter((r) => !r.ok)
  console.log('## 検めたこと')
  console.log('')
  for (const r of results) console.log(`${r.ok ? '  ok  ' : '  NG  '} ${r.name}${r.note ? `\n         ${r.note}` : ''}`)
  console.log('')
  console.log(`${results.length} 件中 ${results.length - failed.length} 件が通った。`)
  console.log('')

  // ⚠ **覆った範囲だけを述べれば、この機構が「覆ったように読ませる」側になる** ——
  // それは canon が 7 箇所で禁じている形そのものである（`docs/aims/consumer-evidence.md`）。
  console.log('## この job が覆っていない範囲')
  console.log('')
  console.log([
    '⚠ **これは cache そのものではない。** 出荷 copy は checkout の tracked file から組んだ複製で',
    'あり、marketplace が実際に複製する中身と一致するかは、この job の外に在る。',
    '',
    `⚠ **走ったのは 1 platform / 1 node 版だけである**（${process.platform}/${process.arch}、node ${process.version}）。`,
    '2026-09-04 に出た 4 件の不具合のうち **2 件は、人間が別マシン・別 browser で踏んで初めて出た** ——',
    'win32 の path 形、UNC 越しの picker 拒否。ここは 1 つも再現できない。',
    '',
    '⚠ **statusline の probe が通るのは platform 既定のシェルであって、harness が使うシェルではない。**',
    '証明できるのは「どこでも走らない」ことであって「harness で走る」ことではない。',
    '',
    '⚠ **ハーネスの振る舞いは覆えない** —— 置いた skill が登録されるか、`$ARGUMENTS` が skills/ で',
    '展開されるか、plugin の skill 一覧がいつ固まるか。どれも我々の code の外に在る。',
    '',
    '⚠ **plugin が不在の場で block がどう読まれるかは、検査の対象ではない** —— それは repo の開示',
    'であって plugin の責任ではない（人間の決定 2026-09-05）。',
    '',
    '⚠ **browser の面（`surface/aim.html`）は 1 行も走らせていない。**',
  ].join('\n'))
  console.log('')

  if (!keep) await rm(base, { recursive: true, force: true })
  else console.log(`--keep ∴ 置き場を残した: ${base}`)

  if (failed.length > 0) {
    console.log(`⚠ **${failed.length} 件が落ちた。** 出荷物は消費者の前で、上に書いたとおりには振る舞わない。`)
    return 1
  }
  return 0
}

process.exit(await main())
