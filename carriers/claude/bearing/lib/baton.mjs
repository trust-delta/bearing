// The baton — the previous session's chosen hand-over.
//
// Derived from:
//
//   conversation-handoff   エージェントのネイティブなコンテキスト圧縮やリセット機能
//                          ではなく、セッションを跨ぐコンテキスト伝達のために固有の
//                          会話引き継ぎ機能を備える
//   operator-single-producer  人間が1度に対話するエージェントは常に単一である
//   handoff-low-cost       早期の会話引き継ぎを安く行えるようにする
//
// Placement is `.handoff/active.md`, cwd-relative, machine-local. That is the
// canon in `_guide/handoff.md`, and it is a CONSEQUENCE of the purpose, not an
// accepted limitation: what a baton protects is the continuity of ONE
// conversation between the operator and one session, and a session on another
// machine is simply a different conversation.
//
// ⚠ **The reader and the writer must agree on where the baton lives.** The
// `handoff-r` / `handoff-w` skills write to the canonical path, so this reader
// reads it. A baton written through this plugin's skill that its own hook
// cannot see is worse than no baton: the ritual reports success and the next
// session starts blind.
//
// ⚠ **This reader does not stamp `read-at`.** That is step 3 of the canon's
// reading procedure, and steps 4-6 come after it — surfacing unpushed aims,
// reading the pointers, reporting where things stand. A hook that stamped would
// be claiming a procedure it cannot carry out, and a baton marked read by a
// session that then died would be read by nobody. The hook surfaces; the agent
// executes and stamps.

import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Read the unit's baton, if one is present.
 *
 * @param {string} unitRoot
 * @returns {Promise<{path: string, text: string, composedAt: string|null, readAt: string|null, task: string|null}|null>}
 */
export async function readBaton(unitRoot) {
  const file = path.join(unitRoot, '.handoff', 'active.md')
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    // Absent is the structurally normal state — a fresh start, not a fault.
    return null
  }
  if (text.trim() === '') return null
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ''
  const field = (key) => front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].trim() || null
  return {
    path: file,
    text,
    composedAt: field('composed-at'),
    readAt: field('read-at'),
    task: field('task'),
  }
}
