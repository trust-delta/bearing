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
//   DRIFT fence  安い機械検知が検査面を可視化する —— その上に何が在るかは判定しない
//   UNPUSHED     既に done だが、次に判断する人にまだ届いていない作業
//
// ⚠ **かつて BATON（前回どこで止まったか）が在った。** 2026-10-27、人間が handoff を
// 退役させ（`docs/aims/session-handoff.md`）、ここから外した。⚠ **session の記録だけは
// この hook が引き継いだ** —— 以前は UserPromptSubmit の hook が prompt ごとに書いていた。
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
import { resolveCwd, resolveUnit } from '../lib/unit.mjs'
import { gatherBacklog, renderAwaitingDeclarationFence } from '../lib/process.mjs'
import { gatherDrift, renderInterFence, renderIntraFence } from '../lib/drift.mjs'
import { gatherWorkingDelta, renderWorkingDeltaFence } from '../lib/working-delta.mjs'
import { gatherUnpushed, renderUnpushedFence } from '../lib/unpushed.mjs'
import { gatherAimCodeStale, renderAimCodeFence } from '../lib/aim-code.mjs'
import { corpusSignature, deltaStatePath, factsDigest } from '../lib/corpus-signature.mjs'
import {
  findBlocks, inspect as inspectBlock, loadDesired, substituteAims, declaredAimsDir,
  readDeclaration, isEngaged,
} from '../lib/claude-md.mjs'
import { DEFAULT_AIMS_DIR } from '../lib/corpus.mjs'
import { recordSession } from '../lib/unit-home.mjs'
import { humanLineOf, readStore, renderAimDbSection, summarizeStore, validateStore } from '../lib/aim-db.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'

// ⚠ **stdin を読む前に、ここが最初に走らねばならない。** 委譲は fd をそのまま子へ渡す
// （`stdio: 'inherit'`）ので、親が一度でも stdin を読めばその分は永久に失われる。
import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)


const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const out = []
const say = (...lines) => out.push(...lines)

// ⚠ **aim を採っていない project では、aim について 1 行も述べない。** 毎セッション「この
// project は aim を採っていない」と述べる機構こそ、人間が 2026-09-02 に user スコープを
// 外した理由そのものである。∴ 採用の印を読み、無ければ黙る。
//
// ⚠ **catch 節もこれを見る** —— composer が落ちた場面で frame だけを吐けば、黙ると決めた
// project に、失敗経路からだけ法が漏れる。
let aimEngaged = null

/**
 * この project が aim を採ったか、そして置かれた法が今の版か。
 *
 * ⚠ **印は `CLAUDE.md` の marker である**（`/bearing:setup-aim` が置く）。marker は HTML
 * コメント ∴ 消費者の context には乗らないが、**我々は file を読むので見える。**
 *
 * ⚠ **「今の法を組み立てられない」を「印が無い」に畳まない。** 畳めば、採用済みの project が
 * 生成の失敗をきっかけに黙る —— 沈黙が 2 つの別々の原因を持つ形は、この repo が一貫して
 * 拒んできたものである。
 *
 * @param {string} root unit root
 * @returns {Promise<{state: string, version: string|null, detail: string}>}
 */
async function readOptIn(root) {
  let text
  try {
    text = await readFile(path.join(root, 'CLAUDE.md'), 'utf8')
  } catch {
    return { state: 'absent', version: null, detail: 'CLAUDE.md が無いか読めない' }
  }
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) return { state: 'broken', version: null, detail: anomalies.join('。') }
  if (blocks.length === 0) return { state: 'absent', version: null, detail: 'block が無い' }
  try {
    // ⚠ **宣言された在り処から法を組み立てる。** 既定で組み立てれば、在り処を宣言した
    // project は**恒久的に「古い」と報告される** —— そして人間は、plugin を更新しても
    // 直らない理由を探すことになる。
    const declared = declaredAimsDir(text)
    return inspectBlock(text, await loadDesired(PLUGIN_ROOT, declared.dir ?? DEFAULT_AIMS_DIR))
  } catch (err) {
    return {
      state: 'unverifiable',
      version: blocks[0].version,
      detail: `今の法を組み立てられない: ${err?.message ?? err}`,
    }
  }
}

/** 常時効く規律。静的な text であり、binary を必要としたことは一度も無い。 */
async function frame(dir = DEFAULT_AIMS_DIR) {
  // 法の text は `templates/aim/frame.md` に住む —— **正本であって生成物ではない**
  // （2026-09-05 に `original/` は畳まれた）。
  // ⚠ **placeholder を埋めてから注入する。** `{{aims}}` を残したまま出せば、セッションは
  // 存在しない path を正本として読む —— そして placeholder は prose の中では意味ありげな
  // 記号にしか見えないので、誰も壊れたと気づかない。
  try {
    const raw = await readFile(path.join(PLUGIN_ROOT, 'templates', 'aim', 'frame.md'), 'utf8')
    return substituteAims(raw, dir)
  } catch {
    return null
  }
}

/** repo ごとの事実。⚠ **どの失敗も、失敗したと述べる fence へ degrade する。** */
async function repoFacts(repo) {
  // ⚠ **在り処は repo ごとに違いうる** ∴ ここで既定へ落とさない。
  const dir = repo.aimsDir ?? DEFAULT_AIMS_DIR
  const slugs = await readAimSlugs(repo.root, dir)
  const head = (await runGit(repo.root, ['rev-parse', '--short', 'HEAD']))?.trim() ?? null
  // ⚠ **人間の決定と解釈の記録は、`docs/aims/` の有無と独立に読む**（2026-10-29）—— 本文を退かせた
  // repo でも、記録が在れば届けねばならない。
  const aimDb = await readStore(repo.root).catch(() => null)
  if (slugs.length === 0) {
    return { ...repo, head, slugs, corpus: false, aimDb }
  }
  const graph = await readAimGraph(repo.root, dir)
  // ⚠ **記録を持つ repo（試行）では、剥離の検知を回さない**（人間の決定 2026-10-29、`bearing-x08`）——
  // 本文の `[done]` mark は凍結した ∴ 引いても意味を失った候補が増えるだけである。
  const aimCodeStopped = Boolean(aimDb?.present)
  const [drift, working, unpushed, aimCode] = await Promise.all([
    gatherDrift(repo.root, dir),
    gatherWorkingDelta(repo.root, slugs, dir),
    gatherUnpushed(repo.root, slugs, dir),
    aimCodeStopped ? null : gatherAimCodeStale(repo.root, graph?.nodes ?? new Map(), dir),
  ])
  const backlog = await gatherBacklog(repo.root, dir)
  return { ...repo, head, slugs, corpus: true, drift, working, unpushed, aimCode, aimCodeStopped, backlog, aimDb }
}

/** 人間の決定と解釈の記録を、要約として述べる。記録の無い repo では何も言わない。 */
function sayAimDb(r) {
  if (!r.aimDb?.present) return
  say('#### 人間の決定とエージェントの解釈（`docs/aim-db/`）', '')
  // ⚠ **人間はこの context を見ない** ∴ 件数は、エージェントが会話で言わなければ人間に届かない（試行
  // 2026-10-29、`bearing-x13`）。hook の `systemMessage` で直接見せる案は、Desktop に表示されなかった
  // （人間の観測 2026-10-29、PostToolBatch で測った）∴ 渡し先をエージェントにして、伝えることを法で課す。
  say(`🔴 **最初の返答で、次の 1 行をそのまま人間に伝えること**（中身は「aim を見たい」と頼まれたら、記録を写したページを出す）:`, '',
      `> ${humanLineOf(r.aimDb, { label: r.label })}`, '')
  say(renderAimDbSection(summarizeStore(r.aimDb.store), {
    problems: validateStore(r.aimDb.store),
    unreadable: r.aimDb.unreadable,
  }).trimEnd(), '')
}

function renderRepo(r) {
  const role = r.primary ? ', primary' : ''
  say(`### ${r.label} (\`${r.root}\`${role}) · git HEAD ${r.head ?? 'unknown'}`, '')
  if (!r.corpus) {
    // ⚠ **どこを見たかを言う。** 言わなければ、在り処の宣言を誤った repo で、**設定の
    // 誤りが健康証明として読まれる。**
    say(`*この repo に \`${r.aimsDir}/\` は無い —— corpus を採っていない。これは構造的に*`,
        '*正常な状態であって、欠陥ではない。*', '')
    sayAimDb(r)
    return
  }
  if (r.drift === null) {
    say('```bearing-drift-intra v1', '# unavailable — この repo の git を読めなかった。',
        '# ⚠ clean ではなく「不在」である: これを「drift 無し」と読まないこと。', '```', '')
  } else {
    say(renderIntraFence(r.drift.intra, r.drift.scanned?.intra ?? null).trimEnd(), '')
    say(
      renderInterFence(
        r.drift.inter,
        r.drift.brokenCollations,
        r.drift.scanned?.inter ?? null,
        r.drift.legacyCollations,
      ).trimEnd(),
      '',
    )
  }
  say(renderWorkingDeltaFence(r.working).trimEnd(), '')
  say(renderUnpushedFence(r.unpushed).trimEnd(), '')
  say(renderAimCodeFence(r.aimCode, { stopped: r.aimCodeStopped }).trimEnd(), '')
  sayAimDb(r)
}

async function main(input) {
  // ⚠ **他の 4 面と同じ解決を通る。** ここだけ `process.cwd()` を直に読んでいた ∴
  // agent が `cd` した先を unit と読み、**同じセッションの同じ瞬間に、面ごとに別の
  // corpus を見る形**が実在していた（`lib/unit.mjs` の `resolveCwd`）。
  const cwd = resolveCwd(input)
  const unit = await resolveUnit(cwd)

  // 🔴 **session の記録は採用の gate より前に置く。** ⚠ **これは aim の機構ではなく帳簿で
  // ある** —— aim を採らない消費者もこの記録で数えている（`lib/unit-home.mjs`）。失敗しても
  // 黙る: 帳簿の bug でセッションの開始を妨げない。
  try {
    await recordSession(unit.root, input?.session_id)
  } catch {
    // 記録できないことは、facts を止める理由にならない。
  }

  const repos = []
  for (const repo of unit.repos) repos.push(await repoFacts(repo))

  const withCorpus = repos.filter((r) => r.corpus)

  // ── この project は aim を採ったか ────────────────────────────────────────
  // ⚠ **corpus が在ることは採用ではない。** `docs/aims/` は*使っている証拠*であって、この
  // 機構を通したいという宣言ではない —— 共同開発の repo で、team が採っていない機構が黙って
  // 喋る形になる（人間の決定 2026-09-05、`docs/aims/adoption-declaration.md`）。
  const optIn = await readOptIn(unit.root)
  // ⚠ **述語は `lib/claude-md.mjs` の `isEngaged` 1 箇所である** —— ここで組み直せば、
  // statusline との間に 2 つ目の結論が生まれる（2026-09-03 に実際に食い違った形）。
  const declaration = await readDeclaration(unit.root)
  aimEngaged = isEngaged(declaration)

  // ⚠ **採っていない project では 1 byte も出さない。** かつては未読の baton だけが例外
  // だったが、handoff の退役（2026-10-27）で例外は無くなった。
  if (!aimEngaged) return { unit, repos: withCorpus }

  // ⚠ **frame は unit に 1 つ ∴ primary の在り処で埋める。** repo ごとに違う場合、
  // 各 repo の事実の側が自分の在り処を述べる —— 法は 1 つ、事実は repo ごと。
  const f = await frame(repos[0]?.aimsDir ?? DEFAULT_AIMS_DIR)
  if (f) say(f.trimEnd(), '', '---', '')
  // 🔴 **`docs/aim-db/` を持つ repo は、本文から数える残務・宣言待ち・判断待ち・観測を出さない**（人間の
  // 決定 2026-10-29: 記録を一本化し、`[todo]` と観測の票は持たない —— `bearing-x03`〜`x05`）。⚠ **持たない
  // repo の数は今のまま** —— 試行はこの repo だけで行う（`bearing-x06`）∴ 挙動の変化を記録の有無で閉じる。
  const legacy = withCorpus.filter((r) => !r.aimDb?.present)
  const trial = withCorpus.filter((r) => r.aimDb?.present)
  const openTodo = legacy.reduce((n, r) => n + r.backlog.openTodoNodes, 0)
  const escalation = legacy.reduce((n, r) => n + (r.backlog.escalationNodes?.length ?? 0), 0)
  const anomalies = legacy.flatMap((r) =>
    r.backlog.anomalies.map((a) => ({ repo: r.label, ...a })),
  )
  const unknown = legacy.flatMap((r) =>
    r.backlog.unknownNodes.map((slug) => `${r.label}/${slug}`),
  )
  const emptyEscalation = legacy.flatMap((r) =>
    (r.backlog.escalationEmptyNodes ?? []).map((slug) => `${r.label}/${slug}`),
  )
  const observation = legacy.reduce((n, r) => n + (r.backlog.observationNodes?.length ?? 0), 0)
  const emptyObservation = legacy.flatMap((r) =>
    (r.backlog.observationEmptyNodes ?? []).map((slug) => `${r.label}/${slug}`),
  )
  // ⚠ unit を横断して 1 枚に畳む。repo ごとに割ると、**番が渡っている node の総数**という
  // 唯一意味のある読み方が失われる —— 観測するのは人間であって、repo ではない。
  const awaiting = legacy.flatMap((r) =>
    (r.backlog.awaitingNodes ?? []).map((a) => ({
      ...a,
      slug: legacy.length > 1 ? `${r.label}/${a.slug}` : a.slug,
    })),
  )
  say(`# aim facts —— unit: ${unit.name} —— 構成時刻 ${new Date().toISOString()}`)
  say(
    `> repo ${repos.length} 個、うち corpus を持つもの ${withCorpus.length} 個`,
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
    // ⚠ **ここに立つのは「採用済みだが corpus が空」の project だけである。** 採っていない
    // project は上の gate で既に返っている ∴ **「まだ採っていない」を述べる分岐をここに
    // 置いてはならない** —— 到達しない分岐は、扱えているという嘘である。
    say(
      '⚠ **この project は aim を採用済みだが、`docs/aims/` はまだ空である**（`CLAUDE.md` に',
      '法の block が在る）。∴ ここで作業が始まるなら、最初の手段が実装される前に最初の',
      'aim node が作られる。⚠ **`aim:` を書くのは人間である** —— 候補を出し、確定を待て。',
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

  // ── 置かれた法の版 ────────────────────────────────────────────────────────
  // ⚠ **block は複製である ∴ 版の門が 1 つ増える**（`~/.claude/` の statusline shim と
  // 同じ構造）。⚠ **古い複製は正常に動いて見える** ∴ 面に出さなければ誰も気づかない。
  if (optIn.state === 'stale') {
    say(
      `⚠ **CLAUDE.md に置かれた法の block が古い** —— ${optIn.detail}。`,
      '`/bearing:setup-aim` で置き直せる。⚠ **古い複製は正常に動いて見える** ∴ 今この',
      'セッションが読んでいる法は、この plugin の今の法ではない。',
      '',
    )
  } else if (optIn.state === 'edited') {
    say(
      '⚠ **`CLAUDE.md` の法の block に、人間が手を入れている**（本文が marker の sha と',
      '一致しない）。⚠ **置き直せばその編集が消える** ∴ 機構は触らない —— どうするかは',
      '人間が決める。',
      '',
    )
  }

  // ⚠ **扱えない在り処の宣言を、既定として黙って動かさない。** 人間は自分の宣言が効いて
  // いると信じ続けることになる。
  for (const r of repos.filter((x) => x.aimsDirProblem)) {
    say(`⚠ **${r.label} の在り処の宣言を読めない** —— ${r.aimsDirProblem}。`,
        `既定（\`${DEFAULT_AIMS_DIR}/\`）を見ている。`, '')
  }

  if (optIn.state === 'broken' || optIn.state === 'unverifiable') {
    say(
      `⚠ **CLAUDE.md の法の block を読めない** —— ${optIn.detail}。これは「block が無い」`,
      'とは別である: **壊れた記録は、無い記録より声が大きい。**',
      '',
    )
  }

  // ── repo ごとの aim 事実 ──────────────────────────────────────────────────
  say('## Aim corpus', '')
  if (withCorpus.length === 0) {
    say(
      `*この unit のどの repo も宣言された在り処に corpus を持たない（` +
        `${[...new Set(repos.map((r) => r.aimsDir))].join('、')}）。*`,
      '',
    )
  } else {
    for (const r of repos) renderRepo(r)
  }

  // ── forward backlog ───────────────────────────────────────────────────────
  if (trial.length > 0) {
    say(
      `${trial.map((r) => r.label).join('、')} は記録を \`docs/aim-db/\` に一本化している（試行）∴ 本文から数える`,
      'open-todo・宣言待ち・escalation・observation は出さない。**人間の判断待ちは、上の「問い」を見ること。**',
      '',
    )
  }
  if (legacy.length > 0) {
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
    say(renderAwaitingDeclarationFence(awaiting).trimEnd(), '')
    if (awaiting.length > 0) {
      say(
        '⚠ **上の node はエージェントが尽くしている ∴ 残っているのは人間の観測と',
        '`state:` の宣言だけである。** これは「終わった aim」の一覧ではない —— **満足したか',
        'どうかを述べられるのは人間だけであり、この一覧はそれを一切先取りしない。**',
        '',
      )
      // ⚠ **番だけを渡して材料を渡していない行を名指す。** これは triage ではない ——
      // どれを先にやれとも、どれが重いとも述べていない。**述べているのは「この node は
      // 人間に見るべきものを 1 つも渡していない」という corpus の欠陥の所在だけ**である。
      const blind = awaiting.filter((a) => !(a.observations > 0))
      if (blind.length > 0) {
        say(
          `⚠ **うち ${blind.length} 件は \`# OBSERVATION\` の票を 1 枚も持たない**: ` +
            blind.map((a) => a.slug).join(', '),
          '**番は渡っているが、何を見れば満たされたと言えるかが書かれていない** ∴ 人間は',
          'node を頭から読み直すしかない。⚠ **これは人間の読み落としではなく corpus の欠陥で**',
          '**あり、票を書くのはエージェントの仕事である。**',
          '',
        )
      }
    }
    // ⚠ **同じ視野に置く 3 つ目。** 正本は「観測を可能にする作業は PROCESS、判断そのものは
    // ESCALATION、そして観測と宣言は人間」と分けている ∴ **上の 2 つだけを出す面は、その
    // 分割の 3 分の 1 を黙って落とす** —— そして落ちるのは「人間が判断しなければ誰も進めない」
    // という、最も動かない側である。
    say(
      `**escalation: ${escalation}** —— \`# ESCALATION\` に中身を持つ aim node の数`,
      '（`state: dead` は除く）。1 node につき 1 回数える。**「Go だけでは進めない ＝ 人間の',
      '判断が要る」点だけがそこに書かれる** ∴ ⚠ **この数は「エージェントが自力で進めない」',
      'ものを数えており、`open-todo` とは別の側にある。**',
      '',
      '**この数も surface せよ。triage も ranking も、どれから片付けるべきかの提案もするな。**',
      '⚠ **どの数がより重いかを述べることは、注意予算の割り当てであって観測ではない。**',
      '',
    )
    if (emptyEscalation.length > 0) {
      // ⚠ 見出しだけ在って中身が無い節。**上の数には入っていない** —— 読みに行っても何も
      // 書かれていないものを「人間待ち」として数えれば、数は権威のまま別のものを数える。
      // だが黙って落とすのも同じ嘘であり、`# PROCESS` の `unknown` と同じく名指す。
      say(
        `⚠ **\`# ESCALATION\` 見出しを持つが中身が空の node が ${emptyEscalation.length} 件**: ` +
          emptyEscalation.join(', '),
        '**上の数には入っていない。** 節を書き始めて止めたのか、既決を IS へ畳んだ後の残骸か',
        'は、ここからは分からない —— どちらであるかを決めるのは、その node を読む者である。',
        '',
      )
    }
    // ⚠ **`escalation` の直後に置く。** 2 つは「番」と「材料」で対になっており、離せば
    // 「誰の番か」だけが読まれて「渡す材料が在るか」が落ちる。
    say(
      `**observation: ${observation}** —— \`# OBSERVATION\` に中身を持つ aim node の数`,
      '（`state: dead` は除く）。1 node につき 1 回数える。**「人間が何を見れば、この aim が',
      '満たされたと言えるか」だけがそこに書かれる** ∴ ⚠ **この数は「番」ではなく**',
      '**「材料」を数えており、上の 2 つとは別の軸にある。** 票の枚数を運ぶのは上の fence の',
      '`observations` 列だけである。',
      '',
      '**この数も surface せよ。triage も ranking も、どれから書くべきかの提案もするな。**',
      '',
    )
    if (emptyObservation.length > 0) {
      say(
        `⚠ **\`# OBSERVATION\` 見出しを持つが中身が空の node が ${emptyObservation.length} 件**: ` +
          emptyObservation.join(', '),
        '**上の数には入っていない。** `# ESCALATION` の空見出しと同じ法である —— 読みに行っても',
        '何も書かれていないものを「材料が在る」として数えない。だが黙って落としもしない。',
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

  // ⚠ **canon の在否はもう述べない**（人間の決定 2026-09-05）。aim skill は `setup-aim` が
  // `.claude/skills/aim/` へ置き、置いた後はその repo のものである —— 在るか、直されたか、
  // 消されたかは repo の policy であって、hook が毎セッション検める対象ではない。
  // 人間に向けた 1 行。delta の hook が「前に伝えたものと違うか」を比べるために、baseline へ播く。
  const human = repos.map((r) => humanLineOf(r.aimDb, { label: r.label })).filter(Boolean)
  return { unit, repos: withCorpus, human }
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
async function seedDeltaBaseline(unit, sessionId, repos, shown = '') {
  if (!unit || !sessionId) return
  try {
    const { sig, heads } = await corpusSignature(unit)
    if (sig === null) return
    const file = deltaStatePath(sessionId)
    mkdirSync(path.dirname(file), { recursive: true })
    // digest は `main()` が既に集めた事実から作る —— ⚠ **composer は二度払ってはならず、
    // 両側が「事実」の意味について一致していなければならない。**
    // ⚠ `shown` は人間に見せた 1 行である —— delta の hook は、これと違うときだけ人間へ言い直す。
    writeFileSync(file, JSON.stringify({ sig, heads, facts: factsDigest(repos ?? []), shown }), 'utf8')
  } catch (err) {
    process.stderr.write(`bearing: delta の baseline を播けなかった: ${err?.message ?? err}\n`)
  }
}

const hookInput = readHookInput()

let composed = null
try {
  // ⚠ **ここで stdin を待つ。** 読み始めは `main()` より前であり、⚠ **待ちの上限は
  // 変わらない** —— 下段の `await hookInput` が、どの経路でも同じ待ちを既に払っている。
  // 失うのは git 作業との重なり（数十 ms）だけで、得るのは面 5 つの解決の一致である。
  composed = await main(await hookInput)
  // ⚠ **空なら 1 byte も書かない。** 裸の改行 1 つでも、それは「aim を採っていない
  // project では黙る」を破っている —— 黙るとは、出力が短いことではない。
  if (out.length > 0) process.stdout.write(out.join('\n') + '\n')
} catch (err) {
  // 規則 1。ここで何が起きようと、セッションは開始しなければならない。
  //
  // ⚠ **aim を採っていないと分かっている project へは、ここでも何も述べない。** 失敗経路
  // だけが法を吐けば、黙ると決めた repo に、最も説明のつかない形で 2KB が現れる。
  // ⚠ **まだ分かっていない（null）なら述べる** —— 不明を沈黙へ倒すのは、この file が
  // 規則 2 で禁じている degrade そのものである。
  if (aimEngaged !== false) {
    const f = await frame()
    if (f) process.stdout.write(f.trimEnd() + '\n\n---\n\n')
    process.stdout.write(
      '⚠ **このセッションでは aim facts が計算されなかった** —— composer が失敗した。\n' +
        'clean ではなく「不在」である: この沈黙を「拾うものが無い」と読まないこと。\n',
    )
  }
  process.stderr.write(`bearing: composer が失敗した: ${err?.stack ?? err}\n`)
}
await seedDeltaBaseline(composed?.unit, (await hookInput).session_id, composed?.repos, (composed?.human ?? []).join('\n'))
process.exit(0)
