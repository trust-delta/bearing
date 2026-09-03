// handoff 機構 —— baton を書き・読む作業のうち、**機械である半分**。
//
// 導出元の前提:
//
//   引き継ぎの主体エージェントのネイティブな圧縮・リセットではなく、セッションを跨ぐ
//                   context 伝達のために固有の会話引き継ぎ機構を備える
//   安さ            早期の引き継ぎを安く行えるようにし、context の鮮度・出力品質・
//                   無駄なコストの抑制を保つ
//   任意の発火人間の任意のタイミングで引き継ぎを行える
//   確認の門        引き継ぎ内容は、land の前に人間が確認し、漏れや修正があれば書き直しを
//                   指示できる
//   対話の単一性人間が 1 度に対話するエージェントは常に単一である
//
// ═══ ここで機械であるもの、断じて機械でないもの ═════════════════════════════
//
// `handoff.md` が要となる主張を平明に述べている: ⚠ **この方法の価値は authoring の
// judgment にあり、baton の構造にはない。** 何を残し、何を「再導出できる」として捨てるか
// —— それこそが native な圧縮に欠けているものである。∴ **この file は baton の語を 1 つも
// 書かないし、何も要約しないし、何が重要かを決めない。**
//
// この file が持つのは、その judgment の周囲にある**純然たる帳簿仕事**であり、しかも手で
// やると間違えやすいものである —— そして「安さ」の前提が言うとおり、**儀式のコスト自体が
// 標的である**。高価な引き継ぎは、context が既に劣化するまで人間が先延ばしにする
// 引き継ぎだからだ:
//
//   - 新しい baton が着地する**前に**、正確な UTC 名で archive へ退避する
//   - `composed-at` を著者の記憶ではなく時計から刻む
//   - 読む際に `read-at` を刻む（手順 3）。ただし**旧値を先に返す**（手順 2）
//   - baton が構造的に過少報告する aim の trace（手順 4）
//
// ⚠ **`read-at` を書く側が書くことは決して無い。** 新しい baton はまだ読まれていない ——
// canon がそう述べており、書く側が刻めば「既読」という語が何も意味しなくなる。
//
// 置き場は **人間の home の下**（`~/.bearing/units/<unit>/`）、machine-local、決して commit
// しない。⚠ **これは目的の帰結である**（対話の単一性）: baton が守っているのは人間と 1 つの
// セッションの間にある対話の継続である ∴ **越境する手段を手に入れても、越境する理由には
// ならない。**
//
// ⚠ **2026-09-03 に repo の外へ出した。** 以前は cwd の傍らの `.handoff/` に置いており、
// 「どの repo にも属さないので commit されえない」と述べていた —— だがそれが真だったのは
// **multi-repo wrapper が cwd のときだけ**である。単一 repo で使えば `.handoff/` は repo の
// 中に生まれ、⚠ **ignore しているのは bearing 自身の `.gitignore` だけ** ∴ 他 project では
// untracked で現れ、まとめて `git add` されれば**痕跡になる。** home の下へ出せば、
// commit されえないことが**どの使い方でも**構造として保たれる。
//
// ⚠ **引くのは unit root の path であって repo 名ではない。** canon は multi-repo wrapper が
// cwd のとき wrapper 直下に置くと定めており、**repo 名では引けない場合がある**。名前だけで
// 引けば、同名 repo や複数 worktree が**黙って同じ baton を共有する** —— 別の対話の baton を
// 読むことになり、これは baton が無いことより悪い。∴ **読める名 ＋ path の hash**にする。

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export const ACTIVE = 'active.md'
export const ARCHIVE = 'archive'

/** ⚠ 旧い置き場。**読み書きはしない** —— 移行を検出して人間に述べるためだけに在る。 */
export const LEGACY_DIR = '.handoff'
export const legacyDir = (unitRoot) => path.join(unitRoot, LEGACY_DIR)

/**
 * baton たちの家。⚠ **`BEARING_HOME` で移せる** —— test がここを差し替えられなければ、
 * test は人間の実際の baton を触ることになる。
 */
export const bearingHome = (env = process.env, home = os.homedir()) =>
  env.BEARING_HOME || path.join(home, '.bearing')

/**
 * unit を指す dir 名。**unit root の絶対 path を平坦化したもの** ——
 * `/home/x/works/api` → `-home-x-works-api`。
 *
 * ⚠ **Claude Code が `~/.claude/projects/` で採っているのと同じ規則である**（人間が
 * 2026-09-03 に決定）。理由は一意性ではなく**馴染み**である: 人間が自力で archive を見に
 * 行くとき、既に見慣れた形なら path から unit を読み取れる。⚠ **英数字以外はすべて `-` に
 * なる** —— 実測で `/home/trustdelta/.claude` が `-home-trustdelta--claude` になっており、
 * `/` だけでなく `.` も潰れている。win32 の `\` と `:` も同じ規則に含まれる。
 *
 * ⚠ **∴ 平坦化は単射でない。** `/w/名前` と `/w/名称` は同じ dir 名になる —— **別の対話の
 * baton を読む**ことになり、これは baton が無いことより悪い。**hash を足せば塞げるが、
 * 塞ぐ代わりに読めなくなる** ∴ 人間は読めるほうを選んだ。**衝突の検出は別に立てる**
 * （[[session-handoff]] の `[todo]`）—— 名前を安全にするのではなく、**衝突したときに
 * 述べる**ほうへ寄せる。
 */
export function unitSlug(unitRoot) {
  return path.resolve(unitRoot).replace(/[^A-Za-z0-9-]/g, '-') || 'unit'
}

export const batonDir = (unitRoot, env = process.env) =>
  path.join(bearingHome(env), 'units', unitSlug(unitRoot))

export const activePath = (unitRoot, env = process.env) => path.join(batonDir(unitRoot, env), ACTIVE)
export const archiveDir = (unitRoot, env = process.env) =>
  path.join(batonDir(unitRoot, env), ARCHIVE)

/**
 * `YYYY-MM-DDTHHMMSSZ` —— canon が指定する archive の file 名。
 *
 * colon は escape ではなく除去する: この名は Windows でも合法な file 名でなければならず、
 * `:` はそうでない。⚠ **これは形式の妥協ではなく、形式がこう書かれている理由そのものである。**
 */
export function archiveStamp(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '')
}

/**
 * 現在の baton を、在れば archive へ移す。
 *
 * ⚠ **退避は「書く」ときに起こり、「読む」ときには決して起こらない。** canon は明示的で
 * ある: 読む側は archive しない ∴ 同じ baton を二度読むことは起こりうる —— **それを検出
 * するのが `read-at` の役目であって、防ぐことは目的ではない。**
 *
 * @returns {Promise<string|null>} archive の path。移すものが無ければ null
 */
export async function archiveActive(unitRoot, date = new Date()) {
  const src = activePath(unitRoot)
  try {
    await readFile(src, 'utf8')
  } catch {
    return null // 退避するものが無いのは、初回の書き込みとして正常である。
  }
  const dir = archiveDir(unitRoot)
  await mkdir(dir, { recursive: true })
  let dest = path.join(dir, `${archiveStamp(date)}.md`)
  // 同じ秒に 2 回引き継ぐことは、片方を失ってよい理由にはならない。
  for (let n = 2; ; n++) {
    try {
      await readFile(dest, 'utf8')
      dest = path.join(dir, `${archiveStamp(date)}-${n}.md`)
    } catch {
      break
    }
  }
  await rename(src, dest)
  return dest
}

/**
 * 著された markdown が、時計から刻まれた `composed-at` を持つことを保証する。
 *
 * ⚠ **著者が与えた `composed-at` は信頼せず、置換する。** これはセッションが時計より
 * よく知りえない唯一の field であり、誤った値は読む側の「この baton は数日前のものです」
 * という 1 行を嘘にする。
 *
 * ⚠ **著者が与えた `read-at` は除去する。** 新しい baton はまだ読まれていない。
 */
export function stampComposedAt(markdown, date = new Date()) {
  const iso = date.toISOString().replace(/\.\d+Z$/, 'Z')
  const m = markdown.match(/^---\r?\n([\s\S]*?\r?\n)---(\r?\n[\s\S]*)$/)
  if (!m) {
    // frontmatter が全く無い: 拒否せず、与える。baton の価値は body に在り、区切りが
    // 1 つ足りないことは、それを失ってよい理由にならない。
    return `---\ncomposed-at: ${iso}\n---\n\n${markdown.replace(/^\n+/, '')}`
  }
  const front = m[1]
    .split(/\r?\n/)
    .filter((l) => !/^(composed-at|read-at):/.test(l))
    .filter((l, i, a) => !(l === '' && i === a.length - 1))
  front.unshift(`composed-at: ${iso}`)
  return `---\n${front.join('\n')}\n---${m[2]}`
}

/**
 * 退避し、そのうえで著された baton を配置する。
 *
 * ⚠ **ここは確認の門を持たない** —— 確認の門は*この呼び出しの前*、会話の中に在り、そこで
 * 人間が「X を捨てた理由が落ちている」と言える。**ここに機械の門を置いても検査できるのは
 * 形だけであり、この門は形のために在るのではない。**
 */
export async function writeBaton(unitRoot, markdown, date = new Date()) {
  const archived = await archiveActive(unitRoot, date)
  await mkdir(batonDir(unitRoot), { recursive: true })
  const text = stampComposedAt(markdown, date)
  await writeFile(activePath(unitRoot), text.endsWith('\n') ? text : text + '\n', 'utf8')
  return { path: activePath(unitRoot), archived }
}

/**
 * 読む手順の 2 と 3 を、canon が置いた順序どおりに行う。
 *
 * **旧**`read-at` を返し（手順 2 —— 1 行で報告すべき事実）、そのうえで新しいものを刻む
 * （手順 3）。⚠ **これを 1 回の呼び出しで行うことが順序を守る** —— 先に刻んだ読み手は、
 * 報告すべきものを既に破壊している。
 *
 * ⚠ **既読の報告は事実であって、警告でも拒否の理由でもない。** 古い baton をあえて読ませ
 * たい場面はある。
 */
export async function stampReadAt(unitRoot, date = new Date()) {
  const file = activePath(unitRoot)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch {
    return null
  }
  const iso = date.toISOString().replace(/\.\d+Z$/, 'Z')
  const previousReadAt = text.match(/^read-at:\s*(.*)$/m)?.[1].trim() || null
  const composedAt = text.match(/^composed-at:\s*(.*)$/m)?.[1].trim() || null
  let next
  if (previousReadAt !== null) {
    next = text.replace(/^read-at:.*$/m, `read-at: ${iso}`)
  } else if (/^composed-at:.*$/m.test(text)) {
    next = text.replace(/^(composed-at:.*)$/m, `$1\nread-at: ${iso}`)
  } else {
    // 刻む先の frontmatter が無い。読んだこと自体は起きている ∴ 事実を返してそう述べ、
    // frontmatter を発明せず file はそのまま置く。
    return { previousReadAt, composedAt, stamped: false }
  }
  await writeFile(file, next, 'utf8')
  return { previousReadAt, composedAt, stamped: true }
}

/** 退避済みの baton、新しい順。 */
export async function listArchive(unitRoot) {
  try {
    return (await readdir(archiveDir(unitRoot)))
      .filter((n) => n.endsWith('.md'))
      .sort()
      .reverse()
  } catch {
    return []
  }
}
