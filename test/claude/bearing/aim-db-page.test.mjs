// aim の記録から人間向けのページを作る道具の test。
//
// ⚠ **固定するのは 3 つである**: 記録がそのまま埋め込まれること・本文の `</script>` でページが
// 壊れないこと・形の崩れた記録を写さずに止まること。見た目は固定しない。
//
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', 'scripts', 'aim-db-page.mjs')
const present = await access(SCRIPT).then(() => true, () => false)
const load = () => import(pathToFileURL(SCRIPT).href)
const SKIP = 'scripts/ が無い —— cache から走っている'

/** ページから、埋め込んだ記録を取り出す。 */
function embedded(html) {
  const m = html.match(/<script type="application\/json" id="aim-db">([\s\S]*?)<\/script>/)
  assert.ok(m, '埋め込んだ記録が見つからない')
  return JSON.parse(m[1])
}

async function store(t, decisions) {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-db-page-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const put = async (c, id, body) => {
    await mkdir(path.join(root, 'docs', 'aim-db', c), { recursive: true })
    await writeFile(path.join(root, 'docs', 'aim-db', c, `${id}.json`), JSON.stringify(body))
  }
  await put('nodes', 'n', { aim: '目的', parent: null, state: 'open' })
  await put('features', 'f', { frame: 'whole', label: '目的と範囲' })
  await put('categories', 'c', { label: '話題' })
  for (const [id, d] of Object.entries(decisions)) await put('decisions', id, d)
  return root
}
const decision = (quote) => ({ node: 'n', form: 'verbatim', quote, summary: 's', category: 'c', feature: 'f', date: '2026-10-29' })

test('記録をそのまま埋め込み、写した時刻を持たせる', async (t) => {
  if (!present) return t.skip(SKIP)
  const { buildPage } = await load()
  const root = await store(t, { 'n-d01': decision('A でいきましょう') })
  const out = path.join(root, 'page.html')
  await buildPage(out, root, { now: new Date('2026-10-29T00:00:00Z') })
  const html = await readFile(out, 'utf8')
  const data = embedded(html)
  assert.deepEqual(data.decisions.map((d) => [d.id, d.quote]), [['n-d01', 'A でいきましょう']])
  assert.equal(data.nodes[0].aim, '目的')
  assert.match(data.generatedAt, /2026/)
  assert.doesNotMatch(html, /__AIM_DB_DATA__/)
})

test('🔴 本文に </script> が在っても、埋め込みが途中で切れない', async (t) => {
  if (!present) return t.skip(SKIP)
  const { renderPage } = await load()
  const tpl = '<script type="application/json" id="aim-db">__AIM_DB_DATA__</script><p>後ろ</p>'
  const html = renderPage(tpl, { decisions: [{ id: 'x', quote: '</script><b>$& $1</b>' }] }, { generatedAt: 't' })
  assert.equal(embedded(html).decisions[0].quote, '</script><b>$& $1</b>')
  assert.match(html, /<p>後ろ<\/p>$/)
})

test('形の崩れた記録は写さずに止まる', async (t) => {
  if (!present) return t.skip(SKIP)
  const { buildPage } = await load()
  const root = await store(t, { 'n-d01': { ...decision('x'), node: 'ghost' } })
  const out = path.join(root, 'page.html')
  await assert.rejects(buildPage(out, root, {}), /未定義の node ghost/)
  await assert.rejects(access(out), '止まったのにページを書いた')
})

test('この repo の記録からページを作れる（陽性対照）', async (t) => {
  if (!present) return t.skip(SKIP)
  const { buildPage } = await load()
  const dir = await mkdtemp(path.join(tmpdir(), 'aim-db-page-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const out = path.join(dir, 'page.html')
  const repo = path.join(import.meta.dirname, '..', '..', '..')
  const { counts } = await buildPage(out, repo)
  assert.ok(counts.decisions > 0)
  assert.equal(embedded(await readFile(out, 'utf8')).decisions.length, counts.decisions)
})
