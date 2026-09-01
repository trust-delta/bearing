// `# PROCESS` — the marks that say which means are implemented, and the count
// of nodes that still carry an unimplemented one.
//
// Derived from:
//
//   phase-producer       「PROCESS」で表現される進捗を可視化された実装手順は ...
//                        各単位ごとに実装済・未実装をエージェントが事実として安く
//                        把握し記載、人間が進捗の確認をできる
//   aim-backlog-triage   Aimは開発の駆動力であり、エージェントはAimの未実装の手段に
//                        注意を払う必要がある
//   aim-state-dead       state:deadは、その目的そのものを「やらないことに決めた」場合
//
// ⚠ **No aim statement decides the NOTATION.** "実装済・未実装" names the two
// states and nothing about how they are written. So the corpus is the only
// ground there is, and it was measured across all 77 nodes: `-` bullets
// 296/296, lowercase `done`/`todo` only, zero indent only, every one directly
// under `# PROCESS`, zero deeper headings inside a PROCESS section.
//
// ⚠ **Measuring the form does not license enforcing it.** A parser strict
// enough to match today's corpus will SILENTLY MISS a `* [todo]` written
// tomorrow, and a silently missed todo is `drift-git`'s bad sensor — worse than
// no sensor, because the count still looks authoritative. A permissive parser
// fails the other way: it silently absorbs a deviation and the corpus drifts
// into two notations with nobody told.
//
// ∴ neither silence. The observed form is parsed as the mark; anything that
// LOOKS like a mark and is not in that form is counted nowhere and REPORTED as
// an anomaly. The count stays honest and the deviation stays visible.
//
// The dead exclusion is `aim-state-dead`: a purpose someone decided not to
// pursue has no unimplemented means, only abandoned ones.

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { aimRelPath, parseAimRecord, readAimSlugs } from './corpus.mjs'

/**
 * The mark, as the corpus writes it: line-start, `-` bullet, lowercase word.
 *
 * ⚠ **No space is required after the bracket.** The first cut of this parser
 * demanded one and dropped 3 real marks — every one of them `- [todo]（…`, a
 * full-width paren butted straight against the bracket. Three real items went
 * missing from the backlog and surfaced in the anomaly list. The bracket IS the
 * token; what follows it is prose, and prose
 * in Japanese does not owe an ASCII space.
 */
const MARK = /^- \[(done|todo)\]/
/**
 * Anything a reader would call a mark. Deliberately wider than `MARK` — this is
 * the net that catches what the strict form would drop on the floor.
 */
const MARK_ISH = /^(\s*)([-*+])\s+\[([A-Za-z]+)\]/

/** A fence opener/closer: line-start, at most 3 spaces of indent (CommonMark). */
const FENCE_LINE = /^ {0,3}(```+|~~~+)/

/**
 * Strip inline code spans WITHIN one line.
 *
 * ⚠ The corpus-wide `stripCodeSpans` must not be used here. It removes fenced
 * blocks with one global regex over the whole document, so it deletes and
 * merges LINES — and this parser's whole job is line-structured. Worse, its
 * fenced-block pattern matches a ``` appearing mid-line inside an inline span
 * (`` ` ```tmai-aim-drift ` ``, which this corpus writes), so it opened a
 * phantom fence and swallowed everything down to the next ``` anywhere below.
 * Measured: that alone reported a real `# PROCESS` mark as living outside the
 * section. Same law, applied at the granularity that keeps
 * the structure intact.
 */
const stripInlineCode = (line) => line.replace(/`[^`]*`/g, '')

/**
 * Split a record body into its `# PROCESS` section and everything else.
 *
 * A section runs from its `# ` heading to the next `# ` heading. `producer-
 * guide.md` gives the body top-level sections (`# IS`, `# PROCESS`, `# HISTORY`,
 * `# DAG`), so a `## ` inside PROCESS is a deeper level the corpus does not use
 * — reported as an anomaly rather than guessed at.
 *
 * @param {string} body
 * @returns {{process: {line: string, no: number}[], outside: {line: string, no: number}[], nestedHeading: string|null}}
 */
export function splitProcess(body) {
  const process = []
  const outside = []
  let inProcess = false
  let inFence = false
  let hasHeading = false
  let nestedHeading = null
  body.split(/\r?\n/).forEach((raw, i) => {
    // Fence state first: a heading or a mark inside a fenced block is quoted,
    // not asserted — the same law `stripCodeSpans` carries, tracked here where
    // applying it cannot cost a line.
    if (FENCE_LINE.test(raw)) {
      inFence = !inFence
      return
    }
    if (inFence) return
    const line = stripInlineCode(raw)
    if (/^#\s/.test(line)) {
      inProcess = /^#\s+PROCESS\s*$/.test(line)
      if (inProcess) hasHeading = true
      return
    }
    if (inProcess && /^#{2,}\s/.test(line)) nestedHeading ??= line.trim()
    ;(inProcess ? process : outside).push({ line, no: i + 1 })
  })
  return { process, outside, nestedHeading, hasHeading }
}

/**
 * Parse one record body's marks.
 *
 * @param {string} body
 * @returns {{done: number, todo: number, anomalies: {kind: string, line: string, no: number}[]}}
 */
export function parseProcessMarks(body) {
  const { process, outside, nestedHeading, hasHeading } = splitProcess(body)
  let done = 0
  let todo = 0
  const anomalies = []
  if (nestedHeading) {
    anomalies.push({ kind: 'nested-heading', line: nestedHeading, no: 0 })
  }
  for (const { line, no } of process) {
    const strict = line.match(MARK)
    if (strict) {
      if (strict[1] === 'done') done++
      else todo++
      continue
    }
    const loose = line.match(MARK_ISH)
    if (!loose) continue
    const [, indent, bullet, word] = loose
    const kind =
      indent.length > 0 ? 'indented'
      : bullet !== '-' ? 'bullet'
      : /^(done|todo)$/i.test(word) ? 'case'
      : 'unknown-mark'
    anomalies.push({ kind, line: line.trim(), no })
  }
  // A mark outside `# PROCESS` is the third silence: it is written as progress
  // and read by nothing.
  for (const { line, no } of outside) {
    if (MARK_ISH.test(line)) {
      anomalies.push({ kind: 'outside-process', line: line.trim(), no })
    }
  }
  // ⚠ A `# PROCESS` heading with no readable mark is `unknown`, and `unknown`
  // must never be folded into "nothing to do". This is a soft prose parse, not
  // a hard git computation, so when it cannot read it says so — an honest
  // `unknown` beats a fabricated `done`. That asymmetry is the whole of the
  // authority this layer is granted.
  const unknown = hasHeading && done === 0 && todo === 0
  return { done, todo, unknown, anomalies }
}

/**
 * The backlog facts for one repo.
 *
 * `openTodoNodes` counts NODES, not marks — `aim-backlog-triage` asks the agent
 * to attend to aims carrying unimplemented means, and an aim with nine open
 * marks is still one aim to attend to.
 *
 * @param {string} repoRoot
 * @returns {Promise<{openTodoNodes: number, unknownNodes: string[], anomalies: {slug: string, kind: string, line: string, no: number}[]}>}
 */
export async function gatherBacklog(repoRoot) {
  const slugs = await readAimSlugs(repoRoot)
  let openTodoNodes = 0
  const unknownNodes = []
  const anomalies = []
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug)), 'utf8')
    } catch {
      continue
    }
    const record = parseAimRecord(text)
    const marks = parseProcessMarks(record.body)
    for (const a of marks.anomalies) anomalies.push({ slug, ...a })
    if (record.state === 'dead') continue
    if (marks.unknown) unknownNodes.push(slug)
    if (marks.todo > 0) openTodoNodes++
  }
  return { openTodoNodes, unknownNodes, anomalies }
}
