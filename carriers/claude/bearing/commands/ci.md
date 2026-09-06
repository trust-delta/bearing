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

⚠ **採ってから 30 分を過ぎると、面は結論ではなく `CI 古い` と述べる。** 古い緑は緑ではない。
