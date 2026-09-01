// この plugin のための薄い `git` wrapper。
//
// ⚠ **ローカル git が ground truth である ∴ git が語れないことを我々が供給してはなら
// ない —— 観測できなかった事実は「不在」であって、決して捏造しない。** 失敗の様態は
// すべて（spawn 失敗・非 0 終了・timeout）`null` に潰れ、呼び出し側は `null` を
// 「事実が無い」と扱わねばならない。
//
// ⚠ **これは両方向に効く。** `null` を「drift が無い」と読むのは分かりやすい方の嘘だが、
// 肯定的な事実として読むこと（「何も commit されていない」∴「全部 untracked だ」）は
// 同じ嘘の肯定形であり、**実際に一度出荷されたのはこちらである**。
//
// `exec` ではなく `execFile` を意図して使っている: shell を経由しないので、Windows の
// MSYS が引数に対して行う変換（`:` → `;`、`/` → `\`）が起こりえない。これがこの実装を
// bash ではなく Node で書いている理由の 1 つである。

import { execFile } from 'node:child_process'

/**
 * 単一の git 呼び出しに対する上限。
 *
 * ⚠ これは aim から導出された数ではない —— SessionStart hook を吊らせないという拒否で
 * ある。あの hook には実時間の予算があり、それを超えれば、情報を与えるべき当のセッション
 * を妨げることになる。
 */
export const GIT_TIMEOUT_MS = 5_000

/**
 * `git -C <repoRoot> <args...>` を実行する。
 *
 * @param {string} repoRoot
 * @param {string[]} args
 * @returns {Promise<string|null>} 成功時は stdout。timeout・spawn 失敗・非 0 終了は
 *   すべて `null`。
 */
export function runGit(repoRoot, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoRoot, ...args],
      { timeout: GIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => resolve(err ? null : stdout),
    )
  })
}

/**
 * `runGit` と同じだが、空の stdout も `null` にする。
 *
 * `git log -1 -- <path>` は、その path に commit 履歴が無いとき空出力で 0 終了する。
 * ⚠ **それは事実ではなく事実の不在である。** 上と同じ法を、git が「成功」を通じて不在を
 * 報告する唯一の場所に当てている。
 *
 * @param {string} repoRoot
 * @param {string[]} args
 * @returns {Promise<string|null>}
 */
export async function runGitNonEmpty(repoRoot, args) {
  const out = await runGit(repoRoot, args)
  if (out === null) return null
  return out.trim() === '' ? null : out
}
