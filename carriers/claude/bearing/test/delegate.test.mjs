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

import { chooseDelegate, DELEGATE_GUARD } from '../lib/delegate.mjs'

const LIB = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'delegate.mjs'),
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

test('CLAUDE_PROJECT_DIR が無ければ委譲しない —— 推測で他所の code を呼ばない', async () => {
  assert.equal(await chooseDelegate('/somewhere/cache/bin/probe.mjs', undefined, {}), null)
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
