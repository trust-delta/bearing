// 採用を検討する人へ向けた 2 枚（`docs/adoption.md` / `docs/adoption.en.md`）が、
// **版で腐る字を持たない**ことの門。
//
// ⚠ **腐り方は静かである。** 版番号や node 数を literal で書けば、書いた瞬間は真だが、
// **次の bump や次の node で黙って偽になる** —— 面は何も言わず、読み手はそれを今の事実として
// 読む（`CLAUDE.md` の記録の作法）。∴ **人が読み返すことに頼らず、機械に見張らせる。**
//
// ⚠ **見張るのは 3 種だけである**（`docs/aims/adoption-brief.md` の `# IS` ⑵）:
// 版番号・面の例に混ざった実数・node の個数。**日付つきの実測は腐らない ∴ 対象外**である。
//
// ⚠ **この門は「捕まえられること」を先に示す。** 合成した違反を 3 種とも挙げられることを
// 確かめてから本番の 2 枚に当てる —— **陽性対照の無い検査は、対象ではなく道具を測っている。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing')
const REPO = path.join(ROOT, '..', '..', '..')

/**
 * ⚠ **この 2 枚は plugin の外に住む** ∴ cache から走れば無い。
 *
 * 🔴 **だが「無ければ skip」を無条件にしてはならない** —— **消されたことと、居場所が違うことが
 * 同じ顔になる。** ∴ **bearing 自身の checkout に居るかを別の印で判定し**（`scripts/` は
 * この repo にしか無く、plugin には同梱されない）**居るなら不在は落とす。**
 */
const inOwnCheckout = await access(path.join(REPO, 'scripts', 'carrier-check.sh')).then(
  () => true,
  () => false,
)

const DOCS = ['docs/adoption.md', 'docs/adoption.en.md']

/**
 * ⚠ **`g` 付きの正規表現は `lastIndex` を持ち回る** ∴ 使うたびに新しく作る ——
 * 使い回せば 2 度目の照合が途中から始まり、**見つかるはずのものを黙って落とす。**
 */
const patterns = () => [
  // `v0.28.0` / `1.2.3` —— 版は必ず動く。
  { name: '版番号', re: /\bv?\d+\.\d+\.\d+\b/g },
  // statusline の例に実数を書けば、この repo のその日の値が固定される。
  { name: '面の例に実数', re: /(?:aim|todo|宣言待ち|escalation|観測票なし)\s+\d/g },
  // 「11 nodes」「3 ノード」—— corpus は増える。
  { name: 'node の個数', re: /\d+\s*(?:nodes?|ノード)\b/gi },
]

/** @returns {{name: string, hit: string}[]} 見つかった腐る字。無ければ空。 */
export function rotFindings(text) {
  return patterns().flatMap(({ name, re }) =>
    [...(text.match(re) ?? [])].map((hit) => ({ name, hit })),
  )
}

test('陽性対照 —— 合成した違反を 3 種とも挙げる', () => {
  const found = (s) => rotFindings(s).map((f) => f.name)
  assert.deepEqual(found('bearing v0.28.0 を名乗る'), ['版番号'])
  assert.deepEqual(found('bearing   aim 11   todo 2'), ['面の例に実数', '面の例に実数'])
  assert.deepEqual(found('the corpus has 11 nodes'), ['node の個数'])
})

test('偽陽性の門 —— 腐らない字は 1 つも挙げない', () => {
  // ⚠ **placeholder・日付つきの実測・「node 数」という語そのものは、どれも腐らない。**
  assert.deepEqual(rotFindings('bearing   aim <数>   todo <数>   escalation <数>'), [])
  assert.deepEqual(rotFindings('実測 2026-09-09、対象: この repo'), [])
  assert.deepEqual(rotFindings('corpus の node 数を数えている'), [])
  assert.deepEqual(rotFindings('`[todo]` を 1 つ以上持つ node'), [])
})

for (const rel of DOCS) {
  test(`${rel} は版で腐る字を持たない`, async (t) => {
    if (!inOwnCheckout) return t.skip('bearing の checkout の外で走っている —— 2 枚はここに無い')
    // ⚠ **在るはずの場所で読めなければ落とす。** skip は「居場所が違う」ときだけの答えである。
    const text = await readFile(path.join(REPO, rel), 'utf8')
    const found = rotFindings(text)
    assert.deepEqual(
      found,
      [],
      `腐る字が在る: ${found.map((f) => `${f.name}「${f.hit}」`).join(' / ')}`,
    )
  })
}
