// unit の解決は 1 つである —— 面ごとに別の corpus を読む形を、機構で止める。
//
// 🔴 **2026-09-06 まで、解決は 3 通りに割れていた。** `aim-facts` は `process.cwd()`、
// `boot-ritual` / `corpus-delta` / `precompact` は `input.cwd || process.cwd()`、
// statusline は `workspace.project_dir` 優先。⚠ **同じセッションの同じ瞬間に、面ごとに
// 別の unit を読む形が実在していた** —— agent が `cd` すれば分岐は現実になり、実際に
// statusline の 2 行目が `corpus 未取得` へ落ちて発覚している。
//
// ⚠ **挙動の test は `statusline.test.mjs` が既に持っている。** ここが固定するのは
// **分岐が戻らないこと**である —— 正しい関数が在っても、誰かが傍らで組み直せば元に戻る。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveCwd } from '../../../carriers/claude/bearing/lib/unit.mjs'

const BIN = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing', 'bin')
/** unit を解決する面。⚠ **数え漏らしを防ぐため、名前を先に書き下す。** */
const FACES = ['aim-facts', 'boot-ritual', 'corpus-delta', 'precompact', 'statusline']

const read = (name) => readFile(path.join(BIN, `${name}.mjs`), 'utf8')

test('unit を解決する面は、すべて lib/unit.mjs の resolveCwd を通る', async () => {
  let checked = 0
  for (const name of FACES) {
    const src = await read(name)
    // 陽性対照: この面が本当に unit を解決していることを、まず確かめる。
    assert.match(src, /resolveUnit\(/, `${name} が resolveUnit を呼んでいない —— 一覧が古い`)
    assert.match(
      src,
      /import \{[^}]*\bresolveCwd\b[^}]*\} from '\.\.\/lib\/unit\.mjs'/,
      `${name} が resolveCwd を正本から import していない`,
    )
    checked++
  }
  // ⚠ 0 件を緑にしない —— 測っていないことと、測って問題が無かったことは別である。
  assert.equal(checked, FACES.length)
})

test('どの面も、自前の cwd 解決を持たない', async () => {
  for (const name of FACES) {
    const src = await read(name)
    assert.doesNotMatch(
      src,
      /(function|const)\s+resolveCwd\s*[(=]/,
      `${name} が resolveCwd を自分で定義している —— 正本は lib/unit.mjs 1 つである`,
    )
    // 旧い形。⚠ これが戻れば `workspace.project_dir` が黙って無視される。
    assert.doesNotMatch(src, /input\.cwd \|\| process\.cwd\(\)/, `${name} に旧い解決が戻っている`)
  }
})

test('解決の順序 —— 対象は project_dir、立ち位置ではない', () => {
  assert.equal(
    resolveCwd({ workspace: { project_dir: '/p', current_dir: '/p/carriers/claude' } }),
    '/p',
  )
  // ⚠ 連鎖は上位が欠けても壊れない ∴ 揃える前の挙動を下回る面は 1 つも無い。
  assert.equal(resolveCwd({ workspace: { current_dir: '/c' } }), '/c')
  assert.equal(resolveCwd({ cwd: '/x' }), '/x')
  assert.equal(resolveCwd({}, '/fallback'), '/fallback')
  assert.equal(resolveCwd(null, '/fallback'), '/fallback')
})
