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
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  MARKER, AIMS_PLACEHOLDER, bodySha, declaredAimsDir, detectEol, findBlocks, inspect, planApply,
  planRemove, renderBlock, renderLaw, substituteAims,
  readAdopted,
} from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR, normalizeAimsDir } from '../lib/corpus.mjs'

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
  const P = AIMS_PLACEHOLDER
  assert.throws(() => renderLaw('# 見出しだけで link が無い\n\n本文\n'), /link が 0 個/)
  assert.throws(
    () => renderLaw(`見出しが無い [\`${P}/_guide/aim-authoring.md\`](aim-authoring.md) 本文\n`),
    /見出しが無い/,
  )
})

test('placeholder の埋め残しは throw する —— 存在しない path を正本として配らない', () => {
  assert.throws(() => substituteAims(`本文 ${AIMS_PLACEHOLDER}/x と {{other}}`, 'aims'), /placeholder/)
  assert.equal(substituteAims(`${AIMS_PLACEHOLDER}/x`, 'aims'), 'aims/x')
})

test('法の本文は、宣言された在り処を名乗る', () => {
  const law = renderLaw(frameText, 'proj/aims')
  assert.ok(law.includes('`proj/aims/_guide/aim-authoring.md`'))
  assert.ok(law.includes('proj/aims/<slug>.md'))
  assert.ok(!law.includes('docs/aims'), '既定が残っている')
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
  assert.match(lines[0], /^<!-- bearing:aim v1\.2\.3 dir=docs\/aims sha=[0-9a-f]{16} -->$/)
  assert.equal(lines.at(-1), `<!-- /${MARKER} -->`)
})

test('書き出しは dir を省略しない —— 既定であっても', () => {
  // ⚠ **読み取りは省略を許し、書き出しは省略しない。** file を開いた人間が、どこを見て
  // いるかを知るために既定を覚えている必要は無い。
  assert.ok(renderBlock('1.0.0', LAW, DEFAULT_AIMS_DIR).includes(`dir=${DEFAULT_AIMS_DIR}`))
})

test('dir= を持たない古い block も読める —— 前方互換', () => {
  const body = LAW
  const old = `<!-- ${MARKER} v0.9.0 sha=${bodySha(body)} -->\n${body}\n<!-- /${MARKER} -->\n`
  const { blocks, anomalies } = findBlocks(old)
  assert.deepEqual(anomalies, [])
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].dir, DEFAULT_AIMS_DIR, '省略は既定を意味する')
})

test('扱えない dir= は「無い」ではなく anomaly になる', () => {
  // ⚠ **既定へ落とせば、誤った宣言が既定として黙って動く** —— 人間は自分の宣言が効いて
  // いると信じ続ける。
  for (const bad of ['/abs', '../up', 'a*b', 'C:/x']) {
    const doc = `<!-- ${MARKER} v1 dir=${bad} sha=${bodySha(LAW)} -->\n${LAW}\n<!-- /${MARKER} -->\n`
    const { blocks, anomalies } = findBlocks(doc)
    assert.deepEqual(blocks, [], `${bad} が block として読まれた`)
    assert.ok(anomalies.some((a) => /読めない/.test(a)), `${bad} が anomaly にならない`)
  }
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

// ── 在り処の宣言 ────────────────────────────────────────────────────────────

test('normalizeAimsDir は、pathspec として渡せないものを拒む', () => {
  // ⚠ **5 箇所がこの値を git の pathspec として渡す** ∴ 緩めることは走査が黙って
  // 広がることを許すのと同じである。
  assert.equal(normalizeAimsDir('docs/aims'), 'docs/aims')
  assert.equal(normalizeAimsDir('docs/aims/'), 'docs/aims', '末尾の / は落とす')
  // ⚠ 先頭の / は「repo root から」とも「絶対 path」とも読める ∴ 落とさず拒む。
  assert.equal(normalizeAimsDir('/docs/aims'), null, '先頭の / は曖昧 ∴ 拒む')
  assert.equal(normalizeAimsDir('docs' + String.fromCharCode(92) + 'aims'), 'docs/aims', 'backslash は / に倒す')
  // ⚠ 先頭が separator なら、win32 の絶対形でも拒む —— 上と同じ曖昧さである。
  assert.equal(normalizeAimsDir(String.fromCharCode(92) + 'aims'), null)
  for (const bad of ['', '   ', '..', 'a/../b', 'C:/x', 'a*b', 'a?b', 'a[b]', ':x', 42, null]) {
    assert.equal(normalizeAimsDir(bad), null, `${bad} を通してしまった`)
  }
})

test('declaredAimsDir は「宣言が無い」と「宣言が壊れている」を分ける', () => {
  assert.deepEqual(declaredAimsDir('# doc\n'), { dir: null, declared: false, reason: null })

  const placed = planApply('# doc\n', { version: V, law: renderLaw(frameText, 'aims'), dir: 'aims' }).text
  assert.deepEqual(declaredAimsDir(placed), { dir: 'aims', declared: true, reason: null })

  const broken = declaredAimsDir(`<!-- ${MARKER} v1 dir=../up sha=${bodySha(LAW)} -->\n`)
  assert.equal(broken.declared, false)
  assert.ok(broken.reason, '壊れているのに reason が無い')
})

test('在り処が動いたことは、版が古いこととは別の言葉で述べられる', () => {
  // ⚠ 「古い」とだけ言えば、人間は plugin を更新して直らない理由を探すことになる。
  const desiredA = { version: V, law: renderLaw(frameText, 'aims'), dir: 'aims' }
  const placed = planApply('# doc\n', desiredA).text
  const s = inspect(placed, desired)
  assert.equal(s.state, 'stale')
  assert.match(s.detail, /宣言された在り処/)
  assert.doesNotMatch(s.detail, /今の版/)
})

test('在り処を変えると block は置き直され、末尾に 2 つ目が増えない', () => {
  const placed = planApply('# doc\n', desired).text
  const moved = planApply(placed, { version: V, law: renderLaw(frameText, 'aims'), dir: 'aims' })
  assert.equal(moved.action, 'update')
  assert.match(moved.reason, /在り処を docs\/aims から aims へ/)
  assert.equal(findBlocks(moved.text).blocks.length, 1)
  assert.equal(declaredAimsDir(moved.text).dir, 'aims')
})

test('dir= だけを手で書き換えても「人間が本文を編集した」にはならない', () => {
  // ⚠ **本文の sha は本文だけを見る** ∴ 宣言の変更は編集の検出を汚さない。宣言を正として
  // 本文を追従させるのが正しい —— block の本文は我々のものであって人間の散文ではない。
  const placed = planApply('# doc\n', desired).text
  const edited = placed.replace('dir=docs/aims', 'dir=aims')
  assert.notEqual(inspect(edited, desired).state, 'edited')
  const plan = planApply(edited, { version: V, law: renderLaw(frameText, 'aims'), dir: 'aims' })
  assert.equal(plan.action, 'update')
})

test('readAdopted —— CLAUDE.md が無ければ採っていない', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-adopt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  assert.equal(await readAdopted(dir), false)
})

test('readAdopted —— 法の block が在れば採っている', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-adopt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(path.join(dir, 'CLAUDE.md'), '# p\n\n' + renderBlock('1.0.0', '法', DEFAULT_AIMS_DIR))
  assert.equal(await readAdopted(dir), true)
})

test('readAdopted —— block が壊れていても「採っていない」ではない', async (t) => {
  // ⚠ **採用の事実そのものは立っている** ∴ ここで false を返せば、採った project が block を
  // 壊した瞬間に面ごと消える —— **直すべきときに黙る**形である。
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-adopt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const block = renderBlock('1.0.0', '法', DEFAULT_AIMS_DIR)
  const opened = block.slice(0, block.lastIndexOf('<!--'))
  await writeFile(path.join(dir, 'CLAUDE.md'), '# p\n\n' + opened)
  assert.equal(await readAdopted(dir), true)
})

test('readAdopted —— 無関係な CLAUDE.md は採っていない', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-adopt-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(path.join(dir, 'CLAUDE.md'), '# project\n\nふつうの指示だけが在る。\n')
  assert.equal(await readAdopted(dir), false)
})
