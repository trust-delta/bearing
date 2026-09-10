// `bearing-aim-code-stale v1` fence —— aim の主張と、それを実現した code のズレ。
//
// 導出元の前提:
//
//   aim⊥code drift  aim の主張は、それを実装した code が後から動くことで、aim 側は
//                   不変のまま静かに剥離しうる。corpus の中しか見ない fence には映らない
//   provenance      「ある手段が実現された」と記録される場所は `# PROCESS` の `[done]`
//                   mark だけである ∴ aim と code を結ぶ join もそこに在る
//   層の分割        安い機械検知が候補を可視化し、判断は人間が担う
//
// ⚠ **これは `bearing-checkpoint-stale` の置き換えである**（人間の決定 2026-09-10）。
// あちらは `last-verified:` —— **人間が sha を書く frontmatter の field** —— を要求し、
// 🔴 **一度も使われなかった**（保有数 0。実測 2026-09-06 および 2026-09-10）。⚠ **理由は
// 3 つあり、どれも設計の側に在った**: ⑴ **書けと述べる canon が 2026-09-06 まで無かった**
// ⑵ **fence は checkpoint を*持つ* node しか出さない ∴ 持たない node は機構から見えず、
// 人間は一度も促されない** ⑶ **測っていたのは repo 全体の commit 数**であり、実装自身が
// 「repo が動くことは、その aim の code が動くことではない」と述べていた。⚠ **加えて sha は
// host の merge 慣習が書き換える**（`purpose-drift` が照合について直したのと同型）。
//
// 🔴 **join は既に履歴の中に在った**（人間の指摘 2026-09-10）—— **`[done]` mark を書き入れた
// commit は、その mark が指す code を一緒に持っている。** ⚠ **squash はこれを壊すどころか
// 締める**（PR の全体が 1 commit になる）∴ **人間が 1 文字も書かなくても引け、既存の mark に
// 遡って効き、corpus の移行を要さない。**
//
// ⚠ **精度は PR 単位である**（人間の決定 2026-09-10）—— **squash は無関係な file も束ねる。**
// 🔴 **だがそれは欠点ではない**: **PR にはコメント ＝ 意図が載る。そして別の aim のために
// 動いたことも「動いて平気か確かめる価値がある」ことを示す** —— **この fence が述べるのは
// 「読み直す理由が在る」までであって、剥離したという判定ではない。**
//
// ⚠ **費用は corpus の大きさに比例させる。** 全履歴を 1 パスすれば **履歴の長さに比例して
// 黙って重くなる** ∴ **node ごとの範囲問い合わせ**（`<marksAt>..HEAD -- <code>`）を採る。
//
// ⚠ **mark が code より後の commit で書かれると、同居が無いので join が引けない** ∴
// **mark 行が `#<番号>` を含むなら、その番号を message に持つ commit の file も足す**
// （squash merge は `(#NN)` を message に書く）。🔴 **番号は補強であって基礎ではない。**

import { createHash } from 'node:crypto'

import { runGit } from './git.mjs'
import { DEFAULT_AIMS_DIR } from './corpus.mjs'
import { isAimPath, parseCommitLog } from './drift.mjs'

export const AIM_CODE_FENCE_TAG = 'bearing-aim-code-stale v1'

/**
 * 検証記録 —— 「読み直したが剥離していない」。⚠ **`# DAG` の慣例ラベル `検証:` を使う**
 * （`aim-authoring.md` が既にその名を挙げている）。
 *
 * 🔴 **警報に承認が無ければ、警報は壁になる。** ⚠ **`drift-inter` の法が既に述べている** ——
 * **「変更不要と結論したときは、それを書く。**（…）**記録しなければ、機構は既に見た者へ
 * 「見よ」と言い続ける。それは可視化ではなく、注意予算への課税である」** ∴ 同じ法をここへ当てる。
 * **実測 2026-09-10: 承認が無い状態では 13 node 中 11〜12 件が候補になった。**
 *
 * ⚠ **宛先は code の内容である**（人間の決定 2026-09-10）—— **sha は host の merge 慣習が
 * 書き換える。** **blob は書き換えられない**（実測 2026-09-10）∴ **path と blob の対から digest を
 * 作る。code が動けば digest が変わり、記録は自動で失効する。**
 */
const VERIFY_RE = /^[ \t]*[-*][ \t]*検証:[ \t]*@[ \t]*([^\s`]+)/gm

/**
 * この node の code 集合の digest。
 *
 * ⚠ **path だけでは足りない**（中身が動いても変わらない）。⚠ **blob だけでも足りない**
 * （どの file の話か分からず、集合の増減も映らない）∴ **対を並べて 1 つに畳む。**
 */
export function codeDigest(pairs) {
  const body = [...pairs]
    .map(([path, blob]) => `${blob} ${path}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 12)
}

/** body の `検証:` 記録の宛先。 */
export function verifiedDigests(body) {
  return uniq([...body.matchAll(VERIFY_RE)].map((m) => m[1].trim()))
}

/** `[done]` mark の行。⚠ git の `-G` へ渡す ∴ POSIX ERE で書く。 */
const DONE_PATTERN = '^[ \t]*[-*][ \t]*\\[done\\]'

/** mark 行に添えられた PR 番号。⚠ **見出しの `#` と紛れないよう、`#` の直後が数字のものだけ。** */
const PR_RE = /#(\d{1,6})\b/g

/**
 * pathspec と `--no-walk` の引数の上限。
 *
 * ⚠ **超えたら黙って切らない。** 切れば「動いていない」と読めてしまう —— **この機構が
 * 他の面で一貫して拒んでいる形である** ∴ 分割して全部問う。
 */
const CHUNK = 200

const chunk = (xs, n = CHUNK) => {
  const out = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

const uniq = (xs) => [...new Set(xs)]

/**
 * HEAD における path → blob。⚠ **消えた path は対に現れない** —— **それも内容の変化である**
 * （集合が縮んだことが digest に映る）。
 */
async function blobsAt(repoRoot, paths) {
  const pairs = []
  for (const part of chunk(paths)) {
    const out = await runGit(repoRoot, ['ls-tree', '-r', 'HEAD', '--', ...part])
    if (out === null) return null
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/)
      if (m) pairs.push([m[2], m[1]])
    }
  }
  return pairs
}

/**
 * 1 つの repo について aim⊥code の候補を集める。
 *
 * @param {string} repoRoot
 * @param {Map<string, {body: string}>} nodes 生きた record（slug → record）
 * @param {string} dir corpus の在り処
 * @returns {Promise<{slug: string, digest: string, code: number, moved: string[], commitsSince: number}[]|null>}
 *   git が読めなければ `null`。⚠ **空配列と `null` は別である** —— 前者は「候補が無い」、
 *   後者は「測れなかった」。
 */
export async function gatherAimCodeStale(repoRoot, nodes, dir = DEFAULT_AIMS_DIR) {
  // ⑴ `[done]` mark を触った commit を 1 パスで選ぶ。⚠ **出力は pathspec に絞られる** ∴
  //    ここで listed される file はすべて aim record である。
  const picked = await runGit(repoRoot, [
    'log',
    '--format=%H',
    '--name-only',
    '-G',
    DONE_PATTERN,
    '--',
    `${dir}/`,
  ])
  if (picked === null) return null
  const marked = parseCommitLog(picked)
  if (marked.length === 0) return []

  // ⑵ その commit の *全* file を引く（pathspec を外す）—— ここで code が現れる。
  const fullFiles = new Map()
  for (const part of chunk(marked.map((c) => c.sha))) {
    const out = await runGit(repoRoot, ['log', '--no-walk', '--format=%H', '--name-only', ...part])
    if (out === null) return null
    for (const c of parseCommitLog(out)) fullFiles.set(c.sha, c.files)
  }

  const items = []
  for (const [slug, record] of nodes) {
    const own = `${dir}/${slug}.md`
    const mine = marked.filter((c) => c.files.includes(own))
    // ⚠ **mark を持たない node は疎に落ちる** —— **「まだ実現の記録が無い」第 3 状態**であり、
    // 剥離でも整合でもない。**推測で埋め戻さない。**
    if (mine.length === 0) continue

    const code = uniq(
      mine.flatMap((c) => (fullFiles.get(c.sha) ?? []).filter((f) => !isAimPath(f, dir))),
    )
    // ⑶ 補強: mark 行が名指す PR 番号の commit も足す。
    for (const n of prNumbers(record?.body ?? '')) {
      const out = await runGit(repoRoot, [
        'log',
        '--format=%H',
        '--name-only',
        '--grep',
        `(#${n})`,
        '--fixed-strings',
        '-1',
      ])
      if (out === null) continue
      for (const c of parseCommitLog(out)) {
        for (const f of c.files) if (!isAimPath(f, dir)) code.push(f)
      }
    }
    const codeFiles = uniq(code)
    // ⚠ **code を 1 つも持たない node も疎に落ちる**（docs だけを動かした mark）。
    if (codeFiles.length === 0) continue

    const marksAt = mine[0].sha
    const moved = []
    let since = 0
    for (const part of chunk(codeFiles)) {
      const out = await runGit(repoRoot, [
        'log',
        '--format=%H',
        '--name-only',
        `${marksAt}..HEAD`,
        '--',
        ...part,
      ])
      if (out === null) return null
      const cs = parseCommitLog(out)
      since += cs.length
      for (const c of cs) for (const f of c.files) if (part.includes(f)) moved.push(f)
    }
    if (moved.length === 0) continue

    // ⚠ **digest は候補になってから引く** —— 動いていない node に blob を読ませない。
    const pairs = await blobsAt(repoRoot, codeFiles)
    if (pairs === null) return null
    const digest = codeDigest(pairs)
    // 🔴 **承認済みなら候補ではない。** ⚠ **code が次に動けば digest が変わり、記録は自動で
    // 失効する** —— **「一度書いた行が以後すべての変更を黙って吸収する」形にはならない。**
    if (verifiedDigests(record?.body ?? '').includes(digest)) continue

    items.push({
      slug,
      digest,
      code: codeFiles.length,
      moved: uniq(moved).sort(),
      commitsSince: since,
    })
  }

  // ⚠ **順序は導出できる**（多く動いたものほど見る理由が強い）が、**下限は導出できない** ∴
  // **閾値は持たない。** 数は出し、重みづけは読み手が行う。
  items.sort((a, b) => b.commitsSince - a.commitsSince)
  return items
}

/** body の `[done]` 行から PR 番号を拾う。⚠ **`[done]` 以外の行は見ない。** */
export function prNumbers(body) {
  const out = []
  for (const line of body.split(/\r?\n/)) {
    if (!/^[ \t]*[-*][ \t]*\[done\]/.test(line)) continue
    for (const m of line.matchAll(PR_RE)) out.push(m[1])
  }
  return uniq(out)
}

/** 一覧に出す path の上限。⚠ **超えた分は数で述べる —— 黙って落とさない。** */
const SHOW = 4

export function renderAimCodeFence(items) {
  // ⚠ **出す列に sha を置かない。** 🔴 **今日それを写させた設計が壊れた**（照合の commit sha）
  // ∴ **写すべき値は digest だけである。**
  const lines = [
    '```' + AIM_CODE_FENCE_TAG,
    '# fields: slug | code_digest | moved_paths | commits_since',
  ]
  if (items === null) {
    lines.push('# unavailable — git 履歴を読めなかった ∴ 剥離が無いとは読めない')
  } else if (items.length === 0) {
    lines.push(
      '# none — `[done]` mark と一緒に commit された code は、どの node でもその後動いていない',
    )
  } else {
    for (const it of items) {
      const shown = it.moved.slice(0, SHOW).join(',')
      const rest = it.moved.length > SHOW ? `,+${it.moved.length - SHOW}` : ''
      lines.push(`${it.slug} | ${it.digest} | ${shown}${rest} | ${it.commitsSince}`)
    }
  }
  lines.push('```', '')
  return lines.join('\n') + '\n'
}
