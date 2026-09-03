---
description: bearing の statusline を装着する（~/.claude/settings.json に 1 行を書き、shim を置く）
argument-hint: "[--force | --uninstall]"
allowed-tools: Bash(bearing-statusline-setup.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-statusline-setup.mjs $ARGUMENTS
```

⚠ **`${CLAUDE_PLUGIN_ROOT}` を使わない。** plugin の `bin/` は **Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs）—— 一方 `${CLAUDE_PLUGIN_ROOT}` が inline 展開されると docs が明記しているのは hook と skill / agent の content であって、command ではない。**確かなほうを使う。**

出力はそのまま人間に見せること。書き込みの可否・既存 statusLine の扱い・解決先の報告は、すべて CLI 側が述べる。⚠ **この skill が代わりに要約しない** —— 装着が失敗しても画面からは 2 行が消えるだけで理由は出ない ∴ CLI の言葉が、人間に届く唯一の説明である。
