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

import { runGit } from './git.mjs'

import { unitHome } from './handoff.mjs'

const run = promisify(execFile)

export const ciCachePath = (unitRoot, env = process.env) =>
  path.join(unitHome(unitRoot, env), 'ci.json')

// ⚠ **1 度の push で走る workflow は 1 本とは限らない。** この repo は `ci` と `push-policy`
// の 2 本が同じ push で走る ∴ **`--limit 1` は「その commit の CI が全て通ったか」を答えない。**
// 🔴 **実際に食い違った**（実測 2026-09-07、対象: この機体の `gh`）—— `44ff61ef` の
// `push-policy` が completed/success の時点で `ci` はまだ `in_progress` であり、
// **`--limit 1` は前者を返した** ∴ 面は「CI 通過」と描きえた。
const RUN_LIMIT = 20

// ⚠ **`skipped` は失敗ではない**（条件で走らなかった job）∴ 通過側へ数える。
// それ以外の conclusion は、たとえ `neutral` でも**名指す** —— 知らない結論を緑に畳まない。
const PASSING = new Set(['success', 'skipped'])

const base = () =>
  ({ conclusion: null, workflow: null, workflows: [], commit: null, ahead: null, updatedAt: null, reason: null, note: null })

const unknown = (reason) => ({ ...base(), state: 'unknown', reason })

/** run が 1 本も無い。⚠ **これは「緑」ではない** ∴ 理由を添えて別の事実として置く。 */
const none = (note) => ({ ...base(), state: 'none', note })

/**
 * `gh` に、**push 済みの commit の run を全て**訊き、最悪値へ畳む。
 *
 * 🔴 **照合先は HEAD ではなく `@{u}` である**（人間の決定 2026-09-07）。⚠ **CI が走るのは
 * push された commit であって、手元の HEAD ではない** ∴ HEAD と照合する形は**未 push の commit を
 * 抱えた間ずっと「run が無い」**になり、開発中はほぼ常にそう描く —— **それが 2026-09-07 に一度
 * 却下された理由である。** ⚠ **却下された理由は正しかった。誤っていたのは照合先のほうである。**
 *
 * ⚠ **2026-09-07 まで、見ていたのは「先頭 run と同じ commit」だった** —— 🔴 **今の commit の run が
 * まだ登録されていない窓で、1 つ前の commit の結論をそのまま描いた**（実測 2026-09-07、対象:
 * この機体の `gh` —— merge 直後に 2 回とも踏んだ。`9b7f576` と `66d378f`）。⚠ **緑とは限らない:
 * 前の commit が赤なら赤が持ち越される** ∴ 非対称ではなく **commit の取り違え**である。
 * ⚠ **面に置けるのは 1 語で、そこに commit は入らない** —— **読み手には区別できなかった。**
 *
 * ⚠ **`@{u}` は「我々が push した先」の記憶である** —— **他者が push した分は `git fetch` する
 * まで見えない**（ここでは fetch しない: 採取のたびに repo の ref を書き換えない）。
 *
 * ⚠ **畳むのは結論だけで、内訳は残す**（`workflows`）—— 面は 1 語しか置けないが、
 * **会話でこれを読むエージェントと人間は内訳を要る。**
 *
 * ⚠ **失敗の理由を畳まない。** `gh` が無い / 認証が無い / repo が GitHub でない / run が
 * 1 本も無い —— どれも「CI が緑」でも「CI が赤」でもない、**別々の事実**である。
 *
 * @returns {Promise<{state: string, conclusion: string|null, workflow: string|null,
 *   workflows: {name: string, status: string, conclusion: string|null}[], commit: string|null,
 *   ahead: number|null, updatedAt: string|null, reason: string|null, note: string|null}>}
 */
export async function probeCi(repoRoot, branch, deps = {}) {
  const exec = deps.run ?? run
  const git = deps.git ?? ((args) => runGit(repoRoot, args))
  if (!branch) return unknown('branch を読めない')

  // 🔴 **照合先を先に決める。** ⚠ **upstream が無い branch は、push されていない** ∴ CI は
  // 走りようがない —— **「採れなかった」ではなく「まだ無い」である。**
  const commit = (await git(['rev-parse', '@{u}']))?.trim() || null
  if (!commit) return none('この branch に upstream が無い ∴ まだ push されていない')
  const aheadRaw = Number.parseInt((await git(['rev-list', '--count', '@{u}..HEAD']))?.trim() ?? '', 10)
  const ahead = Number.isFinite(aheadRaw) ? aheadRaw : null

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
    return { ...unknown(why), commit, ahead }
  }
  let rows
  try {
    rows = JSON.parse(out)
  } catch {
    return { ...unknown('`gh` の出力を読めない'), commit, ahead }
  }
  if (!Array.isArray(rows)) return { ...unknown('`gh` の出力を読めない'), commit, ahead }

  // 🔴 **push 済みの commit の run だけを見る。** ⚠ **他の commit の run は混ぜない** ——
  // 混ぜれば畳んだ結論が嘘になる。
  const group = rows.filter((r) => (r.headSha ?? null) === commit)
  if (group.length === 0) {
    // ⚠ **上限に当たっていれば、「無い」と「窓の外」を区別できない** ∴ そう述べる。
    if (rows.length === RUN_LIMIT) {
      return { ...unknown(`直近 ${RUN_LIMIT} 本に push 済み commit の run が無い ∴ 取りこぼしを排除できない`), commit, ahead }
    }
    return { ...none('push された commit の run がまだ 1 本も無い'), commit, ahead }
  }
  // ⚠ **上限に当たったまま全部が同じ commit なら、取りこぼしを排除できない** ∴ そう述べる。
  // **「見えた範囲では全部緑」を「全部緑」に畳まない。**
  if (rows.length === RUN_LIMIT && group.length === rows.length) {
    return { ...unknown(`直近 ${RUN_LIMIT} 本すべてが同じ commit ∴ 取りこぼしを排除できない`), commit, ahead }
  }

  const workflows = group.map((r) => ({
    name: r.workflowName ?? '(名前を読めない)',
    status: r.status ?? 'unknown',
    conclusion: r.conclusion || null,
  }))
  const updatedAt = group.map((r) => r.updatedAt).filter(Boolean).sort().at(-1) ?? null
  const common = { ...base(), workflows, commit, ahead, updatedAt }

  // 🔴 **最悪値へ畳む** —— 1 本でも走っていれば実行中、1 本でも通っていなければ失敗。
  //
  // ⚠ **塞げていない窓が 1 つ在る**: **その commit で何本走るはずかを、我々は知らない** ——
  // workflow は path filter や条件で走らないことがあり、**静的には決まらない** ∴ **2 本走るはずが
  // 1 本しか登録されていない瞬間に、その 1 本が緑なら「通過」を描きうる。** ⚠ **これは code の
  // 読みであって実測ではない**（2026-09-07 に観測したのは、いずれも 0 本登録の側である）。
  const pending = workflows.find((w) => w.status !== 'completed')
  if (pending) return { ...common, state: pending.status, workflow: pending.name }
  const failed = workflows.find((w) => !PASSING.has(w.conclusion))
  if (failed) return { ...common, state: 'completed', conclusion: failed.conclusion ?? 'unknown', workflow: failed.name }
  // ⚠ **全部通ったときに 1 本を名指さない** —— 代表を名乗らせれば、また 1 本の話に見える。
  return { ...common, state: 'completed', conclusion: 'success' }
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
  // 🔴 **結論は「push 済みの commit」についてのものである** ∴ **手元がその先に居るなら、そう
  // 言う。** ⚠ **さもなくば、読み手はこの緑を*手元の変更*の緑として読む** —— それは我々が
  // commit の取り違えを直したのと同じ種類の誤読であり、**残せば直した意味が半分になる。**
  const behind = Number.isFinite(cache.ahead) && cache.ahead > 0 ? `(未 push ${cache.ahead})` : ''
  const say = (text, tone) => ({ text: `${text}${behind}`, tone })
  if (cache.reason) return say('CI 不明', 'unknown')
  if (cache.state === 'none') return say('CI 無し', 'unknown')
  if (cache.state !== 'completed') return say('CI 実行中', 'wait')
  if (cache.conclusion === 'success') return say('CI 通過', 'ok')
  return say(`CI ${cache.conclusion ?? '不明'}`, 'bad')
}
