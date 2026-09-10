// `parent:` から木を組む契約の test。
//
// ⚠ **契約は `surface/aim.html` の中に住み、ここはそれを取り出して走らせる**（`aim-format`
// と同じ理由 —— `file://` から相対 module を import する道が塞がっており、別 file に出せば
// 生成と、生成物が正本と一致しているかを見る門が要る）。
//
// 🔴 **固定するのは「壊れ方を畳まないこと」である。** 孤児・循環・自己参照・存在しない親を
// 「木が描けない」の一言にすれば、読み手は corpus が健全だと読む。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing')
const SURFACE = path.join(ROOT, 'surface', 'aim.html')
const REPO_AIMS = path.join(ROOT, '..', '..', '..', 'docs', 'aims')

async function loadContract() {
  const html = await readFile(SURFACE, 'utf8')
  const re = /<script type="module" data-contract="aim-tree">\n([\s\S]*?)\n<\/script>/g
  const blocks = [...html.matchAll(re)]
  assert.equal(blocks.length, 1, `木の契約 block が ${blocks.length} 個 —— ちょうど 1 つでなければならない`)
  await import('data:text/javascript;base64,' + Buffer.from(blocks[0][1], 'utf8').toString('base64'))
  assert.ok(globalThis.AimTree, '契約 block が `globalThis.AimTree` を立てていない')
  return globalThis.AimTree
}

const { buildTree } = await loadContract()
const kinds = (t, slug) => t.problems.filter((p) => p.slug === slug).map((p) => p.kind).sort()

test('健全な木は、root と子を並べて問題を 1 つも挙げない', () => {
  const t = buildTree([
    { slug: 'root', parent: null },
    { slug: 'b', parent: 'root' },
    { slug: 'a', parent: 'root' },
  ])
  assert.deepEqual(t.roots, ['root'])
  assert.deepEqual(t.children.get('root'), ['a', 'b']) // 決定性のため辞書順
  assert.deepEqual(t.problems, [])
})

test('自己参照は、その名で述べる', () => {
  const t = buildTree([{ slug: 'root', parent: null }, { slug: 'x', parent: 'x' }])
  assert.deepEqual(kinds(t, 'x'), ['self', 'unreachable'])
})

test('存在しない親は、root（親が空欄）と別の顔を持つ', () => {
  const t = buildTree([{ slug: 'root', parent: null }, { slug: 'x', parent: 'nowhere' }])
  assert.deepEqual(kinds(t, 'x'), ['missing-parent', 'unreachable'])
  // 陽性対照: 親が空欄のほうは root であって、壊れではない。
  assert.deepEqual(t.roots, ['root'])
  assert.deepEqual(kinds(t, 'root'), [])
})

test('循環は循環として述べ、到達不能と重ねる —— 原因と症状はどちらも消さない', () => {
  const t = buildTree([
    { slug: 'root', parent: null },
    { slug: 'a', parent: 'b' },
    { slug: 'b', parent: 'a' },
  ])
  assert.deepEqual(kinds(t, 'a'), ['cycle', 'unreachable'])
  assert.deepEqual(kinds(t, 'b'), ['cycle', 'unreachable'])
})

test('root が複数あることは、述べるが咎めない —— 良し悪しは目的の問いである', () => {
  const t = buildTree([{ slug: 'a', parent: null }, { slug: 'b', parent: null }])
  assert.deepEqual(t.roots, ['a', 'b'])
  assert.deepEqual(t.problems, [], 'forest であることを problem として数えてはならない')
})

test('この repo の corpus は、実際に 1 本の木として組める', async () => {
  const { readdir } = await import('node:fs/promises')
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  // 陽性対照: corpus を読めていること自体を先に確かめる。
  assert.ok(files.length > 0, 'corpus を 1 枚も読めていない —— 測っているのは対象ではなく道具である')
  const nodes = []
  for (const f of files) {
    const text = await readFile(path.join(REPO_AIMS, f), 'utf8')
    const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
    nodes.push({ slug: f.slice(0, -3), parent: fm.match(/^parent:\s*(.*)$/m)?.[1].trim() || null })
  }
  const t = buildTree(nodes)
  assert.deepEqual(t.problems, [], `corpus に壊れた形が在る: ${JSON.stringify(t.problems)}`)
  assert.equal(t.roots.length, 1, `root が ${t.roots.length} 本 —— この corpus は 1 本の木のはずである`)
})
