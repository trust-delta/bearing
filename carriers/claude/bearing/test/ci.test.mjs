// CI を CLI 側へ運ぶ —— 採るのは外、面は読むだけ。
//
// 🔴 **固定するのは「面が `gh` を起こさない」ことと、「古い緑を緑と描かない」ことである。**
// 前者は面が debounce で殺される事実から、後者は「いつのものか分からない成功」が
// [[ambient-display]] の拒む畳み方の時間軸版だから。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ciSegment, probeCi } from '../lib/ci.mjs'
import { widthUnsafeChars } from '../bin/statusline.mjs'

const at = (iso) => ({ branch: 'main', probedAt: iso, state: 'completed', conclusion: 'success', reason: null })
const NOW = new Date('2026-09-06T12:00:00Z')

test('通過 / 失敗 / 実行中 / 未実行 を畳まない', () => {
  const base = { branch: 'main', probedAt: NOW.toISOString(), reason: null }
  assert.deepEqual(ciSegment({ ...base, state: 'completed', conclusion: 'success' }, 'main', NOW),
    { text: 'CI 通過', tone: 'ok' })
  assert.equal(ciSegment({ ...base, state: 'completed', conclusion: 'failure' }, 'main', NOW).tone, 'bad')
  assert.equal(ciSegment({ ...base, state: 'in_progress', conclusion: null }, 'main', NOW).tone, 'wait')
  // ⚠ run が 0 本なのは「まだ走っていない」であって「緑」ではない。
  assert.equal(ciSegment({ ...base, state: 'none', conclusion: null }, 'main', NOW).text, 'CI 無し')
})

test('採れなかった理由が在れば、結論として描かない', () => {
  const c = { branch: 'main', probedAt: NOW.toISOString(), state: 'unknown', conclusion: null, reason: '`gh` が無い' }
  assert.equal(ciSegment(c, 'main', NOW).text, 'CI 不明')
})

test('古い緑は緑ではない —— 古さのほうを述べる', () => {
  const old = at(new Date(NOW.getTime() - 31 * 60 * 1000).toISOString())
  assert.deepEqual(ciSegment(old, 'main', NOW), { text: 'CI 古い', tone: 'unknown' })
  // 陽性対照: 新しければ結論を述べる。
  assert.equal(ciSegment(at(NOW.toISOString()), 'main', NOW).text, 'CI 通過')
  // 時刻が読めないものも「古い」側へ倒す —— 分からないものを緑にしない。
  assert.equal(ciSegment({ ...at('壊れた時刻') }, 'main', NOW).tone, 'unknown')
})

test('branch が違えば描かない —— 他の branch の緑を今の緑として見せない', () => {
  assert.equal(ciSegment(at(NOW.toISOString()), 'feature/x', NOW), null)
  assert.equal(ciSegment(null, 'main', NOW), null)
})

test('CI の語はすべて幅が確定した文字である', () => {
  const base = { branch: 'main', probedAt: NOW.toISOString(), reason: null }
  const texts = [
    ciSegment({ ...base, state: 'completed', conclusion: 'success' }, 'main', NOW),
    ciSegment({ ...base, state: 'completed', conclusion: 'failure' }, 'main', NOW),
    ciSegment({ ...base, state: 'queued' }, 'main', NOW),
    ciSegment({ ...base, state: 'none' }, 'main', NOW),
    ciSegment({ ...base, state: 'x', reason: 'y' }, 'main', NOW),
    ciSegment(at('壊れた時刻'), 'main', NOW),
  ]
  for (const t of texts) assert.deepEqual(widthUnsafeChars(t.text), [], t.text)
})

test('`gh` の不在を「CI が無い」に畳まない —— 道具の不在は別の事実である', async () => {
  const enoent = Object.assign(new Error('x'), { code: 'ENOENT' })
  const r = await probeCi('/tmp', 'main', { run: () => Promise.reject(enoent) })
  assert.equal(r.state, 'unknown')
  assert.match(r.reason, /`gh` が無い/)
})

test('branch が読めなければ、そう述べて `gh` を呼ばない', async () => {
  let called = false
  const r = await probeCi('/tmp', null, { run: () => ((called = true), Promise.resolve({ stdout: '[]' })) })
  assert.equal(called, false)
  assert.match(r.reason, /branch を読めない/)
})

test('面は gh を起こさない —— statusline は lib/ci.mjs の read 側しか import しない', async () => {
  const src = await readFile(path.join(import.meta.dirname, '..', 'bin', 'statusline.mjs'), 'utf8')
  assert.match(src, /import \{ ciSegment, readCi \} from '\.\.\/lib\/ci\.mjs'/)
  // ⚠ **`probeCi` / `writeCi` が面へ入り込めば、debounce で殺される場所から `gh` が起きる。**
  assert.doesNotMatch(src, /\bprobeCi\b/)
  assert.doesNotMatch(src, /\bwriteCi\b/)
})
