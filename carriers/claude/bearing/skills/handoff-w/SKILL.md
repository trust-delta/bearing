---
name: handoff-w
description: このセッションの baton（会話引き継ぎ）を authoring して .handoff/active.md に書き出す。context を使い切る前、あるいは区切りの良いところで実行する。
---

# handoff-w

手順の正本は **`handoff.md`** の「## 書く」節。**まずそれを読み、そこに書かれた通りに実行すること。**

**何を残し何を省くかの judgment があなたの仕事の全てであり**、それを機械に渡してはならない —— それが native な圧縮に欠けているものだからだ。⚠ **人間に見せて確認を得てから land すること。**

land だけは機械である（旧 baton の archive 退避 → `composed-at` の刻印 → 配置）:

```bash
bearing-handoff.mjs write < <あなたが著した baton>
```

⚠ `read-at` は書かない —— 新しい baton は「まだ読まれていない」が正で、この経路は書かれていても除去する。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。

⚠ **この file は生成物である**（`gen/claude-plugin.sh`）。手で編集しても次の生成で消える —— 実体は `docs/aims/_guide/` にある。
