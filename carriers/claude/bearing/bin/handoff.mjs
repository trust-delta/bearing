#!/usr/bin/env node
// handoff CLI —— baton 儀式のうち**帳簿である半分**。
//
// 手順と judgment は `handoff.md` が持つ。この file が持つのは、そのうち**純然たる機械で
// あり、手でやると間違えやすい 4 手順**である。それに値するのは「安さ」の前提による:
// ⚠ **儀式のコスト自体が標的である。** 高価な引き継ぎは、context が既に劣化するまで
// operator が先延ばしにする引き継ぎであり、それこそがこの方法全体が避けるために在る失敗
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
import { readAimSlugs } from '../lib/corpus.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherUnpushed } from '../lib/unpushed.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { listArchive, stampReadAt, writeBaton } from '../lib/handoff.mjs'
import { readBaton } from '../lib/baton.mjs'

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
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    const [working, unpushed] = await Promise.all([
      gatherWorkingDelta(repo.root, slugs),
      gatherUnpushed(repo.root, slugs),
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
  say('⚠ この trace が見るのは tracked な `docs/aims/` だけである。untracked なローカルの', '変化はここに現れえない —— baton 自身の言葉だけがその記録である。', '')
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

async function main() {
  const verb = process.argv[2] ?? 'read'
  const unit = await resolveUnit(process.cwd())

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
      '**何を残し何を省いたかを、1〜2 行で operator に報告すること。**',
      'それが「書く」の手順 3 であり、**baton の読み手が再構成できない唯一の部分**である。',
      '',
    )
    return 0
  }

  if (verb !== 'read') {
    process.stderr.write(`handoff: 未知の verb '${verb}'。使えるのは: read | write | trace\n`)
    return 2
  }

  // ── read: 手順 2〜4 ───────────────────────────────────────────────────────
  const baton = await readBaton(unit.root)
  if (!baton) {
    say(
      `\`${path.join(unit.root, '.handoff', 'active.md')}\` に baton は無い —— fresh start。`,
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
      `- **過去に \`${stamp.previousReadAt}\` に読まれている** —— これを 1 行で operator に`,
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
