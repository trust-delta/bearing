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

test('契約 block は、ちょうど 3 つ —— frontmatter と木と body', () => {
  const tags = [...html.matchAll(/data-contract="([^"]+)"/g)].map((m) => m[1]).sort()
  // ⚠ **増えたことに気づける形にしておく。** 契約が増えれば、それを取り出す test も要る。
  // 🔴 **`aim-body` は他の 2 つと質が違う** —— あの法は既に `lib/process.mjs` に住んでおり、
  // 面のそれは**2 つ目の実装**である ∴ 取り出す test（`aim-body-shape.test.mjs`）が担うのは
  // 契約の固定だけでなく、**実 corpus 全枚での両者の一致**である。
  assert.deepEqual(tags, ['aim-body', 'aim-frontmatter', 'aim-tree'])
})

test('面が組む 3 つの pane と 3 つの tab は、HTML に在る', () => {
  // ⚠ **id の実在は上の test が見ているが、あれは script が*引いた*ものだけを見る。**
  // 🔴 **pane が 1 つ消えても script が引かなくなれば、あの test は黙って通る** ∴
  // **切り方そのものを、ここで名指しで固定する。**
  for (const id of ['t-tree', 't-human', 't-agent', 'pane-tree', 'pane-human', 'pane-agent']) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} が面から消えている`)
  }
  // ⚠ **役割も固定する** —— tablist が無ければ、押せる見た目の div が 3 つ並ぶだけになる。
  assert.match(html, /role="tablist"/)
  assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 3)
})

test('面の字は、読み手の設定を上書きしない —— そして散文が monospace で描かれない', () => {
  // 🔴 **人間が「読みにくい」と述べ、測ったら原因は 2 つとも構造だった**（2026-09-13）——
  // ⑴ body が絶対 px で字を決めており、**読み手が browser に設定した大きさを上書きしていた**
  // （他は `rem` ＝ `html` を見る ∴ **1 枚の中で 2 つの尺が混ざっていた**）⑵ `pre` が
  // `font-family` を持たず、**この面でいちばん長い日本語の散文が UA 既定の monospace で
  // 描かれていた。** ⚠ **contrast は原因ではない**（実測: muted が 5.36:1 / 6.07:1、AA 通過）。
  //
  // ⚠ **これは heuristic である** —— CSS の字面を見ているだけで、**描かれた結果は browser に
  // しか無い。** 固定しているのは「二度と同じ形へ戻さない」ことだけである。
  const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? [])[1] ?? ''
  assert.ok(css.length > 500, 'style を取り出せていない —— 測っているのは対象ではなく正規表現である')
  // ⚠ **comment を落としてから測る。** 過去の値は理由として字面に残っており、落とさなければ
  // **直した当の記述が違反として出る。**
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const px = [...rules.matchAll(/font(?:-size)?:[^;}]*?\b\d+(?:\.\d+)?px/g)].map((m) => m[0].trim())
  assert.deepEqual(px, [], `字を絶対 px で決めている: ${px.join(' / ')}`)
  // ⚠ **下限を持たせる** —— 直した値が次に小さく戻されても、ここが述べる。
  const small = [...rules.matchAll(/font-size:\s*(\.\d+)(rem|em)/g)]
    .filter((m) => parseFloat(m[1]) < 0.875)
    .map((m) => m[0].trim())
  assert.deepEqual(small, [], `本文より一段以上小さい字が在る: ${small.join(' / ')}`)
  // 🔴 **`pre` の UA 既定は monospace である** —— node の body も節の原文も日本語の散文である。
  for (const [sel, re] of [['pre#d-body', /pre#d-body\s*\{[^}]*\}/], ['pre.sec', /pre\.sec\s*\{[^}]*\}/]]) {
    const block = rules.match(re)
    assert.ok(block, `${sel} の規則が無い`)
    assert.match(block[0], /font-family:\s*var\(--font\)/, `${sel} が family を明示していない —— 既定の monospace で描かれる`)
  }
})
