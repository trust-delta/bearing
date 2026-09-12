// body を節へ割る契約の test —— そして **2 つの実装が食い違わないことの門。**
//
// ⚠ **契約は `surface/aim.html` の中に住み、ここはそれを取り出して走らせる**（`aim-format` /
// `aim-tree-shape` と同じ理由 —— `file://` から相対 module を import する道が塞がっており、
// 別 file に出せば生成と、生成物が正本と一致しているかを見る門が要る）。
//
// 🔴 **前の 2 つと違い、この法は既に node 側に住んでいる。** `lib/process.mjs` が同じ節と同じ
// mark を parse し、**人間が既に見ている数**（`open-todo` / `escalation` / `observation`）を出して
// いる ∴ **面の block は 2 つ目の実装である。** ⚠ **`surface-parity` が `[done]` で述べた形が
// ここに在る**: 「同じ事実を運ぶ 2 つの面が、同じ述語で黙るようにした」—— **黙り方が違えば、
// 同じ corpus について面と statusline が別の数を述べる。**
//
// ∴ **この file の主眼は edge case ではなく一致である**: **実 corpus 全枚に対して両者の出力を
// `deepEqual` で突き合わせる。** ⚠ **これは「同じ code である」ことの保証ではない** ——
// **両方が同じように取り落とす body の形は、corpus に現れるまで検出されない。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { parseEscalation, parseObservation, parseProcessMarks } from '../../../carriers/claude/bearing/lib/process.mjs'
import { parseAimRecord } from '../../../carriers/claude/bearing/lib/corpus.mjs'

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing')
const SURFACE = path.join(ROOT, 'surface', 'aim.html')
const REPO_AIMS = path.join(ROOT, '..', '..', '..', 'docs', 'aims')

async function loadContract() {
  const html = await readFile(SURFACE, 'utf8')
  const re = /<script type="module" data-contract="aim-body">\n([\s\S]*?)\n<\/script>/g
  const blocks = [...html.matchAll(re)]
  assert.equal(blocks.length, 1, `body の契約 block が ${blocks.length} 個 —— ちょうど 1 つでなければならない`)
  await import('data:text/javascript;base64,' + Buffer.from(blocks[0][1], 'utf8').toString('base64'))
  assert.ok(globalThis.AimBody, '契約 block が `globalThis.AimBody` を立てていない')
  return globalThis.AimBody
}

const { parseBody, bodyOf, bodyOffset } = await loadContract()

/** 面の出力を、あちらの 3 関数が返す形へ畳む。⚠ **比べられる形に揃えるだけで、値は触らない。** */
const foldSurface = (body) => {
  const r = parseBody(body)
  return {
    escalation: { blocked: r.escalation.present, empty: r.escalation.empty },
    observation: { present: r.observation.present, empty: r.observation.empty, items: r.observation.items },
    marks: { done: r.marks.done, todo: r.marks.todo, unknown: r.marks.unknown, anomalies: r.marks.anomalies },
  }
}

const foldNode = (body) => {
  const m = parseProcessMarks(body)
  return {
    escalation: parseEscalation(body),
    observation: parseObservation(body),
    marks: { done: m.done, todo: m.todo, unknown: m.unknown, anomalies: m.anomalies },
  }
}

// ══ 食い違いの門 —— 実 corpus 全枚 ═══════════════════════════════════════════

test('実 corpus 全枚で、面の契約と `lib/process.mjs` が同じ答えを返す', async () => {
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  // 陽性対照: corpus を 1 枚も読めていなければ、この門は何も見ていない。
  assert.ok(files.length >= 5, `corpus が ${files.length} 枚 —— 読めていない`)
  let withEscalation = 0
  let withObservationItems = 0
  let withTodo = 0
  let withDone = 0
  for (const f of files) {
    const body = parseAimRecord(await readFile(path.join(REPO_AIMS, f), 'utf8')).body
    assert.deepEqual(foldSurface(body), foldNode(body), `${f} で 2 つの実装が食い違った`)
    const r = parseBody(body)
    if (r.escalation.present) withEscalation++
    if (r.observation.items > 0) withObservationItems++
    if (r.marks.todo > 0) withTodo++
    if (r.marks.done > 0) withDone++
  }
  // 🔴 **陽性対照は「一致した」では足りない。** 全枚が空なら、2 つの空実装も一致する ∴
  // **corpus が各枝を実際に踏んでいることを確かめる。**
  assert.ok(withEscalation > 0, '`# ESCALATION` に中身を持つ node が 0 件 —— 枝を踏んでいない')
  assert.ok(withObservationItems > 0, '観測票を持つ node が 0 件 —— 枝を踏んでいない')
  assert.ok(withTodo > 0, '`[todo]` を持つ node が 0 件 —— 枝を踏んでいない')
  assert.ok(withDone > 0, '`[done]` を持つ node が 0 件 —— 枝を踏んでいない')
})

test('実 corpus 全枚で、面の `bodyOf` と `parseAimRecord` が同じ body を切る', async () => {
  // 🔴 **これは別の軸である。** 節も mark も同じ規則で数えていても、**切り出した body が
  // 違えば数はずれる** —— そして 2 つの実装は同じ答えを返し続けるので、
  // 上の門は緑のまま通る。
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  assert.ok(files.length >= 5, `corpus が ${files.length} 枚 —— 読めていない`)
  for (const f of files) {
    const text = await readFile(path.join(REPO_AIMS, f), 'utf8')
    assert.equal(bodyOf(text), parseAimRecord(text).body, `${f} で body の切り方が食い違った`)
  }
  // 陽性対照: frontmatter を落としていることを、実際に確かめる。
  const one = await readFile(path.join(REPO_AIMS, files[0]), 'utf8')
  assert.ok(one.startsWith('---'), 'corpus に frontmatter が無い —— 測っていない')
  assert.doesNotMatch(bodyOf(one).split('\n')[0] ?? '', /^---$/, 'frontmatter が body に残っている')
})

test('frontmatter が無い text は、丸ごと body である', () => {
  assert.equal(bodyOf('# PROCESS\n- [todo] x\n'), '# PROCESS\n- [todo] x\n')
})

test('実 corpus 全枚で、body の n 行目は file の offset+n 行目である', async () => {
  // 🔴 **面は `slug.md:NN` という引用の形を描く** ∴ **NN が body 相対のままなら、開く先が
  // frontmatter の行数だけずれる。** ⚠ **ずれた参照は、開けない参照より悪い** —— **開いて
  // しまい、そこには別の行が在る。**
  //
  // 🔴 **2026-09-13 に実際に踏んだ**: 人間が面から `dev-platform.md:49` を引用し、その file の
  // 49 行目は `# PROCESS` だった（**実際の行は 54、offset は 5**）。⚠ **検出は人間の使い方に
  // よるものであり、当方の門は 1 つもこれを見ていなかった** —— 面の数が `gatherBacklog` と
  // 一致することは測っていたが、**行番号が何に対する番号かは誰も測っていなかった。**
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  assert.ok(files.length >= 5, `corpus が ${files.length} 枚 —— 読めていない`)
  let checked = 0
  for (const f of files) {
    const text = await readFile(path.join(REPO_AIMS, f), 'utf8')
    const off = bodyOffset(text)
    assert.ok(off > 0, `${f} の offset が 0 —— frontmatter を数えていない`)
    const fileLines = text.split(/\r?\n/)
    const bodyLines = bodyOf(text).split(/\r?\n/)
    // ⚠ **全行を突き合わせる。** 先頭だけ見れば、途中でずれる実装が通る。
    for (let n = 1; n <= bodyLines.length; n++) {
      assert.equal(fileLines[off + n - 1], bodyLines[n - 1], `${f}: body ${n} 行目が file ${off + n} 行目と違う`)
      checked++
    }
  }
  assert.ok(checked > 500, `${checked} 行しか突き合わせていない —— 測っていない`)
})

test('frontmatter が無ければ offset は 0', () => {
  assert.equal(bodyOffset('# PROCESS\n- [todo] x\n'), 0)
})

// ══ corpus が踏んでいない形は、合成で踏む ════════════════════════════════════
//
// ⚠ **上の門は今の corpus の上でしか効かない。** anomaly は corpus に 0 件で在りうる ∴
// **逸脱の側は合成例で固定する** —— 「今日 0 件だから明日も 0 件」は測っていない。

const CASES = {
  'fence の中の見出しと mark は引用である': [
    '# PROCESS',
    '- [done] 実在する mark',
    '',
    '```markdown',
    '# ESCALATION',
    '- [todo] これは例示であって主張ではない',
    '```',
    '',
  ].join('\n'),
  '`*` bullet は bullet の anomaly': '# PROCESS\n* [todo] 掬い上げる\n',
  '字下げした mark は indented の anomaly': '# PROCESS\n  - [todo] 字下げ\n',
  '大文字は case の anomaly': '# PROCESS\n- [TODO] 大文字\n',
  '知らない語は unknown-mark': '# PROCESS\n- [wip] 知らない語\n',
  '節の外の mark は outside-process': '# IS\n- [todo] 節の外\n\n# PROCESS\n- [done] 中\n',
  '`# PROCESS` が在って読める mark が無ければ unknown': '# PROCESS\n散文だけ\n',
  '見出しだけの `# ESCALATION`': '# ESCALATION\n\n# PROCESS\n- [done] x\n',
  '散文だけの `# OBSERVATION` は中身在り・票 0': '# OBSERVATION\n人間が見るべきこと\n',
  '節の中の `##` は nested-heading': '# PROCESS\n## 深い見出し\n- [done] x\n',
  'CRLF': '# PROCESS\r\n- [todo] CRLF\r\n',
  'inline code の中の mark は数えない': '# PROCESS\n- 書き方は `- [todo] …` である\n',
  '空の body': '',
}

for (const [name, body] of Object.entries(CASES)) {
  test(`一致: ${name}`, () => {
    assert.deepEqual(foldSurface(body), foldNode(body))
  })
}

// ══ 面だけが持つもの —— 見せるための形 ═══════════════════════════════════════

test('項目の本文は、次の mark までの行すべてである —— fence の中も含む', () => {
  const body = [
    '# PROCESS',
    '- [todo] 1 つ目',
    '',
    '  続きの段落。**なぜそれが todo かは、ここに書かれている。**',
    '',
    '  ```bash',
    '  node --test',
    '  ```',
    '',
    '- [done] 2 つ目',
    '  続き',
  ].join('\n')
  const r = parseBody(body)
  assert.equal(r.marks.items.length, 2)
  const first = r.marks.items[0].lines.join('\n')
  assert.match(first, /1 つ目/)
  assert.match(first, /続きの段落/)
  // 🔴 **fence の中を落とさない。** 数えないことと見せないことは別である ——
  // 落とせば `[todo]` の中の再測コマンドが画面から消える。
  assert.match(first, /node --test/)
  assert.doesNotMatch(first, /2 つ目/, '次の mark を飲み込んではならない')
  assert.match(r.marks.items[1].lines.join('\n'), /2 つ目/)
})

test('節の生の行は、inline code を剥がさずに返る —— 見せる側は原文である', () => {
  const body = '# ESCALATION\n⑴ `lib/process.mjs` を見よ\n'
  const raw = parseBody(body).escalation.rows.map((r) => r.raw).join('\n')
  assert.match(raw, /`lib\/process\.mjs`/, '画面には原文を出す ∴ 剥がした行を返してはならない')
})

test('fence の行は rows に残るが、数には入らない', () => {
  const body = '# OBSERVATION\n```\n- これは fence の中\n```\n'
  const r = parseBody(body)
  assert.equal(r.observation.items, 0, 'fence の中の list item を票と数えてはならない')
  assert.equal(r.observation.present, false, 'fence だけの節は「中身在り」ではない')
  assert.ok(r.observation.rows.some((x) => x.fenced), 'fence の行は見せるために残す')
})

test('見出しが無い節は、空の節と別の顔を持つ', () => {
  const none = parseBody('# PROCESS\n- [done] x\n')
  assert.deepEqual(
    { heading: none.escalation.heading, present: none.escalation.present, empty: none.escalation.empty },
    { heading: false, present: false, empty: false },
    '無いことを「空」と述べてはならない',
  )
  const empty = parseBody('# ESCALATION\n\n# PROCESS\n- [done] x\n')
  assert.deepEqual(
    { heading: empty.escalation.heading, present: empty.escalation.present, empty: empty.escalation.empty },
    { heading: true, present: false, empty: true },
  )
})
