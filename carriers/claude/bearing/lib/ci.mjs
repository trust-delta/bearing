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

/**
 * `gh` に今の branch の最新 run を訊く。
 *
 * ⚠ **失敗の理由を畳まない。** `gh` が無い / 認証が無い / repo が GitHub でない / run が
 * 1 本も無い —— どれも「CI が緑」でも「CI が赤」でもない、**別々の事実**である。
 *
 * @returns {Promise<{state: string, conclusion: string|null, workflow: string|null,
 *   updatedAt: string|null, reason: string|null}>}
 */
export async function probeCi(repoRoot, branch, deps = {}) {
  const exec = deps.run ?? run
  if (!branch) return { state: 'unknown', conclusion: null, workflow: null, updatedAt: null, reason: 'branch を読めない' }
  let out
  try {
    ;({ stdout: out } = await exec(
      'gh',
      ['run', 'list', '--branch', branch, '--limit', '1',
       '--json', 'status,conclusion,workflowName,updatedAt'],
      { cwd: repoRoot, timeout: deps.timeout ?? 8000 },
    ))
  } catch (e) {
    const why = e?.code === 'ENOENT' ? '`gh` が無い' : (e?.killed ? '`gh` が時間内に答えない' : '`gh` が失敗した')
    return { state: 'unknown', conclusion: null, workflow: null, updatedAt: null, reason: why }
  }
  let rows
  try {
    rows = JSON.parse(out)
  } catch {
    return { state: 'unknown', conclusion: null, workflow: null, updatedAt: null, reason: '`gh` の出力を読めない' }
  }
  // ⚠ **run が 0 本なのは「まだ走っていない」であって「緑」ではない。**
  if (!Array.isArray(rows) || rows.length === 0) {
    return { state: 'none', conclusion: null, workflow: null, updatedAt: null, reason: null }
  }
  const r = rows[0]
  return {
    state: r.status === 'completed' ? 'completed' : (r.status ?? 'unknown'),
    conclusion: r.conclusion || null,
    workflow: r.workflowName ?? null,
    updatedAt: r.updatedAt ?? null,
    reason: null,
  }
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
