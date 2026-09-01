// セッション途中の delta を描画する。
//
// `bin/corpus-delta.mjs` から分離してあるのは 1 つの理由による: `bin/aim-facts.mjs` が
// これと一致していなければならない。composer は**既に**集めた事実からセッションの baseline
// を播くので、⚠ **両者が「何が述べられるか」を別の code で計算すれば、黙って乖離する** ——
// boot の baseline が一方を主張し、最初の batch が起きてもいない変化を報告することになる。
//
// ⚠ **ここは何も判定しない。** 安い機械層が置かれているのは**可視化**の位置である:
// fence が在るものを述べ、エージェントが検査し、人間が決める。open-todo の行がそれを
// そのまま言葉にしているのは、⚠ **その一文を伴わずに届いた数が、体制が差し控えている
// triage を招くからである。**

import { renderWorkingDeltaFence } from './working-delta.mjs'
import { renderAwaitingFence } from './process.mjs'

/**
 * @param {{
 *   repos: {label: string, working: object[], backlog: {openTodoNodes: number, unknownNodes: string[], anomalies: object[]}}[],
 *   moved: {label: string, from: string, to: string, blocks?: string[]}[],
 *   hadBaseline: boolean,
 * }} args
 * @returns {string} unit が corpus を全く持たないときは ''
 */
export function renderCorpusDelta({ repos, moved = [], hadBaseline = true }) {
  if (!repos || repos.length === 0) return ''

  const movedBy = new Map(moved.map((m) => [m.label, m]))
  const lines = []
  let openTodo = 0
  const unknown = []
  const awaiting = []
  const anomalies = []

  lines.push('# aim facts —— このセッションが事実を渡されて以降、corpus が動いた', '')
  if (!hadBaseline) {
    lines.push(
      '⚠ **このセッションには boot 時の baseline が記録されていない** ∴ これは差分ではなく、',
      '現在の corpus そのものである。clean ではなく「不在」。',
      '',
    )
  }

  for (const r of repos) {
    openTodo += r.backlog?.openTodoNodes ?? 0
    for (const s of r.backlog?.unknownNodes ?? []) unknown.push(`${r.label}/${s}`)
    for (const a of r.backlog?.awaitingNodes ?? [])
      awaiting.push({ ...a, slug: repos.length > 1 ? `${r.label}/${a.slug}` : a.slug })
    for (const a of r.backlog?.anomalies ?? []) anomalies.push({ repo: r.label, ...a })

    lines.push(`### ${r.label}`, '')
    const m = movedBy.get(r.label)
    if (m) {
      lines.push(
        `⚠ **\`docs/aims/\` の上で HEAD が動いた**: \`${short(m.from)}\` → \`${short(m.to)}\`。` +
          '以下の履歴 fence は再計算されている。boot 時に渡されたものは、単に古いのではなく',
        '**置き換えられている**。',
        '',
      )
    }
    lines.push(renderWorkingDeltaFence(r.working ?? null).trimEnd(), '')
    for (const b of m?.blocks ?? []) lines.push(b.trimEnd(), '')
  }

  lines.push(
    `**open-todo: ${openTodo}** —— \`# PROCESS\` に \`[todo]\` を 1 つ以上持つ aim node の数`,
    '（`state: dead` は除く）。**この数は surface せよ。triage も ranking も、どれをやるべきか',
    'の提案もするな —— 拾うものを選ぶのは operator の act である。**',
    '',
  )

  // ⚠ **セッション途中こそ、この事実が生まれる場所である** —— 最後の `[todo]` を `[done]` に
  // するのはまさに走っているセッションであり、そのとき番は operator へ渡る。boot 時にしか
  // 出さなければ、**渡した当のセッションがそれを知らないまま進む。**
  lines.push(renderAwaitingFence(awaiting).trimEnd(), '')
  if (awaiting.length > 0) {
    lines.push(
      '⚠ **上の node は producer が尽くしている ∴ 残っているのは operator の観測と `state:` の',
      '宣言だけである。** 「終わった aim」の一覧ではない —— **満足したかを述べられるのは',
      'operator だけであり、この一覧はそれを先取りしない。**',
      '',
    )
  }

  if (unknown.length > 0) {
    lines.push(
      `⚠ **${unknown.length} 個の node が、読める mark を 1 つも持たない \`# PROCESS\` 見出しを抱えている**: ` +
        unknown.join(', '),
      'これを 0 と読むことは、捏造された `[done]` である。',
      '',
    )
  }
  if (anomalies.length > 0) {
    lines.push('⚠ **記法の anomaly** —— この parser が数えない mark:', '')
    for (const a of anomalies) {
      lines.push(`- \`${a.repo}/${a.slug}\` ${a.no} 行目 (${a.kind}): ${a.line.trim()}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function short(sha) {
  return typeof sha === 'string' && sha.length > 8 ? sha.slice(0, 8) : (sha ?? 'none')
}
