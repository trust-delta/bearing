// 採用の gate —— **aim の機構が口を開くのは、その repo が採用を宣言したときだけである。**
//
// ⚠ **2026-09-05 に反転した。** それまで述語は `adopted || hasCorpus` であり、**corpus が在る
// だけで機構は喋った** —— 「既に node を書いている project を、印が無いという理由で黙らせ
// ない」ための推測である。⚠ **だがその推測は、共同開発の repo で team が採っていない機構を
// 黙って喋らせる**（人間の決定 2026-09-05、`docs/aims/adoption-declaration.md`）。
//
// ⚠ **推測をやめたことで、推測を覆すための機構も同時に消えた** —— 専用の「降りる宣言」
// （`--decline`）・`--remove` の但し書き・3 つ目の状態。**この file はその跡地を守る:**
// 旧い宣言が残った repo で意味が反転しないこと、消えた flag が黙って逆の act をしないこと。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  findDeclined, isEngaged, readDeclaration, planRemove, findBlocks, renderBlock, loadDesired,
} from '../lib/claude-md.mjs'
import { renderBearing } from '../bin/statusline.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const BIN = path.join(ROOT, 'bin', 'bearing-setup-aim.mjs')
const LEGACY = '<!-- bearing:aim declined -->'
const { version: VERSION, law: LAW } = await loadDesired(ROOT)

const fresh = async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-gate-'))
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

const withCorpus = async (dir, n = 2) => {
  await mkdir(path.join(dir, 'docs', 'aims'), { recursive: true })
  for (let i = 0; i < n; i++) {
    await writeFile(path.join(dir, 'docs', 'aims', `n${i}.md`), '---\naim: x\nstate: open\n---\n')
  }
}

// ── 述語 ────────────────────────────────────────────────────────────────────

test('isEngaged は corpus を見ない —— 採用の宣言だけで決まる', () => {
  // ⚠ **この 1 件が反転の全体である。** `|| hasCorpus` を戻せば、ここが赤くなる。
  assert.equal(isEngaged({ adopted: false, hasCorpus: true }), false)
  assert.equal(isEngaged({ adopted: true, hasCorpus: false }), true)
  assert.equal(isEngaged({ adopted: false }), false)
  assert.equal(isEngaged({ adopted: true }), true)
})

test('readDeclaration が返すのは 1 つの事実だけである', async (t) => {
  const dir = await fresh(t)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${renderBlock(VERSION, LAW)}\n`, 'utf8')
  assert.deepEqual(await readDeclaration(dir), { adopted: true })
  // CLAUDE.md が無い repo は採っていない。
  const empty = await fresh(t)
  assert.deepEqual(await readDeclaration(empty), { adopted: false })
})

// ── 旧い「降りる宣言」が残った repo ─────────────────────────────────────────

test('旧い降りる宣言は「読めない marker」ではない —— anomaly に落とさない', () => {
  // ⚠ **落とせば意味がちょうど反転する。** anomaly は採用の事実として数えられる ∴
  // **降りたはずの repo が有効になる。**
  const { blocks, anomalies } = findBlocks(`# doc\n\n${LEGACY}\n`)
  assert.deepEqual(blocks, [])
  assert.deepEqual(anomalies, [])
})

test('旧い降りる宣言だけを持つ file は、そのまま「採っていない」になる', async (t) => {
  // ⚠ **移行のための特別扱いを 1 行も要しない** —— 旧い宣言が求めた沈黙は、今や既定である。
  const dir = await fresh(t)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${LEGACY}\n`, 'utf8')
  assert.deepEqual(await readDeclaration(dir), { adopted: false })
  assert.equal(isEngaged(await readDeclaration(dir)), false)
})

test('fenced block の中の旧い宣言は引用であって主張ではない', () => {
  // ⚠ 他人の doc に載った例示を、宣言として読んではならない —— 採用の marker と同じ法。
  assert.equal(findDeclined(`# doc\n\n${LEGACY}\n`), true)
  assert.equal(findDeclined(`# doc\n\n\`\`\`md\n${LEGACY}\n\`\`\`\n`), false)
})

test('採ると旧い宣言は落ちる —— ただし黙ってではない', async (t) => {
  const dir = await fresh(t)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${LEGACY}\n`, 'utf8')
  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /旧い「降りる宣言」が在ったので外した/)
  const after = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  assert.equal(findDeclined(after), false)
  assert.equal((await readDeclaration(dir)).adopted, true)
})

test('--check は旧い宣言を述べる —— 効いていると信じさせない', async (t) => {
  const dir = await fresh(t)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${LEGACY}\n`, 'utf8')
  const r = run(dir, '--check')
  assert.match(r.stdout, /旧い「降りる宣言」が在る/)
  assert.match(r.stdout, /今は既定と同じ意味/)
})

test('planRemove は旧い宣言を掃除する —— 原文へ byte 単位で戻る', () => {
  const before = '# doc\n'
  const plan = planRemove(`${before}\n${LEGACY}\n`)
  assert.equal(plan.action, 'remove')
  assert.equal(plan.text, before)
})

// ── 撤去された flag ─────────────────────────────────────────────────────────

test('--decline は撤去され、素通りして採用しない', async (t) => {
  // ⚠ **これが最も危険な失敗である。** 素通りさせれば adopt の経路へ落ち、**降りるつもりで
  // 打った repo が採用される** —— 意味がちょうど反転する。⚠ **黙って何もしないのも駄目**:
  // 打った人間は降りたと信じる ∴ 述べて、書き換えず、非 0 で終わること。
  const dir = await fresh(t)
  await withCorpus(dir)
  const r = run(dir, '--decline')
  assert.equal(r.status, 1)
  assert.match(r.stdout, /--decline は撤去された/)
  assert.match(r.stdout, /何も書き換えていない/)
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8').catch(() => null), null)
})

// ── `--remove` は断言してよくなった ─────────────────────────────────────────

test('--remove は、corpus を持つ repo に対しても「黙る」と断言する', async (t) => {
  // ⚠ **2026-09-05 まで、ここで断言することは嘘だった** —— 述語が corpus を見ていたため、
  // block を外しても黙らなかったからである。**推測をやめたことで、断言が真になった。**
  const dir = await fresh(t)
  await withCorpus(dir, 3)
  await writeFile(path.join(dir, 'CLAUDE.md'), `# doc\n\n${renderBlock(VERSION, LAW)}\n`, 'utf8')
  const r = run(dir, '--remove')
  assert.equal(r.status, 0)
  assert.match(r.stdout, /この project で黙るようになる/)
  assert.doesNotMatch(r.stdout, /だが hook も面も黙らない/)
  // ⚠ corpus は残る —— 外すことは、持っている corpus を捨てることではない。
  assert.match(r.stdout, /aim node 3 枚はそのまま/)
  assert.equal(isEngaged(await readDeclaration(dir)), false)
})

// ── 黙る機構は自分の存在を告げられない ──────────────────────────────────────

test('corpus を見つけたが採用されていない、は 2 行目が 1 行だけ述べる', () => {
  // ⚠ **これが反転の唯一の代償を埋める面である**（`isEngaged` の説明）—— 採用するまで機構は
  // 完全に黙る ∴ **黙る機構は自分の存在を告げられない。**
  const line = renderBearing('unadopted', { batonUnread: false, aimCount: 11 }).join(' ')
  assert.match(line, /未採用/)
  assert.match(line, /11/)
})

test('corpus が無ければ 2 行目は完全に黙る —— 未採用とは述べない', () => {
  // ⚠ **`docs/aims/` を持たない repo に「aim 未採用」と述べれば、それは全 project に居座る**
  // 勧誘の行になる。述べてよいのは corpus を実際に見つけたときだけである。
  assert.deepEqual(renderBearing('not-engaged', { batonUnread: false }), [])
})

test('未採用でも baton の未読だけは述べる —— handoff は aim ではない', () => {
  const line = renderBearing('unadopted', { batonUnread: true, aimCount: 2 }).join(' ')
  assert.match(line, /baton 未読/)
  assert.match(renderBearing('not-engaged', { batonUnread: true }).join(' '), /baton 未読/)
})
