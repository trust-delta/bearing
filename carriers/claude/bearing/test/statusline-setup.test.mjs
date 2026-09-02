// 装着が settings に何をするかを固定する。
//
// ⚠ **ここで守っているのは「人間が書いた別の statusline を黙って踏まない」である。**
// 面は 1 つしかなく、上書きは相手の面を消すことである ∴ 同じなら何もせず、違うなら述べて
// 止まる。⚠ **そして他の設定を巻き込まない** —— settings.json は人間の持ち物であり、
// 我々が触ってよいのは `statusLine` 1 key だけである。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyExisting, withStatusLine, withoutStatusLine, statusLineFor,
} from '../bin/bearing-statusline-setup.mjs'

const CMD = '/home/x/.claude/bearing-statusline.mjs'

test('statusLine が無ければ absent、同じなら same、違えば foreign', () => {
  assert.equal(classifyExisting({}, CMD), 'absent')
  assert.equal(classifyExisting({ statusLine: statusLineFor(CMD) }, CMD), 'same')
  assert.equal(classifyExisting({ statusLine: { type: 'command', command: 'ccstatusline' } }, CMD), 'foreign')
})

test('type が command でないものも foreign —— 形が違えば我々のものではない', () => {
  assert.equal(classifyExisting({ statusLine: { type: 'static', command: CMD } }, CMD), 'foreign')
})

test('書き込みは statusLine だけを差し替え、他の key を保つ', () => {
  const before = { env: { A: '1' }, permissions: { allow: ['Bash'] } }
  const after = withStatusLine(before, CMD)
  assert.deepEqual(after.env, { A: '1' })
  assert.deepEqual(after.permissions, { allow: ['Bash'] })
  assert.deepEqual(after.statusLine, { type: 'command', command: CMD })
  // ⚠ 入力を破壊しない —— 途中で失敗したとき、呼び手の手元が既に汚れている形は避ける。
  assert.equal(before.statusLine, undefined)
})

test('取り外しは statusLine だけを消し、他の key を保つ', () => {
  const before = { statusLine: statusLineFor(CMD), env: { A: '1' } }
  const after = withoutStatusLine(before)
  assert.equal(after.statusLine, undefined)
  assert.deepEqual(after.env, { A: '1' })
  assert.deepEqual(before.statusLine, statusLineFor(CMD))
})

test('statusLine が無い settings から外しても壊れない', () => {
  assert.deepEqual(withoutStatusLine({ env: {} }), { env: {} })
  assert.deepEqual(withoutStatusLine(undefined), {})
})
