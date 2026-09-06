---
description: aim / 未読 baton / drift を、いま会話へ 1 度だけ出す。statusline を持たない面（デスクトップの Code）から同じ事実へ届くための手段
allowed-tools: Bash(aim-facts.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
aim-facts.mjs
```

⚠ **これは token を食う。** statusline は token を消費せず黙って在り続けるが、**あの面は
CLI にしかない** —— デスクトップの Code には statusline そのものが存在しない ∴ そちらから
同じ事実へ届く道は、会話へ出す以外に無い。⚠ **費用は経路ごとに違い、
その非対称は揃えられない。揃えられるのは*見えるかどうか*である。**

⚠ **出るものは SessionStart hook と同じである** —— 別の記述を持たない。
