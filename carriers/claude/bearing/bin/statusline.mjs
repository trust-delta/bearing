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

import { readAimSlugs, DEFAULT_AIMS_DIR } from '../lib/corpus.mjs'
import { runGit } from '../lib/git.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherBacklog } from '../lib/process.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { gatherUnpushed } from '../lib/unpushed.mjs'
import { gatherDrift } from '../lib/drift.mjs'
import { readBaton } from '../lib/baton.mjs'

// ⚠ **stdin を読む前に、ここが最初に走らねばならない。** 委譲は fd をそのまま子へ渡す
// （`stdio: 'inherit'`）ので、親が一度でも stdin を読めばその分は永久に失われる。
import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)


// ⚠ escape 文字を literal で書かない —— この file は heredoc や diff を通って運ばれる
// ことがあり、生の制御文字はその途中で失われるか、道具に拒まれる。
const ESC = String.fromCharCode(27)
const fg = (n) => ESC + '[38;5;' + n + 'm'
const bg = (n) => ESC + '[48;5;' + n + 'm'
const C = {
  reset: ESC + '[0m',
  // ⚠ 階調で階層を作る —— ラベルは後退し、値が前に出る。`dim` 一段では、ラベルと
  // 補助情報が同じ重さになり、目が拾う順序が生まれない。
  label: fg(245),
  faint: fg(240),
  green: fg(71),
  yellow: fg(179),
  red: fg(167),
  blue: fg(75),
  cyan: fg(80),
}

/** ⚠ 塗るのは**空白**である —— 下の `bar` の理由を見よ。 */
const BAR = { empty: bg(236), green: bg(65), yellow: bg(136), red: bg(124) }

/**
 * ⚠ **区切りは記号ではなく余白である。**
 *
 * 中黒・矢印・ギリシャ文字はいずれも East Asian **Ambiguous** 幅であり、日本語フォント
 * では全角に描かれるのに terminal は半角として桁を進める ∴ **隣の文字と重なる**。
 * これは環境の不調ではなく、その文字を選んだ側の誤りである。構造は色と余白が作る。
 */
const SEP = '   '

/**
 * ⚠ **バーは空白に背景色を塗って描く。**
 *
 * ブロック文字（`█` `░`）や罫線は、幅が Ambiguous / Neutral の境で環境ごとに揺れる ——
 * 一度その事故を起こしている。**空白だけは揺れない** ∴ 見た目の滑らかさと桁の確実さを
 * 同時に取れる唯一の手である。色が形を作り、文字は形を作らない。
 */
export function bar(pct, width = 8) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const filled = Math.round((p / 100) * width)
  const tone = p >= 90 ? BAR.red : p >= 70 ? BAR.yellow : BAR.green
  return tone + ' '.repeat(filled) + BAR.empty + ' '.repeat(width - filled) + C.reset
}

/**
 * 色は「読み手が判断を変える閾値」にだけ使う —— 装飾に使うと閾値が意味を失う。
 *
 * ⚠ **存在しない色名を返してはならない。** `paint()` は受け取ったものをそのまま前置する
 * ∴ 綴りを誤れば色が落ちるのではなく、画面に文字列 `undefined` が出て**値が汚れる**。
 * 現在の呼び手 2 つはいずれも数であることを確かめてから渡す ∴ 下の枝は到達しないが、
 * その保証が外れた日のために在る —— 到達しないことを理由に検査しなければ、罠のまま残る。
 */
export function heat(pct, warn, hot) {
  if (pct === null) return C.faint
  if (pct >= hot) return C.red
  if (pct >= warn) return C.yellow
  return C.green
}

const paint = (color, s) => `${color}${s}${C.reset}`
/** ラベルと値は 1 スペース、segment 間は 3 スペース ∴ 階層が余白の量だけで読める。 */
const field = (label, ...rest) => [paint(C.label, label), ...rest.filter(Boolean)].join(' ')

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
    seg.push([model, ...suffix.map((s) => paint(C.label, s))].join(' '))
  }

  // ⚠ branch は statusline の stdin JSON に無い（`worktree.branch` は worktree 専用）
  // ∴ ここだけは git を自分で叩いた結果を受け取る。
  //
  // ⚠ **ラベルを省かない。** 色は「重さ」を伝えるが「種別」は伝えない —— ラベルの無い
  // 裸の文字列は、読み手にそれが何なのかを推測させる。
  //
  // ⚠ **項目ごと消さない。** 2 行目と同じ誤りが、ここにも在った —— repo を見失ったとき
  // `git` の項目が黙って消えれば、読み手には「branch が無い」のか「statusline が壊れた」
  // のか「幅が足りない」のかが区別できない。
  //   `null` = repo を読めなかった / git 管理外   `''` = detached HEAD
  if (branch === null) seg.push(field('git', paint(C.faint, '未検知')))
  else if (branch === '') seg.push(field('git', paint(C.faint, 'detached')))
  else seg.push(field('git', paint(C.cyan, branch)))

  const cw = input?.context_window
  if (cw && typeof cw.used_percentage === 'number') {
    const pct = Math.round(cw.used_percentage)
    const used = humanTokens(cw.current_usage)
    const size = humanTokens(cw.context_window_size)
    // ⚠ 判断に使うのは割合であって token 数ではない ∴ 割合を先に置き、量は dim で従える。
    seg.push(field('ctx', bar(pct), paint(heat(pct, 70, 90), `${pct}%`),
      used && size ? paint(C.faint, `${used}/${size}`) : null))
  }

  // ⚠ `rate_limits` は Pro / Max のみ、かつ最初の API 応答の後にしか現れず、各窓は
  // 独立に欠ける ∴ 欠落は静かに省く —— 「0%」と描くのは嘘になる。
  for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d'], ['spend_limit', '$']]) {
    const w = input?.rate_limits?.[key]
    if (!w || typeof w.used_percentage !== 'number') continue
    const pct = Math.round(w.used_percentage)
    const left = untilReset(w.resets_at, now)
    seg.push(field(label, paint(heat(pct, 80, 95), `${pct}%`), left ? paint(C.faint, left) : null))
  }

  return seg
}

/**
 * 2 行目 —— **どちらの UI にも無いもの**。
 *
 * ⚠ **静かなときは静かであること。** 0 件の未 commit を描き続ければ、読み手はやがて
 * 行そのものを見なくなる ∴ 異常だけが現れる。⚠ ただし **`null`（git を読めなかった）は
 * 0 ではない** —— 不在を clean と読ませないため `?` を残す。
 *
 * ⚠ **行そのものは消さない。** 初版は corpus を採れないとき 2 行目を黙って落としていたが、
 * それは読み手に「bearing は何も言っていない ＝ 問題が無い」と読ませる —— **corpus fence が
 * 一貫して拒んできた誤読を、statusline でだけ許していた**。行は必ず在り、*何が言えないのか*
 * を述べる。行数が跳ねなくなるのは、その副産物にすぎない。
 *
 * @param {'ok'|'no-corpus'|'unavailable'} state
 */
/**
 * 走っている複製はどちらか。**working tree なら `'repo'`、cache なら `null`。**
 *
 * ⚠ **黙っていてよいのは cache のほうである。** 他 project から見れば cache こそ正常な状態
 * であり、この行の法（静かなときは静かであること）に従えば、述べるべきは*異常*のほう ——
 * すなわち **「あなたが今見ている事実は、他 project が受け取る版のものではない」**である。
 *
 * ⚠ **委譲の env ではなく自分の位置で判定する。** `delegate.mjs` の印は「委譲されて来た」
 * ことしか語らず、statusline のように**最初から working tree を直に指されている**場合に
 * 何も立たない —— 2026-09-02 の食い違いは、まさにその経路で起きた。
 */
export function provenance(selfDir, projectDir) {
  if (!projectDir || !selfDir) return null
  const root = path.resolve(projectDir)
  return path.resolve(selfDir).startsWith(root + path.sep) ? 'repo' : null
}

export function renderBearing(state, facts, from = null, aimsDirs = []) {
  const seg = [paint(C.label, from === 'repo' ? 'bearing repo' : 'bearing')]

  // ⚠ `docs/aims/` を持たない repo は**構造的に正常**である ∴ 警告色を与えない。
  // この判定が先に来ること —— corpus が無い repo も facts を持たないため、
  // 順序を違えれば「正常な不在」がすべて警告に化ける。
  // ⚠ **既定でない在り処を見ているときは、それを言う。** 言わなければ「corpus 無し」が、
  // *本当に無い*のか *宣言を誤って別の場所を見ている*のかを畳んでしまう —— そして
  // ⚠ **既定のときは言わない**: 既定を毎回描くのは、この面が最も持たない予算（幅）を
  // 何も告げずに食うことである。
  if (state === 'no-corpus') {
    // ⚠ **既定のときは黙る** —— 既定を毎回描くのは、この面が最も持たない予算（幅）を
    // 何も告げずに食うことである。⚠ **幅が確定しない文字を含む在り処は名指さない**:
    // 名指せば画面が重なり、**述べようとした事実ごと読めなくなる。**
    const custom = aimsDirs.filter((d) => d && d !== DEFAULT_AIMS_DIR)
    const safe = custom.filter((d) => widthUnsafeChars(d).length === 0)
    const where = safe.length > 0 ? ` (${safe.join(',')})` : custom.length > 0 ? ' (別の在り処)' : ''
    return [...seg, paint(C.faint, `corpus 無し${where}`)]
  }
  // ⚠ 一方 **repo が見つからない**は clean ではない。`resolveUnit` は cwd から*下*を
  // 探す ∴ repo の subdirectory で起動すれば、corpus は在るのに見つからない。
  if (state === 'unavailable' || !facts) return [...seg, paint(C.yellow, 'corpus 未取得')]
  // ⚠ **どの数も、採れなかったときは `?` になる。** 0 と `null` を同じ「出さない」に
  // 畳めば、読み手はそこに事実が無いことを知りようがない。
  const counter = (label, v, color) => {
    if (v === null || v === undefined) return seg.push(field(label, paint(C.yellow, '?')))
    if (v > 0) return seg.push(field(label, color ? paint(color, v) : String(v)))
  }
  counter('aim', facts.aimCount, null)
  counter('todo', facts.openTodo, C.blue)
  counter('観測待ち', facts.awaiting, C.blue)
  // ⚠ **番が人間へ渡っている 2 つを隣に置く。** `観測待ち` は「見れば済む」、`escalation` は
  // 「決めなければ誰も進めない」であり、**どちらも人間が動かない限り動かない** ∴ 離せば、
  // 人間の側の残りが 1 箇所で読めなくなる。
  //
  // ⚠ **色は `todo` / `観測待ち` と同じ blue である。** escalation が他より重いかどうかは
  // **注意予算の割り当て**であり、面がそれを述べれば、この repo が機械とエージェントに禁じて
  // いる ranking を**色で**行うことになる。⚠ 重さの表明は人間の act ∴ 求められたときに変える。
  counter('escalation', facts.escalation, C.blue)

  // ⚠ baton は「未読」だけを鳴らす。読み終えた baton も、baton が無いこと（fresh start）
  // も、構造的に正常な状態であって知らせるべき事実ではない。
  if (facts.batonUnread) seg.push(paint(C.yellow, 'baton 未読'))

  counter('未commit', facts.working, C.yellow)
  counter('未push', facts.unpushed, C.yellow)
  counter('drift', facts.drift, C.red)

  return seg
}

/**
 * unit の全 repo の事実を 1 枚に畳む。
 *
 * ⚠ **`primary` を filter に使わない。** `lib/unit.mjs` は primary を「**表示順であって
 * filter ではない**: どの repo も事実を運び、どの repo の事実も出力される」と定めており、
 * `bin/aim-facts.mjs` も unit を横断して合算する。初版は primary 1 つだけを見ていた ∴
 * multi-repo unit では**同じ画面で数が食い違っていた**。
 *
 * ⚠ **1 つでも採れなければ合計は `null`。** 「一部は読めた」は「読めた」ではない ——
 * 3 repo のうち 1 つを読み落とした合計を数として出せば、それは過少報告である。
 */
export function foldRepos(perRepo) {
  if (perRepo.length === 0) return null
  const sum = (pick) => {
    let total = 0
    for (const r of perRepo) {
      const v = pick(r)
      if (v === null || v === undefined) return null
      total += v
    }
    return total
  }
  return {
    aimCount: sum((r) => r.slugs.length),
    openTodo: sum((r) => r.backlog?.openTodoNodes ?? null),
    awaiting: sum((r) => r.backlog?.awaitingNodes?.length ?? null),
    escalation: sum((r) => r.backlog?.escalationNodes?.length ?? null),
    working: sum((r) => (r.working === null ? null : r.working.length)),
    unpushed: sum((r) => (r.unpushed === null ? null : r.unpushed.length)),
    drift: sum((r) => (r.drift === null ? null : r.drift.intra.length + r.drift.inter.length)),
  }
}

/**
 * unit の root をどこに取るか。
 *
 * ⚠ **`project_dir` を先に見る。** unit とは「このセッションが何を対象にしているか」で
 * あって「今どの directory に立っているか」ではない —— agent が `cd` した先を root と
 * 読めば、`resolveUnit` は cwd から*下*しか探さないため **corpus は在るのに見失う**。
 * これは机上の懸念ではなく、実際に 2 行目が `corpus 未取得` に落ちて発覚した。
 *
 * ⚠ この解決順は `bin/aim-facts.mjs`（`process.cwd()`）とも
 * `boot-ritual` / `corpus-delta` / `precompact`（`input.cwd || process.cwd()`）とも違う。
 * **`docs/aims/bearing.md` の「hook 間の cwd 解決を一致させる」`[todo]` が指しているのは
 * この不一致であり、statusline はそこに 3 つ目の解決を持ち込んでいる。**
 */
export function resolveCwd(input, fallback = process.cwd()) {
  return input?.workspace?.project_dir
    || input?.workspace?.current_dir
    || input?.cwd
    || fallback
}

/**
 * ⚠ どの失敗も「事実が採れなかった」であって「0 だった」ではない ∴ null へ degrade する。
 *
 * ⚠ **branch だけは `current_dir` から取る。** aim は「何を目指しているか」であって
 * `cd` では動かないが、branch は「**今どこで作業しているか**」である —— 2 つは別の問いで
 * あり、同じ directory から答えるべきものではない。`git -C` は上向きに `.git` を探す ∴
 * subdirectory を渡してもその repo に届く。
 */
async function gatherFacts(input) {
  const unit = await resolveUnit(resolveCwd(input))
  const here = input?.workspace?.current_dir || unit.root
  const branchRaw = await runGit(here, ['branch', '--show-current'])
  // ⚠ `''` は detached HEAD、`null` は git を読めなかったこと。**別の事実である。**
  const branch = branchRaw === null ? null : branchRaw.trim()

  if (unit.repos.length === 0) return { state: 'unavailable', facts: null, branch }

  const perRepo = (await Promise.all(unit.repos.map(async (repo) => {
    const dir = repo.aimsDir ?? DEFAULT_AIMS_DIR
    const slugs = await readAimSlugs(repo.root, dir)
    // corpus を採っていない repo は unit の中に普通に居る ∴ 落とすのであって、
    // 「読めなかった」とは数えない。
    if (slugs.length === 0) return null
    const [working, unpushed, drift, backlog] = await Promise.all([
      gatherWorkingDelta(repo.root, slugs, dir).catch(() => null),
      gatherUnpushed(repo.root, slugs, dir).catch(() => null),
      gatherDrift(repo.root, dir).catch(() => null),
      gatherBacklog(repo.root, dir).catch(() => null),
    ])
    return { slugs, working, unpushed, drift, backlog }
  }))).filter(Boolean)

  // ⚠ **「無い」だけでは足りない。** 在り処が宣言で動く以上、*本当に無い*のか
  // *別の場所を見ている*のかを、面が区別できなければならない。
  if (perRepo.length === 0) {
    const aimsDirs = [...new Set(unit.repos.map((r) => r.aimsDir ?? DEFAULT_AIMS_DIR))]
    return { state: 'no-corpus', facts: null, branch, aimsDirs }
  }

  // ⚠ baton は unit に 1 つである（repo ではなく unit root に置かれる）∴ 畳まない。
  const baton = await readBaton(unit.root).catch(() => null)
  return {
    state: 'ok',
    branch,
    facts: { ...foldRepos(perRepo), batonUnread: Boolean(baton && !baton.readAt) },
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

/**
 * ⚠ **export されているのは、装着の shim が呼ぶからである。**
 * `bin/bearing-statusline.mjs` は `~/.claude/` に住み、install record を読んでここへ橋渡し
 * する ∴ そのとき `process.argv[1]` は shim を指し、下の entry 判定は当たらない。
 */
export async function main() {
  const { input, raw } = await readStdin()

  // 実物の JSON を一度見るための穴。⚠ 既定では何も書かない —— statusline は毎ターン
  // 走る ∴ 黙って file を育てる副作用を既定にしてはならない。
  if (process.env.BEARING_STATUSLINE_DEBUG) {
    await writeFile(
      process.env.BEARING_STATUSLINE_DEBUG,
      JSON.stringify({ stdin: raw, env: process.env, columns: process.env.COLUMNS }, null, 2),
    ).catch(() => {})
  }

  const columns = Number.parseInt(process.env.COLUMNS ?? '', 10) || 120

  let gathered = { state: 'unavailable', branch: null, facts: null }
  try {
    gathered = await gatherFacts(input)
  } catch (err) {
    // ⚠ corpus を読めなくても 1 行目は出す。statusline が落ちると行ごと消える ——
    // 「bearing が壊れた」ことと「terminal が狭い」ことが、読み手には区別できない。
    //
    // ⚠ **ただしこの degrade は、実装の bug をも `corpus 未取得` に化けさせる。**
    // 実際に `ReferenceError` を丸ごと飲み、事実が採れないのだと読み違えた ∴
    // debug の穴が開いているときだけは、飲んだものを見せる。
    if (process.env.BEARING_STATUSLINE_DEBUG) console.error(err)
  }

  const first = fit(renderSession(input, gathered.branch), columns)
  const second = fit(
    renderBearing(
      gathered.state,
      gathered.facts,
      provenance(import.meta.dirname, resolveCwd(input)),
      gathered.aimsDirs ?? [],
    ),
    columns,
  )

  if (first) process.stdout.write(first + '\n')
  if (second) process.stdout.write(second + '\n')
}

// ⚠ import されたとき（test）は走らせない。
// ⚠ **basename の一致で見る。** `endsWith` は `bearing-statusline.mjs`（装着の shim）にも
// 当たり、shim 経由で import したときに main() が二重に走る —— 面が 2 度描かれる。
if (process.argv[1] && path.basename(process.argv[1]) === 'statusline.mjs') {
  await main()
}
