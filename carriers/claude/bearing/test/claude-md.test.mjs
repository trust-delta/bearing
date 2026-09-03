// `CLAUDE.md` へ差し込む法の block —— 置き、置き直し、外す。
//
// ⚠ **ここで守っているのは「他人の file を壊さない」である。** この機構が触るのは我々の
// artifact ではなく、**人間が書いた `CLAUDE.md`** である ∴ 疑わしい場面はすべて「触らない」へ
// 倒れねばならず、その分岐こそが試験の対象である。
//
// ⚠ **`renderLaw` を実物の `frame.md` に当てる試験を置いてある。** 変換は 2 つの前提
// （canon への link が 1 つ・見出しが在る）に依っており、**前提が崩れたまま生成すれば、
// 他人の repo に解決しない link を配ることになる** —— それを CI で落とす。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  MARKER, bodySha, detectEol, findBlocks, inspect, planApply, planRemove, renderBlock, renderLaw,
} from '../lib/claude-md.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const CR = String.fromCharCode(13)
const frameText = await readFile(path.join(ROOT, 'skills', 'aim', 'frame.md'), 'utf8')
const LAW = renderLaw(frameText)
const V = '1.2.3'
const desired = { version: V, law: LAW }

const block = (version = V, law = LAW) => renderBlock(version, law)

// ── renderLaw ───────────────────────────────────────────────────────────────

test('実物の frame から法を組み立てられる —— 変換の前提が崩れていない', () => {
  assert.ok(LAW.length > 0)
})

test('canon への link は、消費者の repo で解決しない形のまま配られない', () => {
  assert.ok(!LAW.includes(']('), 'markdown の link が残っている')
  assert.ok(LAW.includes('`docs/aims/_guide/aim-authoring.md`'))
  assert.ok(LAW.includes('`aim` skill が同梱する複製'), 'canon が無い repo 向けの逃げ道が要る')
})

test('全角の閉じ括弧の直後に半角空白を残さない', () => {
  assert.ok(!LAW.includes('）　') && !LAW.includes('） '), '差し込んだ行だけが組版を外す')
})

test('他人の CLAUDE.md の中で H1 を名乗らない', () => {
  const h1 = LAW.split('\n').filter((l) => /^# \S/.test(l))
  assert.deepEqual(h1, [], `H1 が残っている: ${h1.join(' / ')}`)
  assert.ok(LAW.split('\n').some((l) => /^## \S/.test(l)), '見出しが 1 つも無い')
})

test('条件文は落とさない —— 採用は corpus の存在を意味しない', () => {
  assert.ok(LAW.includes('aim corpus を持つなら'))
})

test('前提が崩れたら黙って no-op にせず throw する', () => {
  assert.throws(() => renderLaw('# 見出しだけで link が無い\n\n本文\n'), /link が 0 個/)
  assert.throws(
    () => renderLaw('見出しが無い [`docs/aims/_guide/aim-authoring.md`](aim-authoring.md) 本文\n'),
    /見出しが無い/,
  )
})

// ── sha ─────────────────────────────────────────────────────────────────────

test('sha は改行の違いで動かない —— git の変換を「人間が手を入れた」と読まない', () => {
  const lf = 'a\nb\nc'
  assert.equal(bodySha(lf), bodySha(lf.split('\n').join(CR + '\n')))
})

test('sha は末尾の空白で動かない', () => {
  assert.equal(bodySha('a\nb'), bodySha('a\nb\n\n'))
})

test('本文が 1 文字でも違えば sha は動く', () => {
  assert.notEqual(bodySha('a\nb'), bodySha('a\nB'))
})

// ── marker の形 ─────────────────────────────────────────────────────────────

test('marker は独立行に置かれる —— block-level でなければ context から除かれない', () => {
  const lines = block().split('\n')
  assert.match(lines[0], /^<!-- bearing:aim v1\.2\.3 sha=[0-9a-f]{16} -->$/)
  assert.equal(lines.at(-1), `<!-- /${MARKER} -->`)
})

test('marker の sha は、その block の本文の sha である', () => {
  const [begin] = block().split('\n')
  assert.equal(begin.match(/sha=([0-9a-f]{16})/)[1], bodySha(LAW))
})

// ── findBlocks ──────────────────────────────────────────────────────────────

test('fenced block の中の marker は引用であって主張ではない', () => {
  const doc = ['# doc', '', '```markdown', block(), '```', ''].join('\n')
  const { blocks, anomalies } = findBlocks(doc)
  assert.deepEqual(blocks, [])
  assert.deepEqual(anomalies, [])
})

test('片方だけの marker は「無い」に畳まれず anomaly になる', () => {
  const openOnly = findBlocks(`# doc\n\n<!-- ${MARKER} v1 sha=${'0'.repeat(16)} -->\n本文\n`)
  assert.equal(openOnly.anomalies.length, 1)
  assert.match(openOnly.anomalies[0], /閉じられていない/)

  const closeOnly = findBlocks(`# doc\n\n<!-- /${MARKER} -->\n`)
  assert.equal(closeOnly.anomalies.length, 1)
  assert.match(closeOnly.anomalies[0], /閉じ marker だけ/)
})

test('読めない marker は「無い」ではなく anomaly になる', () => {
  const { blocks, anomalies } = findBlocks(`# doc\n\n<!-- ${MARKER} -->\n本文\n<!-- /${MARKER} -->\n`)
  assert.deepEqual(blocks, [])
  // ⚠ **開始が読めなければ、その閉じ marker も宙に浮く** —— 2 つとも名指すのが正しい。
  // どちらか 1 つに畳めば、読み手は残った側だけを直して「まだ壊れている」に戻る。
  assert.ok(anomalies.some((a) => /読めない/.test(a)))
  assert.ok(anomalies.some((a) => /閉じ marker だけ/.test(a)))
})

test('block が 2 組あれば anomaly になる —— 次の apply が 3 つ目を足さないため', () => {
  const { anomalies } = findBlocks(`${block()}\n\n${block()}\n`)
  assert.ok(anomalies.some((a) => /2 組/.test(a)))
})

// ── planApply ───────────────────────────────────────────────────────────────

test('block が無ければ末尾へ置く —— 人間の最後の行にくっつけない', () => {
  const src = '# My Project\n\n既存の指示。\n'
  const plan = planApply(src, desired)
  assert.equal(plan.action, 'create')
  assert.ok(plan.text.startsWith(src.trimEnd()))
  assert.ok(plan.text.includes(`\n\n<!-- ${MARKER} v${V}`), '前に空行がちょうど 1 つ')
  assert.ok(plan.text.endsWith('\n'))
})

test('CLAUDE.md が無くても置ける', () => {
  const plan = planApply('', desired)
  assert.equal(plan.action, 'create')
  assert.ok(plan.text.startsWith(`<!-- ${MARKER} `))
})

test('CRLF の file は CRLF のまま書き戻す', () => {
  const src = ['# My Project', '', '既存の指示。', ''].join(CR + '\n')
  const plan = planApply(src, desired)
  assert.ok(plan.text.includes(CR + '\n'))
  assert.ok(!/[^\r]\n/.test(plan.text), 'LF が混ざっている')
})

test('二度目は何も変えない（冪等）', () => {
  const once = planApply('# doc\n\n本文\n', desired).text
  assert.equal(planApply(once, desired).action, 'unchanged')
})

test('版が違えば置き直す —— 末尾に 2 つ目を足さない', () => {
  const old = planApply('# doc\n\n本文\n', { version: '0.0.1', law: LAW }).text
  const plan = planApply(old, desired)
  assert.equal(plan.action, 'update')
  assert.equal(findBlocks(plan.text).blocks.length, 1)
  assert.ok(plan.text.includes(`v${V}`))
  assert.ok(!plan.text.includes('v0.0.1'))
})

test('人間が block の中を編集していたら置き直さない', () => {
  const placed = planApply('# doc\n\n本文\n', desired).text
  const edited = placed.replace('迷ったら', 'ただし当 repo では別。迷ったら')
  const plan = planApply(edited, desired)
  assert.equal(plan.action, 'refuse')
  assert.match(plan.reason, /人間が手を入れている/)
  assert.equal(plan.text, undefined, '拒んだ計画は書き換え後の text を持たない')
})

test('marker が壊れていれば触らない', () => {
  const plan = planApply(`# doc\n\n<!-- ${MARKER} v1 sha=${'0'.repeat(16)} -->\n本文\n`, desired)
  assert.equal(plan.action, 'refuse')
  assert.equal(plan.text, undefined)
})

// ── planRemove ──────────────────────────────────────────────────────────────

test('外すと元に戻る —— 置いた空行も一緒に外す', () => {
  const src = '# My Project\n\n既存の指示。\n'
  const placed = planApply(src, desired).text
  const plan = planRemove(placed)
  assert.equal(plan.action, 'remove')
  assert.equal(plan.text, src)
})

test('置かれていなければ、外すことは失敗ではない', () => {
  assert.equal(planRemove('# doc\n').action, 'absent')
})

test('人間が編集した block は消さない —— 消えるのはその編集だから', () => {
  const placed = planApply('# doc\n\n本文\n', desired).text
  const plan = planRemove(placed.replace('迷ったら', 'X 迷ったら'))
  assert.equal(plan.action, 'refuse')
  assert.equal(plan.text, undefined)
})

// ── inspect ─────────────────────────────────────────────────────────────────

test('inspect は 5 つの状態を畳まずに分ける', () => {
  const placed = planApply('# doc\n\n本文\n', desired).text
  assert.equal(inspect('# doc\n', desired).state, 'absent')
  assert.equal(inspect(placed, desired).state, 'current')
  assert.equal(inspect(placed, { version: '9.9.9', law: LAW }).state, 'stale')
  assert.equal(inspect(placed.replace('迷ったら', 'X 迷ったら'), desired).state, 'edited')
  assert.equal(inspect(`<!-- ${MARKER} v1 sha=${'0'.repeat(16)} -->\n`, desired).state, 'broken')
})

test('古い block は版を名指せる —— 「違う」だけでは置き直す根拠にならない', () => {
  const old = planApply('# doc\n', { version: '0.0.1', law: LAW }).text
  const s = inspect(old, desired)
  assert.equal(s.state, 'stale')
  assert.equal(s.version, '0.0.1')
  assert.match(s.detail, /v0\.0\.1/)
})

// ── detectEol ───────────────────────────────────────────────────────────────

test('1 つでも CRLF が在れば CRLF とみなす', () => {
  assert.equal(detectEol('a\nb' + CR + '\nc'), CR + '\n')
  assert.equal(detectEol('a\nb\nc'), '\n')
})
