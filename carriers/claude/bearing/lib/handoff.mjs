// The handoff mechanism — the mechanical half of writing and reading a baton.
//
// Derived from:
//
//   conversation-handoff  エージェントのネイティブなコンテキスト圧縮やリセット機能では
//                         なく、セッションを跨ぐコンテキスト伝達のために固有の会話引き
//                         継ぎ機能を備える
//   handoff-low-cost      早期の会話引き継ぎを安く行えるようにする。これにより、
//                         コンテキスト鮮度を保ち、出力品質向上、無駄なコストの抑制を維持
//   handoff-on-demand     人間の任意タイミングでの会話引き継ぎを行える
//   handoff-review-gate   引き継ぎ内容は、その前に人間が確認し、内容に漏れや修正がある
//                         場合に書き直しを指示できる
//   operator-single-producer  人間が1度に対話するエージェントは常に単一である
//
// ═══ What is mechanism here, and what is emphatically not ═══════════════════
//
// `handoff.md` states the load-bearing claim plainly: **the value of the method
// is the authoring judgment, not the structure of the baton.** What to keep and
// what to drop as re-derivable is precisely what native compaction lacks. ∴
// nothing in this file writes a word of a baton, summarises anything, or decides
// what matters.
//
// What it does own is everything around that judgment which is pure bookkeeping
// and easy to get wrong by hand — and `handoff-low-cost` says the cost of the
// ritual is itself a target, because an expensive hand-off is one the operator
// puts off until the context is already degraded:
//
//   - archive rotation to an exact UTC name, BEFORE the new baton lands
//   - `composed-at` stamped from the clock, not from the author's memory
//   - `read-at` stamped on read (step 3), returning the OLD value first (step 2)
//   - the aim trace (step 4) that the baton structurally under-reports
//
// ⚠ **`read-at` is never written by the writer.** A new baton has not been read;
// the canon says so, and a writer that stamped it would make "already read" mean
// nothing.
//
// Placement is `.handoff/` beside the cwd, machine-local, never committed. That
// is a CONSEQUENCE of the purpose (`operator-single-producer`): what a baton
// protects is the continuity of ONE conversation between the operator and one
// session, so acquiring the means to cross machines never creates a reason to.

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const HANDOFF_DIR = '.handoff'
export const ACTIVE = 'active.md'
export const ARCHIVE = 'archive'

export const activePath = (unitRoot) => path.join(unitRoot, HANDOFF_DIR, ACTIVE)
export const archiveDir = (unitRoot) => path.join(unitRoot, HANDOFF_DIR, ARCHIVE)

/**
 * `YYYY-MM-DDTHHMMSSZ` — the archive file name the canon specifies.
 *
 * Colons are stripped rather than escaped: the name has to be a legal file name
 * on Windows too, and `:` is not. That is not a compromise of the format, it is
 * why the format is written this way.
 */
export function archiveStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '')
}

/**
 * Move the current baton into the archive, if there is one.
 *
 * ⚠ **Rotation happens on WRITE, never on read.** The canon is explicit: a
 * reader does not archive, so reading the same baton twice is possible — and
 * detecting that is exactly what `read-at` is for. Preventing it is not a goal.
 *
 * @returns {Promise<string|null>} the archive path, or null if nothing to move
 */
export async function archiveActive(unitRoot, date = new Date()) {
  const src = activePath(unitRoot)
  try {
    await readFile(src, 'utf8')
  } catch {
    return null // Nothing to rotate is the normal first-ever write.
  }
  const dir = archiveDir(unitRoot)
  await mkdir(dir, { recursive: true })
  let dest = path.join(dir, `${archiveStamp(date)}.md`)
  // Two hand-offs in the same second is not a case worth losing one over.
  for (let n = 2; ; n++) {
    try {
      await readFile(dest, 'utf8')
      dest = path.join(dir, `${archiveStamp(date)}-${n}.md`)
    } catch {
      break
    }
  }
  await rename(src, dest)
  return dest
}

/**
 * Ensure the authored markdown carries a `composed-at`, stamped from the clock.
 *
 * ⚠ An author-supplied `composed-at` is REPLACED, not trusted. It is the one
 * field a session cannot know better than the clock, and a wrong one makes the
 * reader's "this baton is several days old" line lie.
 *
 * ⚠ An author-supplied `read-at` is REMOVED. A new baton has not been read.
 */
export function stampComposedAt(markdown, date = new Date()) {
  const iso = date.toISOString().replace(/\.\d+Z$/, 'Z')
  const m = markdown.match(/^---\r?\n([\s\S]*?\r?\n)---(\r?\n[\s\S]*)$/)
  if (!m) {
    // No frontmatter at all: give it one rather than refusing. The baton's
    // value is its body, and a missing delimiter is not worth losing that over.
    return `---\ncomposed-at: ${iso}\n---\n\n${markdown.replace(/^\n+/, '')}`
  }
  const front = m[1]
    .split(/\r?\n/)
    .filter((l) => !/^(composed-at|read-at):/.test(l))
    .filter((l, i, a) => !(l === '' && i === a.length - 1))
  front.unshift(`composed-at: ${iso}`)
  return `---\n${front.join('\n')}\n---${m[2]}`
}

/**
 * Rotate, then place the authored baton.
 *
 * ⚠ **This does not gate on review** — `handoff-review-gate` puts the operator's
 * confirmation BEFORE this call, in the conversation, where a human can say
 * "you dropped the reason we abandoned X". A mechanical gate here would only be
 * able to check shape, and shape is not what the gate is for.
 */
export async function writeBaton(unitRoot, markdown, date = new Date()) {
  const archived = await archiveActive(unitRoot, date)
  const dir = path.join(unitRoot, HANDOFF_DIR)
  await mkdir(dir, { recursive: true })
  const text = stampComposedAt(markdown, date)
  await writeFile(activePath(unitRoot), text.endsWith('\n') ? text : text + '\n', 'utf8')
  return { path: activePath(unitRoot), archived }
}

/**
 * Steps 2 and 3 of the reading procedure, in the order the canon puts them.
 *
 * Returns the PREVIOUS `read-at` (step 2 — the fact to report in one line) and
 * then stamps the new one (step 3). Doing it in one call is what keeps the
 * order right: a reader who stamps first has destroyed the thing they were
 * meant to report.
 *
 * ⚠ Reporting a prior read is a FACT, never a warning and never a reason to
 * refuse. Reading an old baton on purpose is a thing people do.
 */
export async function stampReadAt(unitRoot, date = new Date()) {
  const file = activePath(unitRoot)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }
  const iso = date.toISOString().replace(/\.\d+Z$/, 'Z')
  const previousReadAt = text.match(/^read-at:\s*(.*)$/m)?.[1].trim() || null
  const composedAt = text.match(/^composed-at:\s*(.*)$/m)?.[1].trim() || null
  let next
  if (previousReadAt !== null) {
    next = text.replace(/^read-at:.*$/m, `read-at: ${iso}`)
  } else if (/^composed-at:.*$/m.test(text)) {
    next = text.replace(/^(composed-at:.*)$/m, `$1\nread-at: ${iso}`)
  } else {
    // No frontmatter to stamp into. The read still happened; say so by
    // returning the facts, and leave the file alone rather than inventing one.
    return { previousReadAt, composedAt, stamped: false }
  }
  await writeFile(file, next, 'utf8')
  return { previousReadAt, composedAt, stamped: true }
}

/** Archived batons, newest first. */
export async function listArchive(unitRoot) {
  try {
    return (await readdir(archiveDir(unitRoot)))
      .filter((n) => n.endsWith('.md'))
      .sort()
      .reverse()
  } catch {
    return []
  }
}
