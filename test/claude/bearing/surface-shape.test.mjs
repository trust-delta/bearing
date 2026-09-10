// 面（`surface/aim.html`）そのものの門。
//
// 🔴 **`node --test` は、この面の UI を 1 行も走らせない。** 契約 block は取り出して走らせて
// いるが、**画面を組む側は誰も parse していなかった** —— syntax error を入れても suite は
// 緑のまま通り、**壊れるのは人間が開いた瞬間で、しかも画面には何も出ない。**
//
// ⚠ **ここが埋めるのは「開けば動くか」ではない。** それは browser でしか答えられない ——
// ここが答えるのは **「そもそも parse できるか」と「script が名指す id が HTML に在るか」**
// の 2 つだけであり、**それ以上を主張しない。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SURFACE = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing', 'surface', 'aim.html')
const html = await readFile(SURFACE, 'utf8')
const blocks = [...html.matchAll(/<script type="module"[^>]*>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1])

test('面の script は、1 つ残らず parse できる', async (t) => {
  // 陽性対照: block が 0 個なら、測っているのは対象ではなく正規表現である。
  assert.ok(blocks.length >= 2, `script block が ${blocks.length} 個 —— 取り出せていない`)
  const dir = await mkdtemp(path.join(tmpdir(), 'surface-'))
  for (const [i, src] of blocks.entries()) {
    const f = path.join(dir, `b${i}.mjs`)
    await writeFile(f, src)
    // ⚠ `--check` は parse だけを見る —— `document` が無くても落ちない。
    execFileSync(process.execPath, ['--check', f])
  }
})

test('script が名指す id は、すべて HTML に在る', () => {
  const ids = new Set()
  for (const src of blocks) {
    for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(m[1])
    for (const m of src.matchAll(/\$\('([^']+)'\)/g)) ids.add(m[1])
  }
  // 陽性対照: 1 つも拾えないなら、この test は何も見ていない。
  assert.ok(ids.size > 0, 'id を 1 つも拾えていない')
  const present = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  const missing = [...ids].filter((i) => !present.has(i)).sort()
  // 🔴 **在らない id を引けば、面は黙って壊れる** —— `null` に `.textContent` を書く形は
  // console にしか出ず、開いた人間には「動かない」としか見えない。
  assert.deepEqual(missing, [], `script が在らない id を引いている: ${missing.join(', ')}`)
})

test('契約 block は、ちょうど 2 つ —— frontmatter と木', () => {
  const tags = [...html.matchAll(/data-contract="([^"]+)"/g)].map((m) => m[1]).sort()
  // ⚠ **増えたことに気づける形にしておく。** 契約が増えれば、それを取り出す test も要る。
  assert.deepEqual(tags, ['aim-frontmatter', 'aim-tree'])
})
