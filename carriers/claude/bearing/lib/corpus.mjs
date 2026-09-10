// repo の aim corpus を読む。
//
// corpus とは**何であるか**は `docs/aims/_guide/aim-authoring.md` が決めている:
// 1 つの aim につき 1 file、frontmatter は人間のもので body はエージェントのもの、
// 子は親を名指し、slug は file 名である。⚠ **以下はそこから読むだけで、自分では何も
// 足さない。**

import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * この directory entry は aim record か。
 *
 * stem が `README` でない `.md` file である —— **file 名が identity** である以上、
 * record の file でないものは record ではない。`_guide/` は無料で落ちる（`.md` ではなく
 * directory だから）∴ canon 自身の file が aim node として現れることは決して無い。
 *
 * @param {string} name path ではなく、裸の file 名
 */
/**
 * corpus の既定の在り処。
 *
 * ⚠ **既定は動かさない。** 既定が動けば、既に在る corpus が一斉に行方不明になる ——
 * **在り処を変えられるようにすること**と**既定を変えること**は別の act である。
 * ⚠ **既定はここ 1 箇所にしか置かない** —— 2 箇所に置けば、片方だけが動く日が来る。
 */
export const DEFAULT_AIMS_DIR = 'docs/aims'

/**
 * 宣言された在り処を、この機構が扱える形へ正規化する。**扱えないものは null を返す。**
 *
 * ⚠ **5 箇所がこの値を git の pathspec として渡す** ∴ ここを緩めることは、走査が黙って
 * 広がることを許すのと同じである。∴ 絶対 path・`..`・glob と pathspec magic の文字を拒む。
 * ⚠ **拒むときは null を返し、呼ぶ側が述べる** —— ここで既定へ落とせば、**誤った宣言が
 * 既定として黙って動く**。
 *
 * @param {unknown} value
 * @returns {string|null} 前後の `/` を落とした repo 相対 path、扱えなければ null
 */
export function normalizeAimsDir(value) {
  if (typeof value !== 'string') return null
  // ⚠ **backslash は `/` へ倒す** —— win32 で人間が書いた宣言も、git の pathspec は
  // `/` で受ける。⚠ **末尾の `/` は落とすが、先頭は落とさず拒む**: 「repo root から」と
  // 「絶対 path」のどちらとも読める ∴ **曖昧なものを我々の側で決めない。**
  const v = value.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  if (v === '') return null
  if (v.startsWith('/')) return null
  if (/^[A-Za-z]:/.test(v)) return null // 絶対 path（win32）
  const segs = v.split('/')
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return null
  if (/[*?\[\]:]/.test(v)) return null // glob と pathspec magic
  return v
}

export function isAimRecord(name) {
  if (path.extname(name) !== '.md') return false
  return path.basename(name, '.md') !== 'README'
}

/**
 * `<repoRoot>/docs/aims` 配下の全 aim slug を昇順で。
 *
 * directory が無ければ `[]` を返す: unit は複数 repo でありうるので、**corpus をまだ採って
 * いない member repo は構造的に正常な状態**であって、error ではない。並びは単純な
 * 辞書順 —— aim の slug は日付を持たず、順序づけるべき新しさの軸が無い ∴ これは安定で
 * 決定的な walk であるという以上の意味を持たない。
 *
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export async function readAimSlugs(repoRoot, dir = DEFAULT_AIMS_DIR) {
  const aimsDir = path.join(repoRoot, ...dir.split('/'))
  let entries
  try {
    entries = await readdir(aimsDir, { withFileTypes: true })
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
  return entries
    .filter((e) => e.isFile() && isAimRecord(e.name))
    .map((e) => path.basename(e.name, '.md'))
    .sort()
}

/**
 * 1 つの aim node に対する repo 相対の pathspec。
 *
 * ⚠ git の pathspec はどの platform でも `/` を使う ∴ 区切りは `path.join` から取らず
 * 正規化する —— これが無いと **Windows で file 単位の信号が失われる**。比較相手である
 * porcelain の出力は、あちらでも `docs/aims/x.md` と言うからである。
 *
 * @param {string} slug
 */
export function aimRelPath(slug, dir = DEFAULT_AIMS_DIR) {
  return `${dir}/${slug}.md`
}

// --- drift fence が読む graph ---------------------------------------------
//
// 先行実装からではなく、目的の文から導出している: 子は親を名指す（木）、`# DAG` は木で
// 辿れない辺を運ぶ、そして frontmatter は人間・body はエージェントのもの
// ∴ **両方が主張を載せる**。

/**
 * fenced block と inline code span を取り除く。
 *
 * 実測: 素の `[[…]]` 正規表現は 564 参照のうち 24 件を未解決と呼ぶが、その全てが backtick
 * の中に引用された記法である（`` `[[slug]]` ``、`` `[[unit]]` ``）。code span を剥ぐと 0 に
 * なる。⚠ **法は「code span の中に在るものは引用であって主張ではない」である** —— path の
 * 検査が backtick 付きの `.handoff/active.md` に一致してしまったとき、取り違えたのがこの法
 * である。
 */
export function stripFencedBlocks(text) {
  return text.replace(/```[\s\S]*?```/g, '')
}

export function stripCodeSpans(text) {
  return stripFencedBlocks(text).replace(/`[^`\n]*`/g, '')
}

/**
 * `# DAG` の**照合記録** —— エージェントが「この隣接を、この commit の変更に対して検査し、
 * 変更不要と結論した」と書いた行。形は `- 照合: [[slug]] @ <sha>`。
 *
 * ⚠ **これが在るのは、`drift-inter` が file の移動しか見ないためである。** 検査の結果
 * 変更が要れば隣接が動く ∴ flag は自然に落ちる。だが**変更不要という結論は何も動かさない**
 * ∴ 記録する場所が無ければ flag は立ち続け、**既に見た者に「見よ」と言い続ける**。
 *
 * ⚠ **宛先を必須にしているのは、照合が「その anchor の下での」証言だからである。** `aim:`
 * が次に変われば、その照合はもう答えになっていない —— **node に対する証言にすると、一度
 * 書いた行が以後すべての変更を黙って吸収してしまう。**
 *
 * 🔴 **宛先は `anchorDigest` である。commit sha ではない**（人間の決定 2026-09-10）——
 * ⚠ **sha は host の merge 慣習が書き換える** ∴ **PR で書いた照合が land で読めなくなる。**
 * **旧い形（commit sha）は `drift.mjs` が当面そのまま通し、fence が書き換えを促す。**
 *
 * ⚠ **fenced block だけを剥ぐ**（inline span は剥がない）。剥ぐと backtick 付きで書かれた
 * 宛先が消え、記録が**黙って落ちる** —— 落ちた記録は「記録が無い」と同じ見た目になる。
 */
const COLLATION_RE = /^[ \t]*[-*][ \t]*照合:[ \t]*\[\[([^\]\n]+)\]\][ \t]*@[ \t]*([^\s`]+)/gm

/**
 * anchor（`aim:` 本文）の digest。**照合記録が指す宛先である。**
 *
 * 🔴 **なぜ commit sha ではないのか。** 照合は「この anchor の下で隣接を点検した」という
 * 証言であり、⚠ **commit sha は host の merge 慣習（squash / rebase）が書き換える** ——
 * **書いた瞬間は正しく、land した瞬間に偽になる。** 2026-09-10 に実際に起きた:
 * PR の squash が 7 件の照合を「読めない証言」へ落とした。**bearing は任意の repo へ配る
 * ∴ 配り先の merge 慣習を知りえない** —— **sha を写す設計では、repo を問わず機能しない。**
 *
 * ⚠ **内容は書き換えられない。** `aim:` が変われば digest が変わり、照合は答えでなくなる
 * （commit sha が担っていた性質はここで保たれる）。**それ以外の変更は吸収してよい** ——
 * `drift-inter` の trigger は anchor の変更だからである。
 *
 * ⚠ **12 桁である。** 区別すべきは「同じ node の anchor の版」だけであり、corpus 全体で
 * 一意である必要は無い。**短いほど commit sha の接頭と衝突しやすい** ∴ 短くしない。
 */
export function anchorDigest(aim) {
  if (aim === null || aim === undefined) return null
  return createHash('sha256').update(String(aim).trim(), 'utf8').digest('hex').slice(0, 12)
}

/**
 * 1 つの aim record を、fence が必要とする事実へ parse する。
 *
 * ⚠ **quote の除去は装飾ではない**: 77 node の corpus でちょうど 1 つの node が
 * `parent: "…"` と quote 付きで書いており、これが無いとその node は**黙って木から
 * 脱落する**。node を落とすセンサーは、この機構が名指している失敗そのものである。
 */
export function parseAimRecord(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  const front = m ? m[1] : ''
  const body = m ? m[2] : text
  const field = (key) => {
    // ⚠ `\s` ではなく `\\s` である: template literal の中では認識されない escape が
    // backslash を失うため、`\s*` が `s*`（リテラル `s` の 0 回以上）になっていた。
    // それでもこの corpus を正しく parse できていたのは、全ての行が空白 1 個の
    // `aim: …` であり、値が後で trim されるからにすぎない。
    const hit = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    if (!hit) return null
    const raw = hit[1].trim()
    const unquoted = raw.replace(/^(["'])([\s\S]*)\1$/, '$2')
    return unquoted === '' ? null : unquoted
  }
  const links = [
    ...new Set(
      [...stripCodeSpans(body).matchAll(/\[\[([^\]\n]+)\]\]/g)].map((x) => x[1].trim()),
    ),
  ]
  // ⚠ **frontmatter は 3 field である**（人間の決定 2026-09-10）—— `aim:` / `parent:` /
  // `state:`。🔴 **かつて 4 番目に `last-verified:` が在ったが退役した** —— **人間が sha を
  // 書く欄であり、host の merge 慣習がそれを書き換える** ∴ **aim⊥code は `aim-code.mjs` が
  // `[done]` mark の commit から引く**（[[purpose-drift]]）。⚠ **知らない field は 1 文字も
  // 動かさない** ∴ **消費者の corpus に残った `last-verified:` は保たれる**（`aim-format` の
  // 「知らない frontmatter の行」の test がそれを固定している）。`body` を返しているのは
  // `# PROCESS` がそこに在るからで、mark の parser が frontmatter を再分割してはならない。
  const collations = [...stripFencedBlocks(body).matchAll(COLLATION_RE)].map((m) => ({
    slug: m[1].trim(),
    sha: m[2].trim(),
  }))
  const aim = field('aim')
  return {
    aim,
    anchorDigest: anchorDigest(aim),
    parent: field('parent'),
    state: field('state'),
    body,
    links,
    collations,
  }
}

/**
 * repo の全 aim record を読み、その隣接を索引する。
 *
 * 隣接とは、親・子・外向きの `[[link]]`・内向きの `[[link]]` である。
 * `aim-authoring.md` がちょうどその集合を名指しており（「親・子・`[[link]]` 先・自身」）、
 * 内向きの辺が含まれるのは、**この node についての主張が向こう側に住んでいる**からである。
 * 生きた record に解決しない辺は、報告せずに落とす: ⚠ 宙に浮いた参照は corpus の問題で
 * あって、drift の事実ではない。
 */
export async function readAimGraph(repoRoot, dir = DEFAULT_AIMS_DIR) {
  const slugs = await readAimSlugs(repoRoot, dir)
  if (slugs === null) return null
  const { readFile } = await import('node:fs/promises')
  const path = (await import('node:path')).default
  const nodes = new Map()
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug, dir)), 'utf8')
    } catch {
      continue // 削除と競合しただけで、それは drift の事実ではない。
    }
    nodes.set(slug, parseAimRecord(text))
  }
  const children = new Map()
  const inbound = new Map()
  const push = (map, key, value) => {
    if (!nodes.has(key)) return
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const [slug, node] of nodes) {
    if (node.parent) push(children, node.parent, slug)
    for (const link of node.links) push(inbound, link, slug)
  }
  const neighbours = (slug) => {
    const node = nodes.get(slug)
    if (!node) return []
    const all = [node.parent, ...(children.get(slug) ?? []), ...node.links, ...(inbound.get(slug) ?? [])]
    return [...new Set(all.filter((x) => x && x !== slug && nodes.has(x)))]
  }
  return { nodes, neighbours }
}
