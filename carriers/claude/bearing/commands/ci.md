---
description: この unit の CI の状態を採って置く。statusline の 1 行目がそれを読んで描く —— 面は決して gh を起こさない
allowed-tools: Bash(bearing-ci.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-ci.mjs
```

⚠ **これは採る側である。** statusline は assistant message ごとに走り debounce で殺される
∴ あそこから `gh` を起こせば子が宙に浮き、rate limit も踏む —— **面は置かれた結果を読む
だけ**であり、採るのはこの 1 手である。

🔴 **見るのは `@{u}`（push 済みの commit）の run だけである。** ⚠ **CI が走るのは push された
commit であって、手元の HEAD ではない** —— その commit の run がまだ 1 本も無ければ **`CI 無し`**
であり、**1 つ前の commit の結論は決して持ち越さない**（2026-09-07 まで持ち越していた）。

⚠ **HEAD が `@{u}` の先に居るときは、面が `(未 push N)` と添える** —— **その緑は手元の変更を
検証していない。**

⚠ **採ってから 30 分を過ぎると、面は結論ではなく `CI 古い` と述べる。** 古い緑は緑ではない。
⚠ **`@{u}` は我々が push した先の記憶である** —— **他者の push は `git fetch` するまで見えない。**
