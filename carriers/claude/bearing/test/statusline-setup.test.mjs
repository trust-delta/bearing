// 装着が settings に何をするかを固定する。
//
// ⚠ **ここで守っているのは「人間が書いた別の statusline を黙って踏まない」である。**
// 面は 1 つしかなく、上書きは相手の面を消すことである ∴ 同じなら何もせず、違うなら述べて
// 止まる。⚠ **そして他の設定を巻き込まない** —— settings.json は人間の持ち物であり、
// 我々が触ってよいのは `statusLine` 1 key だけである。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyExisting, withStatusLine, withoutStatusLine, statusLineFor, commandFor,
} from '../bin/bearing-statusline-setup.mjs'

const CMD = commandFor('/home/x/.claude/bearing-statusline.mjs', 'linux')

// ── 書く 1 行は path ではない —— シェルを通る文字列である ────────────────────
//
// ⚠ **2026-09-04、ここが生の path で書かれていて面が消えた**（win32）。harness は
// statusLine をシェル経由で走らせ、**POSIX シェルは `\` を escape として食う** ∴
// `C:\Users\...` は `command not found` で終わり、**statusline は失敗を描かない。**
// ⚠ **同じ罠は `lib/shell.mjs` で既に塞がれていた** —— 塞がれた法を、新しい emission
// 地点が通っていなかっただけである ∴ **ここが「通っていること」を見る門である。**

test('win32 で書く 1 行に backslash を 1 つも残さない —— シェルが escape として食う', () => {
  const cmd = commandFor('C:\\Users\\x\\.claude\\bearing-statusline.mjs', 'win32')
  assert.equal(cmd, 'node "C:/Users/x/.claude/bearing-statusline.mjs"')
  assert.ok(!cmd.includes('\\'), `シェルが食う文字が残っている: ${cmd}`)
})

test('POSIX では path に触らない —— あちらの filename に `\\` は合法に現れる', () => {
  assert.equal(
    commandFor('/home/x/we\\ird/bearing-statusline.mjs', 'linux'),
    'node "/home/x/we\\\\ird/bearing-statusline.mjs"',
  )
})

test('書いた 1 行は、POSIX シェルの unescape を 1 度通しても同じ 1 行である', () => {
  // ⚠ **これが 2026-09-04 に破れた不変である。** 生の win32 path はここで別物になる。
  const unescape = (s) => s.replace(/\\(.)/g, '$1')
  const cmd = commandFor('C:\\Users\\x\\.claude\\bearing-statusline.mjs', 'win32')
  assert.equal(unescape(cmd), cmd)
  // 生の path は破れる —— 門が何を捕まえているかを、同じ場所で示しておく。
  assert.notEqual(unescape('C:\\Users\\x\\.claude\\bearing-statusline.mjs'), 'C:\\Users\\x\\.claude\\bearing-statusline.mjs')
})

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
