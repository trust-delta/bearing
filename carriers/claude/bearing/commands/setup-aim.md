---
description: この project で aim の規律を採る —— 書き先は実行した project。CLAUDE.md の末尾へ marker 付きの法を差し込み、.claude/skills/aim/ へ aim skill を置く。置いた後はどちらもこの repo のものであり、block と skill は 1 組として動く
argument-hint: "[--dir <path>] [--check | --remove | --update]"
allowed-tools: Bash(bearing-setup-aim.mjs:*)
disable-model-invocation: true
---

次のコマンドを、そのまま実行すること。

```bash
bearing-setup-aim.mjs $ARGUMENTS
```

⚠ **書き先は、これを実行した project である** —— `CLAUDE.md` の末尾（marker 付きの法の block）と `.claude/skills/aim/`（aim skill）。これは scope の選択ではなく置くものの性質による: aim の採用はその repo の corpus についての宣言ゆえ、repo にしか置けない。⚠ **置いた後はどちらもこの repo のものである。** track するか・直すか・古いままにするかは repo が決める。

🔴 **block と skill は 1 組である**（人間の決定 2026-09-07）—— **更新するなら両方、しないならどちらも維持であり、どちらにするかは aim を使う側が決める。** ⚠ **理由は保有 corpus である**: 版が上がることは doc の差し替えではなく、**手元の aim node の書き換えを伴いうる act** だからである。∴ 置かれた skill が同梱の正本と一致しないとき、この CLI は **`SKILL.md` の frontmatter に刻んだ版と 3 枚の指紋に訊く** —— 🔴 **刻印が今の中身を指していれば「この repo は触っていない」** ∴ **打った act で揃え直す**（消えるものが無い）。⚠ **刻印が無いか、刻印と中身が食い違えば block も触らずに止まる** —— そこは「古い」と「手を入れた」を分けられない。**捨ててよいと述べるのが `--update`** である。⚠ **刻印は frontmatter に在る ∴ 消費者の context には 1 token も乗らない**（実測 2026-09-07、対象: Claude Code 2.1.263、1 台）。

⚠ **採用していない project では、aim の機構は口を開かない** —— `docs/aims/` を持っていても黙る。**corpus が在ることは*使っている証拠*であって、この機構を通したいという宣言ではない**（人間の決定 2026-09-05）∴ **`--remove` はそのまま「通さない」を意味する** —— 専用の「降りる」宣言は要らない。⚠ **statusline の 2 行目だけは、corpus を見つけたことを 1 行述べる** —— 黙る機構は自分の存在を告げられないからである。⚠ **未読の baton も述べ続ける** —— handoff は aim に依存せず、どの project でも使える。

⚠ **裸のコマンド名で呼ぶ。** plugin の `bin/` は **Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs が明記している唯一の経路）∴ path も env も要らない。

⚠ **`CLAUDE_PLUGIN_ROOT` を波括弧つきで書いてはならない** —— この command 本文でも **inline 展開される**（2026-09-03 に実測。docs の表は command を挙げていないが、実際には置換される）∴ 散文の中に書けば、注意書きが**その場で実 path に化けて意味を失う。**

出力はそのまま人間に見せること。書き先・既存 block の扱い・置き直しの可否・skill が正本と一致するか —— すべて CLI 側が述べる。⚠ **この command が代わりに要約しない** —— **触らずに止まった**という報告は、成功の報告よりも読まれる必要がある。

⚠ **CLI が「置き直さない」「一致しない」と述べたときに、その理由を回避する手を勝手に採ってはならない。** block の本文が marker の sha と食い違うのは **人間がそこを編集した**という意味であり、置き直せばその編集が消える。⚠ **`--update` を自分の判断で足してはならない** —— あれは**区別できない複製を捨てる**うえ、**手元の aim node の書き換えを呼ぶ**。**CLI が「区別もできない」と述べたのは、捨ててよいか分からないという意味である。****どうするかは人間が決める。**
