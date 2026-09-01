---
name: aim
description: aim corpus（docs/aims/）—— この project を駆動する purpose＝means の木 —— を読み・書き・保守する方法。aim node を読む／作る／編集する前、boot 時の drift / unpushed / checkpoint-stale の record が slug を名指したとき、open todo やこの project が何のためかを問われたとき、あるいは repository にまだ aim corpus が無く設置すべきときに使う。
---

# aim

`docs/aims/<slug>.md` の各ファイルが 1 つの **aim**（目的とその手段）であり、親子で目的を分解した木を成す。

**aim の作成と保守の正本は `producer-guide.md`。aim に触れる前に読むこと。** slug の付け方・body の section・木の保守・drift の検出と修復は、そこが唯一の source である。⚠ この repo に `docs/aims/_guide/` が無い場合、**設置は operator の act である** —— plugin は不在を surface するところで止まり、自分では置かない。この skill には正本が同梱されているので、置かれるまではそれを読むこと。⚠ **multi-repo wrapper が cwd の場合、guide は member repo の側にある** —— cwd 直下を見て無いと決めつけないこと。

**セッション開始時に注入される事実の読み方の正本は `aim-facts.md`。** fence の schema、各 fence が課すもの、open-todo 数の扱い、`# PROCESS` の機械 parse 形、CLI —— これらを知る必要が出たらそこを読む。⚠ **fence を parse せよ。prose を scrape するな。**

常時効く不変（frontmatter は人間のもの・body はあなたのもの 等）は `frame.md` にあり、通常はセッション開始時に自動で注入されている（plugin の SessionStart hook、または vendor ファイルの import）。**ここには複製しない** —— 同じ規則が context に二度入ることになり、しかも複製した側が先に古くなる。

⚠ **この file は生成物である**（`gen/claude-plugin.sh`）。手で編集しても次の生成で消える —— 実体は `docs/aims/_guide/` にある。
