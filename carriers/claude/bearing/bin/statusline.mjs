#!/usr/bin/env node
// statusline —— **CLI にだけ空いている穴**を埋める。
//
// ⚠ **これは「新しい情報を足す道具」ではない。** Claude デスクトップの Code は
// usage ring（context と plan usage）・footer の PR badge・CI status bar を UI として
// 既に持っており、CLI はそれを持たない。∴ 1 行目が運ぶのは *CLI 側の欠落*であって、
// デスクトップの人間が見ていないものではない。
//
// ⚠ **2 行目だけが、どちらの UI にも無いものを運ぶ** —— aim / baton / corpus の動き。
// hook はそれを両面へ注入できるが（hook はデスクトップでも走る）、注入は token を食い、
// 会話に割り込む。statusline は **token を消費しない** ∴ 「常に見えていてほしいが、
// 毎ターン喋られると邪魔なもの」の置き場として、hook とは別の面である。
//
// ⚠ **PR は出さない。** Claude Code は footer に PR badge を既に出しており
// （statusline の `pr.*` は docs いわく "Mirrors the PR badge in the footer"）、
// ここに重ねるのは同じ事実の二重表示にしかならない。
//
// ⚠ **fence を計算し直すことを恐れなくてよい。** 実測で全 gather 込み 55ms（node 起動
// 29ms を含む）であり、Claude Code の 300ms debounce に対して十分軽い。∴ hook が書いた
// cache を読む間接層は要らない —— **正本の lib をそのまま呼ぶ**ほうが、二重実装が
// 生まれない分だけ正しい。この判断は速度が変われば覆る。

import path from 'node:path'
import { writeFile } from 'node:fs/promises'

import { readAimSlugs } from '../lib/corpus.mjs'
import { runGit } from '../lib/git.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherBacklog } from '../lib/process.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { gatherUnpushed } from '../lib/unpushed.mjs'
import { gatherDrift } from '../lib/drift.mjs'
import { readBaton } from '../lib/baton.mjs'

// ⚠ escape 文字を literal で書かない —— この file は heredoc や diff を通って運ばれる
// ことがあり、生の制御文字はその途中で失われるか、道具に拒まれる。
const ESC = String.fromCharCode(27)
const C = {
  reset: ESC + '[0m',
  dim: ESC + '[2m',
  red: ESC + '[31m',
  green: ESC + '[32m',
  yellow: ESC + '[33m',
  blue: ESC + '[34m',
  cyan: ESC + '[36m',
  bold: ESC + '[1m',
}

/**
 * ⚠ **区切りは記号ではなく余白である。**
 *
 * 中黒・矢印・ギリシャ文字はいずれも East Asian **Ambiguous** 幅であり、日本語フォント
 * では全角に描かれるのに terminal は半角として桁を進める ∴ **隣の文字と重なる**。
 * これは環境の不調ではなく、その文字を選んだ側の誤りである。構造は色と余白が作る。
 */
const SEP = '   '

/** 色は「読み手が判断を変える閾値」にだけ使う —— 装飾に使うと閾値が意味を失う。 */
function heat(pct, warn, hot) {
  if (pct === null) return C.dim
  if (pct >= hot) return C.red
  if (pct >= warn) return C.yellow
  return C.green
}

const paint = (color, s) => `${color}${s}${C.reset}`
/** ラベルと値は 1 スペース、segment 間は 3 スペース ∴ 階層が余白の量だけで読める。 */
const field = (label, ...rest) => [paint(C.dim, label), ...rest.filter(Boolean)].join(' ')

/** `105300` → `105.3k` / `1000000` → `1M`。桁を落とすのは幅のためだけである。 */
export function humanTokens(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return `${m >= 10 || Number.isInteger(m) ? Math.round(m) : m.toFixed(1)}M`
  }
  if (n >= 1_000) {
    const k = n / 1_000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
  }
  return String(n)
}

/**
 * `resets_at`（Unix epoch 秒）→ `30m` / `1:06` / `2d`。
 *
 * ⚠ **過ぎた窓は Claude Code 側が JSON から落とす**が、こちらが先に描くこともありうる
 * ∴ 負の残りは 0 に畳む —— 「マイナス 3 分後にリセット」は読み手を混乱させるだけである。
 */
export function untilReset(epochSeconds, now = Date.now()) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) return null
  const ms = epochSeconds * 1000 - now
  const mins = Math.max(0, Math.round(ms / 60_000))
  // ⚠ 週の窓を `55:33` と描いても読めない ∴ 24 時間を超えたら日で見る。
  if (mins >= 1440) return `${Math.round(mins / 1440)}d`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}m`
}

const stripAnsi = (s) => s.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '')

/**
 * ⚠ **幅が確定している文字だけを許す。**
 *
 * 許すのは ASCII printable と、Wide が確定している日本語の帯だけである。Ambiguous
 * （中黒 `·`、矢印 `↑`、ギリシャ文字 `Δ`、絵文字 `⚠` など）は
 * フォント次第で全角に描かれ、桁がずれて隣と重なる。⚠ **この関数は test のための
 * 飾りではない** —— 一度その事故を起こしており、次に同じ文字を足す者を止めるのが役目である。
 */
const WIDTH_SAFE = /[\x20-\x7e　-ヿ一-鿿！-｠]/
export function widthUnsafeChars(s) {
  return [...stripAnsi(s)].filter((ch) => !WIDTH_SAFE.test(ch))
}

/** ANSI を除いた表示幅。ASCII は 1、日本語の帯は 2。 */
export function displayWidth(s) {
  let w = 0
  for (const ch of stripAnsi(s)) {
    const c = ch.codePointAt(0)
    w += (c >= 0x3000 && c <= 0x9fff) || (c >= 0xff01 && c <= 0xff60) ? 2 : 1
  }
  return w
}

/**
 * 幅に収まるまで、**後ろから**捨てる。
 *
 * ⚠ segment は既に優先度順に並んでいる前提である —— 落とす順を呼び手が決められないと、
 * 狭い terminal で最初に消えるのが最も要る情報になりうる。
 */
export function fit(segments, columns) {
  let kept = segments.filter(Boolean)
  while (kept.length > 1) {
    if (displayWidth(kept.join(SEP)) <= columns) break
    kept = kept.slice(0, -1)
  }
  return kept.join(SEP)
}

/** 1 行目 —— デスクトップの usage ring が持っていて、CLI が持っていないもの。 */
export function renderSession(input, branch, now = Date.now()) {
  const seg = []

  const model = input?.model?.display_name
  if (model) {
    const suffix = [input?.effort?.level, input?.fast_mode === true ? 'fast' : null].filter(Boolean)
    seg.push([paint(C.bold, model), ...suffix.map((s) => paint(C.dim, s))].join(' '))
  }

  // ⚠ branch は statusline の stdin JSON に無い（`worktree.branch` は worktree 専用）
  // ∴ ここだけは git を自分で叩いた結果を受け取る。
  if (branch) seg.push(paint(C.cyan, branch))

  const cw = input?.context_window
  if (cw && typeof cw.used_percentage === 'number') {
    const pct = Math.round(cw.used_percentage)
    const used = humanTokens(cw.current_usage)
    const size = humanTokens(cw.context_window_size)
    // ⚠ 判断に使うのは割合であって token 数ではない ∴ 割合を先に置き、量は dim で従える。
    seg.push(field('ctx', paint(heat(pct, 70, 90), `${pct}%`),
      used && size ? paint(C.dim, `${used}/${size}`) : null))
  }

  // ⚠ `rate_limits` は Pro / Max のみ、かつ最初の API 応答の後にしか現れず、各窓は
  // 独立に欠ける ∴ 欠落は静かに省く —— 「0%」と描くのは嘘になる。
  for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d'], ['spend_limit', '$']]) {
    const w = input?.rate_limits?.[key]
    if (!w || typeof w.used_percentage !== 'number') continue
    const pct = Math.round(w.used_percentage)
    const left = untilReset(w.resets_at, now)
    seg.push(field(label, paint(heat(pct, 80, 95), `${pct}%`), left ? paint(C.dim, left) : null))
  }

  return seg
}

/**
 * 2 行目 —— **どちらの UI にも無いもの**。
 *
 * ⚠ **静かなときは静かであること。** 0 件の未 commit を描き続ければ、読み手はやがて
 * 行そのものを見なくなる ∴ 異常だけが現れる。⚠ ただし **`null`（git を読めなかった）は
 * 0 ではない** —— 不在を clean と読ませないため `?` を残す。
 */
export function renderBearing(facts) {
  const seg = []
  if (!facts) return seg

  seg.push(paint(C.dim, 'bearing'))
  if (facts.aimCount > 0) seg.push(field('aim', String(facts.aimCount)))
  if (facts.openTodo > 0) seg.push(field('todo', paint(C.blue, facts.openTodo)))
  if (facts.awaiting > 0) seg.push(field('観測待ち', paint(C.blue, facts.awaiting)))

  // ⚠ baton は「未読」だけを鳴らす。読み終えた baton も、baton が無いこと（fresh start）
  // も、構造的に正常な状態であって知らせるべき事実ではない。
  if (facts.batonUnread) seg.push(paint(C.yellow, 'baton 未読'))

  const counter = (label, v, color) => {
    if (v === null) return seg.push(field(label, paint(C.yellow, '?')))
    if (v > 0) return seg.push(field(label, paint(color, v)))
  }
  counter('未commit', facts.working, C.yellow)
  counter('未push', facts.unpushed, C.yellow)
  counter('drift', facts.drift, C.red)

  return seg
}

/** ⚠ どの失敗も「事実が採れなかった」であって「0 だった」ではない ∴ null へ degrade する。 */
async function gatherFacts(cwd) {
  const unit = await resolveUnit(cwd)
  const repo = unit.repos.find((r) => r.primary) ?? unit.repos[0]
  if (!repo) return { unit, repo: null, facts: null, branch: null }

  const branchRaw = await runGit(repo.root, ['branch', '--show-current'])
  const branch = branchRaw?.trim() || null

  const slugs = await readAimSlugs(repo.root)
  if (slugs.length === 0) return { unit, repo, facts: null, branch }

  const [working, unpushed, drift, backlog, baton] = await Promise.all([
    gatherWorkingDelta(repo.root, slugs).catch(() => null),
    gatherUnpushed(repo.root, slugs).catch(() => null),
    gatherDrift(repo.root).catch(() => null),
    gatherBacklog(repo.root).catch(() => null),
    readBaton(unit.root).catch(() => null),
  ])

  return {
    unit,
    repo,
    branch,
    facts: {
      aimCount: slugs.length,
      openTodo: backlog?.openTodoNodes ?? 0,
      awaiting: backlog?.awaitingNodes?.length ?? 0,
      batonUnread: Boolean(baton && !baton.readAt),
      working: working === null ? null : working.length,
      unpushed: unpushed === null ? null : unpushed.length,
      drift: drift === null ? null : drift.intra.length + drift.inter.length,
    },
  }
}

async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return { input: JSON.parse(raw), raw }
  } catch {
    return { input: {}, raw }
  }
}

async function main() {
  const { input, raw } = await readStdin()

  // 実物の JSON を一度見るための穴。⚠ 既定では何も書かない —— statusline は毎ターン
  // 走る ∴ 黙って file を育てる副作用を既定にしてはならない。
  if (process.env.BEARING_STATUSLINE_DEBUG) {
    await writeFile(
      process.env.BEARING_STATUSLINE_DEBUG,
      JSON.stringify({ stdin: raw, env: process.env, columns: process.env.COLUMNS }, null, 2),
    ).catch(() => {})
  }

  const cwd = input?.workspace?.current_dir || input?.cwd || process.cwd()
  const columns = Number.parseInt(process.env.COLUMNS ?? '', 10) || 120

  let gathered = { branch: null, facts: null }
  try {
    gathered = await gatherFacts(cwd)
  } catch {
    // ⚠ corpus を読めなくても 1 行目は出す。statusline が落ちると行ごと消える ——
    // 「bearing が壊れた」ことと「terminal が狭い」ことが、読み手には区別できない。
  }

  const first = fit(renderSession(input, gathered.branch), columns)
  const second = fit(renderBearing(gathered.facts), columns)

  if (first) process.stdout.write(first + '\n')
  if (second) process.stdout.write(second + '\n')
}

// ⚠ import されたとき（test）は走らせない。
if (process.argv[1] && path.resolve(process.argv[1]).endsWith('statusline.mjs')) {
  await main()
}
