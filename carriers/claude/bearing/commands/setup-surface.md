---
description: aim の面（browser で開く 1 枚）を、bookmark できる固定 path で人間の home（~/.claude/）へ置く。project には何も書かない
argument-hint: "[--check]"
allowed-tools: Bash(bearing-setup-surface.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-setup-surface.mjs $ARGUMENTS
```

⚠ **書き先は人間の home（`~/.claude/`）であり、project には何も書かない。** これは scope の選択ではなく置くものの性質による: bookmark は machine-local な絶対 path であり、tracked な project settings に書けば他の人間の面が黙って壊れる。実行した場所（cwd）で書き先は変わらない。

⚠ **なぜ複製を置くのか。** plugin の cache path は version を含み、**cache は旧版を消さない** ∴ 面を直接 bookmark すれば bump 後も黙って古い面が開く。⚠ **statusline の shim のように橋渡しはできない** —— あちらは*走る*ので install record を読めるが、**browser は HTML を開くだけであり、開かれた HTML は自分がどの版かを解決できない**（`file://` では相対 import も fetch も塞がれている）。∴ 残るのは固定 path への複製である。

⚠ **置かれた 1 枚は追随しない。** plugin を上げたら打ち直すこと。今のかどうかは `--check` が答える —— ⚠ **違ったとき「古い版」か「人間が手を入れた」かは分けられず、CLI はそう述べる。**

⚠ **裸のコマンド名で呼ぶ。** plugin の `bin/` は **Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs が明記している唯一の経路）∴ path も env も要らない。

⚠ **開くのは人間である。** CLI は `file://` の URL を述べるだけで、browser を起動しない —— **どの browser で、どの path 形で開くかは実際に効く**（人間の観測 2026-09-04: `\\wsl.localhost\…` 越しに開くと picker が拒み、WSL 側の Chrome から Linux の path を選ぶと通った）∴ 我々が選べば、通らない側を黙って選びうる。

出力はそのまま人間に見せること。置き先・到達範囲・覆っていない範囲は、すべて CLI 側が述べる。⚠ **この command が代わりに要約しない** —— **面の拒否は browser 自身のダイアログにしか出ず、面には取り消しと同じ形で届く** ∴ CLI の言葉が、開く前に届く唯一の説明である。
