// 置かれた skill の刻印 —— 版と指紋を、`SKILL.md` の frontmatter に 1 行で運ぶ。
//
// 🔴 **ここで最も重要なのは round-trip である**（刻む → 外す → 原文と byte 一致）。⚠ **実装中に
// 実際に踏んだ**（2026-09-07）: `split('\n')` は末尾改行を最後の空要素として既に運んでいるのに、
// 書き戻しが改めて足しており、**刻むたびに file の末尾が 1 行ずつ伸びていた。** ⚠ **この repo は
// 2026-09-05 に `with-aim` で同じ轍を踏んでおり**（`docs/aims/bearing.md`）、**そのとき捕まえたのも
// round-trip の試験だけだった** —— 置く側だけを見る試験では出ない。
//
// ⚠ **今回それを捕まえたのは、round-trip ではなく別の試験である**（「刻印を除けば正本と byte
// 同一」）—— **round-trip を先に書いていれば、書いた直後に鳴っていた。**

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  STAMP_KEY, renderStamp, parseStamp, stripStamp, withStamp, skillSha,
} from '../../../carriers/claude/bearing/lib/placed-skill.mjs'

const DOC = '---\nname: aim\ndescription: 目的の木\n---\n\n# aim\n\n本文。\n'
const NO_FM = '# aim-authoring\n\nfrontmatter を持たない 1 枚。\n'

test('刻んで外せば原文へ byte 単位で戻る —— 末尾が伸びない', () => {
  const stamped = withStamp(DOC, renderStamp('1.2.3', { 'SKILL.md': 'abc' }))
  assert.notEqual(stamped, DOC)
  assert.equal(stripStamp(stamped), DOC)
})

test('2 度刻んでも 1 行しか増えない —— 置き換えであって追加ではない', () => {
  const once = withStamp(DOC, renderStamp('1.2.3', { 'SKILL.md': 'abc' }))
  const twice = withStamp(once, renderStamp('9.9.9', { 'SKILL.md': 'zzz' }))
  assert.equal(twice.split('\n').length, once.split('\n').length)
  assert.equal(parseStamp(twice).version, '9.9.9')
  assert.equal(stripStamp(twice), DOC)
})

test('刻印は frontmatter の中に在る —— 本文には出ない', () => {
  const stamped = withStamp(DOC, renderStamp('1.2.3', { 'SKILL.md': 'abc' }))
  const [, frontmatter, body] = stamped.split('---\n')
  assert.match(frontmatter, new RegExp(`^${STAMP_KEY}:|\\n${STAMP_KEY}:`))
  assert.doesNotMatch(body, new RegExp(STAMP_KEY))
})

test('刻印は 3 枚ぶんの指紋を運ぶ', () => {
  const shas = { 'SKILL.md': 'aaaa', 'aim-authoring.md': 'bbbb', 'aim-facts.md': 'cccc' }
  const got = parseStamp(withStamp(DOC, renderStamp('0.23.0', shas)))
  assert.equal(got.version, '0.23.0')
  assert.deepEqual(got.shas, shas)
})

test('刻印が無ければ null —— 「無い」と「壊れている」を畳まない', () => {
  assert.equal(parseStamp(DOC), null)
  assert.equal(parseStamp(NO_FM), null)
  // ⚠ **版を名乗らない値は刻印ではない。**
  assert.equal(parseStamp(`---\nname: aim\n${STAMP_KEY}: 壊れている\n---\n\n# aim\n`), null)
})

test('壊れた対は捨てるが、版は返す —— 壊れた刻印は刻印の不在ではない', () => {
  const got = parseStamp(`---\nname: aim\n${STAMP_KEY}: v0.23.0 SKILL.md=aaaa ごみ\n---\n\n# aim\n`)
  assert.equal(got.version, '0.23.0')
  assert.deepEqual(got.shas, { 'SKILL.md': 'aaaa' })
})

test('frontmatter を持たない file には刻まない —— 読まれ方を変えてしまう', () => {
  assert.equal(withStamp(NO_FM, renderStamp('1.0.0', {})), NO_FM)
  assert.equal(stripStamp(NO_FM), NO_FM)
})

test('本文中の `---` を frontmatter の終わりと読まない', () => {
  // ⚠ **1 行目が `---` でなければ frontmatter は無い** —— 区切り線を header と読めば、
  // **他人の doc の途中へ我々の 1 行が刺さる。**
  const ruler = '# aim\n\n---\n\n本文。\n'
  assert.equal(withStamp(ruler, renderStamp('1.0.0', {})), ruler)
  assert.equal(parseStamp(ruler), null)
})

test('指紋は改行を正規化してから採る —— CRLF の checkout を「違い」にしない', () => {
  assert.equal(skillSha(DOC), skillSha(DOC.replace(/\n/g, '\r\n')))
})
