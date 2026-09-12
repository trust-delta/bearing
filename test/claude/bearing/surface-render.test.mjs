// 面の**描画そのもの**を走らせる門。
//
// 🔴 **`surface-shape.test.mjs` が答えるのは「parse できるか」と「id が在るか」の 2 つだけで
// ある** ∴ **描画の中で数を取り違えても、あの門は緑のまま通る。** ⚠ **この repo は一度それを
// 踏んでいる** —— 「picker だけを stub して描画の経路を実際に走らせたとき、最初の実装は
// frontmatter を持たない file を `（root）` と描いていた」（[[human-domain]] の `# PROCESS`）。
// **あのときの stub は commit されておらず、次の面が同じ穴を持って生まれた。**
//
// 🔴 **主眼は「面の数が statusline の数と一致すること」である。** 面は自分で数える（写せば数が
// 2 箇所に住む）∴ **独立に数えた 2 つが同じ答えを出すことを、実 corpus の上で assert する** ——
// `surface-parity` が `[done]` で述べた「同じ事実を運ぶ 2 つの面が、同じ述語で黙る」の、
// この面における形である。
//
// ⚠ **browser の代わりにはならない。** 固定できるのは*論理*であって*見え方*ではなく、
// ⚠ **stub は DOM ではない** —— ここが緑でも、開いて何も出ないことは在りうる。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { gatherBacklog } from '../../../carriers/claude/bearing/lib/process.mjs'
import { parseAimRecord } from '../../../carriers/claude/bearing/lib/corpus.mjs'

const ROOT = path.join(import.meta.dirname, '..', '..', '..', 'carriers', 'claude', 'bearing')
const REPO = path.join(ROOT, '..', '..', '..')
const SURFACE = path.join(ROOT, 'surface', 'aim.html')
const REPO_AIMS = path.join(REPO, 'docs', 'aims')

// ── DOM の stub ──────────────────────────────────────────────────────────────
//
// ⚠ **面が実際に触る分だけを持つ。** 足りなければ面が落ち、それはこの門が答えるべきこと
// である ∴ **黙って埋めない。**

function node(tagName = 'div') {
  const n = {
    tagName,
    children: [],
    attrs: {},
    dataset: {},
    className: '',
    textContent: '',
    type: '',
    hidden: false,
    disabled: false,
    append(...k) {
      n.children.push(...k)
      return n
    },
    replaceChildren(...k) {
      n.children = [...k]
      return n
    },
    setAttribute(k, v) {
      n.attrs[k] = String(v)
    },
    getAttribute(k) {
      return n.attrs[k] ?? null
    },
    addEventListener() {},
    querySelector() {
      return node('tbody')
    },
  }
  return n
}

const byId = new Map()
globalThis.document = {
  getElementById(id) {
    if (!byId.has(id)) byId.set(id, node())
    return byId.get(id)
  },
  createElement(tag) {
    return node(tag)
  },
}
// ⚠ **`showDirectoryPicker` を持たない window にする** —— そちらの経路（「空なのではなく、
// 開けないのです」）も同時に走る。**持たせれば、その分岐は一度も走らない。**
globalThis.window = {}

const html = await readFile(SURFACE, 'utf8')
const blocks = [...html.matchAll(/<script type="module"([^>]*)>\n([\s\S]*?)\n<\/script>/g)]
const run = async (src) => {
  await import('data:text/javascript;base64,' + Buffer.from(src, 'utf8').toString('base64'))
}
// 契約 3 枚 → UI。⚠ **順序が要る** —— UI は 3 つの `globalThis` を前提に組む。
for (const b of blocks.filter((m) => m[1].includes('data-contract'))) await run(b[2])
const ui = blocks.filter((m) => !m[1].includes('data-contract'))
assert.equal(ui.length, 1, `UI の block が ${ui.length} 個 —— ちょうど 1 つでなければならない`)
await run(ui[0][2])

const S = globalThis.AimSurface
assert.ok(S, '面が `globalThis.AimSurface` を立てていない —— 走らせる口が無い')

/** 木の下の text を全部集める。 */
function textOf(n) {
  return [String(n.textContent ?? ''), ...n.children.map(textOf)].join('\n')
}
const $ = (id) => document.getElementById(id)

/** 実 corpus を、面が受け取る形（`renderAll` が組む rows）へ。 */
async function corpusRows() {
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  const rows = []
  for (const f of files.sort()) {
    const text = await readFile(path.join(REPO_AIMS, f), 'utf8')
    const rec = parseAimRecord(text)
    rows.push({ slug: f.replace(/\.md$/, ''), text, readable: true, state: rec.state })
  }
  return rows
}

// ── 不在を黙って示さない（top-level の経路） ─────────────────────────────────

test('FSA を持たない window では、空ではなく「開けない」と述べる', () => {
  // 🔴 **これは正常系をいくら見ても観測されない経路である。**
  assert.equal($('pick').disabled, true, 'picker が押せるままになっている')
  assert.match($('note').textContent, /開けない/, '空と区別できない文面になっている')
})

// ── 面の数と statusline の数が一致するか ────────────────────────────────────

test('人間の面の数は、`gatherBacklog` の数と一致する', async () => {
  const rows = await corpusRows()
  const back = await gatherBacklog(REPO)
  S.renderHuman(rows)
  const count = $('human-count').textContent
  // 陽性対照: 0 件どうしの一致は一致ではない。
  assert.ok(back.escalationNodes.length > 0, 'corpus に escalation が 0 件 —— 測っていない')
  assert.ok(back.observationNodes.length > 0, 'corpus に observation が 0 件 —— 測っていない')
  assert.match(count, new RegExp(`ESCALATION に中身を持つ node: ${back.escalationNodes.length} 件`))
  assert.match(count, new RegExp(`OBSERVATION に中身を持つ node: ${back.observationNodes.length} 件`))
  // ⚠ **card は「どちらかを持つ node」の数** —— 2 つの和ではなく合併である。
  const union = new Set([...back.escalationNodes, ...back.observationNodes])
  assert.equal($('human-list').children.length, union.size, 'card の数が、番が渡っている node の数と違う')
  // 🔴 **中身が運ばれているか** —— 数だけ合っていても、読む材料が無ければ面ではない。
  const body = textOf($('human-list'))
  for (const slug of union) assert.match(body, new RegExp(slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(body, /# ESCALATION —— 人間の判断が要る点/)
  assert.match(body, /票 \d+ 枚/)
})

test('エージェントの面の数は、`gatherBacklog` の open-todo と一致する', async () => {
  const rows = await corpusRows()
  const back = await gatherBacklog(REPO)
  S.renderAgent(rows)
  const count = $('agent-count').textContent
  assert.ok(back.openTodoNodes > 0, 'corpus に `[todo]` が 0 件 —— 測っていない')
  assert.match(count, new RegExp(`\\[todo\\] を持つ node: ${back.openTodoNodes} 件`))
  // 🔴 **項目の本文が運ばれているか。** `[todo]` の 1 行目だけでは、なぜそれが残務かが落ちる。
  const body = textOf($('agent-list'))
  assert.match(body, /\.md:\d+/, '項目の在り処（file:line）が出ていない')
  assert.ok(body.length > 200, `本文が短すぎる（${body.length} 字）—— 見出しだけになっている疑い`)
})

// ── 不在と壊れを、黙って示さない ────────────────────────────────────────────

test('0 件は「番が無い」と読ませない —— 宣言待ちを数えていないことを述べる', () => {
  S.renderHuman([{ slug: 'x', text: '---\naim: a\nstate: open\n---\n\n# IS\n何も無い\n', readable: true, state: 'open' }])
  assert.equal($('human-list').children.length, 0)
  assert.match($('human-count').textContent, /番が無いという意味ではない/)
})

test('`[todo]` 0 件は「尽くした」と読ませない', () => {
  S.renderAgent([{ slug: 'x', text: '---\naim: a\n---\n\n# IS\n散文\n', readable: true, state: 'open' }])
  assert.match($('agent-count').textContent, /尽くしたという意味ではない/)
})

test('見出しだけの節は「在る」と数えず、黙っても落とさない', () => {
  S.renderHuman([
    { slug: 'x', text: '---\naim: a\n---\n\n# ESCALATION\n\n# PROCESS\n- [done] x\n', readable: true, state: 'open' },
  ])
  assert.equal($('human-list').children.length, 0, '空の見出しを「番が渡っている」と数えてはならない')
  assert.match($('human-count').textContent, /見出しだけで中身が無い節: x（ESCALATION）/)
})

test('読めない file は空欄で並べず、何件落としたかを述べる', () => {
  S.renderHuman([{ slug: 'broken', text: 'frontmatter が無い', readable: false }])
  assert.equal($('human-list').children.length, 0)
  assert.match($('human-count').textContent, /読めない file 1 件はこの面に出していない: broken/)
  S.renderAgent([{ slug: 'broken', text: 'frontmatter が無い', readable: false }])
  assert.match($('agent-count').textContent, /読めない file 1 件はこの面に出していない: broken/)
})

test('mark に見えて数えられなかった行を、面からも落とさない', () => {
  // 🔴 **落とせば、この面と statusline が同じ corpus について別の数を述べる。**
  S.renderAgent([{ slug: 'x', text: '---\naim: a\n---\n\n# PROCESS\n* [todo] 掬い上げる\n', readable: true, state: 'open' }])
  assert.match($('agent-count').textContent, /数えられなかった行: 1 行/)
  assert.match(textOf($('agent-list')), /bullet\s+x\.md:\d+/)
  // ⚠ **`# PROCESS` が在って読める mark が無い node は `unknown`** —— 「やることが無い」ではない。
  assert.match($('agent-count').textContent, /読める mark が無い node: x/)
})

// ── tab は、切り替えたことを述べる ──────────────────────────────────────────

test('tab は 1 つだけを見せ、選ばれていることを属性で述べる', () => {
  S.showTab('human')
  assert.equal($('pane-human').hidden, false)
  assert.equal($('pane-tree').hidden, true)
  assert.equal($('pane-agent').hidden, true)
  assert.equal($('t-human').getAttribute('aria-selected'), 'true')
  assert.equal($('t-tree').getAttribute('aria-selected'), 'false')
  S.showTab('tree')
  assert.equal($('pane-tree').hidden, false)
  assert.equal($('t-tree').getAttribute('aria-selected'), 'true')
})

test('節の原文は、前後の空行だけ落として運ばれる —— inline code は剥がさない', () => {
  const rows = [
    { raw: '', fenced: false },
    { raw: '⑴ `lib/process.mjs` を見よ', fenced: false },
    { raw: '', fenced: false },
  ]
  assert.equal(S.secText(rows), '⑴ `lib/process.mjs` を見よ')
})
