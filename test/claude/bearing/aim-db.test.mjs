// aim の記録（人間の決定とエージェントの解釈）を読み、形を検める lib の test。
//
// ⚠ **この repo の本物の記録が形を通ることも、ここで固定する** —— 記録を壊す commit を CI で止める。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  COLLECTIONS, formatRecord, readStore, renderAimDbSection, summarizeStore, validateStore,
} from '../../../carriers/claude/bearing/lib/aim-db.mjs'

const REPO = path.join(import.meta.dirname, '..', '..', '..')

/** 形の整った最小の記録の一揃い。 */
const good = () => ({
  nodes: [{ id: 'n', aim: 'x' }],
  features: [{ id: 'f', frame: 'whole', label: '目的' }],
  categories: [{ id: 'c', label: '話題' }],
  decisions: [{ id: 'n-d01', node: 'n', form: 'verbatim', quote: 'こうしましょう', summary: 's', category: 'c', feature: 'f' }],
  interpretations: [{ id: 'n-i01', node: 'n', text: 't', basis: ['n-d01'], feature: 'f' }],
  questions: [{ id: 'n-q01', node: 'n', text: 'どちらにするか', status: 'answered', answeredBy: ['n-d01'], feature: 'f' }],
})

test('formatRecord は key を並べ直し、id を本文から落とす —— 書き手ごとに差分が出ない', () => {
  const a = formatRecord({ id: 'x', z: 1, a: { d: 1, c: 2 } })
  const b = formatRecord({ a: { c: 2, d: 1 }, z: 1, id: 'x' })
  assert.equal(a, b)
  assert.doesNotMatch(a, /"id"/)
  assert.ok(a.endsWith('\n'))
})

test('形の整った記録は問題を返さない（陽性対照）', () => {
  assert.deepEqual(validateStore(good()), [])
})

test('形の崩れを名指す —— 未定義の参照、言い換えの quote、逐語の quote 欠け、不正な id', () => {
  const s = good()
  s.decisions.push({ id: 'n-d02', node: 'ghost', form: 'paraphrase', quote: '言い換えなのに引用', summary: 's' })
  s.decisions.push({ id: 'n-d03', node: 'n', form: 'verbatim', summary: 's' })
  s.interpretations.push({ id: 'n-i02', node: 'n', text: 't', basis: ['n-d99'] })
  s.features.push({ id: '../up', frame: 'nowhere', label: 'x' })
  s.questions.push({ id: 'n-q02', node: 'n', text: 'q', status: 'answered' })
  s.questions.push({ id: 'n-q03', node: 'n', text: 'q', status: 'pending', answeredBy: ['n-d77'] })
  const p = validateStore(s).join('\n')
  assert.match(p, /n-d02: 未定義の node ghost/)
  assert.match(p, /n-d02: 言い換えが quote を持つ/)
  assert.match(p, /n-d03: verbatim なのに quote が無い/)
  assert.match(p, /n-i02: 実在しない決定を名指す n-d99/)
  assert.match(p, /features\/\.\.\/up: id の形が不正/)
  assert.match(p, /未定義の枠 nowhere/)
  assert.match(p, /n-q02: answered なのに答えの決定を名指さない/)
  assert.match(p, /n-q03: 未定義の status pending/)
  assert.match(p, /n-q03: 実在しない決定を名指す n-d77/)
})

test('readStore は、在り処が無いことと読めない file を分けて返す', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const none = await readStore(root)
  assert.equal(none.present, false)
  await mkdir(path.join(root, 'docs', 'aim-db', 'decisions'), { recursive: true })
  await writeFile(path.join(root, 'docs', 'aim-db', 'decisions', 'ok.json'), '{"summary":"s"}')
  await writeFile(path.join(root, 'docs', 'aim-db', 'decisions', 'broken.json'), '{')
  const r = await readStore(root)
  assert.equal(r.present, true)
  assert.deepEqual(r.store.decisions.map((x) => x.id), ['ok'])
  assert.equal(r.unreadable.length, 1)
  assert.match(r.unreadable[0], /broken\.json/)
})

test('この repo の記録は読めて、形が整っている', async () => {
  const r = await readStore(REPO)
  assert.equal(r.present, true, 'docs/aim-db が無い —— 測っていない')
  assert.deepEqual(r.unreadable, [])
  // 陽性対照: 0 件どうしの「問題なし」は検査ではない。
  for (const c of COLLECTIONS) assert.ok(r.store[c].length > 0, `${c} が 0 件`)
  assert.deepEqual(validateStore(r.store), [])
})

// ── セッション開始時の要約 ───────────────────────────────────────────────────

test('要約の「今の解釈」は、撤回した目的と置き換えられた解釈を除く —— 決定は除かない', () => {
  const s = good()
  s.nodes.push({ id: 'gone', aim: 'y', state: 'dead' })
  s.decisions.push({ id: 'gone-d01', node: 'gone', form: 'paraphrase', summary: 's', feature: 'f', date: '2026-10-01' })
  s.interpretations.push({ id: 'gone-i01', node: 'gone', text: 't', basis: [], feature: 'f' })
  s.interpretations.push({ id: 'n-i02', node: 'n', text: 't', basis: [], feature: 'f', status: 'superseded' })
  s.interpretations.push({ id: 'n-i03', node: 'n', text: 't', basis: [], feature: 'f' })
  const f = summarizeStore(s).features.find((x) => x.id === 'f')
  assert.equal(f.decisions, 2, '撤回した目的についての決定も、人間がそう決めた事実である')
  assert.equal(f.current, 2, '今の解釈は n-i01 と n-i03 だけ')
  assert.equal(f.choices, 1, 'どの決定にも依らない今の解釈は n-i03 だけ')
})

test('直近の決定は日付の新しい順で、日付の無い決定は入れない', () => {
  const s = good()
  s.decisions[0].date = '2026-10-01'
  s.decisions.push({ id: 'n-d02', node: 'n', form: 'paraphrase', summary: '新しい', feature: 'f', date: '2026-10-29' })
  s.decisions.push({ id: 'n-d03', node: 'n', form: 'paraphrase', summary: '日付なし', feature: 'f' })
  assert.deepEqual(summarizeStore(s).latest.map((d) => d.id), ['n-d02', 'n-d01'])
})

test('描いた節は、読めない記録と形の崩れを要約より先に述べる', () => {
  const text = renderAimDbSection(summarizeStore(good()), { problems: ['decisions/x: 未定義の node y'], unreadable: ['decisions/z.json: 壊れている'] })
  assert.match(text, /^\`\`\`bearing-aim-db v1/)
  assert.ok(text.indexOf('読めない記録') < text.indexOf('whole | f |'), '要約の後ろに埋もれている')
  assert.match(text, /# ⚠ 形の崩れ: decisions\/x/)
  assert.match(text, /whole \| f \| 目的 \| 1 \| 1 \| 0/)
})

test('開いた問いは要約に全件出る —— 答え済みと、撤回した目的の問いは出ない', () => {
  const s = good()
  s.nodes.push({ id: 'gone', aim: 'y', state: 'dead' })
  s.questions.push({ id: 'n-q02', node: 'n', text: 'まだ決まっていない', status: 'open', feature: 'f' })
  s.questions.push({ id: 'gone-q01', node: 'gone', text: '撤回済み', status: 'open' })
  const sum = summarizeStore(s)
  assert.deepEqual(sum.open.map((q) => q.id), ['n-q02'])
  assert.match(renderAimDbSection(sum), /人間の判断を待っている問い（1 件）:[\s\S]*n-q02/)
})
