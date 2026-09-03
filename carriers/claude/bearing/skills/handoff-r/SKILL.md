---
name: handoff-r
description: 直前のセッションが残した baton（machine-local な会話の引き継ぎ）を読み込み、未プッシュの aim を surface して作業を再開する。新しいセッションの最初に実行する。
---

# handoff-r

手順の正本は **`handoff.md`** の「## 読む」節。**まずそれを読み、そこに書かれた通りに実行すること。**

手順 2〜4（前回 read-at の報告 → 新しい read-at の刻印 → 未 push/未 commit aim の trace）は**機械であって判断ではない**。次のコマンドが正しい順序で行う —— 手で刻むと、報告すべき旧 read-at を先に潰す事故が起きる:

```bash
bearing-handoff.mjs read
```

残り（baton を読むこと・Pointers の slug を読むこと・今どこに立っているかを人間に伝えること）は**あなたの仕事**である。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。

⚠ **この file は生成物である**（`gen/claude-plugin.sh`）。手で編集しても次の生成で消える —— 実体は `docs/aims/_guide/` にある。
