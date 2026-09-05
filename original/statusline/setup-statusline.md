---
description: bearing の statusline を装着する —— 書き先は人間の home（~/.claude/）。settings.json に 1 行を書き、shim を置く。project には何も書かない
argument-hint: "[--force | --uninstall]"
allowed-tools: Bash(bearing-setup-statusline.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-setup-statusline.mjs $ARGUMENTS
```

⚠ **書き先は人間の home（`~/.claude/`）であり、project には何も書かない。** これは scope の選択ではなく置くものの性質による: plugin は `statusLine` key を宣言できず settings に書くしかなく、shim の path は home を含む ∴ tracked な project settings に書けば他の人間の面が黙って壊れる。**∴ home にしか置けない。** 実行した場所（cwd）で書き先は変わらない。

⚠ **裸のコマンド名で呼ぶ。** plugin の `bin/` は **Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs が明記している唯一の経路）∴ path も env も要らない。

⚠ **`CLAUDE_PLUGIN_ROOT` を波括弧つきで書いてはならない** —— この command 本文でも **inline 展開される**（2026-09-03 に実測。docs の表は command を挙げていないが、実際には置換される）∴ 散文の中に書けば、注意書きが**その場で実 path に化けて意味を失う。**

出力はそのまま人間に見せること。書き込みの可否・既存 statusLine の扱い・解決先の報告は、すべて CLI 側が述べる。⚠ **この command が代わりに要約しない** —— 装着が失敗しても画面からは 2 行が消えるだけで理由は出ない ∴ CLI の言葉が、人間に届く唯一の説明である。
