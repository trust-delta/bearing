// CI の通過 / 失敗を CLI 側へ運ぶ —— [[surface-parity]] が測った 4 つ目の非対称。
//
// 🔴 **statusline はここで `gh` を起こしてはならない。** あの面は assistant message ごとに
// 走り、debounce で**途中で殺される** —— 起こした子は宙に浮き、rate limit も踏む。
// ∴ **採るのと読むのを分ける**: 採るのは `bin/bearing-ci.mjs`（人間か hook が打つ）、
// 面は**置かれた JSON を読むだけ**である。
//
// ⚠ **古い緑は、緑ではない。** 採った時刻を必ず一緒に置き、読む側が古さを述べられるように
// する —— **「いつのものか分からない成功」は、[[ambient-display]] が拒んできた「消えたものと
// 元から無いものが同じ見た目になる」の、時間軸における形である。**
//
// ⚠ **`gh` が無いことを「CI が無い」に畳まない。** 道具の不在と、走っていないことは別である。

import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { unitHome } from './handoff.mjs'

const run = promisify(execFile)

export const ciCachePath = (unitRoot, env = process.env) =>
  path.join(unitHome(unitRoot, env), 'ci.json')

// ⚠ **1 度の push で走る workflow は 1 本とは限らない。** この repo は `ci` と `push-policy`
// の 2 本が同じ push で走る ∴ **`--limit 1` は「間近に走った CI が全て通ったか」を答えない。**
// 🔴 **実際に食い違った**（実測 2026-09-07、対象: この機体の `gh`）—— `44ff61ef` の
// `push-policy` が completed/success の時点で `ci` はまだ `in_progress` であり、
// **`--limit 1` は前者を返した** ∴ 面は「CI 通過」と描きえた。
const RUN_LIMIT = 20

// ⚠ **`skipped` は失敗ではない**（条件で走らなかった job）∴ 通過側へ数える。
// それ以外の conclusion は、たとえ `neutral` でも**名指す** —— 知らない結論を緑に畳まない。
const PASSING = new Set(['success', 'skipped'])

const unknown = (reason) =>
  ({ state: 'unknown', conclusion: null, workflow: null, workflows: [], headSha: null, updatedAt: null, reason })

/**
 * `gh` に今の branch の**間近に走った run を全て**訊き、最悪値へ畳む。
 *
 * ⚠ **畳むのは結論だけで、内訳は残す**（`workflows`）—— 面は 1 語しか置けないが、
 * **会話でこれを読むエージェントと人間は内訳を要る。**
 *
 * ⚠ **失敗の理由を畳まない。** `gh` が無い / 認証が無い / repo が GitHub でない / run が
 * 1 本も無い —— どれも「CI が緑」でも「CI が赤」でもない、**別々の事実**である。
 *
 * @returns {Promise<{state: string, conclusion: string|null, workflow: string|null,
 *   workflows: {name: string, status: string, conclusion: string|null}[], headSha: string|null,
 *   updatedAt: string|null, reason: string|null}>}
 */
export async function probeCi(repoRoot, branch, deps = {}) {
  const exec = deps.run ?? run
  if (!branch) return unknown('branch を読めない')
  let out
  try {
    ;({ stdout: out } = await exec(
      'gh',
      ['run', 'list', '--branch', branch, '--limit', String(RUN_LIMIT),
       '--json', 'headSha,status,conclusion,workflowName,updatedAt'],
      { cwd: repoRoot, timeout: deps.timeout ?? 8000 },
    ))
  } catch (e) {
    const why = e?.code === 'ENOENT' ? '`gh` が無い' : (e?.killed ? '`gh` が時間内に答えない' : '`gh` が失敗した')
    return unknown(why)
  }
  let rows
  try {
    rows = JSON.parse(out)
  } catch {
    return unknown('`gh` の出力を読めない')
  }
  if (!Array.isArray(rows)) return unknown('`gh` の出力を読めない')
  // ⚠ **run が 0 本なのは「まだ走っていない」であって「緑」ではない。**
  if (rows.length === 0) {
    return { state: 'none', conclusion: null, workflow: null, workflows: [], headSha: null, updatedAt: null, reason: null }
  }
  // ⚠ **`gh run list` は新しい順である** ∴ 先頭の commit が「間近に走った」もの。
  // **その commit の run だけを見る** —— 前の commit の緑を混ぜれば、畳んだ結論が嘘になる。
  const headSha = rows[0].headSha ?? null
  const group = rows.filter((r) => (r.headSha ?? null) === headSha)
  // ⚠ **上限に当たったまま全部が同じ commit なら、取りこぼしを排除できない** ∴ そう述べる。
  // **「見えた範囲では全部緑」を「全部緑」に畳まない。**
  if (rows.length === RUN_LIMIT && group.length === rows.length) {
    return { ...unknown(`直近 ${RUN_LIMIT} 本すべてが同じ commit ∴ 取りこぼしを排除できない`), headSha }
  }

  const workflows = group.map((r) => ({
    name: r.workflowName ?? '(名前を読めない)',
    status: r.status ?? 'unknown',
    conclusion: r.conclusion || null,
  }))
  const updatedAt = group.map((r) => r.updatedAt).filter(Boolean).sort().at(-1) ?? null

  // 🔴 **最悪値へ畳む** —— 1 本でも走っていれば実行中、1 本でも通っていなければ失敗。
  const pending = workflows.find((w) => w.status !== 'completed')
  if (pending) {
    return { state: pending.status, conclusion: null, workflow: pending.name, workflows, headSha, updatedAt, reason: null }
  }
  const failed = workflows.find((w) => !PASSING.has(w.conclusion))
  if (failed) {
    return { state: 'completed', conclusion: failed.conclusion ?? 'unknown', workflow: failed.name, workflows, headSha, updatedAt, reason: null }
  }
  // ⚠ **全部通ったときに 1 本を名指さない** —— 代表を名乗らせれば、また 1 本の話に見える。
  return { state: 'completed', conclusion: 'success', workflow: null, workflows, headSha, updatedAt, reason: null }
}

/** 採った結果を、採った時刻つきで置く。 */
export async function writeCi(unitRoot, branch, probe, now = new Date(), env = process.env) {
  const file = ciCachePath(unitRoot, env)
  await mkdir(path.dirname(file), { recursive: true })
  const body = { branch, probedAt: now.toISOString(), ...probe }
  await writeFile(file, JSON.stringify(body, null, 1) + '\n', 'utf8')
  return { path: file, ...body }
}

/**
 * 置かれた結果を読む。⚠ **面はこれしか呼ばない。**
 *
 * @returns {Promise<null|{branch: string, probedAt: string, state: string, conclusion: string|null,
 *   workflow: string|null, updatedAt: string|null, reason: string|null}>}
 */
export async function readCi(unitRoot, env = process.env) {
  try {
    return JSON.parse(await readFile(ciCachePath(unitRoot, env), 'utf8'))
  } catch {
    // ⚠ **不在は「採っていない」であって「CI が無い」ではない** —— 呼び出し側が区別する。
    return null
  }
}

/**
 * 面に描く 1 語。⚠ **branch が違えば、描かない** —— 他の branch の緑を今の branch の緑と
 * して見せることは、この機構が最も避けたい形である。
 *
 * @returns {{text: string, tone: 'ok'|'bad'|'wait'|'unknown'}|null} null = 描かない
 */
export function ciSegment(cache, branch, now = new Date(), staleMs = 30 * 60 * 1000) {
  if (!cache || !branch || cache.branch !== branch) return null
  const age = now.getTime() - Date.parse(cache.probedAt ?? '')
  // ⚠ **古い緑は緑ではない** ∴ 古ければ結論ではなく古さを述べる。
  if (!Number.isFinite(age) || age > staleMs) return { text: 'CI 古い', tone: 'unknown' }
  if (cache.reason) return { text: 'CI 不明', tone: 'unknown' }
  if (cache.state === 'none') return { text: 'CI 無し', tone: 'unknown' }
  if (cache.state !== 'completed') return { text: 'CI 実行中', tone: 'wait' }
  if (cache.conclusion === 'success') return { text: 'CI 通過', tone: 'ok' }
  return { text: `CI ${cache.conclusion ?? '不明'}`, tone: 'bad' }
}
