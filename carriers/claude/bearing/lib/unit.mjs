// unit —— 1 つのセッションが対象とする repo の集合。
//
// 移植ではなく、目的の文から導出している:
//
//   cwd が project   エージェントが立ち上がった cwd を project とする
//   下方向の探索     cwd 自身を含めて下階層へ git を探索し、各枝で最初に現れたものを
//                    project 内で管理する repository とする
//   複数 repo        project は複数の repository から構成される場合もある
//
// この 3 文から 3 つが従い、それ以外は何も従わない:
//
//   1. **walk は cwd から始まり、下へ行く。決して上らない。** ある member repo の中で
//      開かれたセッションは、その repo だけについてのセッションである —— それは cwd が
//      project を定義しているのであって、上の wrapper を見つけて訂正すべき誤りではない。
//   2. 「各枝で最初に現れたもの」が、**当たった時点で walk を刈る**ことを課す。repo 自身の
//      submodule や vendor された checkout はその repo の中に在る ∴ それらはその repo の
//      問題であって、unit の問題ではない。
//   3. 複数は正常である ∴ ここでは 2 つ目の repo を error として扱わない。
//
// ⚠ **下記の上限は導出されたものではない** —— 深さや個数を名指す目的の文は存在しない。
// これらが在るのは、これが実時間の予算を持つ SessionStart hook の中で走るからであり、
// 任意の cwd（home directory、`/`）を無制限に walk すれば、情報を与えるべき当のセッションを
// 吊らせるからである。∴ **これらは在るがままに述べる: 吊らないという拒否であって、project
// の形についての主張ではない。** 上限が噛んだときは、黙って適用せず**事実として報告する**
// —— 完全に見える切り詰められた unit は、「悪いセンサーはセンサーが無いことに劣る」という
// 失敗そのものである。

import { readdir, stat, readFile } from 'node:fs/promises'
import path from 'node:path'

import { DEFAULT_AIMS_DIR } from './corpus.mjs'
import { declaredAimsDir } from './claude-md.mjs'

/** cwd の下、どこまで深く repo を探しうるか。導出ではなく、吊らないための拒否。 */
export const MAX_DEPTH = 4
/** 1 つの unit が持ちうる repo の数。導出ではなく、吊らないための拒否。 */
export const MAX_REPOS = 12

/**
 * 決して降りる価値のない directory 名。
 *
 * どれも、そこに `.git` が在ればそれはこの project 以外の何かに属する場所である ——
 * 依存の vendor された checkout、build 生成物、worktree 自身の帳簿。`node_modules`
 * 1 つで数百を抱えうる。
 */
const SKIP = new Set([
  'node_modules', 'target', 'dist', 'build', 'out', 'vendor',
  '.venv', 'venv', '__pycache__', '.next', '.turbo', '.cache',
])

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

/**
 * その dir の `CLAUDE.md` が宣言している corpus の在り処。
 *
 * ⚠ **読めない file は「宣言が無い」である** —— そこに在ったかもしれない宣言を我々は
 * 知りようがなく、**知らないことを壊れていると述べるのは捏造である。**
 */
async function declaredIn(dir) {
  try {
    return declaredAimsDir(await readFile(path.join(dir, 'CLAUDE.md'), 'utf8'))
  } catch {
    return { dir: null, declared: false, reason: null }
  }
}

/**
 * corpus の在り処を repo ごとに解決する。**解決はここ 1 箇所で行い、そこから配る。**
 *
 * ⚠ **8 箇所の hardcode を「`CLAUDE.md` を読む」8 箇所の hardcode に置き換えてはならない**
 * —— 読む場所が増えれば、どれが正かが再び分からなくなる。
 *
 * 順序は **repo 自身の宣言 → unit root の宣言 → 既定**。⚠ **repo 自身が先に来るのは、
 * corpus が repo の artifact だからである**（[[aim-tree]]「置き場はリポジトリである」）——
 * wrapper の宣言は、自分で名乗らない repo に対する既定にすぎない。
 *
 * ⚠ **壊れた宣言を既定へ落とさない。** `reason` を持たせて呼ぶ側に述べさせる ——
 * 既定として黙って動けば、人間は自分の宣言が効いていると信じ続ける。
 */
async function resolveAimsDirs(root, repos) {
  const unitLevel = await declaredIn(root)
  const out = []
  for (const repo of repos) {
    const own = repo.root === root ? unitLevel : await declaredIn(repo.root)
    const chosen = own.declared ? own : unitLevel
    out.push({
      ...repo,
      aimsDir: chosen.dir ?? DEFAULT_AIMS_DIR,
      aimsDirDeclared: chosen.declared,
      aimsDirProblem: own.reason ?? unitLevel.reason ?? null,
    })
  }
  return out
}

/**
 * `cwd` を root とする unit を解決する。
 *
 * @param {string} cwd
 * @returns {Promise<{root: string, name: string, repos: {root: string, label: string, primary: boolean}[], truncated: null|'depth'|'count'}>}
 */
export async function resolveUnit(cwd) {
  const root = path.resolve(cwd)
  const found = []
  let truncated = null

  // 幅優先である ∴ 浅い repo が、先に上限を埋めた深い枝のせいで失われることが無い。
  // 深さ順は目的の文が含意する唯一の順序である（「下階層に向かって」）—— 同一 level 内の
  // 並びは決定性のための辞書順で、これはどの文も要求していないが、読み手は全員要求する。
  let level = [root]
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next = []
    for (const dir of level.sort()) {
      if (found.length >= MAX_REPOS) {
        truncated = 'count'
        break
      }
      if (await isDir(path.join(dir, '.git'))) {
        // 当たり。刈る: この下に在るものは何であれ*この* repo に属する。
        found.push(dir)
        continue
      }
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue // 読めないものは repo ではないし、止まるに値する error でもない。
      }
      for (const e of entries) {
        if (!e.isDirectory()) continue
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue
        next.push(path.join(dir, e.name))
      }
    }
    if (found.length >= MAX_REPOS) {
      truncated = 'count'
      break
    }
    if (depth === MAX_DEPTH && next.length > 0) truncated = 'depth'
    level = next
  }

  // primary: そのセッションが最も尤もらしく*それについて*である repo。cwd 自身が勝つ ——
  // 「cwd が project」が指しているのはそれである。次点は directory 名が unit 名と一致する
  // もので、これは wrapper が包む対象の名を名乗るときに取る形である。それも無ければ最初に
  // 見つかったもの。⚠ **これは表示順であって filter ではない**: どの repo も事実を運び、
  // どの repo の事実も出力される。
  const name = path.basename(root)
  const primaryIdx = found.indexOf(root) !== -1
    ? found.indexOf(root)
    : Math.max(0, found.findIndex((r) => path.basename(r) === name))

  const repos = await resolveAimsDirs(
    root,
    found.map((r, i) => ({
      root: r,
      label: path.basename(r),
      primary: i === primaryIdx,
    })),
  )
  // primary を先頭に。残りは発見順を保つ。
  repos.sort((a, b) => (a.primary === b.primary ? 0 : a.primary ? -1 : 1))

  return { root, name, repos, truncated }
}
