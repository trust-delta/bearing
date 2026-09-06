#!/usr/bin/env node
// CI の状態を採って置く —— **statusline の外で走る側**。
//
// 🔴 **面はこれを呼ばない。** statusline は assistant message ごとに走り debounce で殺される
// ∴ そこから `gh` を起こせば子が宙に浮き、rate limit も踏む（`lib/ci.mjs` の冒頭）。
// ここは人間（`/bearing:ci`）か hook が打つ側であり、**面は置かれた JSON を読むだけ**である。
//
// ⚠ **採れなかったことを「CI が無い」に畳まない** —— `gh` の不在も、認証の不在も、
// run が 1 本も無いことも、それぞれ別の事実として置かれる。
//
// 🔴 **見るのは「間近に走った commit の run を全て」である**（`lib/ci.mjs`）—— 1 度の push で
// 走る workflow は 1 本とは限らず、**1 本だけ読めば「全部通ったか」に答えられない。**

import { probeCi, writeCi } from '../lib/ci.mjs'
import { resolveUnit } from '../lib/unit.mjs'
import { runGit } from '../lib/git.mjs'

const unit = await resolveUnit(process.cwd())
const repo = unit.repos.find((r) => r.primary) ?? unit.repos[0]
if (!repo) {
  process.stdout.write('この cwd 以下に git repository が無い ∴ CI は採れない。\n')
  process.exit(0)
}

// ⚠ **branch は「今どこで作業しているか」である** ∴ unit root ではなく repo から取る。
const branch = (await runGit(repo.root, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() || null
const probe = await probeCi(repo.root, branch)
const placed = await writeCi(unit.root, branch, probe)

// ⚠ **内訳を必ず出す。** 面に置けるのは 1 語だが、**ここを読むのは会話の中の人間と
// エージェントである** —— 「全部通ったか」を答えるには、何本を見たかが要る。
const lines = (probe.workflows ?? []).map(
  (w) => `  - ${w.name}: ${w.status}${w.conclusion ? ` / ${w.conclusion}` : ''}`,
)

process.stdout.write(
  `CI を採った: ${placed.path}\n` +
    `- branch: ${branch ?? '(読めない)'}\n` +
    (probe.headSha ? `- 間近に走った commit: ${probe.headSha.slice(0, 8)}\n` : '') +
    `- 状態: ${probe.state}${probe.conclusion ? ` / ${probe.conclusion}` : ''}` +
    `${probe.workflow ? ` (${probe.workflow})` : ''}\n` +
    (lines.length ? `- 見た run ${lines.length} 本:\n${lines.join('\n')}\n` : '') +
    (probe.reason ? `- ⚠ 採れなかった理由: ${probe.reason}\n` : ''),
)
process.exit(0)
