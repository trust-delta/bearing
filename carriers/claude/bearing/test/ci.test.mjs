// CI を CLI 側へ運ぶ —— 採るのは外、面は読むだけ。
//
// 🔴 **固定するのは「面が `gh` を起こさない」ことと、「古い緑を緑と描かない」ことである。**
// 前者は面が debounce で殺される事実から、後者は「いつのものか分からない成功」が
// [[ambient-display]] の拒む畳み方の時間軸版だから。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ciSegment, probeCi } from '../lib/ci.mjs'
import { widthUnsafeChars } from '../bin/statusline.mjs'

const at = (iso) => ({ branch: 'main', probedAt: iso, state: 'completed', conclusion: 'success', reason: null })
const NOW = new Date('2026-09-06T12:00:00Z')

test('通過 / 失敗 / 実行中 / 未実行 を畳まない', () => {
  const base = { branch: 'main', probedAt: NOW.toISOString(), reason: null }
  assert.deepEqual(ciSegment({ ...base, state: 'completed', conclusion: 'success' }, 'main', NOW),
    { text: 'CI 通過', tone: 'ok' })
  assert.equal(ciSegment({ ...base, state: 'completed', conclusion: 'failure' }, 'main', NOW).tone, 'bad')
  assert.equal(ciSegment({ ...base, state: 'in_progress', conclusion: null }, 'main', NOW).tone, 'wait')
  // ⚠ run が 0 本なのは「まだ走っていない」であって「緑」ではない。
  assert.equal(ciSegment({ ...base, state: 'none', conclusion: null }, 'main', NOW).text, 'CI 無し')
})

test('採れなかった理由が在れば、結論として描かない', () => {
  const c = { branch: 'main', probedAt: NOW.toISOString(), state: 'unknown', conclusion: null, reason: '`gh` が無い' }
  assert.equal(ciSegment(c, 'main', NOW).text, 'CI 不明')
})

test('古い緑は緑ではない —— 古さのほうを述べる', () => {
  const old = at(new Date(NOW.getTime() - 31 * 60 * 1000).toISOString())
  assert.deepEqual(ciSegment(old, 'main', NOW), { text: 'CI 古い', tone: 'unknown' })
  // 陽性対照: 新しければ結論を述べる。
  assert.equal(ciSegment(at(NOW.toISOString()), 'main', NOW).text, 'CI 通過')
  // 時刻が読めないものも「古い」側へ倒す —— 分からないものを緑にしない。
  assert.equal(ciSegment({ ...at('壊れた時刻') }, 'main', NOW).tone, 'unknown')
})

test('branch が違えば描かない —— 他の branch の緑を今の緑として見せない', () => {
  assert.equal(ciSegment(at(NOW.toISOString()), 'feature/x', NOW), null)
  assert.equal(ciSegment(null, 'main', NOW), null)
})

test('CI の語はすべて幅が確定した文字である', () => {
  const base = { branch: 'main', probedAt: NOW.toISOString(), reason: null }
  const texts = [
    ciSegment({ ...base, state: 'completed', conclusion: 'success' }, 'main', NOW),
    ciSegment({ ...base, state: 'completed', conclusion: 'failure' }, 'main', NOW),
    ciSegment({ ...base, state: 'queued' }, 'main', NOW),
    ciSegment({ ...base, state: 'none' }, 'main', NOW),
    ciSegment({ ...base, state: 'x', reason: 'y' }, 'main', NOW),
    ciSegment(at('壊れた時刻'), 'main', NOW),
    // ⚠ **未 push の注記も面に出る** —— 添え物だからといって幅の検査から外さない。
    ciSegment({ ...base, state: 'completed', conclusion: 'success', ahead: 2 }, 'main', NOW),
    ciSegment({ ...base, state: 'none', ahead: 12 }, 'main', NOW),
  ]
  for (const t of texts) assert.deepEqual(widthUnsafeChars(t.text), [], t.text)
})

test('`gh` の不在を「CI が無い」に畳まない —— 道具の不在は別の事実である', async () => {
  const enoent = Object.assign(new Error('x'), { code: 'ENOENT' })
  const r = await probeCi('/tmp', 'main', {
    run: () => Promise.reject(enoent),
    git: (args) => Promise.resolve(args.includes('rev-list') ? '0' : 'aaaa1111'),
  })
  assert.equal(r.state, 'unknown')
  assert.match(r.reason, /`gh` が無い/)
  // ⚠ **照合先は分かっている** —— 分かっている事実まで捨てない。
  assert.equal(r.commit, 'aaaa1111')
})

test('branch が読めなければ、そう述べて `gh` を呼ばない', async () => {
  let called = false
  const r = await probeCi('/tmp', null, { run: () => ((called = true), Promise.resolve({ stdout: '[]' })) })
  assert.equal(called, false)
  assert.match(r.reason, /branch を読めない/)
})

test('面は gh を起こさない —— statusline は lib/ci.mjs の read 側しか import しない', async () => {
  const src = await readFile(path.join(import.meta.dirname, '..', 'bin', 'statusline.mjs'), 'utf8')
  assert.match(src, /import \{ ciSegment, readCi \} from '\.\.\/lib\/ci\.mjs'/)
  // ⚠ **`probeCi` / `writeCi` が面へ入り込めば、debounce で殺される場所から `gh` が起きる。**
  assert.doesNotMatch(src, /\bprobeCi\b/)
  assert.doesNotMatch(src, /\bwriteCi\b/)
})

// ── 間近に走った run を「全て」見る ────────────────────────────────────────────
//
// 🔴 **固定するのは「1 本の緑を全体の緑として描かない」ことである。**
// ⚠ **これは仮定ではなく踏んだ形である**（実測 2026-09-07、対象: この機体の `gh`）——
// `44ff61ef` の `push-policy` が completed/success の時点で `ci` はまだ `in_progress`
// であり、旧い `--limit 1` は前者を返した。

/**
 * `gh` と `git` を差し込む。⚠ **`git` も要る** —— 🔴 **照合先は HEAD ではなく `@{u}` であり**、
 * それを解決するのは git だからである（人間の決定 2026-09-07）。
 *
 * @param rows `gh run list` が返す行
 * @param upstream `@{u}` が指す commit（既定は `RUN` の既定と同じ）
 * @param ahead `@{u}..HEAD` の本数
 */
const gh = (rows, upstream = 'aaaa1111', ahead = 0) => ({
  run: () => Promise.resolve({ stdout: JSON.stringify(rows) }),
  git: (args) => Promise.resolve(args.includes('rev-list') ? String(ahead) : upstream),
})
/** upstream が解決できない機体 —— push されていない branch。 */
const noUpstream = (rows = []) => ({
  run: () => Promise.resolve({ stdout: JSON.stringify(rows) }),
  git: () => Promise.resolve(null),
})
const RUN = (name, status, conclusion = null, headSha = 'aaaa1111', updatedAt = '2026-09-07T00:00:00Z') =>
  ({ workflowName: name, status, conclusion, headSha, updatedAt })

test('1 本でも実行中なら、実行中へ倒す —— 片方の緑を全体の緑にしない', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('push-policy', 'completed', 'success'),
    RUN('ci', 'in_progress'),
  ]))
  assert.equal(r.state, 'in_progress')
  assert.equal(r.conclusion, null)
  assert.equal(r.workflow, 'ci')
  assert.equal(ciSegment({ ...r, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 実行中')
  // 陽性対照: 同じ 2 本が両方 completed/success なら、通過を描く。
  const ok = await probeCi('/tmp', 'main', gh([
    RUN('push-policy', 'completed', 'success'),
    RUN('ci', 'completed', 'success'),
  ]))
  assert.equal(ciSegment({ ...ok, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 通過')
})

test('1 本でも通っていなければ失敗であり、その 1 本を名指す', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('push-policy', 'completed', 'success'),
    RUN('ci', 'completed', 'failure'),
  ]))
  assert.equal(r.conclusion, 'failure')
  assert.equal(r.workflow, 'ci')
  assert.equal(ciSegment({ ...r, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).tone, 'bad')
})

test('前の commit の run を混ぜない —— 混ぜれば畳んだ結論が嘘になる', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('ci', 'completed', 'failure', '新しい'),
    RUN('push-policy', 'completed', 'success', '新しい'),
    RUN('ci', 'completed', 'success', '古い'),
    RUN('push-policy', 'completed', 'success', '古い'),
  ], '新しい'))
  assert.equal(r.commit, '新しい')
  assert.equal(r.workflows.length, 2)
  assert.equal(r.conclusion, 'failure')
})

test('`skipped` は失敗ではない —— 条件で走らなかった job を赤くしない', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('ci', 'completed', 'success'),
    RUN('nightly', 'completed', 'skipped'),
  ]))
  assert.equal(r.conclusion, 'success')
  // ⚠ **全部通ったときは 1 本を名指さない** —— 代表を名乗らせれば、また 1 本の話に見える。
  assert.equal(r.workflow, null)
  // 内訳は残す —— 面は 1 語しか置けないが、会話で読む側は何本見たかを要る。
  assert.deepEqual(r.workflows.map((w) => w.name), ['ci', 'nightly'])
})

test('run が 0 本なのは「まだ走っていない」であって「緑」ではない', async () => {
  const r = await probeCi('/tmp', 'main', gh([]))
  assert.equal(r.state, 'none')
  assert.deepEqual(r.workflows, [])
})

// ── 照合先は HEAD ではなく `@{u}` である ─────────────────────────────────────
//
// 🔴 **固定するのは「前の commit の結論を持ち越さない」ことである。**
//
// ⚠ **これは仮定ではなく踏んだ形である**（実測 2026-09-07、対象: この機体の `gh`）——
// **merge 直後に 2 回とも踏んだ**（`9b7f576` / `66d378f`）: 今の commit の run がまだ登録されて
// いない窓で、**1 つ前の commit の 2 本を読んで「緑」と述べた。** ⚠ **緑とは限らない** ——
// **前が赤なら赤が持ち越される** ∴ 非対称ではなく **commit の取り違え**である。

test('push 済み commit の run がまだ無いなら、前の commit の緑を持ち越さない —— 踏んだ形', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('ci', 'completed', 'success', '前'),
    RUN('push-policy', 'completed', 'success', '前'),
  ], '今'))
  assert.equal(r.state, 'none')
  assert.equal(r.conclusion, null)
  assert.equal(r.commit, '今')
  assert.match(r.note, /まだ 1 本も無い/)
  assert.equal(ciSegment({ ...r, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 無し')

  // ✅ **陽性対照** —— 同じ行でも、照合先がその commit なら通過を描く。
  const ok = await probeCi('/tmp', 'main', gh([
    RUN('ci', 'completed', 'success', '前'),
    RUN('push-policy', 'completed', 'success', '前'),
  ], '前'))
  assert.equal(ciSegment({ ...ok, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 通過')
})

test('前の commit が赤でも持ち越さない —— 誤りは緑の側だけではない', async () => {
  const r = await probeCi('/tmp', 'main', gh([RUN('ci', 'completed', 'failure', '前')], '今'))
  assert.equal(r.state, 'none')
  assert.equal(r.conclusion, null)
})

test('upstream が無い branch は「まだ push されていない」——「採れなかった」ではない', async () => {
  const r = await probeCi('/tmp', 'main', noUpstream([RUN('ci', 'completed', 'success')]))
  assert.equal(r.state, 'none')
  assert.equal(r.reason, null)
  assert.match(r.note, /upstream が無い/)
  assert.equal(ciSegment({ ...r, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 無し')
})

test('手元が push 済みの先に居るなら、面がそう言う —— 緑は手元を検証していない', async () => {
  const r = await probeCi('/tmp', 'main', gh([
    RUN('ci', 'completed', 'success'),
    RUN('push-policy', 'completed', 'success'),
  ], 'aaaa1111', 2))
  assert.equal(r.ahead, 2)
  const seg = ciSegment({ ...r, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW)
  assert.equal(seg.text, 'CI 通過(未 push 2)')
  assert.equal(seg.tone, 'ok')
  // ⚠ **0 なら何も足さない** —— 常時出る注記は、出ていないことに意味が無くなる。
  const none = await probeCi('/tmp', 'main', gh([RUN('ci', 'completed', 'success')], 'aaaa1111', 0))
  assert.equal(ciSegment({ ...none, branch: 'main', probedAt: NOW.toISOString() }, 'main', NOW).text, 'CI 通過')
})

test('その commit を、commit で直接引く —— sha を切り詰めない', async () => {
  // 🔴 **`--commit` に短縮 sha を渡すと、在る run を黙って 0 件と返す**（実測 2026-09-07、
  // 対象: この機体の `gh` 2.85.0）∴ **渡す sha を短くする最適化を、二度と入れさせない。**
  let seen = null
  await probeCi('/tmp', 'main', {
    run: (_bin, args) => ((seen = args), Promise.resolve({ stdout: '[]' })),
    git: (a) => Promise.resolve(a.includes('rev-list') ? '0' : '0123456789abcdef0123456789abcdef01234567'),
  })
  assert.ok(seen.includes('--commit'), 'commit で引いていない')
  assert.ok(seen.includes('0123456789abcdef0123456789abcdef01234567'), 'sha が切り詰められている')
  // ⚠ **branch では引かない** —— それが「窓の外」と「まだ無い」を混ぜた原因である。
  assert.ok(!seen.includes('--branch'), 'branch で引いている')
})

test('この commit の run が上限に達したら、取りこぼしを排除できないと述べる', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => RUN(`w${i}`, 'completed', 'success'))
  const r = await probeCi('/tmp', 'main', gh(rows))
  assert.equal(r.state, 'unknown')
  assert.match(r.reason, /取りこぼしを排除できない/)
})
