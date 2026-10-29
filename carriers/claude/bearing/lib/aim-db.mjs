// aim の記録（人間の決定とエージェントの解釈）を repo から読み、形を検める。
//
// 置き場は `docs/aim-db/<collection>/<id>.json` —— **1 件 1 file** である（人間の決定
// 2026-10-29: 正本は repo）。⚠ **1 件 1 file にしたのは、並行する会話が衝突しないため**
// である —— hub の作業窓は会話ごとに worktree を切る ∴ 2 つの会話が 1 つの file の末尾へ
// 追記すれば、merge のたびに衝突する。file を分ければ、別々の記録は決して同じ行に触れない。
//
// ⚠ **file 名が id である** ∴ 本文に `id` を持たせない —— 2 箇所に置けば、片方だけが動く日が来る。
// この形は `ArtifactData` の `list` に `out_dir` を付けて読み出した形と同じである。

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

/** 記録の既定の在り処。 */
export const DEFAULT_AIM_DB_DIR = 'docs/aim-db'

/** 記録が持つ collection。⚠ 並びは読み手に見せる順でもある。 */
export const COLLECTIONS = ['nodes', 'features', 'categories', 'decisions', 'interpretations', 'questions']

/**
 * 問いの状態。⚠ **問いは人間の判断待ちである**（2026-10-29、本文の `# ESCALATION` から移した）——
 * 答えが出たら、その答えの決定を `answeredBy` で名指して `answered` にする。問いそのものは消さない。
 */
export const QUESTION_STATUSES = ['open', 'answered']

/** 固定の枠。機能は repo ごとに `features` が持ち、枠だけはどの repo でも同じ。 */
export const FRAMES = [
  ['whole', '全体'],
  ['make', '作る'],
  ['record', '記録する'],
  ['output', '出力する'],
]

/** 決定の `form`。`verbatim` は人間の言葉そのもの、`pinned` は目的として固定された `aim:` の文。 */
export const DECISION_FORMS = ['verbatim', 'paraphrase', 'pinned']

/** id として使える形。⚠ file 名になる ∴ path を登れる字（`/`・`..`）を通さない。 */
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/**
 * 1 件を file の本文へ。key を並べ直し、末尾に改行を置く。
 *
 * ⚠ **並びを固定しないと、中身が同じでも書き手ごとに差分が出る** —— git の差分で「何が
 * 足されたか」を読むための形である。
 */
export function formatRecord(body) {
  const sort = (v) =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v
  const { id: _drop, ...rest } = body
  return JSON.stringify(sort(rest), null, 2) + '\n'
}

/**
 * repo の記録を読む。
 *
 * ⚠ **在り処が無いことと、読めない file が在ることを分けて返す** —— 前者は「この repo は
 * まだ記録を持たない」であり、後者は壊れた記録である。壊れた記録を黙って飛ばせば、
 * 在る決定を無いと読ませる。
 *
 * @returns {Promise<{present: boolean, store: Record<string, object[]>, unreadable: string[]}>}
 */
export async function readStore(repoRoot, dir = DEFAULT_AIM_DB_DIR) {
  const base = path.join(repoRoot, dir)
  const store = Object.fromEntries(COLLECTIONS.map((c) => [c, []]))
  const unreadable = []
  let present = false
  for (const c of COLLECTIONS) {
    let names
    try {
      names = (await readdir(path.join(base, c))).filter((n) => n.endsWith('.json')).sort()
    } catch {
      continue // collection の dir が無いのは、まだ 1 件も無いことである。
    }
    present = true
    for (const n of names) {
      const id = n.slice(0, -'.json'.length)
      try {
        const body = JSON.parse(await readFile(path.join(base, c, n), 'utf8'))
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object ではない')
        store[c].push({ id, ...body })
      } catch (err) {
        unreadable.push(`${c}/${n}: ${err.message}`)
      }
    }
  }
  return { present, store, unreadable }
}

/**
 * 記録の形を検める。返すのは問題の一覧であり、空なら形は整っている。
 *
 * ⚠ **見るのは形と参照だけである** —— 決定の中身が正しいかは、人間にしか言えない。
 */
export function validateStore(store) {
  const problems = []
  const ids = (c) => new Set((store[c] ?? []).map((x) => x.id))
  const nodes = ids('nodes')
  const features = ids('features')
  const categories = ids('categories')
  const decisions = ids('decisions')
  const frames = new Set(FRAMES.map(([k]) => k))
  for (const c of COLLECTIONS) {
    // ⚠ 種類が足される前の形（`questions` を持たない）も読めるように、欠けた種類は空と読む。
    for (const x of store[c] ?? []) if (!ID.test(x.id)) problems.push(`${c}/${x.id}: id の形が不正`)
  }
  for (const n of store.nodes) {
    if (!n.aim) problems.push(`nodes/${n.id}: aim が無い`)
    if (n.feature && !features.has(n.feature)) problems.push(`nodes/${n.id}: 未定義の機能 ${n.feature}`)
  }
  for (const f of store.features) {
    if (!frames.has(f.frame)) problems.push(`features/${f.id}: 未定義の枠 ${f.frame}`)
    if (!f.label) problems.push(`features/${f.id}: label が無い`)
  }
  const common = (c, x) => {
    if (!nodes.has(x.node)) problems.push(`${c}/${x.id}: 未定義の node ${x.node}`)
    if (x.feature && !features.has(x.feature)) problems.push(`${c}/${x.id}: 未定義の機能 ${x.feature}`)
    if (x.category && !categories.has(x.category)) problems.push(`${c}/${x.id}: 未定義の分類 ${x.category}`)
  }
  for (const d of store.decisions) {
    common('decisions', d)
    if (!DECISION_FORMS.includes(d.form)) problems.push(`decisions/${d.id}: 未定義の form ${d.form}`)
    if ((d.form === 'verbatim' || d.form === 'pinned') && !d.quote) {
      problems.push(`decisions/${d.id}: ${d.form} なのに quote が無い`)
    }
    if (d.form === 'paraphrase' && d.quote) problems.push(`decisions/${d.id}: 言い換えが quote を持つ`)
    if (!d.summary) problems.push(`decisions/${d.id}: summary が無い`)
  }
  for (const i of store.interpretations) {
    common('interpretations', i)
    if (!i.text) problems.push(`interpretations/${i.id}: text が無い`)
    for (const b of i.basis ?? []) {
      if (!decisions.has(b)) problems.push(`interpretations/${i.id}: 実在しない決定を名指す ${b}`)
    }
  }
  for (const q of store.questions ?? []) {
    if (!nodes.has(q.node)) problems.push(`questions/${q.id}: 未定義の node ${q.node}`)
    if (!q.text) problems.push(`questions/${q.id}: text が無い`)
    if (!QUESTION_STATUSES.includes(q.status)) problems.push(`questions/${q.id}: 未定義の status ${q.status}`)
    if (q.status === 'answered' && !(q.answeredBy ?? []).length) problems.push(`questions/${q.id}: answered なのに答えの決定を名指さない`)
    for (const d of q.answeredBy ?? []) {
      if (!decisions.has(d)) problems.push(`questions/${q.id}: 実在しない決定を名指す ${d}`)
    }
    if (q.feature && !features.has(q.feature)) problems.push(`questions/${q.id}: 未定義の機能 ${q.feature}`)
  }
  return problems
}

/**
 * セッション開始時に注入する要約を作る —— 全件ではなく、機能ごとの件数と直近の決定だけ。
 *
 * ⚠ **全件を注入しない** —— 決定は増え続ける ∴ 全文を載せれば、文脈の予算を記録の量に
 * 比例して食う。機能 A の今を読みたいエージェントは、要約が名指す dir を引けばよい。
 *
 * ⚠ **今の解釈からは、撤回した目的（`state: dead`）の node と置き換えられたもの
 * （`status: superseded`）を除く** —— facts の他の数（open-todo 等）と同じ除外である。
 * 決定は除かない: 撤回した目的についての決定も、人間がそう決めたという事実である。
 *
 * @param {Record<string, object[]>} store
 * @param {{recent?: number}} opts
 */
export function summarizeStore(store, { recent = 5 } = {}) {
  const dead = new Set(store.nodes.filter((n) => n.state === 'dead').map((n) => n.id))
  const current = store.interpretations.filter((i) => i.status !== 'superseded' && !dead.has(i.node))
  const count = (xs, f) => xs.filter((x) => (x.feature ?? null) === f).length
  const order = new Map(FRAMES.map(([k], i) => [k, i]))
  const features = store.features
    .slice()
    .sort((a, b) => (order.get(a.frame) ?? 99) - (order.get(b.frame) ?? 99) || (a.order ?? 0) - (b.order ?? 0))
    .map((f) => ({
      frame: f.frame, id: f.id, label: f.label,
      decisions: count(store.decisions, f.id),
      current: count(current, f.id),
      choices: count(current.filter((i) => !(i.basis ?? []).length), f.id),
    }))
  const unassigned = {
    decisions: count(store.decisions, null),
    current: count(current, null),
  }
  // 日付の新しい順。日付の無い決定は、いつのものか言えない ∴ 直近には入れない。
  const latest = store.decisions
    .filter((d) => d.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.seq ?? 0) - (a.seq ?? 0)))
    .slice(0, recent)
  // ⚠ **開いた問いは全件を返す** —— 人間の判断待ちは、数ではなく中身が要る。撤回した目的の問いは除く。
  const open = (store.questions ?? []).filter((q) => q.status === 'open' && !dead.has(q.node))
  return { features, unassigned, latest, open, totals: { decisions: store.decisions.length, current: current.length } }
}

/** 1 行に収める。⚠ 字数で切るのは表示のためだけで、記録そのものは切らない。 */
const clip = (s, n = 70) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t
}

/**
 * 要約を facts の 1 節として描く。
 *
 * ⚠ **読めない file と形の崩れを、要約の前に述べる** —— 壊れた記録を黙って飛ばせば、
 * 在る決定を無いと読ませる。
 */
export function renderAimDbSection(summary, { dir = DEFAULT_AIM_DB_DIR, problems = [], unreadable = [] } = {}) {
  const featureLabel = new Map(summary.features.map((f) => [f.id, f.label]))
  const lines = ['```bearing-aim-db v1', '# fields: frame | feature | label | decisions | current_interpretations | agent_choices']
  for (const p of unreadable) lines.push(`# ⚠ 読めない記録: ${p}`)
  for (const p of problems) lines.push(`# ⚠ 形の崩れ: ${p}`)
  for (const f of summary.features) {
    lines.push(`${f.frame} | ${f.id} | ${f.label} | ${f.decisions} | ${f.current} | ${f.choices}`)
  }
  if (summary.unassigned.decisions || summary.unassigned.current) {
    lines.push(`- | - | 機能が未割り当て | ${summary.unassigned.decisions} | ${summary.unassigned.current} | -`)
  }
  lines.push('```', '')
  if (summary.open?.length) {
    lines.push(`人間の判断を待っている問い（${summary.open.length} 件）:`, '')
    for (const q of summary.open) lines.push(`- \`${q.id}\` [${featureLabel.get(q.feature) ?? '機能なし'}] ${clip(q.text, 90)}`)
    lines.push('')
  }
  if (summary.latest.length) {
    lines.push(`直近の人間の決定（新しい順に ${summary.latest.length} 件）:`, '')
    for (const d of summary.latest) {
      const what = d.form === 'paraphrase' ? `${clip(d.summary)}（言い換え）` : `「${clip(d.quote)}」${d.form === 'pinned' ? '（目的の固定）' : ''}`
      lines.push(`- ${d.date} \`${d.id}\` [${featureLabel.get(d.feature) ?? '機能なし'}] ${what}`)
    }
    lines.push('')
  }
  lines.push(
    `⚠ **ここに在るのは要約である。** 機能ごとの決定と今の解釈は \`${dir}/decisions/\` と \`${dir}/interpretations/\` を`,
    `機能で引くこと（例: \`grep -l '"feature": "<機能 id>"' ${dir}/decisions/*.json\`）。⚠ **\`agent_choices\` は、どの人間の`,
    '決定にも依らない今の解釈の数である** —— 手段が人間に指示されたものか、エージェントが選んだものかは、ここで見分ける。',
    '',
  )
  return lines.join('\n')
}

/**
 * 人間に向けた 1 行 —— hook がエージェントへ渡し、エージェントが会話でそのまま人間に伝える。
 *
 * ⚠ **statusline の代わりである**（人間の決定 2026-10-29、`bearing-x13`）—— 主経路の Desktop には
 * statusline が届かない ∴ 数はエージェントの context にだけ在り、人間は頼まなければ見えなかった。
 * ⚠ hook の `systemMessage` で人間へ直接見せる案は、Desktop に表示されなかった（人間の観測 2026-10-29）。
 * ⚠ **件数と最新の決定だけを載せる** —— 中身は会話かページ（Artifact）で見る。1 行を超えれば、
 * 毎回読まれる面ではなくなる。
 */
export function renderHumanLine(summary, { label }) {
  const latest = summary.latest[0]
  const decisions = `決定 ${summary.totals.decisions} 件` + (latest ? `（最新 ${latest.id}・${latest.date}）` : '')
  return `aim（${label}）: 人間の判断を待っている問い ${summary.open.length} 件 ・ ${decisions}`
}

/** 読めた記録の一揃いから 1 行を作る。記録を持たない repo では `null`。 */
export function humanLineOf(read, { label }) {
  if (!read?.present) return null
  // ⚠ 読めない・崩れた記録が在るときに数を出せば、欠けた数が正しく見える ∴ 数を出さずに崩れを言う。
  if (read.unreadable.length || validateStore(read.store).length) {
    return `aim（${label}）: ⚠ 記録に読めない・形の崩れたものが在る —— 件数は出さない`
  }
  return renderHumanLine(summarizeStore(read.store), { label })
}

/** 記録を読み、人間に向けた 1 行を返す。記録を持たない repo では `null`。 */
export async function readHumanLine(repoRoot, { label, dir = DEFAULT_AIM_DB_DIR } = {}) {
  return humanLineOf(await readStore(repoRoot, dir), { label })
}

/**
 * 開いた問いの id だけを読む。記録を持たない repo では `null`。
 *
 * ⚠ **statusline のための軽い読み** —— statusline は描くたびに走る ∴ 全件（数百）を読まず、
 * 問いの dir だけを読む。撤回した目的の問いは除かない（node を読まない軽さと引き換えである）。
 */
export async function readOpenQuestions(repoRoot, dir = DEFAULT_AIM_DB_DIR) {
  const base = path.join(repoRoot, dir)
  try {
    await readdir(base)
  } catch {
    return null
  }
  let names = []
  try {
    names = (await readdir(path.join(base, 'questions'))).filter((n) => n.endsWith('.json'))
  } catch {
    return []
  }
  const open = []
  for (const n of names) {
    try {
      const q = JSON.parse(await readFile(path.join(base, 'questions', n), 'utf8'))
      if (q?.status === 'open') open.push(n.slice(0, -'.json'.length))
    } catch {
      // 読めない問いは数えない。⚠ facts の側（readStore）が読めないことを述べる。
    }
  }
  return open.sort()
}
