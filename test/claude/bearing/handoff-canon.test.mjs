// handoff の canon 文書が運ぶべき要求 —— **具体的な失敗から生まれた規則だけを固定する。**
//
// ⚠ **傍らの `handoff.test.mjs` は「帳簿である半分」しか見ず、authoring の test を持たない**
// （あの実装は何も著さない）。∴ **canon の*字面*が要求を持ち続けているかは、どこも見ていな
// かった。** ここがそれを見る。
//
// ⚠ **ここは `test/claude/bearing/` に住む** —— **開発用の test は配らない**（人間の決定
// 2026-09-10、`#53`）∴ **canon は 3 段上の `carriers/claude/bearing/` から引く。**
//
// 🔴 **散文の test を無闇に増やしてはならない** —— 字面を固定するほど、書き直す自由が減る。
// ∴ **ここへ足すのは「実際に踏んだ」規則に限る。** 各 assert は、いつ何を踏んだかを併記する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing')
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

test('write.md は「他人の系の主張は階級と射程ごと運ぶ」を要求する', async () => {
  // 🔴 **2026-09-11 に測った**（対象: 本 repo の baton と native な圧縮要約）—— **主張が
  // 運ばれながら日付・対象・射程の限定だけが落ちる形が、両方に実在した。**
  // ⚠ **圧縮側**: corpus の「commit sha は host の merge 慣習が書き換える（実測 2026-09-10、
  // 対象: `#53`）。配り先の慣習は知りえない」が、要約では「every PR lands as one commit ∴
  // force-push is avoidable」になった —— **他人の系についての、日付を持たない普遍的な現在形。**
  // ⚠ **baton 側**: 「`.jsonl` の `isCompactSummary` 行に全文が在り、読める」も同じ形である。
  // 🔴 **止めたいのは片方だけである** —— **丸ごと落ちれば不在として現れる（安い）。剥がれて
  // 運ばれれば確信として現れる（高い）。**
  const text = await read(path.join('skills', 'handoff', 'write.md'))
  const principles = text.split('### 原則')[1]?.split('### 形')[0] ?? ''
  assert.match(principles, /他人の系/, '他人の系についての要求が消えている')
  assert.match(principles, /階級と射程/, '「階級と射程」が消えている —— 片方だけでは足りない')
  assert.match(principles, /corpus を指す/, '運べないときの行き先が消えている')
})

test('write.md の様式は人間の逐語の欄を持つ', async () => {
  // ⚠ **これは欠落として先に測られていた**（`docs/aims/session-handoff.md` の `# IS`:
  // 「baton は逐語の欄を持たない」）—— 🔴 **2026-09-11、native 側がその欄を持つことを
  // 実測した**（対象: 本 repo の圧縮要約 —— **人間の逐語 22 件が `6. All user messages` に
  // 独立節で保たれていた**）∴ **取り入れた。** ⚠ **欄が黙って消えれば、著者は逐語を
  // 言い換えて Settled へ埋め、人間の原語が失われる**（前の baton が実際にそうしている）。
  const text = await read(path.join('skills', 'handoff', 'write.md'))
  const shape = text.split('### 形')[1] ?? ''
  assert.match(shape, /^## 逐語$/m, '様式から逐語の節が消えている')
  assert.match(shape, /言い換えてはならない/, '言い換えの禁止が消えている —— 節だけでは効かない')
})

test('write.md は transcript を機械の欄として扱い、read.md は何のための欄かを述べる', async () => {
  // 🔴 **2026-09-11 に測った**（対象: 本 repo の圧縮要約）—— **native な圧縮は transcript を
  // *貼らず*、絶対 path 1 本と「何を取りに行く欄か」の 1 行だけを置いていた**
  // （transcript 6,431,899 字に対し要約 18,033 字 ＝ 0.28%）。⚠ **対して baton には欄が無く、
  // 代わりに `<session-id>` が未解決の *path の形* が書かれていた** —— **読む側は開けない。**
  // ⚠ **path だけでは足りない** —— **開く理由が無ければ開かれない** ∴ 用途の 1 行を対で見張る。
  const write = await read(path.join('skills', 'handoff', 'write.md'))
  assert.match(write, /`transcript:` も書かない/, '機械の欄であることが消えている')
  assert.match(write, /開けない path は、欄が無いことより悪い/, '刻まない条件が消えている')
  const rd = await read(path.join('skills', 'handoff', 'read.md'))
  assert.match(rd, /`transcript:` が在れば/, '読む側の手順から消えている')
  assert.match(rd, /原文は運ばない/, '何のために開く欄かが消えている —— path だけでは開かれない')
})
