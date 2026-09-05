// original/ ↔ carrier —— 生成物が正本と byte 同一であること。
//
// ⚠ CI の `carriers-in-sync` は再生成して diff を取る。ここは **test でも同じ事実を見る** —— 門が
// 1 つしか無ければ、その門を飛ばした日に誰も気づかない。⚠ **cache から走れば `original/` は無い**
// ∴ skip する（「検査した」と「検査できなかった」を同じ緑に畳まない）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'

const PLUGIN = path.join(import.meta.dirname, '..')
const ORIGINAL = path.join(PLUGIN, '..', '..', '..', 'original')

/** 配置表。⚠ **`gen/claude-plugin.sh` と同じ表である** —— 片方だけ動けば、この test が赤くなる。 */
export const MAP = [
  ['aim/SKILL.md', 'templates/aim/SKILL.md'],
  ['aim/aim-authoring.md', 'templates/aim/aim-authoring.md'],
  ['aim/aim-facts.md', 'templates/aim/aim-facts.md'],
  ['aim/frame.md', 'templates/aim/frame.md'],
  ['aim/setup-aim.md', 'commands/setup-aim.md'],
  ['handoff/SKILL.md', 'skills/handoff/SKILL.md'],
  ['handoff/read.md', 'skills/handoff/read.md'],
  ['handoff/write.md', 'skills/handoff/write.md'],
  ['statusline/setup-statusline.md', 'commands/setup-statusline.md'],
]

const hasOriginal = await access(ORIGINAL).then(() => true, () => false)

for (const [from, to] of MAP) {
  test(`${to} は original/${from} と byte 同一である`, async (t) => {
    if (!hasOriginal) return t.skip('original/ が無い —— cache から走っている')
    assert.equal(
      await readFile(path.join(PLUGIN, to), 'utf8'),
      await readFile(path.join(ORIGINAL, from), 'utf8'),
    )
  })
}

test('出荷される正本は corpus の cross-ref を持たない', async () => {
  // ⚠ 届いた先にその node は存在せず、参照は必ず宙に浮く。`[[slug]]` 等の syntax 例は除く。
  for (const [, to] of MAP) {
    const text = await readFile(path.join(PLUGIN, to), 'utf8')
    const refs = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
      .map((m) => m[1])
      .filter((r) => !/^(slug|link|隣接の slug)$/.test(r))
    assert.deepEqual(refs, [], `${to} が corpus を指している: ${refs.join(', ')}`)
  }
})

test('aim の規律は plugin の skill として登録されない —— templates/ に住む', async () => {
  // ⚠ `skills/aim/` に置けば `bearing:aim` として登録され、`setup-aim` が消費者へ置いた `aim` と
  // 同じ規律が 2 つの skill として並ぶ —— どちらが正か誰にも決められない。
  assert.equal(await access(path.join(PLUGIN, 'skills', 'aim')).then(() => true, () => false), false)
  assert.equal(await access(path.join(PLUGIN, 'templates', 'aim', 'SKILL.md')).then(() => true, () => false), true)
})
