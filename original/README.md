# `original/` — 配布する規律の正本

**この directory が、plugin が運ぶ規律の正本を持つ。** corpus（`docs/aims/*.md`）が *この project の目的*を持つのに対し、ここは *目的をどう書き、どう保ち、どう引き継ぐか*を持つ。∴ **corpus が入れ替わってもここは変わらない。**

⚠ **ここは bearing にしか存在しない。** 出荷も配置もされない ∴ 「実体は `original/` にある」は、消費者の repo から見ても真である。

## 配布機能の単位で切る

| 単位 | 正本 | 生成先（`carriers/claude/bearing/`） |
| :-- | :-- | :-- |
| `aim/` | `SKILL.md`・`aim-authoring.md`・`aim-facts.md`・`frame.md`・`setup-aim.md` | `templates/aim/`（前 4 枚）・`commands/setup-aim.md` |
| `handoff/` | `SKILL.md`・`read.md`・`write.md` | `skills/handoff/` |
| `statusline/` | `setup-statusline.md` | `commands/setup-statusline.md` |

⚠ **aim の規律は plugin の skill として載らない。** `templates/aim/` は `setup-aim` が消費者の `.claude/skills/aim/` へ置くための template であり、Claude Code の skill 一覧には出ない。**aim の規律は project ごとに置かれるものであって、user scope に住むものではない**（`docs/aims/adoption-declaration.md`）。⚠ **`frame.md` は置かれない** —— `CLAUDE.md` の法の block と SessionStart hook が運ぶ ∴ 置けば同じ 6 箇条が 3 箇所に住む。

⚠ **handoff は plugin の skill として載る。** baton は repo に痕跡を残さない ∴ 宣言を要求せず、どの project でも `/bearing:handoff r` / `w` で使える。

## 置いた後は、その repo のものである

`setup-aim` が置く `CLAUDE.md` の block と `.claude/skills/aim/` は、**置いた瞬間からその repo のものである。** track するか・直すか・古いままにするか・clone した誰もが読めるようにするか —— すべて repo の policy であって、plugin は関与しない。⚠ **plugin は置いたものを追随させない。追随しないことは中立である**（人間の決定 2026-09-05）。block だけは版と本文 sha を marker に持つので、`setup-aim` を打ち直せば置き直せる —— **人間が block の中を編集していれば置き直さず止まる。**

⚠ **以前は `docs/aims/_guide/` に在った。** あそこは bearing の build の源でありながら bearing 自身の消費者側 canon でもあり、**同じ dir が 2 つの役を持っていたことが、複製の矢印が消費者から見て逆を向く原因だった** —— 経緯と測って出た形は `docs/aims/adoption-declaration.md` の `# HISTORY` に在る。

## 出荷される file は corpus を参照してはならない

carrier として生成・同梱される file は、corpus を持たない場所へも届く。∴ **corpus 内部への `[[slug]]` cross-ref を持ってはならない** —— 届いた先にその node は存在せず、参照は必ず宙に浮く。

⚠ **これは行儀の問題ではなく、センサーの問題である。** 解決しない参照は「読むべき何かがある」と告げながら何処も指さない ＝ 読み手を無い情報の探索へ送る。この README 以外の全枚が **0 件**で、これは実測して維持する不変である。

**方法論の正当化は、この directory の中で閉じること。** 「なぜこの規約なのか」を corpus の node へ委ねると、出荷した瞬間に説明が欠ける。

## carrier の生成

```
gen/claude-plugin.sh
```

⚠ **生成物を手で編集しない。** 次の生成で消える。実体は常にここにある。**生成は純粋な複製であり、substitution も合成も無い** —— 正本の text がそのまま carrier に載る。CI が再生成して diff を取る（`carriers-in-sync`）。

⚠ **carrier は必ず、それが名指す道具のコマンドを載せること。** 誰も名指さない道具は誰も走らせない道具であり、儀式は手作業に戻る。
