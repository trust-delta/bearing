// シェルへ載せる path の形の test。
//
// ⚠ **この suite は platform を引数で渡す。** `process.platform` を見るだけの実装にすると、
// CI（ubuntu）から win32 の分岐を検査できない —— そして「片方の platform でしか効かない門」
// こそ、この機構が直したはずの defect である（`boot-ritual.test.mjs` の CLI 名指し検査が
// 先頭 `/` を要求し、win32 で常時赤だった件）。**同じ穴を掘り直さないための形である。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { quotePathForShell } from '../lib/shell.mjs'

/** 実際にシェルへ貼られる中身 —— 囲みの二重引用符を外したもの。 */
const inner = (quoted) => JSON.parse(quoted)

test('win32 では separator が `/` へ倒れ、backslash が 1 つも残らない', () => {
  const q = quotePathForShell('D:\\trust_project\\bearing\\bin\\handoff.mjs', 'win32')
  assert.equal(q, '"D:/trust_project/bearing/bin/handoff.mjs"')
  // ⚠ **これが UNC を救っている性質そのものである** —— backslash が 0 個なら、JSON にも
  // どのシェルにも escape する対象が残らない ∴ 二重化も、畳み損ねも起きえない。
  assert.ok(!inner(q).includes('\\'))
})

test('win32 の UNC が、往復して元の UNC に解決する', () => {
  const unc = '\\\\server\\share\\bearing\\bin\\handoff.mjs'
  const q = quotePathForShell(unc, 'win32')
  assert.equal(inner(q), '//server/share/bearing/bin/handoff.mjs')
  // ⚠ **先行版が壊れたのはまさにここだった。** `JSON.stringify(unc)` は先頭を 4 本にし、
  // PowerShell を経ると 1 本に畳まれて UNC でなくなる（`\server\share\...`）。
  assert.equal(path.win32.normalize(inner(q)), path.win32.normalize(unc))

  // ⚠ **先行版が何に化けたかを、対比として固定する。** PowerShell は backslash を escape と
  // 見ない ∴ node が受け取るのは囲みを外した *text そのもの* である —— 先行版ではそれが
  // 先頭 4 本の backslash を持ち、正規化で 1 本に畳まれて UNC でなくなった。
  const oldEmission = JSON.stringify(unc).slice(1, -1)
  assert.notEqual(path.win32.normalize(oldEmission), path.win32.normalize(unc))
  assert.ok(!path.win32.normalize(oldEmission).startsWith('\\\\'))
})

test('POSIX では 1 文字も変えない —— filename の backslash は合法である', () => {
  // ⚠ **無条件に置換していたら、ここが別の path に化ける。** リスクを win32 に閉じる、
  // というのがこの分岐の唯一の理由である。
  const weird = '/home/user/we\\ird/bin/handoff.mjs'
  assert.equal(inner(quotePathForShell(weird, 'linux')), weird)
  assert.equal(inner(quotePathForShell('/opt/bearing/bin/handoff.mjs', 'darwin')),
    '/opt/bearing/bin/handoff.mjs')
})

test('結果は常に 1 つの引用された token である', () => {
  for (const [p, plat] of [
    ['D:\\a b\\handoff.mjs', 'win32'],
    ['/opt/a b/handoff.mjs', 'linux'],
  ]) {
    const q = quotePathForShell(p, plat)
    assert.ok(q.startsWith('"') && q.endsWith('"'), q)
    // 空白を含む path が 1 token に収まることが、そもそも囲む理由である。
    assert.ok(inner(q).includes(' '))
  }
})

test('platform を省くと実行中の platform に従う', () => {
  const p = path.join('x', 'handoff.mjs')
  assert.equal(quotePathForShell(p), quotePathForShell(p, process.platform))
})
