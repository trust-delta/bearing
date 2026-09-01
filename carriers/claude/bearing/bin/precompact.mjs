#!/usr/bin/env node
// The threshold trigger — derived from `handoff-threshold-trigger`.
//
//   handoff-threshold-trigger  人間が予め定めた地点（コンテキスト使用率など）を元に、
//                              半強制的に会話引き継ぎを行える
//   conversation-handoff       エージェントのネイティブなコンテキスト圧縮やリセット機能
//                              **ではなく**、セッションを跨ぐコンテキスト伝達のために
//                              固有の会話引き継ぎ機能を備える
//
// ═══ Why this hook, and not a context-percentage watcher ════════════════════
//
// The aim statement names 「コンテキスト使用率など」 as an EXAMPLE of the point,
// not as the mechanism. And there is no percentage to watch: a plugin
// has no clock, no polling, no view of the context meter. What it does have is
// the harness announcing, once, that it is **about to compact** — and that is
// not a proxy for the threshold, it IS the threshold, chosen by the harness on
// the same signal a watcher would have watched.
//
// More than convenient: `conversation-handoff` exists precisely to displace
// native compaction, because compaction discards the trajectory INVISIBLY. ∴ the
// instant the harness decides to compact is exactly the instant the régime says
// a baton should be authored instead. Firing here is the derivation, not a
// workaround for the missing meter.
//
// ═══ 半強制 — what "semi-forced" resolves to ════════════════════════════════
//
// ⚠ There is a real tension to state: the aim statement asks for a threshold
// trigger, while `handoff.md` says 「これは operator が呼ぶものであって、閾値で
// 自動発火させるものではない」. Both hold once "trigger" is read as what it says —
// **半 (semi-)** forced. This hook does not write a baton and does not decide
// anything. It interrupts a SILENT DISCARD and hands the choice back:
//
//   - it blocks the compaction (the session continues uncompacted),
//   - it tells the session to author a baton now,
//   - the operator reviews it (`handoff-review-gate`) and it lands, or the
//     operator says no and the next compaction proceeds untouched.
//
// The forced half is that the discard cannot happen quietly. The unforced half
// is everything after.
//
// ⚠ **`manual` is never blocked.** A human running `/compact` has made the act
// themselves, and overriding an explicit operator act to enforce a ritual meant
// to serve them would invert the whole régime. Only `auto` is intercepted.
//
// ⚠ **It fires once per session.** Blocking every time would trap a session
// that has decided to keep going — the context would never compact and the
// session would die at the ceiling instead. One interruption is a prompt; a
// standing refusal is a cage.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { readAimSlugs } from '../lib/corpus.mjs'
import os from 'node:os'
import path from 'node:path'
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
 * Does the aim discipline apply here at all?
 *
 * A corpus, or a `.handoff/` someone already made. Without either, this project
 * never adopted the régime and imposing its ritual would be the plugin deciding
 * something the operator did not.
 */
async function inScope(unit) {
  if (existsSync(path.join(unit.root, '.handoff'))) return true
  for (const repo of unit.repos) {
    if ((await readAimSlugs(repo.root)).length > 0) return true
  }
  return false
}

const MESSAGE = `⚠ Auto-compaction was blocked, once, so it could not discard this conversation quietly.

**This is the threshold point: author a baton instead of being compacted.**
Native compaction is reactive and invisible — what it drops, nobody chose. The
handoff method exists to replace exactly that, and its value is the authoring
judgment: what to keep, and what to leave out as re-derivable from git and from
docs/aims/.

Do this now:
  1. Follow the \`handoff-w\` skill (canon: \`_guide/handoff.md\` § 書く).
  2. Show the operator what you kept and what you left out, in 1-2 lines, and
     let them correct it BEFORE it lands.
  3. Land it with:  node "$CLAUDE_PLUGIN_ROOT"/bin/handoff.mjs write < <authored.md>

If the operator would rather keep going, say so and continue — this will not
fire again in this session, and the next auto-compaction will proceed normally.`

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  // Unparseable input is not a reason to interfere with the session.
  process.exit(0)
}

// A human's own `/compact` is their act. Never override it.
if (input.trigger !== 'auto') process.exit(0)

const sessionId = String(input.session_id ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
const marker = path.join(os.tmpdir(), `aim-precompact-${sessionId}`)
if (existsSync(marker)) process.exit(0)

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  if (!(await inScope(unit))) process.exit(0)
  mkdirSync(path.dirname(marker), { recursive: true })
  writeFileSync(marker, new Date().toISOString(), 'utf8')
} catch {
  // Anything unexpected: let the session compact. Never obstruct on a bug.
  process.exit(0)
}

// Exit 2 is the harness's "show stderr to the model and block". If a future
// build stops blocking on it, the message still reaches the model — the prompt
// survives even when the interruption does not, which is the half that matters.
process.stderr.write(MESSAGE + '\n')
process.exit(2)
