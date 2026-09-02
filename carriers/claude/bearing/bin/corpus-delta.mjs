#!/usr/bin/env node
// 陳腐化の trigger —— boot 時の snapshot を、セッション途中でも正直に保つ。
//
// 「事実が動いた」の導出は `lib/corpus-signature.mjs` が持つ（前提の引用もそちら）。
//
// ═══ なぜ PostToolBatch なのか ══════════════════════════════════════════════
//
// SessionStart の composer は snapshot である。corpus を編集してから作業を続けるセッション
// は、開始時点で真だった数を抱えている —— ⚠ **陳腐化した数は、数が無いことより悪い。
// それでも権威に見えるからである。**
//
// ⚠ **これは tool である必要が無い。** ここに MCP server を置く論拠は、trigger ——「今 aim
// を編集した」—— がエージェントにしか分からない事実であり ∴ 体制は告げるのではなく尋ねる
// しかない、というものだった。**それは誤りである**: ハーネスは tool 呼び出しの batch が解決
// した時点を知っており、git はそれが tree に何をしたかを知っている。`PostToolBatch` は batch
// につきちょうど一度、**次の model 要求の前に**発火し、`additionalContext` を注入できる。
// ∴ push 側は発火点を持ち、**事実が選択肢に成り下がる必要は一度も無い。**
//
// ⚠ **この区別は様式ではなく荷重を負っている。** 体制が発火させる hook はセッションに
// **負われている**が、tool はセッションに**差し出されている**にすぎない。**一度も呼ばれない
// tool は、セッションの内側からは、存在しない tool と区別がつかない** —— そして「見ないこと」
// 自体が 1 つの評価である以上、open-todo の数を tool へ移すことは、規律がエージェントから
// 差し控えているまさにその judgment を、**省略の姿に偽装して**手渡すことになる。
//
// ═══ 3 つの門、安い順 ══════════════════════════════════════════════════════
//
// この unit で実測（2 repo・77 node）: signature は node の起動込みで約 40ms、working tree の
// 層が約 65ms、drift が約 169ms。⚠ これは model への各要求の前に走る ∴ **通常の場合は最初の
// 1 つしか払ってはならない。**
//
//   1. **signature** —— HEAD ＋ dirty な aim path の内容 hash。1 byte も動いていなければ
//      沈黙して exit。
//   2. **facts digest** —— working tree の層が**述べるであろうこと**。aim の body を編集する
//      ことはセッションが corpus に対して行う最も普通のことであり、**signature を動かす一方で
//      事実はすべて同一のまま**である。そのたびに変わらない報告を再注入することは、機械層を
//      *可視化*の位置に置く規律が排している雑音である: ⚠ **自分を繰り返す面は読まれなくなり、
//      そのとき本物の変化は、直前の 9 回と同じ顔をして到着する。**
//   3. **aim の commit** —— `docs/aims/` の上で HEAD が動けば boot 時の履歴 fence は誤りに
//      なる ∴ 再計算して本物を出す。commit 1 回につき 169ms 払うのは無であり、batch ごとに
//      払うのが問題なのである。
//
// ⚠ **1 つの不正確さを、隠さずに述べる**: `checkpoint-stale` の `commits_since` は**あらゆる**
// commit で動く（aim に一切触れないものを含む）が、ここはそれを再報告しない。あの fence は
// verdict ではなく**弱い経過の候補**であることを明言しており、boot 時の fence が既に slug を
// 名指している —— **カウンタが 1 進んだことを batch ごとに督促するのは、第 2 の門がまさに
// 防ぐために在る雑音である。**

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readAimGraph, readAimSlugs } from '../lib/corpus.mjs'
import { corpusSignature, deltaStatePath, factsDigest } from '../lib/corpus-signature.mjs'
import { renderCorpusDelta } from '../lib/corpus-delta.mjs'
import { gatherCheckpointStale, renderCheckpointFence } from '../lib/checkpoint.mjs'
import { gatherDrift, renderInterFence, renderIntraFence } from '../lib/drift.mjs'
import { runGit } from '../lib/git.mjs'
import { gatherBacklog } from '../lib/process.mjs'
import { gatherUnpushed, renderUnpushedFence } from '../lib/unpushed.mjs'
import { gatherWorkingDelta } from '../lib/working-delta.mjs'
import { resolveUnit } from '../lib/unit.mjs'

function readStdin() {
  return new Promise((resolve) => {
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (buf += c))
    process.stdin.on('end', () => resolve(buf))
    process.stdin.on('error', () => resolve(buf))
    // stdin が閉じない hook が、仕えるべきセッションを吊らせてはならない。
    setTimeout(() => resolve(buf), 2000).unref?.()
  })
}

function readState(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 2 つの commit の間で、いずれかの aim file が動いたか。
 *
 * ⚠ **`git log <a>..<b>` ではなく `git diff`。** baseline の sha は HEAD の祖先である必要が
 * なく（rebase、branch の切り替え）、**祖先関係でない範囲は「異なる」ではなく「空」として
 * 読まれる** —— 黙った false negative であり、この plugin が拒み続けている失敗そのもので
 * ある。
 *
 * ⚠ **`null` は git の失敗であって、git が「何も無い」と言ったのではない。** 動いたものと
 * 扱い、履歴 fence を「黙って新鮮だと仮定する」のではなく再計算させる。
 */
async function aimsMovedBetween(repoRoot, from, to) {
  if (!from || !to || from === to) return false
  const out = await runGit(repoRoot, ['diff', '--name-only', from, to, '--', 'docs/aims/'])
  if (out === null) return true
  return out.trim() !== ''
}

/** 1 つの repo について再計算した履歴層。⚠ どの失敗も「不在」として描画される。 */
async function historyFences(repo) {
  const graph = await readAimGraph(repo.root)
  const [drift, unpushed, checkpoint] = await Promise.all([
    gatherDrift(repo.root),
    gatherUnpushed(repo.root, repo.slugs),
    gatherCheckpointStale(repo.root, graph?.nodes ?? new Map()),
  ])
  const blocks = []
  if (drift === null) {
    blocks.push(
      '```bearing-drift-intra v1\n# unavailable — この repo の git を読めなかった。\n' +
        '# ⚠ clean ではなく「不在」である: これを「drift 無し」と読まないこと。\n```',
    )
  } else {
    blocks.push(renderIntraFence(drift.intra).trimEnd())
    blocks.push(renderInterFence(drift.inter, drift.brokenCollations).trimEnd())
  }
  blocks.push(renderUnpushedFence(unpushed).trimEnd())
  blocks.push(renderCheckpointFence(checkpoint).trimEnd())
  return blocks
}

const raw = await readStdin()
let input = {}
try {
  input = JSON.parse(raw || '{}')
} catch {
  process.exit(0)
}

try {
  const unit = await resolveUnit(input.cwd || process.cwd())
  const { sig, heads } = await corpusSignature(unit)
  // unit のどこにも corpus が無い: この project は規律を採ったことが無く、空の corpus を
  // 報告することは「人間が決めていないことを plugin が決める」ことになる。
  if (sig === null) process.exit(0)

  const file = deltaStatePath(input.session_id)
  const prev = existsSync(file) ? readState(file) : null

  // ── Gate 1 ────────────────────────────────────────────────────────────────
  if (prev && prev.sig === sig) process.exit(0)

  const repos = []
  for (const repo of unit.repos) {
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    repos.push({
      label: repo.label,
      root: repo.root,
      slugs,
      working: await gatherWorkingDelta(repo.root, slugs),
      backlog: await gatherBacklog(repo.root),
    })
  }

  const facts = factsDigest(repos)

  // ── 第 3 の門。第 2 の門が short-circuit する前に評価する ∴ たまたま変化していないよう
  //    に見える working tree のせいで commit が飲み込まれることが決して無い ────────
  const moved = []
  if (prev) {
    for (const r of repos) {
      const before = prev.heads?.[r.label]
      if (before === undefined || before === heads[r.label]) continue
      if (await aimsMovedBetween(r.root, before, heads[r.label])) {
        moved.push({ label: r.label, from: before, to: heads[r.label] })
      }
    }
  }

  // ── Gate 2 ────────────────────────────────────────────────────────────────
  if (prev && facts === prev.facts && moved.length === 0) {
    // byte は動いたが、その意味は動かなかった。新しい signature を記録し、次の batch が
    // ここを再び払わずに第 1 の門で止まるようにする。
    writeFileSync(file, JSON.stringify({ sig, heads, facts }), 'utf8')
    process.exit(0)
  }

  for (const m of moved) {
    m.blocks = await historyFences(repos.find((r) => r.label === m.label))
  }

  const body = renderCorpusDelta({ repos, moved, hadBaseline: Boolean(prev) })

  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ sig, heads, facts }), 'utf8')

  if (body) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolBatch',
          additionalContext: body,
        },
      }) + '\n',
    )
  }
} catch (err) {
  // ⚠ この hook の bug で turn を妨げることは決してしない。ここでの exit 2 は agentic loop
  // を丸ごと止めることになり、更新が 1 回落ちるより遥かに悪い。
  process.stderr.write(`bearing: corpus-delta hook が失敗した: ${err?.stack ?? err}\n`)
}
process.exit(0)
