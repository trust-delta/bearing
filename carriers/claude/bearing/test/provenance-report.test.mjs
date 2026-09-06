// 出所の測定 —— 日付を持たない実測／観測を候補として挙げる heuristic。
//
// ⚠ **門ではない ∴ 固定するのは「落とすか」ではなく「何を単位として見るか」である。**
// 🔴 初版は空行だけで切っており、`- [done]` が並ぶ `# PROCESS` を丸ごと 1 単位にしていた
// —— **どれか 1 つが日付を持てば、残りの欠落が消える。** その退行をここで止める。
//
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'provenance-report.mjs')
const present = await access(SCRIPT).then(() => true, () => false)
const load = () => import(pathToFileURL(SCRIPT).href)

test('bullet はそれぞれが 1 単位である —— list を畳まない', async (t) => {
  if (!present) return t.skip('scripts/ が無い —— cache から走っている')
  const { paragraphs } = await load()
  const units = paragraphs(['- [done] 日付つき（実測 2026-09-06）', '- [done] 日付なし（実測）'].join('\n'))
  assert.equal(units.length, 2, 'bullet 2 つは 2 単位')
})

test('fence の中は測らない', async (t) => {
  if (!present) return t.skip('scripts/ が無い')
  const { paragraphs } = await load()
  const units = paragraphs(['散文', '', '```x v1', '# fields: 実測', '```', '', '散文 2'].join('\n'))
  assert.equal(units.some((u) => u.text.includes('# fields')), false)
})

test('候補の行は、単位の先頭ではなく主張の語が在る行を指す', async (t) => {
  if (!present) return t.skip('scripts/ が無い')
  const { paragraphs, claimLine } = await load()
  const [unit] = paragraphs(['前置きの行', '主張はここで実測と述べる'].join('\n'))
  assert.equal(claimLine(unit).no, 2)
})

test('日付の形を広く取る —— 書式の統一はここの問いではない', async (t) => {
  if (!present) return t.skip('scripts/ が無い')
  const { DATED } = await load()
  for (const ok of ['2026-09-06', '2026-09', '2026 年', '9 月 6 日']) {
    assert.match(ok, DATED, `${ok} は日付として拾えるべき`)
  }
  assert.doesNotMatch('（実測）', DATED)
})

test('測る対象は aim record と repo root の CLAUDE.md に限る', async (t) => {
  if (!present) return t.skip('scripts/ が無い')
  const { inScope } = await load()
  assert.equal(inScope('docs/aims/bearing.md'), true)
  assert.equal(inScope('CLAUDE.md'), true)
  assert.equal(inScope('docs/aims/README.md'), false)
  assert.equal(inScope('carriers/claude/bearing/lib/drift.mjs'), false)
})

// 🔴 **この test が 1 度落ちて、cwd 依存を捕まえた。** `git ls-files` は cwd 相対に列挙し、
// CI はこの test を `carriers/claude/bearing` で走らせる ∴ 道具は 0 件を報告して緑のまま
// 通っていた —— **陽性対照が無ければ、測っていないことと測って何も無かったことを区別できない。**
test('報告は走り、必ず 0 で終わる —— これは門ではない', async (t) => {
  if (!present) return t.skip('scripts/ が無い')
  const { report } = await load()
  const lines = []
  assert.equal(report((...a) => lines.push(a.join(' '))), 0)
  // ⚠ **陽性対照**: この repo の corpus には主張の語が実在する ∴ 0 段落なら道具が壊れている。
  // ⚠ **この assert は cwd に依らず真でなければならない** —— test の cwd は呼ばれ方で変わる。
  assert.match(lines.join('\n'), /「実測」「観測」を含む段落: [1-9]/)
  assert.match(lines.join('\n'), /測った file: [1-9]/)
})
