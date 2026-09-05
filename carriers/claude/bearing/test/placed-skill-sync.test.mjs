// 出荷される md が閉じていること、そして **bearing 自身に置かれた複製が正本と byte 同一である**こと。
//
// ⚠ **2026-09-05 まで、この file は `original/` ↔ carrier の同期を見ていた。** 人間が `original/` を
// 畳み、`carriers/claude/bearing/` が正本になった ∴ **あの対はもう存在しない。** 残ったのは逆向きの
// 対である —— `setup-aim` が `templates/aim/` から `.claude/skills/aim/` へ置いた複製。
//
// ⚠ **bearing は自分の消費者の 1 つである。** plugin は置いたものを追随させない（置いた後は repo の
// もの）が、**この repo は置かれた 3 枚を track する側を選んだ**（人間の決定 2026-09-05）∴ 揃って
// いることを見るのは plugin の義務ではなく、この repo の policy である。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access, readdir } from 'node:fs/promises'
import path from 'node:path'

const PLUGIN = path.join(import.meta.dirname, '..')
const REPO_ROOT = path.join(PLUGIN, '..', '..', '..')

// ⚠ **cache から走れば layout が一致しない** ∴ 置かれた複製の検査は bearing の checkout でだけ
// 意味を持つ。「検査した」と「検査できなかった」を同じ緑に畳まないため、判定を字面に出す。
const inCheckout =
  path.resolve(path.join(REPO_ROOT, 'carriers', 'claude', 'bearing')) === path.resolve(PLUGIN)

/** `setup-aim` が置く 3 枚。⚠ **`frame.md` は置かれない** —— 法は block と hook が運ぶ。 */
const PLACED = ['SKILL.md', 'aim-authoring.md', 'aim-facts.md']

for (const f of PLACED) {
  test(`.claude/skills/aim/${f} は templates/aim/${f} と byte 同一である`, async (t) => {
    if (!inCheckout) return t.skip('bearing の checkout ではない —— cache から走っている')
    assert.equal(
      await readFile(path.join(REPO_ROOT, '.claude', 'skills', 'aim', f), 'utf8'),
      await readFile(path.join(PLUGIN, 'templates', 'aim', f), 'utf8'),
    )
  })
}

test('frame.md は置かれない —— 置けば同じ 6 箇条が 3 箇所に住む', async (t) => {
  if (!inCheckout) return t.skip('bearing の checkout ではない —— cache から走っている')
  const placed = path.join(REPO_ROOT, '.claude', 'skills', 'aim', 'frame.md')
  assert.equal(await access(placed).then(() => true, () => false), false)
})

/** 出荷される md をすべて挙げる。⚠ **表を手で持たない** —— 正本が carrier 自身になった以上、
 *  配置表は directory そのものである。手で持てば、増えた 1 枚が黙って検査を逃れる。 */
async function shippedMarkdown() {
  const out = []
  for (const d of ['skills', 'templates', 'commands']) {
    const root = path.join(PLUGIN, d)
    if (!(await access(root).then(() => true, () => false))) continue
    for (const e of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.md')) out.push(path.join(e.parentPath ?? e.path, e.name))
    }
  }
  return out
}

test('出荷される md は corpus の cross-ref を持たない', async () => {
  // ⚠ 届いた先にその node は存在せず、参照は必ず宙に浮く。`[[slug]]` 等の syntax 例は除く。
  const files = await shippedMarkdown()
  assert.ok(files.length > 0, '出荷される md が 1 枚も見つからない —— glob が壊れている')
  for (const f of files) {
    const text = await readFile(f, 'utf8')
    const refs = [...text.matchAll(/\[\[([^\]]+)\]\]/g)]
      .map((m) => m[1])
      .filter((r) => !/^(slug|link|隣接の slug)$/.test(r))
    assert.deepEqual(refs, [], `${path.relative(PLUGIN, f)} が corpus を指している: ${refs.join(', ')}`)
  }
})

test('aim の規律は plugin の skill として登録されない —— templates/ に住む', async () => {
  // ⚠ `skills/aim/` に置けば `bearing:aim` として登録され、`setup-aim` が消費者へ置いた `aim` と
  // 同じ規律が 2 つの skill として並ぶ —— どちらが正か誰にも決められない。
  assert.equal(await access(path.join(PLUGIN, 'skills', 'aim')).then(() => true, () => false), false)
  assert.equal(await access(path.join(PLUGIN, 'templates', 'aim', 'SKILL.md')).then(() => true, () => false), true)
})
