---
aim: 使用言語をエージェントに指示を出す人間の母語に合わせる
parent: bearing
state: open
---

# IS

**判別線は「人が読む文か、機械が parse する token か」である。** 母語に寄せるのは前者だけで、後者は英語のまま据え置く —— fence のタグ（`bearing-drift-intra v1`）と field 名（`slug | anchor_commit | …`）はセッションが parse する契約であり、値も slug も英語である ∴ **これを訳すのは言語の統一ではなく契約の破壊**である。識別子・関数名・ファイル名も同じ側に立つ。逆に、hook が stdout へ出す散文・fence の `# none — …` コメント・skill の `description`・canon・aim node・code 内コメントは、いずれも**読まれるために書かれた文** ∴ 母語へ寄せる。

**この aim の根拠は operator の推論であって、実測ではない。** 前提はこう述べられている ——「エージェントへの指示は、英語と日本語の混在よりも、どちらかに統一した方が質が高い。⚠ **混在しても質が低下しないという核心が得られた場合にのみ、混在を許す**」。⚠ **これを検証済みの事実として扱ってはならない。** 反証は「混在が無害である」という核心の獲得であり、そのとき動くのは手段であって目的ではない —— 統一という手段が要らなくなるだけで、母語に合わせるという目的は残る。

**到達範囲より先に、operator 自身の可用性を置く。** ⚠ **operator が使えなければ道具は存在しないのと同じ** ∴ 当面のターゲットは日本語話者であり、英語圏の読者はその次に来る。**「当面の」は本気の限定である** —— 母語が変われば、あるいは対象が変われば、この node の手段は動く。目的の側（`aim:`）が「日本語に統一する」ではなく「**指示を出す人間の母語に合わせる**」と書かれているのはそのためで、日本語は現在の値であって定数ではない。

**外向きの英語は捨てず、従属物として残す。** README は日本語を正本とし、英語版を `README.en.md` として併置する。⚠ **2 枚は必ず drift する** —— 併記は同期の義務を人間に課す構造であり、機械はこれを検知しない（[[purpose-drift]] の fence は `docs/aims/` しか見ない）。∴ **食い違いを見つけたら日本語側が正**と決めておく。これは翻訳の質の問題ではなく、どちらが権威かを先に決めておかないと 2 枚とも信用できなくなるからである。

⚠ **既に push された commit message は書き換えない。** 履歴の rewrite は別の act であり、言語の統一がその理由になることはない。

# PROCESS

- [done] **実行時に注入される散文を日本語へ寄せた。** `bin/*.mjs` 5 枚・`lib/*.mjs` 11 枚が emit する文、5 枚の fence の `# none` / `# unavailable` コメント散文、`hooks.json` の `statusMessage` 4 件、`plugin.json` と `marketplace.json` の `description`、`gen/claude-plugin.sh` が書く `aim` skill の `description`。⚠ **fence のタグ・field 名・値（`true`/`false`/`unknown`/`unreadable`/`untracked`）は英語のまま据え置いた** —— 契約であって散文ではない。test の assertion 18 件が emit 文字列を見ていたので追随させ、123/123 green
- [done] **code 内コメントを日本語へ寄せた。** `bin/` `lib/` `test/` `gen/claude-plugin.sh`。⚠ **翻訳のついでに、解決しない参照を 12 件落とした** —— code コメントが前身の node 名（`aim-upkeep` / `drift-git` / `aim-code-drift` / `neutral-source-vendor-carrier` 等）と存在しない path（`docs/runbook/windows.md`・`scripts/gen-carriers.sh`）を名指していた。導出の理由は前提として言い換えて残し、名だけを落とした
- [done] **README を日本語正本にし、英語版を `README.en.md` として併置した**（root と plugin の 2 組、相互リンク付き）。⚠ **あわせて root README の Status 節が偽になっていたのを直した** —— 「移設が着地するまで、この repo は名前と README だけである」と書かれていたが、移設は着地済である
- [todo] **混在が残っている箇所を測る手段を持つ。** 現在は 1 回限りの実測（日本語文字 / 英字の比）で見ただけで、⚠ **次に混ざったときに気づく仕組みが無い** —— これは [[purpose-drift]] が「沈黙が健全と読まれる」問題として抱えているものと同じ形である
