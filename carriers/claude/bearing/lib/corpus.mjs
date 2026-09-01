// Reading a repo's aim corpus.
//
// What a corpus IS is settled by `docs/aims/_guide/producer-guide.md`: one file
// per aim, frontmatter the human's and body the agent's, a child naming its
// parent, and the slug being the file name. Everything below reads from those
// and adds nothing of its own.

import { readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Is this directory entry an aim record?
 *
 * A `.md` file whose stem is not `README` — `aim-slug-producer-owned` makes
 * the file name the identity, so anything that is not a record's file is not a
 * record. The `_guide/` directory falls out for free (it is a directory, not a
 * `.md`), which is why the canon's own files never appear as aim nodes.
 *
 * @param {string} name a bare file name, not a path
 */
export function isAimRecord(name) {
  if (path.extname(name) !== '.md') return false
  return path.basename(name, '.md') !== 'README'
}

/**
 * Every aim slug under `<repoRoot>/docs/aims`, sorted ascending.
 *
 * A missing directory yields `[]`: `multi-repo-project` makes plural repos
 * normal, and a member repo that has not adopted the corpus is the structurally
 * normal state, not an error. The
 * sort is plain alphabetical — aim slugs carry no date, so there is no recency
 * dimension to order on; this is just a stable, deterministic walk.
 *
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export async function readAimSlugs(repoRoot) {
  const aimsDir = path.join(repoRoot, 'docs', 'aims')
  let entries
  try {
    entries = await readdir(aimsDir, { withFileTypes: true })
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
  return entries
    .filter((e) => e.isFile() && isAimRecord(e.name))
    .map((e) => path.basename(e.name, '.md'))
    .sort()
}

/**
 * The repo-relative pathspec for one aim node.
 *
 * git pathspecs use `/` on every platform, so the separator is normalised
 * rather than taken from `path.join` — without this the
 * per-file signal is lost on Windows, where the porcelain output this is
 * compared against still says `docs/aims/x.md`.
 *
 * @param {string} slug
 */
export function aimRelPath(slug) {
  return `docs/aims/${slug}.md`
}

// --- The graph the drift fences read -------------------------------------
//
// Derived from the `aim:` statements, not from any prior implementation:
// `aim-tree-pin` (a child names its parent), `aim-cross-edge-link` (`# DAG`
// carries the edges the tree cannot reach) and `aim-file-purpose-and-means`
// (frontmatter is the human's, body is the agent's — so both carry claims).

/**
 * Remove fenced blocks and inline code spans.
 *
 * Measured against this corpus: the bare `[[…]]` regex calls 24 of 564
 * references unresolved, and every one of them is metasyntax quoted inside
 * backticks (`` `[[slug]]` ``, `` `[[unit]]` ``). Stripping code spans takes it
 * to zero. The law is that **what sits inside a code span is quoted, not
 * asserted** — the same law this repo's `SHIPPED` guard already applies from the
 * other direction, and the same one a path check got wrong when it matched a
 * backticked `.handoff/active.md`.
 */
export function stripCodeSpans(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

/**
 * Parse one aim record into the facts the fences need.
 *
 * The quote strip is not decoration: exactly one node in this corpus of 77
 * writes `parent: "operator-single-producer"`, and without it that node — which
 * happens to be `conversation-handoff` — silently falls out of the tree. A
 * sensor that drops a node is the failure `drift-git` names.
 */
export function parseAimRecord(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  const front = m ? m[1] : ''
  const body = m ? m[2] : text
  const field = (key) => {
    // ⚠ `\\s` not `\s`: inside a template literal an unrecognised escape loses
    // its backslash, so `\s*` became `s*` — zero-or-more literal `s`. It parsed
    // this corpus correctly only because every line is `aim: …` with one space
    // and the value is trimmed afterwards.
    const hit = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    if (!hit) return null
    const raw = hit[1].trim()
    const unquoted = raw.replace(/^(["'])([\s\S]*)\1$/, '$2')
    return unquoted === '' ? null : unquoted
  }
  const links = [
    ...new Set(
      [...stripCodeSpans(body).matchAll(/\[\[([^\]\n]+)\]\]/g)].map((x) => x[1].trim()),
    ),
  ]
  // `last-verified` is the sparse 4th human field (`aim-code-drift`): absence is
  // a first-class third state — not yet under aim⊥code watch — never a default
  // to fill in. `body` is returned because `# PROCESS` lives there and the mark
  // parser must not re-split the frontmatter.
  return {
    aim: field('aim'),
    parent: field('parent'),
    state: field('state'),
    lastVerified: field('last-verified'),
    body,
    links,
  }
}

/**
 * Read every aim record in a repo and index its neighbours.
 *
 * A neighbour is the parent, a child, an outbound `[[link]]` or an inbound one.
 * `producer-guide.md` names exactly that set ("親・子・`[[link]]` 先・自身"),
 * and inbound edges belong because a claim about this node lives over there.
 * Edges that do not resolve to a live record are dropped rather than reported:
 * a dangling reference is a corpus question, not a drift fact.
 */
export async function readAimGraph(repoRoot) {
  const slugs = await readAimSlugs(repoRoot)
  if (slugs === null) return null
  const { readFile } = await import('node:fs/promises')
  const path = (await import('node:path')).default
  const nodes = new Map()
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug)), 'utf8')
    } catch {
      continue // Racing with a delete is not a drift fact.
    }
    nodes.set(slug, parseAimRecord(text))
  }
  const children = new Map()
  const inbound = new Map()
  const push = (map, key, value) => {
    if (!nodes.has(key)) return
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const [slug, node] of nodes) {
    if (node.parent) push(children, node.parent, slug)
    for (const link of node.links) push(inbound, link, slug)
  }
  const neighbours = (slug) => {
    const node = nodes.get(slug)
    if (!node) return []
    const all = [node.parent, ...(children.get(slug) ?? []), ...node.links, ...(inbound.get(slug) ?? [])]
    return [...new Set(all.filter((x) => x && x !== slug && nodes.has(x)))]
  }
  return { nodes, neighbours }
}
