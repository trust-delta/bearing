// Rendering the mid-session delta.
//
// Split from `bin/corpus-delta.mjs` for one reason: `bin/aim-facts.mjs` has to
// agree with it. The composer seeds the session's baseline from facts it has
// ALREADY gathered, and if the two sides computed "what would be said" by
// different code they would drift apart silently — the boot baseline claiming
// one thing and the first batch reporting a change that never happened.
//
// ⚠ **Nothing here judges.** `aim-upkeep` puts the cheap machine layer at
// *visibility*: the fences state what is, the agent inspects, the human
// decides. The open-todo line says so in as many words, because a count that
// arrives without that sentence invites the triage the régime withholds.

import { renderWorkingDeltaFence } from './working-delta.mjs'

/**
 * @param {{
 *   repos: {label: string, working: object[], backlog: {openTodoNodes: number, unknownNodes: string[], anomalies: object[]}}[],
 *   moved: {label: string, from: string, to: string, blocks?: string[]}[],
 *   hadBaseline: boolean,
 * }} args
 * @returns {string} '' when the unit carries no corpus at all
 */
export function renderCorpusDelta({ repos, moved = [], hadBaseline = true }) {
  if (!repos || repos.length === 0) return ''

  const movedBy = new Map(moved.map((m) => [m.label, m]))
  const lines = []
  let openTodo = 0
  const unknown = []
  const anomalies = []

  lines.push('# aim facts — the corpus moved since this session was given its facts', '')
  if (!hadBaseline) {
    lines.push(
      '⚠ **No boot baseline was recorded for this session**, so this is not a diff —',
      'it is the corpus as it stands now. Absent, not clean.',
      '',
    )
  }

  for (const r of repos) {
    openTodo += r.backlog?.openTodoNodes ?? 0
    for (const s of r.backlog?.unknownNodes ?? []) unknown.push(`${r.label}/${s}`)
    for (const a of r.backlog?.anomalies ?? []) anomalies.push({ repo: r.label, ...a })

    lines.push(`### ${r.label}`, '')
    const m = movedBy.get(r.label)
    if (m) {
      lines.push(
        `⚠ **HEAD moved over \`docs/aims/\`**: \`${short(m.from)}\` → \`${short(m.to)}\`. ` +
          'The history fences below are recomputed; the ones you were given at boot',
        'are superseded, not merely older.',
        '',
      )
    }
    lines.push(renderWorkingDeltaFence(r.working ?? null).trimEnd(), '')
    for (const b of m?.blocks ?? []) lines.push(b.trimEnd(), '')
  }

  lines.push(
    `**open-todo: ${openTodo}** — aim nodes whose \`# PROCESS\` carries at least one`,
    '`[todo]`, excluding `state: dead` nodes. Surface this number; do not triage it,',
    "rank it, or propose which to work — the pick is the operator's.",
    '',
  )

  if (unknown.length > 0) {
    lines.push(
      `⚠ **${unknown.length} node(s) carry a \`# PROCESS\` heading with no readable mark**: ` +
        unknown.join(', '),
      'Reading that as zero would be a fabricated `[done]`.',
      '',
    )
  }
  if (anomalies.length > 0) {
    lines.push('⚠ **Notation anomalies** — marks this parser will not count:', '')
    for (const a of anomalies) {
      lines.push(`- \`${a.repo}/${a.slug}\` line ${a.no} (${a.kind}): ${a.line.trim()}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function short(sha) {
  return typeof sha === 'string' && sha.length > 8 ? sha.slice(0, 8) : (sha ?? 'none')
}
