// baton —— 直前のセッションが**選んで**渡した引き継ぎ。
//
// 導出元の前提:
//
//   引き継ぎの主体エージェントのネイティブな圧縮・リセットではなく、セッションを跨ぐ
//                    context 伝達のために固有の会話引き継ぎ機構を備える
//   対話の単一性人間が 1 度に対話するエージェントは常に単一である
//   早期化のための安さ  区切りの良いところで早めに引き継げるよう、コストを低く保つ
//
// 置き場は `~/.bearing/units/<unit>/active.md`、machine-local。これは `_guide/handoff.md` の
// 正本であり、⚠ **制約の受容ではなく目的の帰結である**: baton が守っているのは
// **人間と 1 つのセッションの間にある対話の継続**であって、別マシンの別セッションは
// そもそも別の対話だからである。
//
// ⚠ **読む側と書く側は baton の在り処について一致していなければならない。**
// `handoff-r` / `handoff-w` skill は正本の path へ書き、この reader はそこを読む。
// **この plugin の skill で書かれた baton を、その plugin 自身の hook が見つけられない
// 状態は、baton が無いことより悪い**: 儀式は成功を報告し、次のセッションは盲目で始まる。
//
// ⚠ **この reader は `read-at` を刻まない。** 刻印は正本の読む手順の 3 であり、その後に
// 4〜6（未 push aim の surface・pointers の読み込み・現在地の報告）が続く。刻む hook は
// **自分が遂行できない手順を遂行したと主張すること**になり、しかも「読まれた」と印の付いた
// baton を残したままセッションが死ねば、その baton は誰にも読まれない。
// hook は surface する。刻印と遂行はエージェントが行う。

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { activePath } from './handoff.mjs'

/**
 * unit の baton を、在れば読む。
 *
 * @param {string} unitRoot
 * @returns {Promise<{path: string, text: string, composedAt: string|null, readAt: string|null, task: string|null}|null>}
 */
export async function readBaton(unitRoot) {
  // ⚠ **置き場の正本は `lib/handoff.mjs` 1 箇所である。** 読む側と書く側が別々に path を
  // 組み立てれば、書かれた baton を我々自身の hook が見つけられない状態が作れてしまう ——
  // それは baton が無いことより悪い（儀式は成功を報告し、次のセッションは盲目で始まる）。
  const file = activePath(unitRoot)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    // 不在は構造的に正常な状態である —— fresh start であって、故障ではない。
    return null
  }
  if (text.trim() === '') return null
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  const field = (key) => front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].trim() || null
  return {
    path: file,
    text,
    composedAt: field('composed-at'),
    readAt: field('read-at'),
    task: field('task'),
  }
}
