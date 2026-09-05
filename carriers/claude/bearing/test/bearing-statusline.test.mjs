// 装着の shim が解決する条項を固定する。
//
// ⚠ **ここで守っているのは「載っていないことを述べる」である。** shim は plugin の外に住み、
// **plugin が 1 枚も載っていなくても走る** ∴ その場面で黙ることは、この面で最も高くつく壊れ方
// になる —— 読み手には「何も言っていない ＝ 問題が無い」に見える。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  chooseRecord, compareVersions, readInstallRecord, resolveConfigDir, absentLine, run,
} from '../bin/bearing-statusline.mjs'
import { widthUnsafeChars } from '../bin/statusline.mjs'

/** `installed_plugins.json` を持つ config dir を作る。`plugins` が null なら file を置かない。 */
async function makeConfig(plugins) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-shim-'))
  if (plugins !== null) {
    await mkdir(path.join(dir, 'plugins'), { recursive: true })
    await writeFile(
      path.join(dir, 'plugins', 'installed_plugins.json'),
      typeof plugins === 'string' ? plugins : JSON.stringify({ version: 2, plugins }),
    )
  }
  return dir
}

test('projectPath が一致する record を最優先する —— project スコープはその project でだけ効く', () => {
  const chosen = chooseRecord(
    [
      { scope: 'user', installPath: '/user', version: '9.9.9' },
      { scope: 'project', projectPath: '/w/bearing', installPath: '/proj', version: '0.1.0' },
    ],
    '/w/bearing',
  )
  assert.equal(chosen.installPath, '/proj')
})

test('一致する project が無ければ user スコープ —— どの project でも効くのはそれだけである', () => {
  const chosen = chooseRecord(
    [
      { scope: 'project', projectPath: '/w/other', installPath: '/other', version: '9.9.9' },
      { scope: 'user', installPath: '/user', version: '0.1.0' },
    ],
    '/w/bearing',
  )
  assert.equal(chosen.installPath, '/user')
})

test('他 project の project スコープしか無ければ「無い」と答える —— 他所の版を誤射しない', () => {
  const chosen = chooseRecord(
    [{ scope: 'project', projectPath: '/w/other', installPath: '/other', version: '9.9.9' }],
    '/w/bearing',
  )
  assert.equal(chosen, null)
})

test('同スコープが並べば version の新しさで選ぶ —— file 中の順序は履歴であって優先順位ではない', () => {
  const chosen = chooseRecord(
    [
      { scope: 'user', installPath: '/old', version: '0.9.0' },
      { scope: 'user', installPath: '/new', version: '0.10.0' },
    ],
    null,
  )
  assert.equal(chosen.installPath, '/new')
})

test('version は semver として比べる —— 文字列比較は 0.10.0 を 0.9.0 より古いと答える', () => {
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0)
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0)
  assert.equal(compareVersions('0.7.0', '0.7.0'), 0)
})

test('installPath を持たない record は使わない —— 解決できない record は無い record である', () => {
  assert.equal(chooseRecord([{ scope: 'user', version: '1.0.0' }], null), null)
})

test('CLAUDE_CONFIG_DIR が config dir を移設する —— 移設した人間の面だけが黙って壊れてはならない', () => {
  assert.equal(resolveConfigDir({ CLAUDE_CONFIG_DIR: '/elsewhere' }, '/home/x'), '/elsewhere')
  assert.equal(resolveConfigDir({}, '/home/x'), path.join('/home/x', '.claude'))
})

test('record file が無い / record が無い / 読めない を畳まない —— 理由が述べられねば面は黙る', async (t) => {
  const missing = await makeConfig(null)
  const empty = await makeConfig({ 'other@mp': [{ scope: 'user', installPath: '/o' }] })
  const broken = await makeConfig('{ not json')
  t.after(() => Promise.all([missing, empty, broken].map((d) => rm(d, { recursive: true, force: true }))))

  assert.equal((await readInstallRecord({ configDir: missing })).reason, 'record file が無い')
  assert.equal((await readInstallRecord({ configDir: empty })).reason, 'record が無い')
  assert.equal((await readInstallRecord({ configDir: broken })).reason, 'record を読めない')
})

test('marketplace 名は問わない —— fork や rename で `bearing@` の後ろは変わる', async (t) => {
  const dir = await makeConfig({ 'bearing@someone-else': [{ scope: 'user', installPath: '/x', version: '1.2.3' }] })
  t.after(() => rm(dir, { recursive: true, force: true }))
  const record = await readInstallRecord({ configDir: dir })
  assert.equal(record.installPath, '/x')
  assert.equal(record.version, '1.2.3')
})

test('載っていなければ、その 1 行を描く —— 不在を黙って消さない', async (t) => {
  const dir = await makeConfig(null)
  t.after(() => rm(dir, { recursive: true, force: true }))
  let out = ''
  await run({ env: { CLAUDE_CONFIG_DIR: dir }, write: (s) => { out += s } })
  assert.match(out, /載っていない/)
  assert.match(out, /claude plugin install bearing@trust-delta/)
})

test('record は在るのに本体が無い場合も述べる —— 「読めなかった」を「問題が無い」に畳まない', async (t) => {
  const dir = await makeConfig({ 'bearing@trust-delta': [{ scope: 'user', installPath: '/nowhere', version: '1.0.0' }] })
  t.after(() => rm(dir, { recursive: true, force: true }))
  let out = ''
  await run({ env: { CLAUDE_CONFIG_DIR: dir }, write: (s) => { out += s } })
  assert.match(out, /本体が無い/)
})

test('不在の行も幅の規律に従う —— 本体を import できない場面で描くので、literal で守るほかない', () => {
  assert.deepEqual(widthUnsafeChars(absentLine('record が無い')), [])
})

test('absentLine は install の scope を勧めない —— scope は install する人間の問いである', () => {
  // ⚠ どの scope で載せるかは plugin の範囲外（人間の決定 2026-09-05）。
  assert.ok(!absentLine('x').includes('--scope'))
  assert.ok(absentLine('x').includes('claude plugin install bearing@trust-delta'))
})
