---
description: この project で aim の規律を使う（CLAUDE.md へ marker 付きの法を差し込む）
argument-hint: "[--dir <path>] [--check | --remove]"
allowed-tools: Bash(bearing-with-aim.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-with-aim.mjs $ARGUMENTS
```

⚠ **裸のコマンド名で呼ぶ。** plugin の `bin/` は **Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs が明記している唯一の経路）∴ path も env も要らない。

⚠ **`CLAUDE_PLUGIN_ROOT` を波括弧つきで書いてはならない** —— この command 本文でも **inline 展開される**（2026-09-03 に実測。docs の表は command を挙げていないが、実際には置換される）∴ 散文の中に書けば、注意書きが**その場で実 path に化けて意味を失う。**

出力はそのまま人間に見せること。書き先・既存 block の扱い・置き直しの可否は、すべて CLI 側が述べる。⚠ **この command が代わりに要約しない** —— **触らずに止まった**という報告は、成功の報告よりも読まれる必要がある。

⚠ **CLI が「置き直さない」と述べたときに、その理由を回避する手を勝手に採ってはならない。** block の本文が marker の sha と食い違うのは **人間がそこを編集した**という意味であり、置き直せばその編集が消える。**どうするかは人間が決める。**
