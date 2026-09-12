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
    listeners: {},
    // ⚠ **握らなければ、押せない** —— コピーの口は押してみるまで何も主張しない。
    addEventListener(type, fn) {
      ;(n.listeners[type] ??= []).push(fn)
    },
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

// clipboard の stub。⚠ **node の `navigator` は getter である** ∴ 代入ではなく定義で差し替える。
const clip = { last: null, fail: null }
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    clipboard: {
      async writeText(t) {
        if (clip.fail) throw clip.fail
        clip.last = t
      },
    },
  },
})

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

/** 木の下から、この class を持つ node を集める。 */
function findAll(n, cls, out = []) {
  if (n.className?.split(' ').includes(cls)) out.push(n)
  for (const k of n.children) findAll(k, cls, out)
  return out
}
const press = async (n) => {
  for (const fn of n.listeners?.click ?? []) await fn()
}

/** 実 corpus を、面が受け取る形（`renderAll` が組む rows）へ。 */
async function corpusRows() {
  const files = (await readdir(REPO_AIMS)).filter((f) => f.endsWith('.md') && f !== 'README.md')
  const rows = []
  for (const f of files.sort()) {
    const text = await readFile(path.join(REPO_AIMS, f), 'utf8')
    const rec = parseAimRecord(text)
    rows.push({ slug: f.replace(/\.md$/, ''), text, readable: true, state: rec.state, aim: rec.aim })
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
  // 🔴 **`aim:` を運ぶ。** ⚠ **判断は目的に対して下される** —— slug と state だけでは
  // 「何に対する escalation か」が画面に無い（人間の観測 2026-09-13）。
  for (const slug of union) {
    const aim = parseAimRecord(await readFile(path.join(REPO_AIMS, `${slug}.md`), 'utf8')).aim
    assert.ok(aim, `${slug} に aim: が無い —— 測っていない`)
    assert.ok(body.includes(`aim: ${aim}`), `${slug} の aim: 文が面に出ていない`)
  }
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

test('aim: を持たない record は、空行ではなく壊れとして出す', () => {
  // ⚠ **空行で見せれば「目的の無い node」が「目的を書き忘れた node」と同じ顔になる。**
  S.renderAgent([
    { slug: 'x', text: '---\nstate: open\n---\n\n# PROCESS\n- [todo] y\n', readable: true, state: 'open', aim: null },
  ])
  assert.match(textOf($('agent-list')), /aim: が無い/)
})

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

// ── 引用として使える行番号か ────────────────────────────────────────────────

test('🔴 label の行番号は file 相対である —— ずれた参照は開けない参照より悪い', async () => {
  // 🔴 **2026-09-13 に踏んだ。** 人間が面から `dev-platform.md:49` を引用したが、その file の
  // 49 行目は `# PROCESS` だった（**実際は 54、offset は 5**）—— ⚠ **検出は人間の使い方による
  // ものであり、当方の門は 1 つもこれを見ていなかった。**
  //
  // ⚠ **行番号を字で固定しない**（corpus が動けば行は動く）—— **label が指す行に、その項目の
  // 1 行目が実在することを assert する。** これは編集に耐え、しかも正確である。
  const rows = await corpusRows()
  S.renderAgent(rows)
  const labels = [...textOf($('agent-list')).matchAll(/^(\S+)\.md:(\d+)$/gm)]
  assert.ok(labels.length > 0, 'label を 1 つも拾えていない —— 測っているのは対象ではなく正規表現である')
  for (const [, slug, no] of labels) {
    const lines = (await readFile(path.join(REPO_AIMS, `${slug}.md`), 'utf8')).split(/\r?\n/)
    assert.match(
      lines[Number(no) - 1] ?? '',
      /^- \[todo\]/,
      `${slug}.md:${no} が [todo] の行を指していない（実際: ${JSON.stringify((lines[Number(no) - 1] ?? '').slice(0, 40))}）`,
    )
  }
})

test('人間の面の label は、1 つ残らず中身が在る行を file 相対で指す', async () => {
  // 🔴 **「1 つでも在れば通る」形にしない。** ⚠ **変異試験で露見した**（2026-09-13）——
  // ESCALATION の label から行番号を落としても、OBSERVATION 側が残っていれば通っていた
  // ∴ **測っていたのは「どこかに在る」であって「すべてに在る」ではなかった。**
  //
  // ⚠ **label は class で拾う** —— 字面を走査すれば、**節の原文の中で `# ESCALATION` に
  // 言及している散文**（この corpus に実在する）を label と取り違える。
  const rows = await corpusRows()
  S.renderHuman(rows)
  const labels = findAll($('human-list'), 'seclabel')
  assert.ok(labels.length > 0, 'label を 1 つも拾えていない')
  const refs = []
  for (const l of labels) {
    const t = textOf(l).trim()
    const m = t.match(/^(\S+)\.md:(\d+) # (ESCALATION|OBSERVATION)/)
    assert.ok(m, `label が引用の形で始まっていない: ${JSON.stringify(t.slice(0, 60))}`)
    refs.push([m[1], m[2]])
    // 🔴 **節ごとに口が 1 つ在る** —— 無ければ、人間は手で選び直すことになる。
    assert.equal(findAll(l, 'copy').length, 1, `${t.slice(0, 40)} に コピーの口が無い`)
  }
  for (const [slug, no] of refs) {
    const lines = (await readFile(path.join(REPO_AIMS, `${slug}.md`), 'utf8')).split(/\r?\n/)
    const line = lines[Number(no) - 1] ?? ''
    // ⚠ **空行を指さない** —— 引用の頭は中身である。
    assert.notEqual(line.trim(), '', `${slug}.md:${no} が空行を指している`)
    assert.doesNotMatch(line, /^# /, `${slug}.md:${no} が見出しを指している —— 指すべきは最初の中身である`)
  }
})

test('エージェントの面も、項目ごとに口を持つ', async () => {
  // ⚠ **同じ理由で「どこかに在る」では測らない。**
  S.renderAgent(await corpusRows())
  const labels = findAll($('agent-list'), 'seclabel')
  assert.ok(labels.length > 0, 'label を 1 つも拾えていない')
  for (const l of labels) {
    assert.equal(findAll(l, 'copy').length, 1, `${textOf(l).trim().slice(0, 40)} に コピーの口が無い`)
  }
})

// ── コピーの口 ───────────────────────────────────────────────────────────────

test('節ごとの口は、label と原文をまとめて渡す', async () => {
  clip.fail = null
  clip.last = null
  S.renderHuman(await corpusRows())
  const cards = $('human-list').children
  const labels = findAll($('human-list'), 'seclabel')
  const buttons = findAll($('human-list'), 'copy')
  // 🔴 **数で固定する** —— card 丸ごとに 1 つ、節ごとに 1 つ。⚠ **変異試験で露見した**
  // （2026-09-13）: `buttons.length > 1` は、節の口が全部消えても card の口で通っていた。
  assert.equal(
    buttons.length,
    cards.length + labels.length,
    `口が ${buttons.length} 個 —— card ${cards.length} ＋ 節 ${labels.length} でなければならない`,
  )
  // 節の口（最後の label の中の 1 つ）を押す。
  await press(findAll(labels[labels.length - 1], 'copy')[0])
  assert.ok(clip.last, '何も渡されていない')
  assert.match(clip.last, /\.md:\d+/, '引用に使える形（slug.md:行）が入っていない')
  assert.ok(clip.last.split('\n').length > 1, 'label だけで原文が入っていない')
  assert.match(buttons[buttons.length - 1].textContent, /コピーした/, '押した結果が画面に出ていない')
})

test('card 丸ごとの口は、slug と aim: と全節を渡す', async () => {
  clip.fail = null
  S.renderAgent([
    {
      slug: 'x',
      text: '---\naim: 目的の 1 文\nstate: open\n---\n\n# PROCESS\n- [todo] やること\n',
      readable: true,
      state: 'open',
      aim: '目的の 1 文',
    },
  ])
  const buttons = findAll($('agent-list'), 'copy')
  await press(buttons[0])
  assert.match(clip.last, /^x\.md/, '先頭が slug でない')
  assert.match(clip.last, /aim: 目的の 1 文/, 'aim: が入っていない —— 判断は目的に対して下される')
  assert.match(clip.last, /やること/, '節の中身が入っていない')
})

test('🔴 コピーが拒まれたら、黙らずに述べる', async () => {
  // ⚠ **`file://` が secure context であることは実測されているが**（`# IS` の表、2026-09-03）
  // **書き込みの可否そのものは測っていない** ∴ **拒まれる経路を先に固定する。**
  clip.fail = Object.assign(new Error('denied'), { name: 'NotAllowedError' })
  S.renderAgent([
    { slug: 'x', text: '---\naim: a\n---\n\n# PROCESS\n- [todo] y\n', readable: true, state: 'open', aim: 'a' },
  ])
  const b = findAll($('agent-list'), 'copy')[0]
  await press(b)
  assert.match(b.textContent, /コピーできなかった/, '黙って何も起きない口になっている')
  assert.match(b.textContent, /NotAllowedError/, '理由を落としてはならない')
  clip.fail = null
})
