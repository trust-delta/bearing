// repo の aim corpus を読む。
//
// corpus とは**何であるか**は `docs/aims/_guide/aim-authoring.md` が決めている:
// 1 つの aim につき 1 file、frontmatter は人間のもので body はエージェントのもの、
// 子は親を名指し、slug は file 名である。⚠ **以下はそこから読むだけで、自分では何も
// 足さない。**

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
export async function readAimSlugs(repoRoot) {
  const aimsDir = path.join(repoRoot, 'docs', 'aims')
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
export function aimRelPath(slug) {
  return `docs/aims/${slug}.md`
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
export function stripCodeSpans(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
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
  // `last-verified` は人間が持つ 4 番目の疎な field である: ⚠ **不在は一級の第 3 状態**
  // （まだ aim⊥code の監視下に無い）であって、埋めるべき既定値ではない。`body` を返して
  // いるのは `# PROCESS` がそこに在るからで、mark の parser が frontmatter を再分割しては
  // ならないためである。
  return {
    aim: field('aim'),
    parent: field('parent'),
    state: field('state'),
    lastVerified: field('last-verified'),
    body,
    links,
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
export async function readAimGraph(repoRoot) {
  const slugs = await readAimSlugs(repoRoot)
  if (slugs === null) return null
  const { readFile } = await import('node:fs/promises')
  const path = (await import('node:path')).default
  const nodes = new Map()
  for (const slug of slugs) {
    let text
    try {
      text = await readFile(path.join(repoRoot, aimRelPath(slug)), 'utf8')
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
