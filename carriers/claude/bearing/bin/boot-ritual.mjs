#!/usr/bin/env node
// The boot ritual trigger — derived from `producer-boot-continue-or-fresh`.
//
//   producer-boot-continue-or-fresh  Producerの起動時に、直前の会話を継続するか
//                                    新規で始めるかをoperatorが選べる。これにより、
//                                    クラッシュからの復帰も日々の再開も、tmai側の
//                                    手続きだけで済む。
//   conversation-handoff             セッションを跨ぐコンテキスト伝達のために固有の
//                                    会話引き継ぎ機能を備える
//
// ═══ Why UserPromptSubmit and not SessionStart ══════════════════════════════
//
// ⚠ **`SessionStart` fires into a void.** Its stdout becomes context; context is
// not a turn. `_guide/handoff.md` § 読む steps 2-6 are AGENT acts — stamp
// `read-at`, surface un-pushed aims, read the pointers, report where things
// stand — and **an agent that is never invoked performs no acts**. So out-tmai
// an unbounded window opens between "the baton is in context" and "the baton
// was read": however long it takes a human to type, and if what they type is
// unrelated the procedure never runs at all while the facts sit there looking
// delivered.
//
// Measured 2026-08-31 on this unit: the engine spawns its Producer as
//   claude --append-system-prompt <posture> <BOOT>
// — argc 4, where `argv[3]` is a positional first prompt. THAT is what makes the
// ritual run at boot with no human input. A plugin has no such element: argc is
// 1. What the aim statement calls 「tmai側の手続きだけで済む」 was carried by the
// engine's ability to create a turn, not by the facts it injected.
//
// ⚠ **A plugin cannot create a turn — but the ritual never needed one created.**
// What it needs is to run BEFORE the first turn does anything else, and
// `UserPromptSubmit` is the only ritual-relevant event whose firing is by
// definition followed by a turn. Turn *creation* is the premise of unattended
// operation, which this node delegates to the harness (`# IS`).
//
// ═══ 半強制 — the same shape as the threshold trigger ════════════════════════
//
// This hook writes nothing and decides nothing. It states an obligation once,
// at a moment when the agent is definitely running, and hands everything else
// back.
//
// ⚠ **It never exits 2.** Exit 2 here would "block processing, erase original
// prompt" — destroying what the operator typed in order to enforce a ritual
// meant to serve them, which is the same inversion `precompact.mjs` refuses
// when it declines to block a human's own `/compact`.
//
// ⚠ **It fires once per session.** A standing reminder on every prompt is a
// cage, and it would keep firing long after the ritual was done.
//
// ⚠ **No baton, no fire.** With no baton there is no outstanding *procedure*:
// `handoff.md` step 1 ends at "report the fresh start", and the boot facts the
// SessionStart composer already delivered stand on their own. Firing anyway
// would impose a ritual on a session that has nothing to hand over.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readBaton } from '../lib/baton.mjs'
import { resolveUnit } from '../lib/unit.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
    // A hook whose stdin never closes must not hang the session it serves.
    setTimeout(() => resolve(buf), 2000).unref?.()
  })
}

/**
 * The obligation, stated once.
 *
 * ⚠ It names the CLI rather than restating the procedure. `handoff.md` is the
 * canon and `bin/handoff.mjs read` already owns the four mechanical steps —
 * duplicating either here would put a third account of the ritual in the tree,
 * which is exactly what `neutral-source-vendor-carrier` forbids.
 */
function message(baton) {
  const when = baton.composedAt ? ` composed \`${baton.composedAt}\`` : ''
  const seen = baton.readAt
    ? `\n⚠ This baton carries \`read-at: ${baton.readAt}\` — it has been read before. ` +
      'State that as a fact in your report; it is not a reason to skip the procedure ' +
      '(re-reading is legitimate, and `read-at` exists to detect it, not to prevent it).'
    : ''
  return `⚠ **A baton is outstanding and the reading procedure has not run.**${when}

\`${baton.path}\`

The SessionStart hook surfaced this baton but deliberately did NOT stamp
\`read-at\`: stamping is step 3 of a procedure whose steps 4-6 come after it, and
a baton marked read by a session that then died would be read by nobody. Those
steps are yours, and nothing else in this session will perform them.

**Do this before answering the operator:**

  1. Run the bookkeeping half (canon steps 2-4 — returns the previous
     \`read-at\`, stamps the new one, and emits the aim trace):

       node "$CLAUDE_PLUGIN_ROOT"/bin/handoff.mjs read

  2. Re-read every aim slug the trace names. A baton is chosen FORWARD, so it
     under-reports how the aims were touched along the way — and re-reading an
     aim yields its *arrived state*, never the *change*. That diff is the only
     thing carrying the change.

  3. Read the \`Pointers\` the baton names (canon step 5).

  4. Tell the operator where you stand and what you are picking up (step 6),
     then continue with what they actually asked.

Canon: \`docs/aims/_guide/handoff.md\` § 読む. This fires once per session.${seen}`
}

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  // Unparseable input is not a reason to interfere with the session.
  process.exit(0)
}

const sessionId = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
const marker = path.join(os.tmpdir(), `aim-boot-ritual-${sessionId}`)
if (existsSync(marker)) process.exit(0)

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  const baton = await readBaton(unit.root)
  if (!baton) process.exit(0)
  mkdirSync(path.dirname(marker), { recursive: true })
  writeFileSync(marker, new Date().toISOString(), 'utf8')
  // Exit 0: stdout is shown to Claude. Never exit 2 — see the header.
  process.stdout.write(message(baton) + '\n')
} catch (err) {
  // Rule: never obstruct a session over a bug in this hook.
  process.stderr.write(`aim plugin: boot-ritual hook failed: ${err?.stack ?? err}\n`)
}
process.exit(0)
