// The unit — the set of repos one session is about.
//
// Derived from the `aim:` statements, not ported:
//
//   producer-cwd        Producerエージェントが立ち上がったcwdをプロジェクトとする
//   cwd-git             cwd自身を含めて下階層に向かってgitを探索し、各枝で初めて
//                       現れたものをプロジェクト内で管理するリポジトリとする
//   multi-repo-project  プロジェクトは複数のリポジトリから構成される場合もある
//
// Three things fall out of those three sentences and nothing else does:
//
//   1. The walk starts at cwd and goes DOWN. It never climbs. A session opened
//      inside one member repo is a session about that repo alone — that is the
//      cwd defining the project, not a mistake to correct by finding the
//      wrapper above.
//   2. "各枝で初めて現れたもの" makes the walk prune on hit. A repo's own
//      submodules and vendored checkouts are inside it, so they are its
//      business, not the unit's.
//   3. Plural is normal, so nothing here treats a second repo as an error.
//
// ⚠ The caps below are NOT derived — no aim statement names a depth or a count.
// They exist because this runs in a SessionStart hook with a wall-clock budget,
// and an unbounded walk of an arbitrary cwd (a home directory, `/`) would hang
// the session it is supposed to inform. They are stated as what they are:
// a refusal to hang, not a claim about how projects are shaped. When a cap
// bites, the fact is REPORTED rather than silently applied — a truncated unit
// that looks complete is the "bad sensor is worse than no sensor" failure
// `drift-git` names.

import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

/** How deep below cwd a repo may be found. Not derived — a hang refusal. */
export const MAX_DEPTH = 4
/** How many repos a unit may hold. Not derived — a hang refusal. */
export const MAX_REPOS = 12

/**
 * Directory names never worth descending into.
 *
 * Every one of these is a place where a `.git` would belong to something other
 * than this project — a dependency's vendored checkout, a build artifact, a
 * worktree's own bookkeeping. `node_modules` alone can hold hundreds.
 */
const SKIP = new Set([
  'node_modules', 'target', 'dist', 'build', 'out', 'vendor',
  '.venv', 'venv', '__pycache__', '.next', '.turbo', '.cache',
])

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Resolve the unit rooted at `cwd`.
 *
 * @param {string} cwd
 * @returns {Promise<{root: string, name: string, repos: {root: string, label: string, primary: boolean}[], truncated: null|'depth'|'count'}>}
 */
export async function resolveUnit(cwd) {
  const root = path.resolve(cwd)
  const found = []
  let truncated = null

  // Breadth-first, so a shallow repo is never lost to a deep branch that filled
  // the cap first. Depth order is the only order the aim statements imply
  // ("下階層に向かって") — within a level the sort is alphabetical for
  // determinism, which no statement demands but every reader does.
  let level = [root]
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next = []
    for (const dir of level.sort()) {
      if (found.length >= MAX_REPOS) {
        truncated = 'count'
        break
      }
      if (await isDir(path.join(dir, '.git'))) {
        // Hit. Prune: whatever is below belongs to THIS repo.
        found.push(dir)
        continue
      }
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue // Unreadable is not a repo and not an error worth stopping for.
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue
        next.push(path.join(dir, e.name))
      }
    }
    if (found.length >= MAX_REPOS) {
      truncated = 'count'
      break
    }
    if (depth === MAX_DEPTH && next.length > 0) truncated = 'depth'
    level = next
  }

  // Primary: the repo the session is most plausibly *about*. cwd itself wins —
  // it is what `producer-cwd` points at. Otherwise the one whose directory name
  // matches the unit's, which is the shape a wrapper takes when it is named for
  // the thing it wraps. Otherwise the first found. This is a display ordering,
  // never a filter: every repo carries facts and every repo's facts are emitted.
  const name = path.basename(root)
  const primaryIdx = found.indexOf(root) !== -1
    ? found.indexOf(root)
    : Math.max(0, found.findIndex((r) => path.basename(r) === name))

  const repos = found.map((r, i) => ({
    root: r,
    label: path.basename(r),
    primary: i === primaryIdx,
  }))
  // Primary first; the rest keep discovery order.
  repos.sort((a, b) => (a.primary === b.primary ? 0 : a.primary ? -1 : 1))

  return { root, name, repos, truncated }
}
