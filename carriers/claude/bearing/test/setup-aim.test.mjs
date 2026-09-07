// setup-aim —— 置き、置いたところで責任が終わる。**そして block と skill は 1 組である。**
//
// ⚠ **ここで守っているのは「置いた後はその repo のもの」である**（人間の決定 2026-09-05）。
// 2 度目の `setup-aim` が既に在る `.claude/skills/aim/` に 1 byte も触らないこと、そして置くものが
// template と byte 同一であることを固定する。⚠ **先行の手段（canon を `_guide/` へ置き台帳で追随
// させる）はこの逆を採り、1 日で行き詰まった** —— `docs/aims/adoption-declaration.md` の `# HISTORY`。
//
// 🔴 **2026-09-07、人間が「古さは repo のもの」の射程を確定させた** —— **「block だけ更新する」は
// あの決定の実装ではない。更新するなら両方、しないならどちらも維持であり、どちらにするかは aim を
// 使う側が決める**（理由: 版の更新は**手元の aim node の書き換えを伴いうる**）。∴ 下半分は
// **「片方だけが動かない」ことを固定する。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { spawnSync } from 'node:child_process'

import { placeSkill, inspectSkill, TEMPLATE_FILES, SKILL_DIR, chooseDir } from '../bin/bearing-setup-aim.mjs'
import { parseStamp, stripStamp, withStamp, renderStamp, skillSha } from '../lib/placed-skill.mjs'
import { renderBlock } from '../lib/claude-md.mjs'

const ROOT = path.join(import.meta.dirname, '..')
const fresh = async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bearing-setup-aim-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

test('空の project へは template を byte 同一で置く', async (t) => {
  const dir = await fresh(t)
  const r = await placeSkill(ROOT, dir)
  assert.equal(r.action, 'placed')
  assert.deepEqual(r.missing, [])
  for (const f of TEMPLATE_FILES) {
    assert.equal(
      await readFile(path.join(dir, SKILL_DIR, f), 'utf8'),
      await readFile(path.join(ROOT, 'templates', 'aim', f), 'utf8'),
      `${f} が template と違う`,
    )
  }
})

test('frame.md は置かない —— 6 箇条は block と hook が運ぶ', async (t) => {
  assert.ok(!TEMPLATE_FILES.includes('frame.md'))
  const dir = await fresh(t)
  await placeSkill(ROOT, dir)
  assert.deepEqual((await readdir(path.join(dir, SKILL_DIR))).sort(), [...TEMPLATE_FILES].sort())
})

test('既に在れば 1 byte も触らない —— 置いた後はその repo のもの', async (t) => {
  const dir = await fresh(t)
  const dest = path.join(dir, SKILL_DIR)
  await mkdir(dest, { recursive: true })
  await writeFile(path.join(dest, 'SKILL.md'), 'この repo が直した版\n')
  const r = await placeSkill(ROOT, dir)
  assert.equal(r.action, 'kept')
  assert.equal(await readFile(path.join(dest, 'SKILL.md'), 'utf8'), 'この repo が直した版\n')
  // ⚠ 足りない枚を補うことも「触る」である —— 何を持つかは repo が決めている。
  assert.deepEqual(await readdir(dest), ['SKILL.md'])
})

test('置く SKILL.md は project skill として登録される形（name: aim）である', async () => {
  const s = await readFile(path.join(ROOT, 'templates', 'aim', 'SKILL.md'), 'utf8')
  assert.match(s, /^---\nname: aim\n/)
})

test('template の SKILL.md は corpus の在り処を決め打ちにせず、block の dir= を指す', async () => {
  // ⚠ `--dir` で在り処を変えた repo でも、置かれた skill が既定を正本と呼ばないため。
  const s = await readFile(path.join(ROOT, 'templates', 'aim', 'SKILL.md'), 'utf8')
  assert.ok(s.includes('dir='))
})

test('chooseDir は --dir → 既に置かれた宣言 → 既定 の順', () => {
  assert.deepEqual(chooseDir(['--dir', 'proj/aims'], ''), { dir: 'proj/aims', from: 'flag' })
  assert.equal(chooseDir([], '').from, 'default')
  assert.ok(chooseDir(['--dir', '../x'], '').error, '拒むべき path を通した')
})

// ── block と skill は 1 組である ─────────────────────────────────────────────
//
// 🔴 **固定するのは「片方だけが動かない」ことである。**
//
// ⚠ **これは仮定ではなく踏んだ形である**（実測 2026-09-07、対象: この checkout）—— 0.20.0 の
// 3 枚を置いた repo に打つと、**block は v0.21.0 へ置き直され、skill は 0 byte のまま、`--check`
// は exit 0 で `状態: current` と述べた。** 🔴 **そして 0.21.0 の実質は skill 側にしか無かった** ∴
// **あの「更新」は、その版が持っていたものを 1 文字も運んでいなかった。**
//
// ── そして刻印が、止める範囲を狭める ────────────────────────────────────────
//
// 🔴 **刻印が「この repo は触っていない」と述べるなら、置き直しても消えるものは無い** ∴ 止まる
// 必要が無い。⚠ **止まるのは区別できないときだけである。**

/** ⚠ 委譲を塞ぐ —— 通れば走るのは working tree であって、この test が指した root ではない。 */
const run = (dir, ...args) =>
  spawnSync(process.execPath, [path.join(ROOT, 'bin', 'bearing-setup-aim.mjs'), ...args], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, BEARING_DELEGATED: '1' },
  })

/** 正本と違う 3 枚を、**刻印を持たずに**置く（＝ 刻む前に採用した消費者）。 */
const withUnstampedSkill = async (dir) => {
  await mkdir(path.join(dir, SKILL_DIR), { recursive: true })
  for (const f of TEMPLATE_FILES) await writeFile(path.join(dir, SKILL_DIR, f), `# 古い版\n`)
}

/**
 * **古い版を、その版の刻印つきで**置く（＝ 旧い plugin が置いたまま、誰も触っていない消費者）。
 * ⚠ **刻印は、そのとき置かれた中身の指紋を運ぶ** —— ここでもそう組み立てる。
 */
const withStampedOldSkill = async (dir, version = '0.20.0') => {
  await mkdir(path.join(dir, SKILL_DIR), { recursive: true })
  const bodies = Object.fromEntries(TEMPLATE_FILES.map((f) => [f, `# ${version} の ${f}\n`]))
  // SKILL.md は frontmatter を持たねば刻めない —— 旧版もそうであった。
  bodies['SKILL.md'] = `---\nname: aim\ndescription: ${version} の版\n---\n\n# aim\n`
  const shas = Object.fromEntries(Object.entries(bodies).map(([f, t]) => [f, skillSha(t)]))
  for (const [f, t] of Object.entries(bodies)) {
    const out = f === 'SKILL.md' ? withStamp(t, renderStamp(version, shas)) : t
    await writeFile(path.join(dir, SKILL_DIR, f), out, 'utf8')
  }
}

test('inspectSkill —— 無ければ absent、置いた直後は same', async (t) => {
  const dir = await fresh(t)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'absent')
  await placeSkill(ROOT, dir, { version: '9.9.9' })
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
})

test('刻印は SKILL.md の frontmatter に置かれ、本文は正本のままである', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir, { version: '9.9.9' })
  const placed = await readFile(path.join(dir, SKILL_DIR, 'SKILL.md'), 'utf8')
  const stamp = parseStamp(placed)
  assert.equal(stamp.version, '9.9.9')
  // 🔴 **3 枚ぶんの指紋を運ぶ** —— 刻印は 1 箇所、対象は 3 枚である。
  assert.deepEqual(Object.keys(stamp.shas).sort(), [...TEMPLATE_FILES].sort())
  // ⚠ **刻印を除けば正本と byte 同一** —— 我々が書いた 1 行のせいで「一致しない」にならない。
  assert.equal(
    stripStamp(placed),
    await readFile(path.join(ROOT, 'templates', 'aim', 'SKILL.md'), 'utf8'),
  )
  // ⚠ **他の 2 枚には刻まない** —— あれらは Read で開かれる ∴ 何を足しても context に載る。
  for (const f of ['aim-authoring.md', 'aim-facts.md']) {
    assert.equal(
      await readFile(path.join(dir, SKILL_DIR, f), 'utf8'),
      await readFile(path.join(ROOT, 'templates', 'aim', f), 'utf8'),
    )
    assert.equal(parseStamp(await readFile(path.join(dir, SKILL_DIR, f), 'utf8')), null)
  }
})

test('刻印が中身を指していれば stale —— この repo は触っていない', async (t) => {
  const dir = await fresh(t)
  await withStampedOldSkill(dir)
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'stale')
  assert.equal(sk.stampVersion, '0.20.0')
  assert.deepEqual(sk.unknown, [])
  assert.deepEqual(sk.untouched.sort(), [...TEMPLATE_FILES].sort())
})

test('刻印が在っても、中身が食い違えば diverged —— その 1 枚を名指す', async (t) => {
  const dir = await fresh(t)
  await withStampedOldSkill(dir)
  await writeFile(path.join(dir, SKILL_DIR, 'aim-authoring.md'), '# この repo が直した版\n')
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'diverged')
  assert.deepEqual(sk.unknown, ['aim-authoring.md'])
  // ⚠ **触られていない枚は、触られていないと述べる** —— 畳まない。
  assert.ok(sk.untouched.includes('SKILL.md'))
})

test('刻印が無ければ diverged —— 刻む前に置かれた複製は区別できない', async (t) => {
  const dir = await fresh(t)
  await withUnstampedSkill(dir)
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'diverged')
  assert.equal(sk.stampVersion, null)
  assert.deepEqual(sk.unknown.sort(), [...TEMPLATE_FILES].sort())
})

test('欠けている 1 枚も違い —— 半分置かれた skill を「在る」に畳まない', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir, { version: '9.9.9' })
  await rm(path.join(dir, SKILL_DIR, 'aim-facts.md'))
  const sk = await inspectSkill(ROOT, dir)
  assert.equal(sk.state, 'diverged')
  assert.deepEqual(sk.unknown, ['aim-facts.md'])
})

test('CRLF の checkout を「違い」にしない —— git が変換しただけである', async (t) => {
  const dir = await fresh(t)
  await placeSkill(ROOT, dir, { version: '9.9.9' })
  for (const f of TEMPLATE_FILES) {
    const at = path.join(dir, SKILL_DIR, f)
    await writeFile(at, (await readFile(at, 'utf8')).replace(/\n/g, '\r\n'))
  }
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
})

// 🔴 **踏んだ形**（実装中、2026-09-07）—— **中身が正本と一致する repo は、刻印を持たないまま
// 永久に据え置かれた。** ⚠ **bearing 自身がその状態だった** ∴ **次に template が動いた日、触って
// いないのに `diverged` へ落ちるところだった。** **中身が同じなら書いても消えるものは無い。**
test('中身が一致していて刻印だけ無いなら、黙って刻む —— 中身は 1 byte も変えない', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  // 刻印を剥がす（＝ 刻む前に採用した repo が、たまたま今の版と同じ中身を持っている状態）
  const at = path.join(dir, SKILL_DIR, 'SKILL.md')
  const bare = stripStamp(await readFile(at, 'utf8'))
  await writeFile(at, bare)
  const before = await inspectSkill(ROOT, dir)
  assert.equal(before.state, 'same')
  assert.equal(before.stamped, false)

  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /刻印を書いた/)
  // ⚠ **corpus の見直しを求めない** —— 何も動いていない。⚠ **2026-09-07 まで、ここは
  // `/版が上がった/` を見ていた** —— その文言は同日 code から消え、**この assertion は
  // 在らない文字列の不在を測る空振りになっていた。** 見るのは出続ける側の 1 文である。
  assert.doesNotMatch(r.stdout, /手元の aim node/)
  const after = await inspectSkill(ROOT, dir)
  assert.equal(after.stamped, true)
  assert.equal(stripStamp(await readFile(at, 'utf8')), bare)
})

test('区別できない skill が在るなら、block も動かない —— 踏んだ形', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  const placedBlock = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  await withUnstampedSkill(dir)

  const r = run(dir)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /区別もできない/)
  assert.match(r.stdout, /CLAUDE\.md も触っていない/)
  // 🔴 **block は 1 byte も動いていない。**
  assert.equal(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), placedBlock)
  assert.equal(await readFile(path.join(dir, SKILL_DIR, 'SKILL.md'), 'utf8'), '# 古い版\n')
})

test('刻印が「触っていない」と述べるなら、--update なしで両方が揃う', async (t) => {
  const dir = await fresh(t)
  await withStampedOldSkill(dir)
  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /この repo は触っていない/)
  assert.match(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), /bearing:aim/)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
  assert.match(r.stdout, /手元の aim node/)
})

test('--update は、区別できない複製を捨てて両方を今の版へ揃える', async (t) => {
  const dir = await fresh(t)
  await withUnstampedSkill(dir)
  const r = run(dir, '--update')
  assert.equal(r.status, 0)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'same')
  assert.match(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'), /bearing:aim/)
  assert.match(r.stdout, /手元の aim node/)
})

// ⚠ **この 1 本は、直す前も緑だった**（変異試験 2026-09-07）—— 旧い code も refuse を skill の
// 前で return していた。∴ **これが固定するのは新しい挙動ではなく、組の判定を足しても壊れない
// ことである。** 拾ったのは運ではなく網であるが、**網に掛かったものは無かったと書く。**
test('block を人間が編集していたら、skill も置かれない', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  await rm(path.join(dir, SKILL_DIR), { recursive: true })
  const text = await readFile(path.join(dir, 'CLAUDE.md'), 'utf8')
  await writeFile(path.join(dir, 'CLAUDE.md'), `${text}\n人間が足した 1 行\n`.replace('# aim frame', '# aim frame（手を入れた）'))

  const r = run(dir)
  assert.equal(r.status, 1)
  assert.match(r.stdout, /も触っていない/)
  assert.equal((await inspectSkill(ROOT, dir)).state, 'absent')
})

test('--check は、block が current でも skill が違えば赤い —— 踏んだ形', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  // ✅ 陽性対照 —— 揃っていれば緑である
  const green = run(dir, '--check')
  assert.equal(green.status, 0)
  assert.match(green.stdout, /aim skill: 同梱の正本と一致する/)

  await withUnstampedSkill(dir)
  const red = run(dir, '--check')
  assert.equal(red.status, 1)
  assert.match(red.stdout, /状態: current/)
  assert.match(red.stdout, /区別もできない/)
})

test('--check は「古いだけ」を「区別できない」と別の言葉で述べる', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)   // 採ってから —— 未採用は赤くならない（下の 1 本が固定する）
  await withStampedOldSkill(dir)
  const r = run(dir, '--check')
  assert.equal(r.status, 1)
  assert.match(r.stdout, /aim skill: 古い/)
  assert.match(r.stdout, /この repo は触っていない/)
})

test('採っていない repo の --check は赤くない —— 未採用は異常ではない', async (t) => {
  const dir = await fresh(t)
  const r = run(dir, '--check')
  assert.equal(r.status, 0)
  assert.match(r.stdout, /状態: absent/)
})

// ── 版の数字と、置かれるものの中身 ───────────────────────────────────────────
//
// 🔴 **踏んだ形**（実測 2026-09-07、対象: この checkout）—— **0.21.0 で置いた repo へ 0.26.0 で
// 打つと、「中身は 1 byte も変えていない。」の 2 行下に「版が上がった ∴ 手元の aim node を
// 見よ」が出た。隣り合う 2 行が矛盾していた。** ⚠ **そして 0.22.0〜0.26.0 の 5 版で
// `templates/aim/` は 1 行も動いていない** ∴ **これは例外ではなく通常の版上げの姿であり、**
// **放てば警告そのものが読み飛ばされる側になる。**

test('版の数字だけが動いたなら、corpus の見直しを求めない', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  // 版の数字だけを古くする —— **本文も sha もそのまま** ＝ 「法は同一・版だけ古い」
  const at = path.join(dir, 'CLAUDE.md')
  await writeFile(at, (await readFile(at, 'utf8')).replace(/(<!-- bearing:aim )v[\d.]+/, '$1v0.0.1'))

  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /v0\.0\.1 から/)                 // 置き直しはする（版は事実として古い）
  assert.match(r.stdout, /動いたのは版の数字だけ/)
  // 🔴 **これが本体** —— 1 byte も動いていない版で人を働かせない。
  assert.doesNotMatch(r.stdout, /手元の aim node/)
})

// ✅ **陽性対照** —— **求めない側だけを固定すれば、警告を丸ごと消しても緑になる。**
test('法の本文が動いたなら、corpus の見直しを求める', async (t) => {
  const dir = await fresh(t)
  await writeFile(
    path.join(dir, 'CLAUDE.md'),
    `# doc\n\n${renderBlock('0.0.1', '# aim frame\n\n古い法\n')}\n`,
  )
  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /法の中身が動いた/)
  assert.match(r.stdout, /手元の aim node/)
  assert.doesNotMatch(r.stdout, /版の数字だけ/)
})

// ⚠ **skill の側も同じ軸で見る** —— 法が 1 字も動いていなくても、**skill が動けば読み直す
// ものは在る。**（既存の 2 本が `--update` 経路でこれを固定している ∴ ここは「法は同一のまま
// skill だけが動く」という、あちらが通らない組み合わせを見る。）
test('法が同一でも skill が動いていれば、corpus の見直しを求める', async (t) => {
  const dir = await fresh(t)
  assert.equal(run(dir).status, 0)
  await withStampedOldSkill(dir)      // 刻印つきの古い skill ＝「触っていない」と読める
  const r = run(dir)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /skill の中身が動いた/)
  assert.doesNotMatch(r.stdout, /版の数字だけ/)
})
