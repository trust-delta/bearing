#!/usr/bin/env node
// この plugin の SessionStart composer —— セッションが手渡されるもの。
//
// ═══ 何が入り、なぜ入るのか ═══════════════════════════════════════════════════
//
// 各要素は規律の要求 1 つに答えている。⚠ **たまたま出すのが安かったから在るものは 1 つも
// 無い:**
//
//   FRAME        所有の分割は、利用可能な最も強い挿入経路でエージェントに届かねばならない。
//                さもなくばそれは単なる助言である
//   BATON        context がセッション境界を越えるのは**選ばれた**ときであって、切り詰めを
//                生き延びたときではない
//   DRIFT fence  安い機械検知が検査面を可視化する —— その上に何が在るかは判定しない
//   UNPUSHED     既に done だが、次に判断する人にまだ届いていない作業。baton は forward に
//                選ばれるゆえ、これを過少報告する
//   CHECKPOINT   目的は、それを実装した code から剥離しうる。その剥離は surface できねば
//                ならない
//   OPEN-TODO    未実装の手段が backlog である: **数は述べ、triage はしない**
//   AWAITING     エージェントが尽くした node は、体制が人間へ番を渡した瞬間である ——
//                その瞬間が可視化されなければ、誰も観測に来ない
//   UNIT         project は常に 1 repo とは限らない —— cwd から下方向に解決する
//   READINESS    git が無いのは新規 project、corpus が無いのは新規の取り付け
//   GUIDE 検査   canon は実際に在るか、さもなくば不在として報告されねばならない
//
// ═══ この file が決して破ってはならない 2 つの規則 ═══════════════════════════
//
// 1. **常に exit 0。** これは**あらゆる** project の**あらゆる**セッションの開始時に走る。
//    壊れた corpus・読めない repo・吊る git —— そのどれも、情報を与えるべき当のセッションを
//    妨げてはならない。
// 2. **観測できなかった事実は「不在」であって、決して捏造しない** —— そして**不在が clean と
//    して描画されてはならない。** どの fence も、自分が 2 つのどちらを述べているかを言う。
//
// ⚠ **stdout が注入される context そのものである。** 他の何もそこへ書いてはならない。

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readAimGraph, readAimSlugs } from '../lib/corpus.mjs'
import { runGit } from '../lib/git.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { gatherBacklog, renderAwaitingFence } from '../lib/process.mjs'
import { gatherDrift, renderInterFence, renderIntraFence } from '../lib/drift.mjs'
import { gatherWorkingDelta, renderWorkingDeltaFence } from '../lib/working-delta.mjs'
import { gatherUnpushed, renderUnpushedFence } from '../lib/unpushed.mjs'
import { gatherCheckpointStale, renderCheckpointFence } from '../lib/checkpoint.mjs'
import { corpusSignature, deltaStatePath, factsDigest } from '../lib/corpus-signature.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const out = []
const say = (...lines) => out.push(...lines)

/** 常時効く規律。静的な text であり、binary を必要としたことは一度も無い。 */
async function frame() {
  // `gen/claude-plugin.sh` が `aim` skill の傍らに同梱する。その複製が
  // `docs/aims/_guide/frame.md` と同期していることは CI が検査する。
  try {
    return await readFile(path.join(PLUGIN_ROOT, 'skills', 'aim', 'frame.md'), 'utf8')
  } catch {
    return null
  }
}

/** repo ごとの事実。⚠ **どの失敗も、失敗したと述べる fence へ degrade する。** */
async function repoFacts(repo) {
  const slugs = await readAimSlugs(repo.root)
  const head = (await runGit(repo.root, ['rev-parse', '--short', 'HEAD']))?.trim() ?? null
  if (slugs.length === 0) {
    return { ...repo, head, slugs, corpus: false }
  }
  const graph = await readAimGraph(repo.root)
  const [drift, working, unpushed, checkpoint] = await Promise.all([
    gatherDrift(repo.root),
    gatherWorkingDelta(repo.root, slugs),
    gatherUnpushed(repo.root, slugs),
    gatherCheckpointStale(repo.root, graph?.nodes ?? new Map()),
  ])
  const backlog = await gatherBacklog(repo.root)
  return { ...repo, head, slugs, corpus: true, drift, working, unpushed, checkpoint, backlog }
}

function renderRepo(r) {
  const role = r.primary ? ', primary' : ''
  say(`### ${r.label} (\`${r.root}\`${role}) · git HEAD ${r.head ?? 'unknown'}`, '')
  if (!r.corpus) {
    say('*この repo に `docs/aims/` は無い —— corpus を採っていない。これは構造的に正常な',
        '状態であって、欠陥ではない。*', '')
    return
  }
  if (r.drift === null) {
    say('```bearing-drift-intra v1', '# unavailable — この repo の git を読めなかった。',
        '# ⚠ clean ではなく「不在」である: これを「drift 無し」と読まないこと。', '```', '')
  } else {
    say(renderIntraFence(r.drift.intra).trimEnd(), '')
    say(renderInterFence(r.drift.inter).trimEnd(), '')
  }
  say(renderWorkingDeltaFence(r.working).trimEnd(), '')
  say(renderUnpushedFence(r.unpushed).trimEnd(), '')
  say(renderCheckpointFence(r.checkpoint).trimEnd(), '')
}

async function main() {
  const cwd = process.cwd()
  const f = await frame()
  if (f) say(f.trimEnd(), '', '---', '')

  const unit = await resolveUnit(cwd)
  const repos = []
  for (const repo of unit.repos) repos.push(await repoFacts(repo))

  const withCorpus = repos.filter((r) => r.corpus)
  const openTodo = withCorpus.reduce((n, r) => n + r.backlog.openTodoNodes, 0)
  const anomalies = withCorpus.flatMap((r) =>
    r.backlog.anomalies.map((a) => ({ repo: r.label, ...a })),
  )
  const unknown = withCorpus.flatMap((r) =>
    r.backlog.unknownNodes.map((slug) => `${r.label}/${slug}`),
  )
  // ⚠ unit を横断して 1 枚に畳む。repo ごとに割ると、**番が渡っている node の総数**という
  // 唯一意味のある読み方が失われる —— 観測するのは人間であって、repo ではない。
  const awaiting = withCorpus.flatMap((r) =>
    (r.backlog.awaitingNodes ?? []).map((a) => ({
      ...a,
      slug: withCorpus.length > 1 ? `${r.label}/${a.slug}` : a.slug,
    })),
  )
  const baton = await readBatonSafe(unit.root)

  say(`# aim facts —— unit: ${unit.name} —— 構成時刻 ${new Date().toISOString()}`)
  say(
    `> repo ${repos.length} 個、うち corpus を持つもの ${withCorpus.length} 個 · ` +
      `baton: ${baton ? 'あり' : 'なし'}`,
    '',
  )

  // ── boot 時の readiness ───────────────────────────────────────────────────
  // 2 つの不在を分けているのは、求められる act が違うからである: git が無いのは新規
  // project、git が在って corpus が無いのは、この規律がまだ取り付けられていない既存
  // project である。
  if (repos.length === 0) {
    say(
      '⚠ **この cwd 以下に git repository が無い。** これを**新規** project として扱うこと:',
      'ここで作業が始まるなら、最初の手段が実装される前に最初の aim node が作られる。',
      '',
    )
  } else if (withCorpus.length === 0) {
    say(
      '⚠ **git は在るが `docs/aims/` が無い。** これを、aim の規律をまだ採っていない**既存**',
      'project として扱うこと。⚠ **採用は人間の act であり、頼まれずにあなたが行うもの',
      'ではない** —— 選択肢を surface せよ。黙って設置するな。',
      '',
    )
  }
  if (unit.truncated) {
    say(
      `⚠ **repo の walk が切り詰められた（${unit.truncated} の上限）。** この unit の repo 一覧は`,
      '**不完全**である ∴ 以下の事実はすべて部分的である。報告する前にその旨を述べること。',
      '',
    )
  }

  // ── baton ─────────────────────────────────────────────────────────────────
  say('## ▶ 前回どこで止まったか', '')
  if (!baton) {
    say(
      '*`.handoff/active.md` に baton は無い —— これは fresh start である。*',
      '',
      '⚠ **空の baton は空の project ではない。** 拾うものが無いと結論する前に、下の',
      'backlog 数を読むこと。',
      '',
    )
  } else {
    say(
      `baton: \`${path.relative(unit.root, baton.path) || baton.path}\`` +
        (baton.composedAt ? ` · composed-at \`${baton.composedAt}\`` : '') +
        (baton.readAt ? ` · **read-at \`${baton.readAt}\`（既に一度読まれている）**` : ''),
      '',
      '**`_guide/handoff.md` § 読む の手順 2〜6 に従うこと** —— この hook は baton を surface',
      'したが `read-at` は**刻んでいない**。手順 4〜6（未 push aim の surface・pointers の',
      '読み込み・現在地の報告）はあなたの仕事である。',
      '',
      baton.text.trimEnd(),
      '',
    )
  }

  // ── repo ごとの aim 事実 ──────────────────────────────────────────────────
  say('## Aim corpus', '')
  if (withCorpus.length === 0) {
    say('*この unit のどの repo も `docs/aims/` を持たない。*', '')
  } else {
    for (const r of repos) renderRepo(r)
  }

  // ── forward backlog ───────────────────────────────────────────────────────
  if (withCorpus.length > 0) {
    say('## Forward backlog', '')
    say(
      `**open-todo: ${openTodo}** —— \`# PROCESS\` に \`[todo]\` mark を 1 つ以上持つ aim node`,
      'の数（`state: dead` は除く）。1 node につき 1 回数える。',
      '',
      '**この数は surface せよ。triage も ranking も、どれをやるべきかの提案もするな ——**',
      '**拾うものを選ぶのは人間の act である。**',
      '',
    )
    // ⚠ **open-todo の直後に置く。** 数が 0 でも「番が人間へ渡っている」ことが
    // 同じ視野に入らねばならない —— 離せば、0 が「何も残っていない」と読まれる。
    say(renderAwaitingFence(awaiting).trimEnd(), '')
    if (awaiting.length > 0) {
      say(
        '⚠ **上の node はエージェントが尽くしている ∴ 残っているのは人間の観測と',
        '`state:` の宣言だけである。** これは「終わった aim」の一覧ではない —— **満足したか',
        'どうかを述べられるのは人間だけであり、この一覧はそれを一切先取りしない。**',
        '',
      )
    }
    if (anomalies.length > 0) {
      // corpus が、自ら観測された記法から逸脱した。黙って吸収もせず、黙って無視もしない:
      // ⚠ この parser が数えなかった mark は、誰も注意を払っていない todo である。
      say(
        `⚠ **PROCESS 記法の anomaly が ${anomalies.length} 件** ——`,
        'これらの行は mark に見えるが corpus が使っている形ではない ∴ 上の数の**どこにも**',
        '数えられていない:',
        '',
      )
      for (const a of anomalies.slice(0, 20)) {
        say(`- \`${a.repo}\` **${a.slug}** (${a.kind}, ${a.no} 行目): ${a.line.slice(0, 100)}`)
      }
      if (anomalies.length > 20) say(`- … 他 ${anomalies.length - 20} 件`)
      say('')
    }
    if (unknown.length > 0) {
      // 進捗読み取りの 4 値のうち `unknown`: `# PROCESS` 見出しの下に読めるものが何も無い
      // 場合。⚠ これを「todo 無し」へ畳むことは、この層に禁じられている捏造された `done`
      // そのものである。
      say(
        `⚠ **${unknown.length} 個の node が、読める mark を 1 つも持たない \`# PROCESS\` 見出しを持つ。**`,
        'これらは done とも todo とも数えられていない —— `unknown` と読むこと。決して',
        '「やることが無い」と読まないこと:',
        '',
        unknown.map((u) => `\`${u}\``).join(', '),
        '',
      )
    }
  }

  // ── canon ─────────────────────────────────────────────────────────────────
  // canon はセッションが立っている場所から**到達可能**でなければならない。⚠ multi-repo の
  // unit では、canon は cwd ではなく member repo の側に在る。
  const guides = []
  for (const r of withCorpus) {
    const g = path.join(r.root, 'docs', 'aims', '_guide', 'aim-authoring.md')
    try {
      await readFile(g, 'utf8')
      guides.push(path.relative(unit.root, g) || g)
    } catch {
      /* 在らず */
    }
  }
  if (withCorpus.length > 0) {
    say('## canon', '')
    if (guides.length > 0) {
      say(`canon あり: ${guides.map((g) => `\`${g}\``).join('、')}。**aim node に触れる前に`,
          '読むこと。**', '')
    } else {
      say(
        '⚠ **この unit に `docs/aims/_guide/aim-authoring.md` が無い。** `aim` skill は canon の',
        '複製を同梱している —— それを使い、ここでの不在は人間に上げるべきこととして',
        '扱うこと。',
        '',
      )
    }
  }
  return { unit, repos: withCorpus }
}

async function readBatonSafe(unitRoot) {
  try {
    const { readBaton } = await import('../lib/baton.mjs')
    return await readBaton(unitRoot)
  } catch {
    return null
  }
}

/**
 * hook の入力を、composer を決して止めない形で読む。
 *
 * `main()` の前に開始し、後で await する ∴ 決して閉じない pipe があっても、事実の計算が
 * 既に費やした以上のコストはかからない。TTY の guard は、文書化された手作業の呼び出し
 * （unit directory で `node bin/aim-facts.mjs`）のためにある —— そこでは stdin は端末で
 * あり、そもそも閉じない。
 */
function readHookInput(ms = 1000) {
  if (process.stdin.isTTY) return Promise.resolve({})
  return new Promise((resolve) => {
    let buf = ''
    const done = () => {
      try {
        resolve(JSON.parse(buf || '{}'))
      } catch {
        resolve({})
      }
    }
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', done)
    process.stdin.on('error', done)
    setTimeout(done, ms).unref?.()
  })
}

/**
 * このセッションが何を告げられたかを記録する。⚠ そうすることで `bin/corpus-delta.mjs` が
 * 後から「corpus が足元で動いたか」を言えるようになる。
 *
 * ⚠ **構造として best-effort である。** baseline が無ければ delta hook は現在の corpus を
 * そのまま報告し、その旨を述べる —— 必要以上に声は大きいが、**決して沈黙しない**。
 * ∴ **ここでの失敗は雑音の方へ degrade するのであって、陳腐化した数を信じるセッションの方へ
 * degrade することは決して無い。**
 */
async function seedDeltaBaseline(unit, sessionId, repos) {
  if (!unit || !sessionId) return
  try {
    const { sig, heads } = await corpusSignature(unit)
    if (sig === null) return
    const file = deltaStatePath(sessionId)
    mkdirSync(path.dirname(file), { recursive: true })
    // digest は `main()` が既に集めた事実から作る —— ⚠ **composer は二度払ってはならず、
    // 両側が「事実」の意味について一致していなければならない。**
    writeFileSync(file, JSON.stringify({ sig, heads, facts: factsDigest(repos ?? []) }), 'utf8')
  } catch (err) {
    process.stderr.write(`bearing: delta の baseline を播けなかった: ${err?.message ?? err}\n`)
  }
}

const hookInput = readHookInput()

let composed = null
try {
  composed = await main()
  process.stdout.write(out.join('\n') + '\n')
} catch (err) {
  // 規則 1。ここで何が起きようと、セッションは開始しなければならない。
  const f = await frame()
  if (f) process.stdout.write(f.trimEnd() + '\n\n---\n\n')
  process.stdout.write(
    '⚠ **このセッションでは aim facts が計算されなかった** —— composer が失敗した。\n' +
      'clean ではなく「不在」である: この沈黙を「拾うものが無い」と読まないこと。\n',
  )
  process.stderr.write(`bearing: composer が失敗した: ${err?.stack ?? err}\n`)
}
await seedDeltaBaseline(composed?.unit, (await hookInput).session_id, composed?.repos)
process.exit(0)
