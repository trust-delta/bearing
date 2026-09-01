// Thin `git` wrapper for the aim plugin.
//
// ⚠ **The "ported verbatim" claim this header used to carry is retracted**
// (`out-tmai-distribution`, operator 2026-08-31): the source of truth is the
// `aim:` sentence, not the Rust build. The contract below is derived, and it
// derives from `git-local-fact-source` — local git is the ground truth, so what
// git cannot tell us is not ours to supply: **a fact we cannot observe is
// absent, never fabricated.** Every failure mode — spawn failure, non-zero
// exit, timeout — collapses to `null`, and callers treat `null` as "no facts",
// never as "no drift".
//
// That the Rust build reached the same contract is unsurprising and is not the
// warrant for it. The warrant is the aim statement.
//
// `execFile` is used deliberately instead of `exec`: it does not go through a
// shell, so the MSYS argument mangling `docs/runbook/windows.md` warns about
// (`:` → `;`, `/` → `\`) cannot happen. That is one of the three reasons this
// port is in Node rather than bash.

import { execFile } from 'node:child_process'

/**
 * A ceiling on any single git call.
 *
 * Not derived from an aim statement — it is a refusal to hang the SessionStart
 * hook, which has a wall-clock budget it cannot exceed without obstructing the
 * session it exists to inform.
 */
export const GIT_TIMEOUT_MS = 5_000

/**
 * Run `git -C <repoRoot> <args...>`.
 *
 * @param {string} repoRoot
 * @param {string[]} args
 * @returns {Promise<string|null>} stdout on success; `null` on timeout, spawn
 *   failure, or non-zero exit.
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
 * `runGit`, but an empty stdout is also `null`.
 *
 * `git log -1 -- <path>` exits 0 with empty output when a path has no
 * committed history, and that is an absence of fact, not a fact. Same law as
 * above, at the one place git reports absence through success.
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
