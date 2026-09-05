// 降りる宣言 —— **corpus を持つ project が、有効を降りられる。**
//
// ⚠ **これが無ければ `aim:` の「選択できる」は満たされない**（`docs/aims/adoption-declaration.md`）
// —— 述語は `corpus 在り || marker 在り` であり、corpus を持つ repo は block を外しても黙らな
// かった。⚠ **そして `--remove` は、その場合にも「黙るようになる」と*断言*していた。**
//
// ⚠ **ここで固定しているのは結論が 1 箇所に住むことでもある。** 2026-09-03、hook は marker を
// 見て黙るのに statusline は corpus の有無しか見ておらず、採っていない全 project に 2 行目を
// 描いていた —— **同じ結論を 2 つの形で書いていた**ことが原因である ∴ `isEngaged` を通る。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  DECLINED_MARKER, findDeclined, isEngaged, readDeclaration,
  planDecline, planRemove, planApply, findBlocks, renderBlock, bodySha, loadDesired,
} from '../lib/claude-md.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const BIN = path.join(ROOT, 'bin', 'bearing-setup-aim.mjs')

const fresh = async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-decline-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

/** ⚠ 委譲を塞ぐ —— 通れば走るのは working tree であって、この test が指した root ではない。 */
const run = (dir, ...args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, BEARING_DELEGATED: '1' },
  })

// ── 述語 ────────────────────────────────────────────────────────────────────

test('isEngaged —— 降りる宣言が最優先で、corpus すら覆す', () => {
  // ⚠ **これがこの node の全目的である** —— corpus が在ることは*使っている証拠*であって、
  // この機構を通したいという宣言ではない。
  assert.equal(isEngaged({ adopted: false, declined: true, hasCorpus: true }), false)
  assert.equal(isEngaged({ adopted: true, declined: true, hasCorpus: true }), false)
  // 降りていなければ、どちらか一方で足りる（移行の便宜は残す）。
  assert.equal(isEngaged({ adopted: true, declined: false, hasCorpus: false }), true)
  assert.equal(isEngaged({ adopted: false, declined: false, hasCorpus: true }), true)
  assert.equal(isEngaged({ adopted: false, declined: false, hasCorpus: false }), false)
})

test('降りる宣言は fenced block の中では引用であって主張ではない', () => {
  // ⚠ 他人の doc に載った例示を、降りる宣言として読んではならない —— 採用の marker と同じ法。
  assert.equal(findDeclined(`# doc\n\n${DECLINED_MARKER}\n`), true)
  assert.equal(findDeclined(`# doc\n\n\`\`\`md\n${DECLINED_MARKER}\n\`\`\`\n`), false)
})

test('降りる宣言は「読めない marker」ではない —— anomaly に落とさない', () => {
  // ⚠ 落とせば `readAdopted` が anomaly を採用と読み、**降りたことが採用に化ける。**
  const { blocks, anomalies } = findBlocks(`# doc\n\n${DECLINED_MARKER}\n`)
  assert.deepEqual(blocks, [])
  assert.deepEqual(anomalies, [])
})

test('readDeclaration は declined と adopted を同時に立てない', async (t) => {
  const dir = await fresh(t)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${DECLINED_MARKER}\n`, 'utf8')
  assert.deepEqual(await readDeclaration(dir), { adopted: false, declined: true })
  // CLAUDE.md が無い repo は、降りてもいないし採ってもいない。
  const empty = await fresh(t)
  assert.deepEqual(await readDeclaration(empty), { adopted: false, declined: false })
})

// ── 計画 ────────────────────────────────────────────────────────────────────

const desired = await loadDesired(ROOT)

test('planDecline は法の block を外してから宣言を置く —— 2 つは同時に立たない', () => {
  const withBlock = planApply('# 人間の doc\n', desired).text
  const plan = planDecline(withBlock)
  assert.equal(plan.action, 'decline')
  assert.equal(findDeclined(plan.text), true)
  assert.deepEqual(findBlocks(plan.text).blocks, [], '法の block が残っている')
  assert.ok(plan.text.startsWith('# 人間の doc\n'), '人間の本文が動いた')
})

test('planDecline は人間が編集した block を消さない —— 述べて止まる', () => {
  const block = renderBlock('9.9.9', 'この行は marker の sha と一致しない')
  const tampered = block.replace('この行は', 'この行を人間が直した。')
  assert.notEqual(bodySha(tampered.split('\n').slice(1, -1).join('\n')), bodySha('この行は marker の sha と一致しない'))
  const plan = planDecline(`# doc\n\n${tampered}\n`)
  assert.equal(plan.action, 'refuse')
  assert.match(plan.reason, /人間が手を入れている/)
})

test('2 度目の --decline は何も動かさない', () => {
  const once = planDecline('# doc\n').text
  assert.equal(planDecline(once).action, 'unchanged')
})

test('降りて外すと、原文へ byte 単位で戻る', () => {
  // ⚠ **置いて外すたびに他人の file の末尾が伸びる**形は、既に 1 度起きている。
  for (const original of ['# doc\n', '# doc', '# a\r\n\r\n# b\r\n', '']) {
    const back = planRemove(planDecline(original).text)
    assert.equal(back.action, 'remove')
    assert.equal(back.text, original, `往復で変わった: ${JSON.stringify(original)}`)
  }
})

test('末尾の余分な空行は、法の block と降りる宣言で同じだけ畳まれる', () => {
  // ⚠ **これは恒等ではない。** `appendAtEnd` は末尾の空行を落としてから足す ∴ 2 つ以上
  // 並んでいた空行は往復で 1 つに畳まれる —— **法の block が最初から持っていた挙動である**
  // （実測 2026-09-05: `'# doc\n\n'` は両経路とも `'# doc\n'` へ戻る）。
  //
  // ⚠ **ここで固定しているのは恒等ではなく、2 つの経路が食い違わないことである。** 別々に
  // 書けば、片方だけが他人の file の末尾を伸ばす（あるいは縮める）日が来る。
  for (const original of ['# doc\n\n', '# doc\n\n\n']) {
    const viaBlock = planRemove(planApply(original, desired).text).text
    const viaDecline = planRemove(planDecline(original).text).text
    assert.equal(viaDecline, viaBlock, `2 つの経路が食い違った: ${JSON.stringify(original)}`)
  }
})

test('--remove は降りる宣言も外す —— 片方だけ外せば降りたままになる', () => {
  const declined = planDecline('# doc\n').text
  const plan = planRemove(declined)
  assert.equal(plan.action, 'remove')
  assert.match(plan.reason, /降りる宣言を外した/)
  assert.equal(findDeclined(plan.text), false)
})

// ── CLI ─────────────────────────────────────────────────────────────────────

/** corpus を持つ消費者。⚠ **corpus が在ることが、この node の全問題である。** */
async function withCorpus(t) {
  const dir = await fresh(t)
  await mkdir(path.join(dir, 'docs', 'aims'), { recursive: true })
  await writeFile(
    path.join(dir, 'docs', 'aims', 'root.md'),
    '---\naim: 合成\nparent: null\nstate: open\n---\n\n# IS\n\n合成である。\n',
    'utf8',
  )
  return dir
}

test('--remove は、corpus を持つ repo に対して「黙る」と断言しない', async (t) => {
  const dir = await withCorpus(t)
  run(dir)
  const r = run(dir, '--remove')
  assert.equal(r.status, 0, r.stderr)
  // ⚠ **2026-09-05 まで、ここは黙ると*断言*していた。** corpus が在れば黙らない。
  assert.match(r.stdout, /だが hook も面も黙らない/)
  assert.match(r.stdout, /--decline/, '降りる手を名指していない')
})

test('--remove は、corpus を持たない repo に対しては黙ると述べてよい', async (t) => {
  const dir = await fresh(t)
  run(dir)
  const r = run(dir, '--remove')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /黙るようになる/)
  assert.doesNotMatch(r.stdout, /だが hook も面も黙らない/)
})

test('--decline は corpus を残したまま宣言を置く', async (t) => {
  const dir = await withCorpus(t)
  const r = run(dir, '--decline')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(findDeclined(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')), true)
  // ⚠ **降りることは、持っている corpus を捨てることではない。**
  assert.ok(await readFile(path.join(dir, 'docs', 'aims', 'root.md'), 'utf8'))
  assert.match(r.stdout, /baton の未読だけは述べ続ける/, '唯一の例外を述べていない')
})

test('--check は declined を、まだ採っていない absent と別の言葉で述べる', async (t) => {
  const dir = await withCorpus(t)
  const absent = run(dir, '--check')
  assert.match(absent.stdout, /状態: absent/)
  run(dir, '--decline')
  const declined = run(dir, '--check')
  assert.equal(declined.status, 0)
  assert.match(declined.stdout, /状態: declined/)
  // ⚠ **同じ言葉を受け取れば、降りると決めた repo とまだ採っていない repo が区別できない。**
  assert.doesNotMatch(declined.stdout, /状態: absent/)
})

test('採ることは降りる宣言を取り消す —— ただし黙ってではない', async (t) => {
  const dir = await withCorpus(t)
  run(dir, '--decline')
  const r = run(dir)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /降りる宣言が在ったので外した/)
  const md = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.equal(findDeclined(md), false)
  assert.equal(findBlocks(md).blocks.length, 1, '法の block が置かれていない')
})
