// エージェントが自分のシェルへ貼り付ける path を、1 つの token として名指す。
//
// ⚠ **これは「見た目を整える」機構ではない。** hook が吐くのは*エージェントが打つコマンド*
// であり、打たれる先のシェルは **emission の時点では分からない**（この harness だけでも Bash
// tool と PowerShell tool の 2 つが在り、POSIX 側では bash / zsh が来る）∴ ここが作るのは
// **どのシェルでも同じ 1 つの path に解決される形**でなければならない。
//
// ⚠ **JSON は shell quoting ではない。** 先行版は `JSON.stringify(p)` をそのまま使っており、
// POSIX では偶然ちょうど正しかったが、Windows では backslash が二重化されていた。
// 2026-09-03 に argv を実測すると、2 つのシェルは**別々の機構で**通っていた:
//
//   Git Bash    argv = `D:\a\b`（単一）—— POSIX シェルの unescape が `\\` を `\` へ畳み、
//               **JSON のエスケープをちょうど打ち消していた**。Windows の性質ではない。
//   PowerShell  argv = `D:\\a\\b`（二重のまま）—— escape 文字は backtick ゆえ畳まれない。
//               通るのは **path 正規化が繰り返し separator を吸収する**からである。
//
// ⚠ **そして偶然は drive letter で終わっていた。** 先頭の `\\` だけは UNC の印ゆえ畳む規則が
// 違い、`\\server\share\x` は JSON escape を経ると `\server\share\x` に化ける —— 先頭が 1 本に
// なり、UNC でなくなる。∴ plugin が network path に載り、かつシェルが PowerShell だと、
// あの 1 行は**解決に失敗する**。
//
// ∴ **Windows では separator を `/` へ倒す。** backslash が 1 つも無くなれば、JSON にも
// どのシェルにも escape する対象が残らない —— 偶然に頼るのをやめる、というのがこの形の
// 全部である。node は `D:/a/b` も `//server/share/x` も正しく解決する（実測）。
//
// ⚠ **POSIX では何もしない。** あちらの filename には `\` が**合法に現れる** ∴ 無条件に
// 置換すれば `/home/user/we\ird/x` を別の path に化けさせる。**リスクは win32 に閉じる。**
//
// ⚠ **残る穴を明記する: `$` / backtick / `"` を含む path は依然として壊れる**（bash の二重
// 引用符は `$` を展開し、PowerShell の escape は backtick である）。これは UNC とは別の穴で、
// **POSIX 側にも在り**、しかも**原理的に閉じない** —— 出力先のシェルが分からない以上、
// 1 つの文字列で全シェルの quoting 規則を同時に満たすことはできない。塞いだのは UNC までで
// あって、ここは「観測できていない」ではなく「**塞げないと分かっている**」である。

/**
 * @param {string} absPath 解決済みの絶対 path
 * @param {string} platform 既定は実行中の platform。⚠ **引数にしてあるのは testability の
 *   ためである** —— これを固定にすると、CI（ubuntu）から win32 の分岐を検査できず、
 *   **片方の platform でしか効かない門**という、この機構が直したはずの defect をそのまま
 *   作り直すことになる。
 * @returns {string} シェルへそのまま貼れる、二重引用符で囲まれた 1 token
 */
export function quotePathForShell(absPath, platform = process.platform) {
  const p = platform === 'win32' ? absPath.split('\\').join('/') : absPath
  return JSON.stringify(p)
}
