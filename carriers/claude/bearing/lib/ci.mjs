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
  ({ conclusion: null, workflow: null, workflows: [], commit: null, ahead: null, pr: null, updatedAt: null, reason: null, note: null })

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
/**
 * PR が在るなら、その番号と repo を返す。⚠ **無いことは失敗ではない** —— main への直 push には
 * PR が無く、それは正常な状態である。
 */
async function findPr(exec, repoRoot, timeout) {
  try {
    const { stdout } = await exec('gh', ['pr', 'view', '--json', 'number,url'], { cwd: repoRoot, timeout })
    const { number, url } = JSON.parse(stdout)
    const m = /^https?:\/\/[^/]+\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(url ?? '')
    return number && m ? { number, owner: m[1], repo: m[2] } : null
  } catch {
    return null
  }
}

// 🔴 **デスクトップの CI 表示が打っているのと同じ問い**（推定 2026-09-07、対象: この機体の
// Claude Code 2.1.263 の同梱バイナリ —— `commits(last:1){nodes{commit{statusCheckRollup{` と
// `contexts(first:0){checkRunCountsByState{state count} statusContextCountsByState{state count}}`
// という文字列が在った）。⚠ **これは文字列からの推定であって、あちらの実装の記述ではない。**
//
// 🔴 **判定は `statusCheckRollup.state` を使う —— GitHub に畳ませる。** ⚠ **自分で畳めば、
// NEUTRAL や SKIPPED の扱いが 1 つ違うだけで、同じ画面を見ている 2 つの経路が別のことを言う。**
// **「揃える」とは同じ集合を見ることではなく、同じ判定に至ることである。**
//
// ⚠ **内訳だけは `first:100` で取る**（あちらは `first:0` で件数しか取らない）—— **面に置けるのは
// 1 語だが、この command の肝は「人間が GitHub の web も打たずに CI を共有できること」である。**
const ROLLUP_QUERY =
  'query($owner:String!,$repo:String!,$n:Int!){repository(owner:$owner,name:$repo)' +
  '{pullRequest(number:$n){commits(last:1){nodes{commit{oid statusCheckRollup{state' +
  ' contexts(first:100){nodes{__typename ... on CheckRun{name status conclusion}' +
  ' ... on StatusContext{context state}}}}}}}}}}'

/** rollup の 1 語を、我々の 2 つ組へ写す。⚠ **知らない値を緑へ畳まない。** */
const ROLLUP = {
  SUCCESS: { state: 'completed', conclusion: 'success' },
  FAILURE: { state: 'completed', conclusion: 'failure' },
  ERROR: { state: 'completed', conclusion: 'error' },
  PENDING: { state: 'pending', conclusion: null },
  // ⚠ **`EXPECTED` は「報告されるはずだが未着」である** —— GitHub 側にだけ在る、
  // **我々が `gh run list` の層では決して知りえなかった状態。**
  EXPECTED: { state: 'expected', conclusion: null },
}

/** rollup の 1 件を、内訳の 1 行へ写す。⚠ **CheckRun と StatusContext を同じ形で並べる。** */
const asRow = (n) => {
  if (n.__typename === 'StatusContext') {
    const st = String(n.state ?? '').toUpperCase()
    return {
      name: n.context ?? '(名前を読めない)',
      status: st === 'PENDING' || st === 'EXPECTED' ? 'in_progress' : 'completed',
      conclusion: st ? st.toLowerCase() : null,
    }
  }
  return {
    name: n.name ?? '(名前を読めない)',
    status: String(n.status ?? 'unknown').toLowerCase(),
    conclusion: n.conclusion ? String(n.conclusion).toLowerCase() : null,
  }
}

/** PR が在るときの経路 —— **デスクトップと同じ判定へ揃える。** */
async function probeByRollup(exec, repoRoot, pr, ahead, timeout) {
  let data
  try {
    const { stdout } = await exec(
      'gh',
      ['api', 'graphql', '-f', `query=${ROLLUP_QUERY}`,
       '-F', `owner=${pr.owner}`, '-F', `repo=${pr.repo}`, '-F', `n=${pr.number}`],
      { cwd: repoRoot, timeout },
    )
    data = JSON.parse(stdout)
  } catch (e) {
    const why = e?.code === 'ENOENT' ? '`gh` が無い' : (e?.killed ? '`gh` が時間内に答えない' : '`gh` の GraphQL が失敗した')
    return { ...unknown(why), ahead, pr: pr.number }
  }
  const commitNode = data?.data?.repository?.pullRequest?.commits?.nodes?.[0]?.commit
  if (!commitNode) return { ...unknown('PR の commit を読めない'), ahead, pr: pr.number }
  const commit = commitNode.oid ?? null
  const rollup = commitNode.statusCheckRollup
  // ⚠ **rollup が無いのは「check が 1 つも無い」である** —— 緑ではない。
  if (!rollup) {
    return { ...none('この PR の commit に check が 1 つも無い'), commit, ahead, pr: pr.number }
  }
  const workflows = (rollup.contexts?.nodes ?? []).map(asRow)
  const mapped = ROLLUP[String(rollup.state ?? '').toUpperCase()]
  if (!mapped) {
    return { ...unknown(`rollup の state を知らない: ${rollup.state}`), commit, ahead, pr: pr.number, workflows }
  }
  // ⚠ **名指すのは、通っていない 1 件だけ** —— 全部通ったときに代表を名乗らせない。
  const bad = workflows.find((w) => w.status !== 'completed' || !PASSING.has(w.conclusion))
  return {
    ...base(),
    ...mapped,
    workflow: mapped.conclusion === 'success' ? null : (bad?.name ?? null),
    workflows,
    commit,
    ahead,
    pr: pr.number,
    note: 'PR の statusCheckRollup —— check run と status context の両方を GitHub が畳んだもの',
  }
}

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

  // 🔴 **PR が在るなら、デスクトップと同じ判定へ揃える**（人間の決定 2026-09-07、「主眼は揃える
  // ことである」）。⚠ **PR が無ければ揃えようが無い** —— **あちらの面は PR 文脈にしか存在せず、
  // main への直 push には PR が無い** ∴ そこは我々の層（`gh run list --commit`）が答える。
  // ⚠ **これは 2 つの実装ではなく、2 つの*問い*である** —— 同じ問いには同じ答えを返す。
  const pr = await findPr(exec, repoRoot, deps.timeout ?? 8000)
  if (pr) return probeByRollup(exec, repoRoot, pr, ahead, deps.timeout ?? 8000)

  let out
  try {
    // 🔴 **その commit の run を、commit で直接引く。** ⚠ **branch で引いて手元で絞る形は、
    // 「まだ走っていない」と「直近 N 本の窓の外」を区別できない** —— main のように run が
    // 溜まった branch では窓が常に埋まっており、**push 直後は必ず「取りこぼしを排除できない」
    // へ倒れて `CI 不明` になった**（実測 2026-09-07、merge 直後の `dbff7598`）。
    //
    // ⚠ **渡す sha を切り詰めてはならない。** 🔴 **`--commit` に短縮 sha を渡すと、在る run を
    // 黙って 0 件と返す**（実測 2026-09-07、対象: この機体の `gh` 2.85.0 —— `66d378f3…` の
    // full sha では 2 本返り、先頭 8 桁では 0 件）∴ **「無い」と読めば嘘になる。**
    // **再測は `gh run list --commit <full> --json headSha` と、同じ sha の先頭 8 桁である。**
    ;({ stdout: out } = await exec(
      'gh',
      ['run', 'list', '--commit', commit, '--limit', String(RUN_LIMIT),
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

  // ⚠ **問うた commit 以外が返ってきたら落とす。** `--commit` で引いている以上これは冗長だが、
  // **他人の系の振る舞いを 1 つ仮定するたび、そこが黙って破れる面が 1 つ増える。**
  const group = rows.filter((r) => (r.headSha ?? null) === commit)
  // 🔴 **0 本は「まだ走っていない」である** —— commit で直接引いている ∴ **窓の外という疑いが
  // 要らない。** ⚠ **これが「前の commit の緑を持ち越さない」の実体である。**
  if (group.length === 0) return { ...none('push された commit の run がまだ 1 本も無い'), commit, ahead }
  // ⚠ **上限に当たったなら、取りこぼしを排除できない** ∴ そう述べる。
  // **「見えた範囲では全部緑」を「全部緑」に畳まない。**
  if (rows.length === RUN_LIMIT) {
    return { ...unknown(`この commit の run が ${RUN_LIMIT} 本以上ある ∴ 取りこぼしを排除できない`), commit, ahead }
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
