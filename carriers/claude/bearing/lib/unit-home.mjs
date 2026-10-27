// unit ごとに我々が持つものの置き場 —— `~/.bearing/units/<unit>/`。
//
// ⚠ **これは handoff の帳簿から切り出した残りである**（2026-10-27、handoff を退役させた）。
// 置き場の規則（home の下・machine-local・決して commit しない）は baton のために決めたもの
// だが、**baton が去った後も CI の結果と session の記録がここに住む** ∴ 規則だけを残した。
//
// ⚠ **既に在る `handoff/` dir と `unit-root` の記録には触れない。** 退役は機構を止めたので
// あって、人間の機体に残った baton を消す理由にはならない —— 消せば、作業がどこにも
// 残っていない破棄になる。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

/**
 * unit の持ち物の家の根。⚠ **`BEARING_HOME` で移せる** —— test がここを差し替えられなければ、
 * test は人間の実際の記録を触ることになる。
 */
export const bearingHome = (env = process.env, home = os.homedir()) =>
  env.BEARING_HOME || path.join(home, '.bearing')

/**
 * unit を指す dir 名。**unit root の絶対 path を平坦化したもの** ——
 * `/home/x/works/api` → `-home-x-works-api`。
 *
 * ⚠ **Claude Code が `~/.claude/projects/` で採っているのと同じ規則である**（人間が
 * 2026-09-03 に決定）。理由は一意性ではなく**馴染み**である: 人間が自力で見に行くとき、
 * 既に見慣れた形なら path から unit を読み取れる。⚠ **英数字以外はすべて `-` になる** ——
 * 実測で `/home/trustdelta/.claude` が `-home-trustdelta--claude` になっており、`/` だけで
 * なく `.` も潰れている。win32 の `\` と `:` も同じ規則に含まれる。
 *
 * ⚠ **∴ 平坦化は単射でない。** `/w/名前` と `/w/名称` は同じ dir 名になる。baton が在った
 * 間は「別の対話の baton を読む」害があり、`unit-root` の記録で衝突を述べていた。⚠ **今
 * ここに住むのは CI の結果と session の記録だけ**であり、取り違えても失われるのは表示の
 * 正しさである。
 *
 * ⚠ **`resolve` を引数に取る。** 平坦化の結果は platform で形が変わる —— win32 では
 * drive letter が付き（`C:\works\api` → `C--works-api`）、POSIX では付かない。
 * ⚠ **`process.platform` に暗黙に依存すると、片方の platform からしか片方の分岐を検査
 * できない** —— 2026-09-04、実際にそうなっていた: POSIX 形を前提にした test が win32 では
 * 常に赤く、CI（ubuntu）は緑のままだった。`lib/shell.mjs` が `platform` を引数に取るのと
 * 同じ理由である。
 */
export function unitSlug(unitRoot, resolve = path.resolve) {
  return resolve(unitRoot).replace(/[^A-Za-z0-9-]/g, '-') || 'unit'
}

/** この unit のために我々が持つもの全部の家。 */
export const unitHome = (unitRoot, env = process.env) =>
  path.join(bearingHome(env), 'units', unitSlug(unitRoot))

/** この unit で最後に始まったセッションの id を書き留めた 1 行。 */
export const SESSION_RECORD = 'session'

export const sessionRecordPath = (unitRoot, env = process.env) =>
  path.join(unitHome(unitRoot, env), SESSION_RECORD)

/**
 * セッションの id を書き留める。
 *
 * ⚠ **baton が去った後もこれを残すのは、消費者を数える手段だからである** ——
 * `docs/aims/consumer-evidence.md` は、aim を採らない消費者をこの記録から数えた
 * （2026-09-30）。⚠ **採用の gate を通さずに書く** ∴ aim を採らない repo も数えられる。
 *
 * ⚠ **上書きする。** 答えるのは「最後にどのセッションが立ったか」であり、古い答えを
 * 保存する意味が無い。
 *
 * ⚠ **中身が変わらないなら書かない。** 何も変わっていない dir の mtime を動かさない。
 */
export async function recordSession(unitRoot, sessionId, env = process.env) {
  const id = String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '')
  if (!id || id === 'unknown') return null
  const file = sessionRecordPath(unitRoot, env)
  try {
    if ((await readFile(file, 'utf8')).trim() === id) return file
  } catch {
    // 無い・読めないは、書かない理由にならない。
  }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, id + '\n', 'utf8')
  return file
}

/** 書き留めた session id。無ければ `null`。 */
export async function readSession(unitRoot, env = process.env) {
  try {
    return (await readFile(sessionRecordPath(unitRoot, env), 'utf8')).trim() || null
  } catch {
    return null
  }
}
