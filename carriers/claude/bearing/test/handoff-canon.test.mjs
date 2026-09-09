// handoff の canon 文書が運ぶべき要求 —— **具体的な失敗から生まれた規則だけを固定する。**
//
// ⚠ **傍らの `handoff.test.mjs` は「帳簿である半分」しか見ず、authoring の test を持たない**
// （あの実装は何も著さない）。∴ **canon の*字面*が要求を持ち続けているかは、どこも見ていな
// かった。** ここがそれを見る。
//
// 🔴 **散文の test を無闇に増やしてはならない** —— 字面を固定するほど、書き直す自由が減る。
// ∴ **ここへ足すのは「実際に踏んだ」規則に限る。** 各 assert は、いつ何を踏んだかを併記する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const read = (rel) => readFile(path.join(ROOT, rel), 'utf8')

test('write.md は「数を書いたら出し直す手を同じ場所に」を要求する', async () => {
  // 🔴 **2026-09-10 に踏んだ**: 裸で運ばれた `open-todo: 1` を受け取った側が、**その todo が
  // 住む node を取り違えた**（`docs/aims/session-handoff.md` の `# IS`）。⚠ **baton は数に
  // 注記を貼って運んでいたが、再検算の手だけが別の節に在った** —— **離れた瞬間、数だけが写る。**
  const text = await read(path.join('skills', 'handoff', 'write.md'))
  assert.match(text, /数を書いたら/, '数についての要求が消えている')
  assert.match(text, /同じ場所に/, '「同じ場所に」が消えている —— 別の節へ寄せてよいと読める')
  // ⚠ **原則の節に在ることまで見る。** 形の節の注記だけになれば、様式の説明に落ちる。
  const principles = text.split('### 原則')[1]?.split('### 形')[0] ?? ''
  assert.match(principles, /出し直すコマンド/, '要求が「原則」の外へ出た')
})

test('write.md は land の前に人間へ見せることを要求し続ける', async () => {
  // ⚠ **ここは CLI の出力と順序が食い違っている**（`write.md` は「見せてから land」、
  // `bearing-handoff.mjs write` は「land 後に報告」）—— 🔴 **その食い違いはまだ解かれていない**
  // ∴ **どちらかが黙って消えることだけを止める。**
  const text = await read(path.join('skills', 'handoff', 'write.md'))
  assert.match(text, /人間に見せて確認を得てから land/, '確認の要求が消えている')
  assert.match(text, /何を残し何を省いたか/, '手順 3 の報告が消えている')
})
