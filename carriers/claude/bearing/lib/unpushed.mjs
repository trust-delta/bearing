// The `tmai-aim-unpushed v1` fence — aim changes that are committed but have
// not reached the remote.
//
// Derived from:
//
//   knowledge-crossing     開発で得た知識は、それを得たマシンや会話に閉じず、次に
//                          判断する人へ届く
//   source-of-truth-tmai   リモートをsource of truthとして ...
//   git-local-fact-source  ローカルgitをground-truthとし、その履歴 ... を最大限活用する
//
// Those settle both the fact and why it is worth a session's attention. An aim
// change sitting between HEAD and `@{upstream}` is knowledge that HAS been
// committed — so it is not in the working-delta layer — and has NOT crossed, so
// the next person to judge cannot see it. It is the one aim state that is
// invisible from both ends: the remote does not have it, and a reader of the
// working tree sees it as settled history.
//
// ⚠ It matters to a SESSION for a second reason, from `conversation-handoff`:
// a baton is chosen forward, so it under-reports how the aims were touched on
// the way. This fence carries the backward trace the baton drops.
//
// No upstream — a branch never pushed, a repo with no remote — yields no facts,
// not zero facts. `@{upstream}` fails and `runGit` collapses to null, which the
// caller must read as "could not look", exactly as everywhere else.

import { runGit } from './git.mjs'
import { readAimSlugs } from './corpus.mjs'

export const UNPUSHED_FENCE_TAG = 'tmai-aim-unpushed v1'

const AIMS_DIR = 'docs/aims/'

/**
 * Parse `--format=%H%x09%cI --name-only` into `{sha, date, files}`, newest
 * first.
 *
 * The committer date, not the author date: what this fence measures is when the
 * change entered THIS history, and a rebase or a cherry-pick keeps an author
 * date that no longer says anything about when the knowledge stopped crossing.
 */
export function parseUnpushedLog(out) {
  const commits = []
  let current = null
  for (const line of out.split(/\r?\n/)) {
    const head = line.match(/^([0-9a-f]{40})\t(.+)$/)
    if (head) {
      current = { sha: head[1], date: head[2], files: [] }
      commits.push(current)
    } else if (line.trim() !== '' && current) {
      current.files.push(line.trim())
    }
  }
  return commits
}

/**
 * Gather the unpushed aim facts for one repo.
 *
 * @param {string} repoRoot
 * @param {string[]} slugs live slugs, so history's ghosts are filtered out
 * @returns {Promise<{slug: string, aheadCommits: number, latestSha: string, latestDate: string}[]|null>}
 */
export async function gatherUnpushed(repoRoot, slugs) {
  if (slugs.length === 0) return []
  const live = new Set(slugs)
  const out = await runGit(repoRoot, [
    'log', '@{upstream}..HEAD', '--format=%H%x09%cI', '--name-only', '--', AIMS_DIR,
  ])
  // Null is "no upstream to compare against" as often as it is "git failed",
  // and the two are the same answer here: no facts.
  if (out === null) return null

  const perSlug = new Map()
  for (const c of parseUnpushedLog(out)) {
    for (const f of c.files) {
      if (!f.startsWith(AIMS_DIR) || !f.endsWith('.md')) continue
      const slug = f.slice(AIMS_DIR.length, -3)
      // Intersect with the live corpus: history carries paths that renames and
      // deletions have taken away, and reporting on those reports on ghosts.
      if (slug.includes('/') || !live.has(slug)) continue
      const seen = perSlug.get(slug)
      // Newest first, so the first sighting of a slug is its latest commit.
      if (seen) seen.aheadCommits++
      else perSlug.set(slug, { slug, aheadCommits: 1, latestSha: c.sha, latestDate: c.date })
    }
  }
  return [...perSlug.values()].sort((a, b) =>
    a.latestDate === b.latestDate
      ? a.slug < b.slug ? -1 : 1
      : a.latestDate < b.latestDate ? 1 : -1,
  )
}

/**
 * Render the fence.
 *
 * ⚠ `null` (could not look) and `[]` (looked, nothing there) must not print the
 * same line. "no upstream" is a fact about the repo the reader may need; "no
 * unpushed aims" is a fact about the corpus. Collapsing them is the silence
 * `git.mjs` forbids.
 */
export function renderUnpushedFence(items) {
  const lines = [
    '```' + UNPUSHED_FENCE_TAG,
    '# fields: slug | ahead_commits | latest_sha | latest_date',
  ]
  if (items === null) {
    lines.push('# none — no upstream to compare against for this repo (or git could not be read)')
  } else if (items.length === 0) {
    lines.push('# none — no un-pushed aim commits for this repo at compose time')
  } else {
    for (const it of items) {
      lines.push(`${it.slug} | ${it.aheadCommits} | ${it.latestSha.slice(0, 8)} | ${it.latestDate}`)
    }
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
