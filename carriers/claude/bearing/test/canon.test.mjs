// `with-aim` が canon を置き、追随させる振る舞いの test。
//
// ⚠ **ここで守っているのは 3 つである。** ⑴ **法を置いた repo に、法が指す canon が在る**
// —— 置かれた法の第 1 条は `<corpus>/_guide/aim-authoring.md` を指しており、無ければその条は
// 最初から満たせない。⑵ **我々が置いたままなら最新へ追随する** —— canon はエージェントが
// 従う法であり、古いまま黙っていること自体が drift である。⑶ **人間が直したものは踏まない。**
//
// ⚠ **⑵ と ⑶ を同時に満たすには、「我々のまま」と「人間が直した」を分ける足場が要る。**
// `CLAUDE.md` の block は marker がそれを持つが、canon の file に marker は挿せない
// （挿せば bearing 自身の正本と食い違う）∴ **足場は file の外＝ manifest に置く。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  CANON_FILES, MANIFEST, normalizeEol, classifyCanonFile, planCanon, describeCanon,
  readManifest, syncCanon,
} from '../lib/canon.mjs'
import { bodySha } from '../lib/claude-md.mjs'

const PLUGIN_ROOT = path.join(import.meta.dirname, '..')
const V = 'test'
const fresh = async () => path.join(await mkdtemp(path.join(tmpdir(), 'bearing-canon-')), 'docs', 'aims', '_guide')
const srcOf = (name) => readFile(path.join(PLUGIN_ROOT, ...CANON_FILES.find((f) => f.name === name).from), 'utf8')
const at = (guide, name) => readFile(path.join(guide, name), 'utf8')

// ── 状態の判別（純関数）──────────────────────────────────────────────────────

test('5 つの状態を分ける —— 「違う」の一語に畳まない', () => {
  const s = (o) => classifyCanonFile({ present: true, sourceSha: 'NEW', ...o })
  assert.equal(classifyCanonFile({ present: false, fileSha: null, sourceSha: 'NEW', recordedSha: null }), 'place')
  assert.equal(s({ fileSha: 'NEW', recordedSha: null }), 'current')
  assert.equal(s({ fileSha: 'OLD', recordedSha: 'OLD' }), 'stale') //   我々が置いたまま
  assert.equal(s({ fileSha: 'MINE', recordedSha: 'OLD' }), 'edited') // 置いた後に人間が直した
  assert.equal(s({ fileSha: 'OLD', recordedSha: null }), 'unknown') //  記録が無い
})

test('中身が正本と同じなら、記録が無くても `current` である', () => {
  // ⚠ **手で正しく置いた repo を「由来不明」と呼べば、正しい状態が警告を出し続ける。**
  assert.equal(classifyCanonFile({ present: true, fileSha: 'NEW', sourceSha: 'NEW', recordedSha: null }), 'current')
})

test('書くのは place と stale だけ —— edited と unknown は触らない', () => {
  const p = planCanon([
    { name: 'a', present: false, fileSha: null, sourceSha: 'N', recordedSha: null },
    { name: 'b', present: true, fileSha: 'O', sourceSha: 'N', recordedSha: 'O' },
    { name: 'c', present: true, fileSha: 'M', sourceSha: 'N', recordedSha: 'O' },
    { name: 'd', present: true, fileSha: 'O', sourceSha: 'N', recordedSha: null },
    { name: 'e', present: true, fileSha: 'N', sourceSha: 'N', recordedSha: 'N' },
  ])
  assert.deepEqual(p.write, ['a', 'b'])
  assert.deepEqual(p.edited, ['c'])
  assert.deepEqual(p.unknown, ['d'])
  assert.deepEqual(p.current, ['e'])
})

test('5 つの状態は 5 つの文で述べられる —— 畳まない', () => {
  const p = planCanon([
    { name: 'a', present: false, fileSha: null, sourceSha: 'N', recordedSha: null },
    { name: 'b', present: true, fileSha: 'O', sourceSha: 'N', recordedSha: 'O' },
    { name: 'c', present: true, fileSha: 'M', sourceSha: 'N', recordedSha: 'O' },
    { name: 'd', present: true, fileSha: 'O', sourceSha: 'N', recordedSha: null },
  ])
  const out = describeCanon(p, 'docs/aims/_guide', true).join('\n')
  assert.match(out, /置いた.*a/)
  assert.match(out, /更新した.*b/)
  assert.match(out, /人間が手を入れている.*c/)
  assert.match(out, /由来が分からない.*d/)
  // ⚠ **上書きしてよい根拠を、同じ息で述べているか。**
  assert.match(out, /置いたときのまま/)
})

test('CRLF の checkout を「違う」と呼ばない', () => {
  const lf = '---\naim: x\n---\n本文\n'
  assert.equal(normalizeEol(lf.split('\n').join('\r\n')), lf)
})

// ── 台帳 ─────────────────────────────────────────────────────────────────────

test('台帳が無いことと、壊れていることを分ける', async () => {
  const guide = await fresh()
  assert.deepEqual(await readManifest(guide), { files: {}, version: null, broken: false, present: false })
  await mkdir(guide, { recursive: true })
  await writeFile(path.join(guide, MANIFEST), '{ 壊れた JSON', 'utf8')
  const m = await readManifest(guide)
  assert.equal(m.broken, true)
  assert.equal(m.present, true)
})

// ── 実際に置く ───────────────────────────────────────────────────────────────

test('同梱の canon は、この repo の `_guide/` と byte 同一である', async () => {
  // ⚠ **ここが崩れると、置かれるのは canon ではなく、その複製の亡霊になる。**
  for (const f of CANON_FILES) {
    const bundled = await readFile(path.join(PLUGIN_ROOT, ...f.from), 'utf8')
    const source = await readFile(
      path.join(PLUGIN_ROOT, '..', '..', '..', 'docs', 'aims', '_guide', f.name), 'utf8')
    assert.equal(normalizeEol(bundled), normalizeEol(source), `${f.name} が正本と違う`)
  }
})

test('空の repo に canon が置かれ、台帳も残る', async () => {
  const guide = await fresh()
  const { plan, missing } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(missing, [])
  assert.deepEqual(plan.place, CANON_FILES.map((f) => f.name))
  for (const f of CANON_FILES) assert.equal(await at(guide, f.name), await srcOf(f.name))
  const m = await readManifest(guide)
  assert.equal(m.version, V)
  assert.equal(Object.keys(m.files).length, CANON_FILES.length)
})

test('2 度打っても何も起きない（冪等）', async () => {
  const guide = await fresh()
  await syncCanon(PLUGIN_ROOT, guide, true, V)
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(plan.write, [])
  assert.equal(plan.current.length, CANON_FILES.length)
})

test('一部だけ在るとき、在らない枚だけが置かれる', async () => {
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  await writeFile(path.join(guide, 'aim-facts.md'), await srcOf('aim-facts.md'), 'utf8')
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(plan.current, ['aim-facts.md'])
  assert.equal(plan.place.length, CANON_FILES.length - 1)
})

test('canon の集合に handoff は入らない —— aim と handoff は分かれている', () => {
  // ⚠ **ここは `with-aim` ＝ aim の opt-in が置く場所である** ∴ handoff を入れれば
  // **handoff の canon が aim の採用に依存する**（人間が 2026-09-04 に正した）。
  // ⚠ **入れる必要も無い**: handoff の skill は自分の同梱物を裸の名で指しており、
  // repo 側の `_guide/handoff.md` を 1 度も要求しない。
  assert.deepEqual(CANON_FILES.map((f) => f.name), ['aim-authoring.md', 'aim-facts.md'])
})

test('我々が置いたままの古い canon は、黙って最新へ追随する', async () => {
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  const old = '# 古い canon\n'
  await writeFile(path.join(guide, 'aim-authoring.md'), old, 'utf8')
  // 我々が置いた記録 —— この sha であることが「触られていない」の証拠である。
  await writeFile(path.join(guide, MANIFEST),
    JSON.stringify({ version: 'old', files: { 'aim-authoring.md': bodySha(old) } }), 'utf8')

  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(plan.stale, ['aim-authoring.md'])
  assert.equal(await at(guide, 'aim-authoring.md'), await srcOf('aim-authoring.md'))
})

test('置いた後に人間が直した canon は踏まない', async () => {
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  const placed = '# 我々が置いたもの\n'
  await writeFile(path.join(guide, MANIFEST),
    JSON.stringify({ version: 'old', files: { 'aim-authoring.md': bodySha(placed) } }), 'utf8')
  const mine = '# 我々が置いたもの\n\n<!-- この repo 固有の追記 -->\n'
  await writeFile(path.join(guide, 'aim-authoring.md'), mine, 'utf8')

  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(plan.edited, ['aim-authoring.md'])
  assert.equal(await at(guide, 'aim-authoring.md'), mine)
  // ⚠ **台帳に今の正本の sha を書いてはならない** —— 次の実行が「我々のまま」と読んで踏む。
  const m = await readManifest(guide)
  assert.equal(m.files['aim-authoring.md'], bodySha(placed))
})

test('台帳が無い古い canon は「由来不明」として触らない', async () => {
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  await writeFile(path.join(guide, 'aim-authoring.md'), '# どこかから来た canon\n', 'utf8')
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.deepEqual(plan.unknown, ['aim-authoring.md'])
  assert.equal(await at(guide, 'aim-authoring.md'), '# どこかから来た canon\n')
})

test('台帳が壊れているときは、記録が無いものとして扱い、上書きしない', async () => {
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  await writeFile(path.join(guide, 'aim-authoring.md'), '# 古い\n', 'utf8')
  await writeFile(path.join(guide, MANIFEST), 'これは JSON ではない', 'utf8')
  const { plan, manifest } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.equal(manifest.broken, true)
  assert.deepEqual(plan.unknown, ['aim-authoring.md'])
  assert.equal(await at(guide, 'aim-authoring.md'), '# 古い\n')
})

test('`--check` の側（write=false）は 1 byte も書かない', async () => {
  const guide = await fresh()
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, false, V)
  assert.equal(plan.place.length, CANON_FILES.length)
  await assert.rejects(() => at(guide, 'aim-authoring.md'))
  await assert.rejects(() => at(guide, MANIFEST))
})

test('CRLF で置かれた canon は `current` と読まれる', async () => {
  // ⚠ **本機は `core.autocrlf=true` である** ∴ これは仮想の形ではない。
  const guide = await fresh()
  await mkdir(guide, { recursive: true })
  for (const f of CANON_FILES) {
    await writeFile(path.join(guide, f.name), (await srcOf(f.name)).split('\n').join('\r\n'), 'utf8')
  }
  const { plan } = await syncCanon(PLUGIN_ROOT, guide, true, V)
  assert.equal(plan.current.length, CANON_FILES.length)
  assert.deepEqual(plan.write, [])
})
