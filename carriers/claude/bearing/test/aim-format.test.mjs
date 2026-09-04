// aim の frontmatter を往復させる契約の test。
//
// ⚠ **契約は `surface/aim.html` の中に住み、ここはそれを取り出して走らせる。** 複製しない ——
// `file://` から相対 module を import する道が塞がっている以上（実測 2026-09-04、Chrome
// 140.0.7339.207、既定フラグ、headless / headed の両方で `import` も `<script src>` も `fetch`
// も TypeError）、契約を別 file に出せば生成が要り、生成すれば「正本と一致しているか」を見る
// 門が要る。**取り出す側にすれば、その門ごと不要になる。**
//
// ⚠ **この suite は「往復」を見る。置く側だけを見ない。** `bearing` の `with-aim` が持っていた
// 末尾改行の伸長は、**書いた結果だけを検める試験では捕まらなかった** —— 捕まえたのは
// 「書く → 読む → 原文と一致」の形だけである。∴ ここでも恒等（読んだ値をそのまま書き戻す）を
// 主要な門に置く。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const SURFACE = path.join(ROOT, 'surface', 'aim.html')
const REPO_AIMS = path.join(ROOT, '..', '..', '..', 'docs', 'aims')

/**
 * 面から契約 block を取り出す。
 * ⚠ **ちょうど 1 つでなければ落とす** —— 0 個なら契約が消えたか marker が変わったのであり、
 * 2 個なら契約が 2 箇所に住み始めている。**どちらも黙って通してはならない。**
 */
async function loadContract() {
  const html = await readFile(SURFACE, 'utf8')
  const re = /<script type="module" data-contract="aim-frontmatter">\n([\s\S]*?)\n<\/script>/g
  const blocks = [...html.matchAll(re)]
  assert.equal(blocks.length, 1, `契約 block が ${blocks.length} 個 —— ちょうど 1 つでなければならない`)
  await import('data:text/javascript;base64,' + Buffer.from(blocks[0][1], 'utf8').toString('base64'))
  assert.ok(globalThis.AimFrontmatter, '契約 block が `globalThis.AimFrontmatter` を立てていない')
  return globalThis.AimFrontmatter
}

const { read, edit, readScalar, emitScalar, AimFormatError } = await loadContract()

/** 読んだ 3 欄をそのまま書き戻す —— 原文と 1 byte も違ってはならない。 */
function writeBackUnchanged(text) {
  const fm = read(text)
  const patch = {}
  for (const k of ['aim', 'parent', 'state']) if (k in fm) patch[k] = fm[k]
  return edit(text, patch)
}

const SAMPLE = ['---', 'aim: 人間は木を構造のまま見て動かせる', 'parent: bearing', 'state: open', '---', '', '# IS', '本文。', ''].join('\n')

// ── 読む ─────────────────────────────────────────────────────────────────────

test('frontmatter が無ければ null —— 「空だった」と同じ顔にしない', () => {
  assert.equal(read('# IS\n本文だけ。\n'), null)
  assert.equal(read('---\naim: x\n本文（閉じが無い）\n'), null)
})

test('3 欄を日本語のまま読む', () => {
  assert.deepEqual(read(SAMPLE), {
    aim: '人間は木を構造のまま見て動かせる',
    parent: 'bearing',
    state: 'open',
  })
})

test('`key: value` の形をしていない行は、畳まずに投げる', () => {
  // ⚠ **corpus に無い形を黙って読み飛ばせば、面は「その行を読んだ」ふりをする。**
  assert.throws(() => read('---\naim: x\n  - list 項目\n---\n'), AimFormatError)
  assert.throws(() => read('---\naim: x\naim: y\n---\n'), /2 度現れる/)
})

test('空行と `#` のコメント行は読み飛ばす —— それは壊れた形ではない', () => {
  assert.deepEqual(read('---\n# 注記\n\naim: x\n---\n'), { aim: 'x' })
})

// ── 往復の恒等 ───────────────────────────────────────────────────────────────

test('同じ値で書き戻すと 1 byte も動かない（LF）', () => {
  assert.equal(writeBackUnchanged(SAMPLE), SAMPLE)
})

test('CRLF の file が CRLF のまま返る', () => {
  // ⚠ **本機は `core.autocrlf=true` である**（`observation-provenance` が checkout 後の
  // CRLF を実測している）∴ これは仮想の形ではなく、実際に現れる形である。
  const crlf = SAMPLE.split('\n').join('\r\n')
  assert.equal(writeBackUnchanged(crlf), crlf)
})

test('末尾改行が無い file に、末尾改行が生えない', () => {
  // ⚠ **`with-aim` が踏んだのがこの形である** —— 置く側だけを見る試験は素通りさせた。
  const noEol = '---\naim: x\nstate: open\n---\n# IS\n末尾に改行が無い。'
  assert.equal(writeBackUnchanged(noEol), noEol)
  assert.ok(!writeBackUnchanged(noEol).endsWith('\n'))
})

test('末尾の空行が増えも減りもしない', () => {
  const padded = SAMPLE + '\n\n\n'
  assert.equal(writeBackUnchanged(padded), padded)
})

test('body に `---` が在っても、そこを frontmatter の閉じと取り違えない', () => {
  const withRule = '---\naim: x\nstate: open\n---\n\n# IS\n\n---\n\n段落。\n'
  assert.equal(writeBackUnchanged(withRule), withRule)
  assert.deepEqual(read(withRule), { aim: 'x', state: 'open' })
})

test('知らない frontmatter の行は 1 文字も動かない', () => {
  const extra = '---\naim: x\nparent: p\nstate: open\nlast-verified: abc123\n---\n本文\n'
  assert.equal(writeBackUnchanged(extra), extra)
  assert.ok(edit(extra, { state: 'done' }).includes('last-verified: abc123'))
})

test('`:` の後ろの空白の量が保たれる', () => {
  const spaced = '---\naim:   x\nstate:\topen\n---\n本文\n'
  assert.equal(writeBackUnchanged(spaced), spaced)
})

// ── 3 欄だけが動く ───────────────────────────────────────────────────────────

test('`state:` を変えると、その 1 行の値だけが変わる', () => {
  const after = edit(SAMPLE, { state: 'done' })
  assert.equal(after, SAMPLE.replace('state: open', 'state: done'))
})

test('`parent: null` は行ごと落ちる —— re-root の形である', () => {
  const after = edit(SAMPLE, { parent: null })
  assert.equal(after, SAMPLE.replace('parent: bearing\n', ''))
  assert.equal(read(after).parent, undefined)
})

test('既に `parent` が無い node に `null` を渡しても何も動かない（冪等）', () => {
  const rootNode = '---\naim: x\nstate: open\n---\n本文\n'
  assert.equal(edit(rootNode, { parent: null }), rootNode)
})

test('新しい `parent` は `aim:` の直後に入る', () => {
  const rootNode = '---\naim: x\nstate: open\n---\n本文\n'
  assert.equal(edit(rootNode, { parent: 'bearing' }), '---\naim: x\nparent: bearing\nstate: open\n---\n本文\n')
})

test('CRLF の file では、挿入した 1 行も CRLF で終わる', () => {
  // ⚠ **ここを LF で挿げば、その file だけ改行が混ざる** —— 次に誰かが読むまで黙っている。
  const rootNode = '---\r\naim: x\r\nstate: open\r\n---\r\n本文\r\n'
  const after = edit(rootNode, { parent: 'bearing' })
  assert.equal(after, '---\r\naim: x\r\nparent: bearing\r\nstate: open\r\n---\r\n本文\r\n')
  assert.ok(!/[^\r]\n/.test(after), 'LF が単独で混ざった')
})

test('body は 3 欄を変えても 1 byte も動かない', () => {
  const body = SAMPLE.slice(SAMPLE.indexOf('\n---\n') + 5)
  const after = edit(SAMPLE, { aim: '別の目的', parent: 'other', state: 'dead' })
  assert.equal(after.slice(after.indexOf('\n---\n') + 5), body)
})

// ── scalar の形 ──────────────────────────────────────────────────────────────

test('普通の日本語の値は裸のまま置かれる —— 無条件に quote しない', () => {
  // ⚠ **無条件に quote すれば、corpus に在る全 node の `aim:` が書き換わる** ∴
  // 「3 欄しか動かさない」が字面で嘘になる。
  assert.equal(emitScalar('人間は木を構造のまま見て動かせる'), '人間は木を構造のまま見て動かせる')
  assert.equal(emitScalar('open'), 'open')
})

test('YAML の指示子で始まる値・`: ` を含む値は quote される', () => {
  // ⚠ **`[` は実際に踏んだ地雷である**（`carrier-frontmatter.test.mjs`、2026-09-03。
  // frontmatter が丸ごと黙って落ちた）。
  assert.equal(emitScalar('[a] [b]'), "'[a] [b]'")
  assert.equal(emitScalar('前提: これが要る'), "'前提: これが要る'")
  assert.equal(emitScalar('# 見出し'), "'# 見出し'")
  assert.equal(emitScalar(' 前後に空白 '), "' 前後に空白 '")
  assert.equal(emitScalar(''), "''")
})

test('引用符を含む値が往復する', () => {
  for (const v of ["it's", "a 'quoted' word", '[x]: y', '"二重"']) {
    assert.equal(readScalar(emitScalar(v)), v, `往復しなかった: ${v}`)
  }
})

test('改行を含む値は投げる —— 単一行 scalar しか扱わないと決めてある', () => {
  assert.throws(() => edit(SAMPLE, { aim: '1 行目\n2 行目' }), AimFormatError)
})

test('`aim:` と `state:` は落とせない', () => {
  assert.throws(() => edit(SAMPLE, { aim: null }), /落とせない/)
  assert.throws(() => edit(SAMPLE, { state: null }), /落とせない/)
})

test('frontmatter を持たない file への書き込みは投げる', () => {
  assert.throws(() => edit('# IS\n本文だけ。\n', { state: 'done' }), AimFormatError)
})

// ── 実 corpus ────────────────────────────────────────────────────────────────

test('この repo の aim 全枚で、往復が恒等である', async () => {
  // ⚠ **合成例だけでは、実際に置かれている形を守れない。** ここが落ちたら、契約が
  // corpus の現実に追いついていない —— 直すのは契約の側である。
  const names = (await readdir(REPO_AIMS, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
  assert.ok(names.length >= 8, `aim が ${names.length} 枚しか見つからない —— 場所が違う`)

  for (const name of names) {
    const text = await readFile(path.join(REPO_AIMS, name), 'utf8')
    const fm = read(text)
    assert.ok(fm, `${name}: frontmatter が無い`)
    assert.ok(fm.aim, `${name}: \`aim:\` が無い`)
    assert.ok(fm.state, `${name}: \`state:\` が無い`)
    assert.equal(writeBackUnchanged(text), text, `${name}: 往復が恒等でない`)
  }
})
