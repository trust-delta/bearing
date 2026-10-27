// session の記録 —— SessionStart composer が、採用の gate より前に書く帳簿。
//
// ⚠ **2026-10-27 まで、これは UserPromptSubmit の `boot-ritual` が prompt ごとに書いていた。**
// handoff の退役でその hook が去り、記録だけが `aim-facts` へ移った。⚠ **記録を残すのは
// 消費者を数える手段だからである**（`docs/aims/consumer-evidence.md`）∴ aim を採らない
// project でも書かれることを固定する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { readSession } from '../../../carriers/claude/bearing/lib/unit-home.mjs'

// ⚠ **unit の家を temp へ倒す。** 倒さなければ、test は `~/.bearing/` —— **人間の実際の
// 記録** —— を読み書きする。`sessionRecordPath` は呼ばれた時点の env を見る。
process.env.BEARING_HOME = mkdtempSync(path.join(tmpdir(), 'bearing-home-'))

const HERE = path.dirname(fileURLToPath(import.meta.url))
const COMPOSER = path.join(HERE, '..', '..', '..', 'carriers', 'claude', 'bearing', 'bin', 'aim-facts.mjs')

let seq = 0
const freshSession = () => `test-${process.pid}-${Date.now()}-${seq++}`

function run(input, cwd, env = {}) {
  return spawnSync(process.execPath, [COMPOSER], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd,
    env: { ...process.env, ...env },
  })
}

test('aim を採っていない project でも、session は記録され、facts は 1 byte も出ない', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-session-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  spawnSync('git', ['init', '-q', root])
  const id = freshSession()
  const res = run({ session_id: id, cwd: root }, root, { CLAUDE_PROJECT_DIR: root })
  assert.equal(res.status, 0)
  assert.equal(res.stdout, '')
  assert.equal(await readSession(root), id)
})

// 🔴 **踏んでいた**（実測 2026-09-30）: root で立ったセッションで agent が下位 dir へ `cd`
// すると、hook の入力の `cwd` はそこへ動き、**下位 dir が別の unit として記録された**
// （消費者 2 repo で 5 件）。⚠ **`CLAUDE_PROJECT_DIR` だけが root に留まった。** 記録の
// 書き手が移っても、同じ解決を通ることを固定する。
test('入力の cwd が下位 dir でも、session は project dir の unit へ記録される', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-session-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sub = path.join(root, 'assets', 'generated')
  await mkdir(sub, { recursive: true })
  const id = freshSession()
  const res = run({ session_id: id, cwd: sub }, sub, { CLAUDE_PROJECT_DIR: root })
  assert.equal(res.status, 0)
  assert.equal(await readSession(root), id)
  // ⚠ 割れていないことそのものを見る —— 下位 dir に unit が生まれていない。
  assert.equal(await readSession(sub), null)
})

test('session id が無い入力では何も記録せず、それでも exit 0 で終わる', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-session-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const res = run({ cwd: root }, root, { CLAUDE_PROJECT_DIR: root })
  assert.equal(res.status, 0)
  assert.equal(await readSession(root), null)
})
