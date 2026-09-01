#!/usr/bin/env node
// The handoff CLI — the bookkeeping half of the baton ritual.
//
// `handoff.md` owns the procedure and the judgment; this owns the four steps in
// it that are pure mechanism and easy to get wrong by hand. `handoff-low-cost`
// makes that worth doing: the cost of the ritual is itself the target, because
// an expensive hand-off is one the operator defers until the context has
// already degraded — which is the failure the whole method exists to avoid.
//
//   handoff.mjs read    steps 2-4 of 「読む」: report the previous read-at, stamp
//                       the new one, and surface the aim trace the baton
//                       structurally under-reports.
//   handoff.mjs write   step 1 of 「書く」: rotate the current baton into the
//                       archive, then place the authored one from stdin with a
//                       `composed-at` stamped from the clock.
//   handoff.mjs trace   the aim trace alone.
//
// ⚠ **Nothing here authors, summarises, or judges.** What to keep and what to
// drop as re-derivable is the judgment native compaction lacks, and it is the
// entire value of the method. Mechanising it would be mechanising the point away.

import path from 'node:path'
import { readAimSlugs } from '../lib/corpus.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherUnpushed } from '../lib/unpushed.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { listArchive, stampReadAt, writeBaton } from '../lib/handoff.mjs'
import { readBaton } from '../lib/baton.mjs'

const out = []
const say = (...l) => out.push(...l)

/**
 * Step 4: the aim trace.
 *
 * ⚠ **This is not a nicety.** The canon states the reason and it is structural:
 * a baton is chosen FORWARD, so it under-reports how the aims were touched on
 * the way — and re-reading an aim gives you its arrived-at state, never the
 * change. This diff is the only thing that carries the change.
 */
async function trace(unit) {
  const rows = []
  for (const repo of unit.repos) {
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    const [working, unpushed] = await Promise.all([
      gatherWorkingDelta(repo.root, slugs),
      gatherUnpushed(repo.root, slugs),
    ])
    // A trace that omits what it could not read is a trace that lies by
    // omission — the same fabrication the fence itself now refuses.
    if (working === null) {
      rows.push(repo.label + ' | — | working-delta unavailable (git could not be read)')
    }
    for (const w of working ?? []) {
      rows.push(`${repo.label} | ${w.slug} | ${w.untracked ? 'untracked' : 'uncommitted'}`)
    }
    for (const u of unpushed ?? []) {
      rows.push(`${repo.label} | ${u.slug} | unpushed (${u.aheadCommits} commit(s), ${u.latestSha.slice(0, 8)})`)
    }
  }
  say('```tmai-aim-trace v1', '# fields: repo | slug | state')
  if (rows.length === 0) {
    say('# none — no uncommitted or un-pushed aim changes in this unit')
  } else {
    for (const r of rows) say(r)
  }
  say('```', '')
  if (rows.length > 0) {
    say(
      '**Re-read every slug above.** A baton is chosen forward, so it under-reports',
      'how the aims were touched on the way; re-reading an aim gives you its',
      'arrived-at state, never the change. This diff is the only carrier of the change.',
      '',
    )
  }
  // ⚠ Stated because it is a hole, not a caveat: this only sees tracked
  // `docs/aims/`. Untracked local changes are invisible here by construction,
  // so the baton's prose is the only record of them.
  say('⚠ This trace sees only tracked `docs/aims/`. Untracked local changes cannot', 'appear here — the baton\'s own words are their only record.', '')
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
  })
}

async function main() {
  const verb = process.argv[2] ?? 'read'
  const unit = await resolveUnit(process.cwd())

  if (verb === 'trace') {
    await trace(unit)
    return 0
  }

  if (verb === 'write') {
    const markdown = await readStdin()
    if (markdown.trim() === '') {
      process.stderr.write(
        'handoff write: nothing on stdin. The baton is authored by you and piped in;\n' +
          'this command only rotates the old one and stamps the new one.\n',
      )
      return 2
    }
    const { path: p, archived } = await writeBaton(unit.root, markdown)
    say(`baton written: ${p}`)
    say(archived ? `previous baton archived: ${archived}` : 'no previous baton to archive')
    say(
      '',
      '**Report to the operator what you kept and what you left out, in 1-2 lines.**',
      'That is step 3 of 「書く」, and it is the only part a reader of the baton',
      'cannot reconstruct.',
      '',
    )
    return 0
  }

  if (verb !== 'read') {
    process.stderr.write(`handoff: unknown verb '${verb}'. Use: read | write | trace\n`)
    return 2
  }

  // ── read: steps 2-4 ───────────────────────────────────────────────────────
  const baton = await readBaton(unit.root)
  if (!baton) {
    say(
      `No baton at \`${path.join(unit.root, '.handoff', 'active.md')}\` — fresh start.`,
      '',
      '⚠ An empty baton is not an empty project. Surface the open-todo count before',
      'reporting that there is nothing to pick up.',
      '',
    )
    await trace(unit)
    return 0
  }

  // Step 2 BEFORE step 3: stamping first would destroy the value being reported.
  const stamp = await stampReadAt(unit.root)
  say(`Baton: \`${baton.path}\``)
  if (baton.composedAt) say(`- composed-at: \`${baton.composedAt}\``)
  if (stamp?.previousReadAt) {
    say(
      `- **previously read at \`${stamp.previousReadAt}\`** — state this to the operator in one`,
      '  line. It is a fact, not a warning: reading an old baton on purpose is a thing',
      '  people do. Never refuse, never ask for confirmation.',
    )
  }
  const archive = await listArchive(unit.root)
  if (archive.length > 0) say(`- ${archive.length} archived baton(s); newest \`${archive[0]}\``)
  if (stamp && !stamp.stamped) {
    say('- ⚠ could not stamp `read-at`: the baton has no `composed-at:` line to place it after')
  }
  say('', '---', '', baton.text.trimEnd(), '', '---', '')
  await trace(unit)
  say(
    'Then read the slugs named in `Pointers`, and report where you stand and what you',
    'are picking up. Work from there.',
    '',
  )
  return 0
}

let code = 0
try {
  code = await main()
} catch (err) {
  process.stderr.write(`handoff: ${err?.stack ?? err}\n`)
  code = 1
}
process.stdout.write(out.join('\n') + (out.length ? '\n' : ''))
process.exit(code)
