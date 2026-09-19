// aim⊥code の fence —— **aim の主張と、それを実現した code のズレ。**
//
// 🔴 **join は履歴の中に在る**（人間の指摘 2026-09-10）—— **`[done]` mark を書き入れた commit は、
// その mark が指す code を一緒に持っている。** ⚠ **人間が sha を書く必要が無く、既存の mark に
// 遡って効く** ∴ **`last-verified:` を要求した `checkpoint-stale` の置き換えである。**
//
// ⚠ **ここで固定するのは 2 つ**: ⑴ **join が引けること** ⑵ 🔴 **承認が効くこと** ——
// **承認が無ければ 13 node 中 11〜12 件が候補になり、警報は壁になる**（実測 2026-09-10）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  AIM_CODE_FENCE_TAG,
  codeDigest,
  gatherAimCodeStale,
  prNumbers,
  renderAimCodeFence,
  renderAimCodeByPathFence,
  pivotByPath,
  AIM_CODE_BY_PATH_FENCE_TAG,
  verifiedDigests,
} from '../../../carriers/claude/bearing/lib/aim-code.mjs'
import { readAimGraph, parseAimRecord } from '../../../carriers/claude/bearing/lib/corpus.mjs'

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'aim-code-'))
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.invalid'])
  git(root, ['config', 'user.name', 'aim-code test'])
  await mkdir(path.join(root, 'docs', 'aims'), { recursive: true })
  await mkdir(path.join(root, 'src'), { recursive: true })
  return root
}

const writeNode = (root, slug, body) =>
  writeFile(
    path.join(root, 'docs', 'aims', slug + '.md'),
    ['---', 'aim: a purpose', 'state: open', '---', '', '# PROCESS', '', body, ''].join('\n'),
  )

const writeCode = (root, name, text) => writeFile(path.join(root, 'src', name), text + '\n')

const commit = (root, msg) => {
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', msg])
}

const gather = async (root) => {
  const g = await readAimGraph(root)
  return gatherAimCodeStale(root, g.nodes)
}

// ── 純粋関数 ────────────────────────────────────────────────────────────────

test('codeDigest は対の並び順に依らない —— 集合の digest である', () => {
  const a = codeDigest([['a.mjs', 'dead'], ['b.mjs', 'beef']])
  const b = codeDigest([['b.mjs', 'beef'], ['a.mjs', 'dead']])
  assert.equal(a, b)
})

test('codeDigest は path も blob も見る —— どちらか片方では足りない', () => {
  const base = codeDigest([['a.mjs', 'dead']])
  assert.notEqual(base, codeDigest([['a.mjs', 'beef']]), '中身が動いても同じ digest になった')
  assert.notEqual(base, codeDigest([['b.mjs', 'dead']]), 'path が違っても同じ digest になった')
  assert.notEqual(base, codeDigest([['a.mjs', 'dead'], ['b.mjs', 'beef']]), '集合が増えても同じ')
})

test('PR 番号は [done] 行からだけ拾う', () => {
  assert.deepEqual(prNumbers('- [done] x (#52) と #53\n- [todo] #99\n見出し #1'), ['52', '53'])
})

test('検証記録の宛先を読む', () => {
  assert.deepEqual(verifiedDigests('- 検証: @ abc123abc123 —— 理由\n- 依存: [[x]]'), [
    'abc123abc123',
  ])
})

// ── 本物の repository に対して ───────────────────────────────────────────────

test('mark と一緒に commit された code が、その後動けば候補になる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')

  // ⚠ 何も動いていない時点では候補にならない。
  assert.deepEqual(await gather(root), [], '動いていないのに候補になった')

  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved afterwards')

  const items = await gather(root)
  assert.equal(items.length, 1)
  assert.equal(items[0].slug, 'alpha')
  assert.deepEqual(items[0].moved, ['src/thing.mjs'])
  assert.equal(items[0].commitsSince, 1)
})

test('🔴 承認が効く —— digest を書いた node は候補から落ちる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')

  const before = await gather(root)
  assert.equal(before.length, 1, '前提が崩れている')

  await writeNode(
    root,
    'alpha',
    `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${before[0].digest} —— 読み直したが剥離していない`,
  )
  commit(root, 'record the verification')
  assert.deepEqual(await gather(root), [], '承認が効いていない')
})

test('🔴 code が次に動けば承認は自動で失効する', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  const d = (await gather(root))[0].digest
  const body = `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${d} —— 読み直したが剥離していない`
  await writeNode(root, 'alpha', body)
  commit(root, 'record the verification')

  // ⚠ 承認をそのまま残して code をもう一度動かす。
  await writeCode(root, 'thing.mjs', 'export const one = 3')
  commit(root, 'the code moved again')

  const items = await gather(root)
  assert.equal(items.length, 1, '古い承認が新しい変更を吸収した')
  assert.notEqual(items[0].digest, d, 'digest が動いていない')
})

test('履歴が書き換えられても承認は生き残る —— 宛先が blob だから', async (t) => {
  // 🔴 **これが「repo を問わず機能する」の実体である。** ⚠ squash を再現する。
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [done] thing を作った')
  commit(root, 'realise the means')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  const d = (await gather(root))[0].digest
  await writeNode(
    root,
    'alpha',
    `- [done] thing を作った\n\n# DAG\n\n- 検証: @ ${d} —— 読み直したが剥離していない`,
  )
  commit(root, 'record the verification')

  git(root, ['reset', '--soft', 'HEAD~2'])
  commit(root, 'squashed')
  assert.deepEqual(await gather(root), [], 'squash が承認を落とした')
})

test('mark を持たない node は疎に落ちる —— 剥離でも整合でもない第 3 状態', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  await writeNode(root, 'alpha', '- [todo] まだ何もしていない')
  commit(root, 'born')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')
  assert.deepEqual(await gather(root), [], 'mark の無い node を候補にした')
})

test('code を伴わない mark も疎に落ちる', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeNode(root, 'alpha', '- [done] doc だけ直した')
  commit(root, 'docs only')
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  commit(root, 'unrelated code appears')
  assert.deepEqual(await gather(root), [], 'code を持たない mark を候補にした')
})

test('mark が code より後で書かれた場合、PR 番号が join を補う', async (t) => {
  const root = await makeRepo()
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeNode(root, 'alpha', '- [todo] まだ')
  commit(root, 'born')
  await writeCode(root, 'thing.mjs', 'export const one = 1')
  commit(root, 'land the code (#7)')
  // ⚠ mark は code と別の commit で書かれる ∴ 同居では引けない。
  await writeNode(root, 'alpha', '- [done] thing を作った (#7)')
  commit(root, 'record the mark afterwards')
  await writeCode(root, 'thing.mjs', 'export const one = 2')
  commit(root, 'the code moved')

  const items = await gather(root)
  assert.equal(items.length, 1, 'PR 番号による join が効いていない')
  assert.deepEqual(items[0].moved, ['src/thing.mjs'])
})

// ── fence の形 ──────────────────────────────────────────────────────────────

test('fence は測れなかったことを「剥離が無い」へ畳まない', () => {
  const out = renderAimCodeFence(null)
  assert.match(out, /unavailable/)
  assert.doesNotMatch(out, /# none/)
})

test('fence は出す列に sha を置かない —— 写させる値は digest だけ', () => {
  const out = renderAimCodeFence([
    { slug: 'alpha', digest: 'abc123abc123', code: 9, moved: ['a', 'b', 'c', 'd', 'e', 'f'], commitsSince: 3 },
  ])
  assert.match(out, /# fields: slug \| code_digest \| moved_paths \| commits_since/)
  assert.match(out, /^alpha \| abc123abc123 \| a,b,c,d,\+2 \| 3$/m)
  assert.match(out, new RegExp('```' + AIM_CODE_FENCE_TAG.replace(/ /g, ' ')))
})

// ── path で転置した面 ────────────────────────────────────────────────────────
//
// 🔴 **消費者 1 例で、候補 17 node のうち 14 が 1 file だけで説明がついた**（`td-apps-site` からの
// 提起 2026-09-19）。候補は node ごとに挙がるが読む対象は diff ∴ 共有 file が動けば N 行は 1 つの
// diff で説明がつく。**転置はそれを字面に出す —— 判定はしない ∴ 候補の表は 1 行も減らない。**

test('転置は「その path が動いたことが何 node を候補にしているか」を、多い順に並べる', () => {
  // ⚠ 共有 file を path 順で*最後*に置く —— path 順と件数順が一致する例では、並びの変異が
  // 捕まらない（最初に書いた例がそうだった）。
  const rows = pivotByPath([
    { slug: 'beta', moved: ['aa/b.mjs', 'zz/shared.md'] },
    { slug: 'alpha', moved: ['zz/shared.md'] },
    { slug: 'gamma', moved: ['aa/g.mjs', 'zz/shared.md'] },
  ])
  assert.deepEqual(rows, [
    { path: 'zz/shared.md', slugs: ['alpha', 'beta', 'gamma'] },
    { path: 'aa/b.mjs', slugs: ['beta'] },
    { path: 'aa/g.mjs', slugs: ['gamma'] },
  ])
})

test('報告された形そのもの —— 候補 17 のうち 14 が 1 file なら、先頭行がそれを述べる', () => {
  // 🔴 消費者 1 例（td-apps-site、2026-09-19）の moved_paths を合成した。
  const items = []
  for (let i = 0; i < 14; i++) {
    items.push({ slug: `n${String(i).padStart(2, '0')}`, digest: 'd', code: 1, moved: ['CLAUDE.md'], commitsSince: 3 })
  }
  items.push({ slug: 'app-fleet', digest: 'd', code: 4, moved: ['CLAUDE.md', 'data/README.md', 'data/vocabulary.json', 'tests/app-facts.test.ts'], commitsSince: 3 })
  items.push({ slug: 'app-pipeline', digest: 'd', code: 2, moved: ['CLAUDE.md', 'docs/ideas/README.md'], commitsSince: 3 })
  items.push({ slug: 'shared-infra', digest: 'd', code: 1, moved: ['docs/ideas/README.md'], commitsSince: 1 })
  const out = renderAimCodeFence(items)
  assert.match(out, new RegExp('```' + AIM_CODE_BY_PATH_FENCE_TAG))
  const byPath = out.split('```' + AIM_CODE_BY_PATH_FENCE_TAG)[1]
  assert.match(byPath, /# fields: path \| nodes \| slugs/)
  assert.match(byPath, /^CLAUDE\.md \| 16 \| app-fleet,app-pipeline,n00,n01,\+12$/m, '先頭行が共有 file を述べていない')
  assert.match(byPath, /^docs\/ideas\/README\.md \| 2 \| app-pipeline,shared-infra$/m)
  // ⚠ 候補の表は 1 行も減らない —— 転置は判定ではない
  assert.equal((out.match(/^n\d\d \| d \| CLAUDE\.md \| 3$/gm) ?? []).length, 14)
})

test('転置は上限を超えた分を数で述べ、候補が無ければ出ない', () => {
  const items = [{ slug: 'a', digest: 'd', code: 8, moved: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'], commitsSince: 1 }]
  assert.match(renderAimCodeFence(items), /^# \+2 path$/m)
  assert.equal(renderAimCodeByPathFence(items).split('\n').filter((l) => /^p\d \| /.test(l)).length, 6)
  assert.doesNotMatch(renderAimCodeFence([]), new RegExp(AIM_CODE_BY_PATH_FENCE_TAG))
  assert.doesNotMatch(renderAimCodeFence(null), new RegExp(AIM_CODE_BY_PATH_FENCE_TAG))
})

// canon が挙げる「慣例ラベル」と、機械が読む予約語が交わらないことを固定する門。
//
// 🔴 **2026-09-15 まで `検証:` が両側に在った** —— canon は慣例ラベルに挙げ、この module は
// 承認記録として読んでいた。⚠ **機械は `@` の有無で分けており取り違えていない** ——
// 🔴 **危うかったのは読み手で、句読点で意味を見分けることになっていた**（`td-apps-site` からの
// 報告 2026-09-15、実際に 1 つの node で 2 つの意味が同居した）。
//
// ⚠ **字面ではなく振る舞いで測る** —— 語を言い当てずに済み、canon が慣例ラベルを 1 語増やした
// ときも、その語が機械に読まれるなら落ちる。
const CANON = path.join(
  import.meta.dirname,
  '../../../carriers/claude/bearing/templates/aim/aim-authoring.md',
)

const DAG_RECORD = (line) => '---\naim: x\n---\n\n# DAG\n\n- ' + line + '\n'

test('慣例ラベルと機械の予約語は交わらない —— 読み手が語だけで見分けられる', async () => {
  const canon = await readFile(CANON, 'utf8')
  const listed = /慣例ラベル\s*([^）]*)）/.exec(canon)
  assert.ok(listed, '慣例ラベルの列挙が canon に見つからない —— この門は何も測っていない')
  const labels = [...listed[1].matchAll(/`([^`\n]+?):`/g)].map((m) => m[1])
  assert.ok(labels.length >= 2, '慣例ラベルが ' + labels.length + ' 語 —— 列挙の形が変わった')

  // 陽性対照 —— 予約語そのものは、両方の機構に確かに読まれる。
  // ⚠ これが緑でなければ、下の空配列は「予約語でないこと」ではなく道具の沈黙を測っている。
  assert.deepEqual(verifiedDigests('- 検証: @ abc123abc123 —— 理由'), ['abc123abc123'])
  assert.deepEqual(parseAimRecord(DAG_RECORD('照合: [[y]] @ deadbeefdead')).collations, [
    { slug: 'y', sha: 'deadbeefdead' },
  ])

  for (const label of labels) {
    assert.deepEqual(
      verifiedDigests('- ' + label + ': @ abc123abc123 —— 理由'),
      [],
      '慣例ラベル ' + label + ': が aim-code-stale の承認として読まれる',
    )
    assert.deepEqual(
      parseAimRecord(DAG_RECORD(label + ': [[y]] @ deadbeefdead')).collations,
      [],
      '慣例ラベル ' + label + ': が drift-inter の照合として読まれる',
    )
  }
})

// canon が frontmatter の欄を宛先として名指すとき、それが機械の実際に読む欄であることの門。
//
// 🔴 **2026-09-10 に `last-verified:` が退役したが、`# OBSERVATION` の節だけが取り残された**
// —— 「観測したという証言は frontmatter（`state:` ／ `last-verified:`）に置かれ」。⚠ **同じ file の
// 22 行目が「frontmatter はこの 3 つだけ」と述べており、34 行目がそれに反していた。**
// **7 日後、消費者からの報告で露見した**（2026-09-17）—— ⚠ **こちらの機構は何も言わなかった。**
//
// 🔴 **害は「書けと言っている」ことである** —— **`# OBSERVATION` を書くときに読む節ゆえ、次の
// 誰かが「`last-verified:` に書けばよい」と読む経路が残っていた。** ⚠ **書いても機械は読まない
// ∴ 黙って落ちる**（`parseAimRecord` は 3 field しか見ない）。
//
// ⚠ **字面ではなく振る舞いで測る** —— 退役した語を並べて禁じるのではなく、**canon が名指す欄を
// parser に渡して、実際に読まれるかを見る。** ∴ **将来 field が増えても減っても、門は自分で追う。**
// ⚠ **射程は「`frontmatter（…）` の直接隣接」に限る**（実測 2026-09-17、対象: 本 canon）——
// 間に散文を挟む形まで拾うと、**退役を述べる*経緯*の括弧を「宛先」と読んで鳴る**（この門を
// 書いた当日に踏んだ）。🔴 **経緯を書けなくする門は、記録の作法と衝突する。**
// ⚠ **∴ この門は「`frontmatter（…）` 以外の形で欄を名指す文」を見ていない** —— 見張るのは、
// **退役した欄が取り残された実際の形**（`frontmatter（\`state:\` ／ \`last-verified:\`）に置かれ`）である。
const FIELD_IN_FRONTMATTER = /frontmatter（([^）\n]*)）/g

/**
 * その名の frontmatter 欄を、parser が実際に値として読むか。
 *
 * ⚠ **足場の field を並べてはならない** —— parser は `^<key>:` の**最初の一致**を返す ∴
 * 検査する field が足場と同名なら、読まれるのは足場の値であり、**読める欄が「読めない」と
 * 報告される**（この試験を書いた当日に踏んだ）。∴ **検査する 1 欄だけを置く。**
 */
function parserReads(field) {
  const rec = parseAimRecord(`---\n${field}: 値\n---\n本文\n`)
  return Object.values(rec).includes('値')
}

test('canon が frontmatter の欄を名指すなら、機械がその欄を実際に読む', async () => {
  const canon = await readFile(CANON, 'utf8')

  // 陽性対照 —— 道具が「読む」と「読まない」を区別できることを先に示す。
  // ⚠ これが緑でなければ、下の検査は対象ではなく道具の沈黙を測っている。
  assert.equal(parserReads('state'), true, 'parser が `state:` を読まない —— 道具が壊れている')
  assert.equal(parserReads('last-verified'), false, '退役した field が読まれている')

  const named = new Set()
  for (const m of canon.matchAll(FIELD_IN_FRONTMATTER)) {
    for (const f of m[1].matchAll(/`([A-Za-z][A-Za-z0-9-]*):`/g)) named.add(f[1])
  }
  for (const field of named) {
    assert.ok(
      parserReads(field),
      `canon は frontmatter の \`${field}:\` を宛先として名指すが、parser はその欄を読まない`,
    )
  }
})
