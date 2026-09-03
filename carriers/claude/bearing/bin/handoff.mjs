#!/usr/bin/env node
// handoff CLI —— baton 儀式のうち**帳簿である半分**。
//
// 手順と judgment は `handoff.md` が持つ。この file が持つのは、そのうち**純然たる機械で
// あり、手でやると間違えやすい 4 手順**である。それに値するのは「安さ」の前提による:
// ⚠ **儀式のコスト自体が標的である。** 高価な引き継ぎは、context が既に劣化するまで
// 人間が先延ばしにする引き継ぎであり、それこそがこの方法全体が避けるために在る失敗
// だからだ。
//
//   handoff.mjs read    「読む」の手順 2〜4: 旧 read-at を報告し、新しいものを刻み、
//                       baton が構造的に過少報告する aim の trace を surface する。
//   handoff.mjs write   「書く」の手順 1: 現在の baton を archive へ退避し、stdin から
//                       受け取った著述物を、時計から刻んだ `composed-at` 付きで配置する。
//   handoff.mjs trace   aim の trace だけ。
//
// ⚠ **ここは何も著さず、何も要約せず、何も判定しない。** 何を残し、何を「再導出できる」と
// して捨てるか —— それが native な圧縮に欠けている judgment であり、この方法の価値の全て
// である。**機械化すれば、要点ごと機械化して消すことになる。**

import path from 'node:path'
import { mkdir, readdir, rename, stat } from 'node:fs/promises'
import { readAimSlugs } from '../lib/corpus.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherUnpushed } from '../lib/unpushed.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import {
  ACTIVE, ARCHIVE, activePath, archiveDir, batonDir, legacyDir, listArchive, stampReadAt,
  writeBaton,
} from '../lib/handoff.mjs'
import { readBaton } from '../lib/baton.mjs'

// ⚠ **stdin を読む前に、ここが最初に走らねばならない。** 委譲は fd をそのまま子へ渡す
// （`stdio: 'inherit'`）ので、親が一度でも stdin を読めばその分は永久に失われる。
import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)


const out = []
const say = (...l) => out.push(...l)

/**
 * 手順 4: aim の trace。
 *
 * ⚠ **これは気の利いた付け足しではない。** canon が理由を述べており、それは構造的である:
 * **baton は forward に選ばれる** ∴ 道中どう aim が触られたかを過少報告する —— そして
 * aim を読み直して得られるのは*到達状態*であって*変化*ではない。**この差分だけが変化を
 * 運ぶ。**
 */
async function trace(unit) {
  const rows = []
  for (const repo of unit.repos) {
    const dir = repo.aimsDir
    const slugs = await readAimSlugs(repo.root, dir)
    if (slugs.length === 0) continue
    const [working, unpushed] = await Promise.all([
      gatherWorkingDelta(repo.root, slugs, dir),
      gatherUnpushed(repo.root, slugs, dir),
    ])
    // ⚠ 読めなかったものを省く trace は、省略によって嘘をつく trace である ——
    // fence 自身が今は拒んでいるのと同じ捏造。
    if (working === null) {
      rows.push(repo.label + ' | — | working-delta unavailable (git を読めなかった)')
    }
    for (const w of working ?? []) {
      rows.push(`${repo.label} | ${w.slug} | ${w.untracked ? 'untracked' : 'uncommitted'}`)
    }
    for (const u of unpushed ?? []) {
      rows.push(`${repo.label} | ${u.slug} | unpushed (${u.aheadCommits} commit(s), ${u.latestSha.slice(0, 8)})`)
    }
  }
  say('```bearing-trace v1', '# fields: repo | slug | state')
  if (rows.length === 0) {
    say('# none — この unit に未 commit / 未 push の aim 変更は無い')
  } else {
    for (const r of rows) say(r)
  }
  say('```', '')
  if (rows.length > 0) {
    say(
      '**上の slug をすべて再読すること。** baton は forward に選ばれる ∴ 道中どう aim が',
      '触られたかを過少報告する。aim を読み直して得られるのは*到達状態*であって*変化*では',
      'ない。**この差分だけが変化の運び手である。**',
      '',
    )
  }
  // ⚠ これを述べるのは、これが但し書きではなく**穴**だからである: ここが見るのは tracked な
  // `docs/aims/` だけ。untracked なローカルの変化は構造上ここに映らない ∴ baton の散文だけが
  // その記録である。
  // ⚠ **どこを見たかを言う。** 在り処は project が宣言する ∴ 「`docs/aims/`」と決め打つ
  // 文言は、宣言を変えた repo で**嘘になる**。
  const looked = [...new Set(unit.repos.map((r) => `\`${r.aimsDir}/\``))].join('、')
  say(`⚠ この trace が見るのは tracked な ${looked} だけである。untracked なローカルの`,
      '変化はここに現れえない —— baton 自身の言葉だけがその記録である。', '')
}

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
  })
}

/**
 * 旧い置き場（`<unit>/.handoff/`）に baton が残っていれば、その本数を返す。
 *
 * ⚠ **見つけても動かさない。** file の移動は人間の act であり、しかも**移した先で読まれる
 * のは別のセッション**である ∴ 黙って動かせば、人間は自分の baton がどこへ行ったかを
 * 知らないまま次の対話を始める。述べて、コマンドを名指すところで止まる。
 */
async function legacyBatons(unitRoot) {
  const dir = legacyDir(unitRoot)
  let active = false
  try {
    active = (await stat(path.join(dir, ACTIVE))).isFile()
  } catch { /* 無い */ }
  let archived = []
  try {
    archived = (await readdir(path.join(dir, ARCHIVE))).filter((f) => f.endsWith('.md'))
  } catch { /* 無い */ }
  if (!active && archived.length === 0) return null
  return { dir, active, archived: archived.length }
}

/** 旧い置き場を新しい置き場へ移す。⚠ **上書きしない** —— 既に在るものを黙って潰さない。 */
async function migrate(unitRoot) {
  const found = await legacyBatons(unitRoot)
  if (!found) {
    say(`旧い置き場に baton は無い（${legacyDir(unitRoot)}）。移すものは何も無い。`)
    return 0
  }
  const dest = batonDir(unitRoot)
  await mkdir(archiveDir(unitRoot), { recursive: true })

  const moved = []
  const kept = []
  const move = async (from, to) => {
    try {
      await stat(to)
      kept.push(to) // ⚠ 既に在る ∴ 触らない。
      return
    } catch { /* 無い ∴ 移せる */ }
    await rename(from, to)
    moved.push(to)
  }
  if (found.active) await move(path.join(found.dir, ACTIVE), activePath(unitRoot))
  try {
    for (const f of await readdir(path.join(found.dir, ARCHIVE))) {
      if (f.endsWith('.md')) await move(path.join(found.dir, ARCHIVE, f), path.join(archiveDir(unitRoot), f))
    }
  } catch { /* archive が無い */ }

  say(`移した: ${moved.length} 本 -> ${dest}`)
  if (kept.length > 0) {
    say(`⚠ **移さなかった: ${kept.length} 本** —— 移動先に同じ名の file が既に在る。`)
    for (const k of kept) say(`  ${k}`)
  }
  say(
    '',
    `⚠ 旧い dir 自体は残してある（${found.dir}）—— **空でも消さない。**`,
    '人間の repo の中に在るものを、我々の都合で消さない。',
    '',
  )
  return 0
}

async function main() {
  const verb = process.argv[2] ?? 'read'
  const unit = await resolveUnit(process.cwd())

  if (verb === 'migrate') return await migrate(unit.root)

  // ⚠ **旧い置き場に取り残された baton は、黙って消えるのと同じである。** 新しい置き場だけを
  // 読む機構は、そこに何も無ければ「fresh start」と述べる ∴ **在るのに無いと報告する。**
  // 述べるのは read と write の両方である —— 書く側も、退避すべき旧 baton を見落とす。
  if (verb === 'read' || verb === 'write') {
    const legacy = await legacyBatons(unit.root)
    if (legacy) {
      say(
        `⚠ **旧い置き場に baton が残っている**（${legacy.dir}）—— active ${legacy.active ? 1 : 0} 本 / archive ${legacy.archived} 本。`,
        '**この機構はもうそこを読まない。** 移すには:',
        '',
        '    handoff.mjs migrate',
        '',
        '⚠ **移動は人間の act である** —— 我々は述べるところで止まる。',
        '',
      )
    }
  }

  if (verb === 'trace') {
    await trace(unit)
    return 0
  }

  if (verb === 'write') {
    const markdown = await readStdin()
    if (markdown.trim() === '') {
      process.stderr.write(
        'handoff write: stdin に何も無い。baton を著すのはあなたであり、それを pipe で渡す。\n' +
          'このコマンドは旧 baton を退避し、新しいものに刻印するだけである。\n',
      )
      return 2
    }
    const { path: p, archived } = await writeBaton(unit.root, markdown)
    say(`baton を書いた: ${p}`)
    say(archived ? `旧 baton を退避した: ${archived}` : '退避すべき旧 baton は無かった')
    say(
      '',
      '**何を残し何を省いたかを、1〜2 行で人間に報告すること。**',
      'それが「書く」の手順 3 であり、**baton の読み手が再構成できない唯一の部分**である。',
      '',
    )
    return 0
  }

  if (verb !== 'read') {
    process.stderr.write(`handoff: 未知の verb '${verb}'。使えるのは: read | write | trace | migrate\n`)
    return 2
  }

  // ── read: 手順 2〜4 ───────────────────────────────────────────────────────
  const baton = await readBaton(unit.root)
  if (!baton) {
    say(
      `\`${activePath(unit.root)}\` に baton は無い —— fresh start。`,
      '',
      '⚠ **空の baton は空の project ではない。** 拾うものが無いと報告する前に、open-todo の',
      '数を surface すること。',
      '',
    )
    await trace(unit)
    return 0
  }

  // ⚠ 手順 3 より先に手順 2。先に刻めば、報告すべき値を破壊してしまう。
  const stamp = await stampReadAt(unit.root)
  say(`baton: \`${baton.path}\``)
  if (baton.composedAt) say(`- composed-at: \`${baton.composedAt}\``)
  if (stamp?.previousReadAt) {
    say(
      `- **過去に \`${stamp.previousReadAt}\` に読まれている** —— これを 1 行で人間に`,
      '  述べること。⚠ **これは事実であって警告ではない**: 古い baton をあえて読ませたい場面は',
      '  ある。決して拒まず、確認も求めないこと。',
    )
  }
  const archive = await listArchive(unit.root)
  if (archive.length > 0) say(`- 退避済み baton ${archive.length} 件。最新は \`${archive[0]}\``)
  if (stamp && !stamp.stamped) {
    say('- ⚠ `read-at` を刻めなかった: この baton には、その直後に置くべき `composed-at:` 行が無い')
  }
  say('', '---', '', baton.text.trimEnd(), '', '---', '')
  await trace(unit)
  say(
    'このあと `Pointers` が名指す slug を読み、今どこに立っていて何を拾うかを報告すること。',
    'そこから作業を進める。',
    '',
  )
  return 0
}

let code = 0
try {
  code = await main()
} catch (err) {
  process.stderr.write(`handoff: ${err?.stack ?? err}\n`)
  code = 1
}
process.stdout.write(out.join('\n') + (out.length ? '\n' : ''))
process.exit(code)
