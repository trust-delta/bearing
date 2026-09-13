// 委譲の条項を固定する。
//
// ⚠ **ここで守っているのは「安全側は委譲しないこと」である。** 判定材料が 1 つでも欠けたら
// 自分で走る —— 誤射して他 project の code を実行するより、cache が古いまま走るほうが遥かに
// 安い。∴ 以下の test の大半は「委譲しない」を主張している。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chooseDelegate, DELEGATE_GUARD } from '../../../carriers/claude/bearing/lib/delegate.mjs'

const LIB = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'carriers', 'claude', 'bearing', 'lib', 'delegate.mjs'),
).href

/** bearing の checkout らしい形を作る。`name` を変えれば「別物」になる。 */
async function makeCheckout(name = 'bearing', file = 'probe.mjs', body = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'bearing-delegate-'))
  const carrier = path.join(root, 'carriers', 'claude', 'bearing')
  await mkdir(path.join(carrier, '.claude-plugin'), { recursive: true })
  await mkdir(path.join(carrier, 'bin'), { recursive: true })
  await writeFile(
    path.join(carrier, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name, version: '9.9.9' }),
  )
  await writeFile(path.join(carrier, 'bin', file), body)
  return { root, target: path.join(carrier, 'bin', file) }
}

test('委譲済みの印が立っていれば委譲しない —— さもなくば無限に spawn する', async (t) => {
  const { root } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  const self = '/somewhere/cache/bin/probe.mjs'
  assert.equal(await chooseDelegate(self, root, { [DELEGATE_GUARD]: '1' }), null)
})

// ── `CLAUDE_PROJECT_DIR` が無い経路（Bash tool から打つ CLI） ────────────────
//
// 🔴 **2026-09-13 まで、この経路は一切委譲しなかった。** ⚠ **`# IS` の「cache 側の bin は
// すべて委譲を通る」は偽であり、測った範囲は hook と statusline の 2 つだけだった** ——
// そして **checkout の中で裸のコマンドを打つと cache が走り、置かれた skill を 1 版*戻した*。**
//
// ⚠ **門は 1 つも緩めていない** —— `plugin.json` の `name` は依然として要る ∴ **cwd が
// bearing の checkout の中に無ければ、辿った先のどこでも `null` である。**

test('CLAUDE_PROJECT_DIR が無ければ cwd から探す —— CLI にとって cwd は推測ではない', async (t) => {
  const { root, target } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', undefined, {}, root), target)
})

test('cwd が checkout の深い所でも見つける —— 深さを決め打たない', async (t) => {
  // ⚠ **CLI は checkout の*どこから*打たれるか分からない。** 1 段固定の道具は、この repo の
  // `CLAUDE.md` が名指しで禁じている形である。
  const { root, target } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  const deep = path.join(root, 'docs', 'aims', 'a', 'b')
  await mkdir(deep, { recursive: true })
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', undefined, {}, deep), target)
})

test('cwd が checkout の外なら、辿っても委譲しない', async (t) => {
  const outside = await mkdtemp(path.join(tmpdir(), 'bearing-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', undefined, {}, outside), null)
})

test('cwd を辿っても、name が違えば委譲しない —— 門は緩めていない', async (t) => {
  const { root } = await makeCheckout('not-bearing')
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', undefined, {}, root), null)
})

test('🔴 `CLAUDE_PROJECT_DIR` が在るときは、そこ 1 点だけを見る —— hook の振る舞いを動かさない', async (t) => {
  // ⚠ **cwd が checkout でも、渡された project が checkout でなければ委譲しない。**
  // 🔴 **2026-09-04 に変異試験で確かめた振る舞いを、1 mm も動かさないための test である。**
  const { root } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  const plain = await mkdtemp(path.join(tmpdir(), 'bearing-plain-'))
  t.after(() => rm(plain, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', plain, {}, root), null)
})

test('bearing の checkout でない project へは委譲しない', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'bearing-delegate-plain-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', root, {}), null)
})

test('path が一致しても plugin.json の name が違えば委譲しない', async (t) => {
  // ⚠ 他 project が bearing を vendor していれば同じ path は存在しうる ∴ path の一致は
  // 実行の根拠として弱すぎる。
  const { root } = await makeCheckout('not-bearing')
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', root, {}), null)
})

test('委譲先の file が無ければ委譲しない', async (t) => {
  const { root } = await makeCheckout('bearing', 'other.mjs')
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', root, {}), null)
})

test('自分が既に checkout の複製なら委譲しない', async (t) => {
  const { root, target } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate(target, root, {}), null)
})

test('条件が揃えば working tree 側の同名 file を選ぶ', async (t) => {
  const { root, target } = await makeCheckout()
  t.after(() => rm(root, { recursive: true, force: true }))
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', root, {}), target)
})

test('委譲すると stdin は素通しされ、exit code は子のものになる', async (t) => {
  const { root } = await makeCheckout(
    'bearing',
    'probe.mjs',
    [
      "let buf = ''",
      "process.stdin.setEncoding('utf8')",
      'for await (const c of process.stdin) buf += c',
      "process.stdout.write('CHECKOUT:' + buf.trim() + '\\n')",
      'process.exit(3)',
    ].join('\n') + '\n',
  )
  t.after(() => rm(root, { recursive: true, force: true }))

  const cacheDir = await mkdtemp(path.join(tmpdir(), 'bearing-cache-'))
  t.after(() => rm(cacheDir, { recursive: true, force: true }))
  const cacheProbe = path.join(cacheDir, 'probe.mjs')
  await writeFile(
    cacheProbe,
    [
      `import { delegateToCheckout } from '${LIB}'`,
      'await delegateToCheckout(import.meta.url)',
      // ⚠ 委譲したなら、ここへは決して来ない。来たなら明け渡しに失敗している。
      "process.stdout.write('CACHE\\n')",
      'process.exit(9)',
    ].join('\n') + '\n',
  )

  let out = ''
  let status = 0
  try {
    out = execFileSync(process.execPath, [cacheProbe], {
      input: 'HELLO',
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, [DELEGATE_GUARD]: '' },
    })
  } catch (err) {
    out = err.stdout ?? ''
    status = err.status
  }
  assert.equal(out, 'CHECKOUT:HELLO\n', 'stdin が子へ素通しされること')
  assert.equal(status, 3, '子の exit code が親の exit code になること')
})

test('🔴 env を渡さず、checkout の中から裸で打っても working tree が走る', async (t) => {
  // 🔴 **これが 2026-09-13 に踏んだ形そのものである。** ⚠ **`CLAUDE_PROJECT_DIR` を渡さない**
  // —— **Bash tool から打つ CLI の env にはあれが無い**（実測 2026-09-13、対象: この機体）。
  // ✅ **陰性対照を同じ test に置く**: checkout の*外*から打てば cache が走る。**片方だけでは、
  // 測っているのが委譲なのか単に常に checkout を選んでいるのかを区別できない。**
  const { root } = await makeCheckout(
    'bearing',
    'probe.mjs',
    "process.stdout.write('CHECKOUT\\n')\nprocess.exit(3)\n",
  )
  t.after(() => rm(root, { recursive: true, force: true }))
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'bearing-cache-'))
  t.after(() => rm(cacheDir, { recursive: true, force: true }))
  const cacheProbe = path.join(cacheDir, 'probe.mjs')
  await writeFile(
    cacheProbe,
    [
      `import { delegateToCheckout } from '${LIB}'`,
      'await delegateToCheckout(import.meta.url)',
      "process.stdout.write('CACHE\\n')",
      'process.exit(9)',
    ].join('\n') + '\n',
  )
  const outside = await mkdtemp(path.join(tmpdir(), 'bearing-outside-'))
  t.after(() => rm(outside, { recursive: true, force: true }))
  // ⚠ **cwd は実在しなければならない** —— 無ければ spawn が ENOENT で落ち、**stdout が空に
  // なって「cache が走った」と区別がつかない**（この test を書いた最初の版で踏んだ）。
  const deep = path.join(root, 'docs', 'aims')
  await mkdir(deep, { recursive: true })
  const env = { ...process.env }
  delete env.CLAUDE_PROJECT_DIR
  delete env[DELEGATE_GUARD]

  const run = (cwd) => {
    try {
      return { out: execFileSync(process.execPath, [cacheProbe], { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }), status: 0 }
    } catch (err) {
      return { out: err.stdout ?? '', status: err.status }
    }
  }
  const inside = run(deep)
  assert.equal(inside.out, 'CHECKOUT\n', 'checkout の中なのに cache が走っている')
  assert.equal(inside.status, 3)
  // ✅ 陰性対照 —— 外では cache が走る。
  const out = run(outside)
  assert.equal(out.out, 'CACHE\n', 'checkout の外なのに委譲している')
  assert.equal(out.status, 9)
})
