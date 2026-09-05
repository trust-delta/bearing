# bearing —— Claude Code plugin

*English: [README.en.md](README.en.md)*

人間が pin した目的を毎セッションへ運び、そこに保ち続ける。

この repository の marketplace から install する:

```
/plugin marketplace add trust-delta/bearing
/plugin install bearing@trust-delta
```

非対話的に、marketplace を 1 つの project にだけ足す形なら:

```
claude plugin marketplace add https://github.com/trust-delta/bearing.git --scope project
claude plugin install bearing@trust-delta
```

Node が要る。build 手順も daemon も server も無い —— hook は file と `git` に対する
`node` の呼び出しである。

## 何を、いつするか

| hook | いつ | 何を |
| --- | --- | --- |
| `SessionStart` | セッションが開いたとき | frame・未処理の baton・repo ごとの corpus fence・open-todo 数・escalation 数を注入する |
| `UserPromptSubmit` | 最初の turn が動く前に一度だけ | baton を読む手順を述べる —— ⚠ `SessionStart` hook の出力は context であり、**context は turn ではない** ∴ 他の何も儀式の実行を保証しない |
| `PostToolBatch` | セッションの足元で corpus が動いたとき | **実際に変わった事実だけ**を述べ直す |
| `PreCompact` | 自動圧縮が起ころうとしているとき | **一度だけ**差し止める ∴ context が選ばれないまま捨てられる代わりに baton を著せる |

⚠ **`PreCompact` は、人間が求めた圧縮を決して遮断しない。** 人に仕えるための儀式で、その人
自身の act を上書きすることは、この plugin が拒む反転である。

skill は `/bearing:handoff`（`r` で読み、`w` で書く）。⚠ **aim の規律は plugin の skill ではない** —— `/bearing:setup-aim` が採用した project の `.claude/skills/aim/` へ置く project skill であり、置いた後はその repo のものである。

### aim は project ごとの opt-in

⚠ **handoff と statusline の 1 行目はどの project でも使えるが、aim の規律は corpus を
前提にする** ∴ **採っていない repo で SessionStart hook は 1 byte も出さない**（未読の
baton だけは述べる —— handoff は aim ではない）。使う project で 1 度だけ:

```
/bearing:setup-aim
```

実行した project の `CLAUDE.md` の末尾へ marker で挟んだ法を差し込み、`.claude/skills/aim/` へ aim
skill を置く（`--check` / `--remove` も在る）。⚠ **置いた後はどちらもその repo のもの** —— plugin は追随させない。⚠ **marker は HTML コメント ∴ context には 1 token も乗らない** —— docs が
「block-level の HTML コメントは注入前に除かれる」と明記している。⚠ **hook はこの marker を
読み、置かれた法が古ければそう述べる。人間が block の中を編集していれば、置き直さず止まる。**

⚠ **corpus が既に在る repo では、marker が無くても従来どおり動く。**

⚠ **在り処は `--dir` で変えられる**（既定 `docs/aims/`）—— `/bearing:setup-aim --dir proj/aims`。
宣言は marker が運ぶ ∴ **採用の宣言と同じ 1 つの宣言**で、`dir=` が無ければ既定である。
⚠ **引数なしで打ち直せば、既に置かれた宣言が正** —— 版の更新が corpus を引っ越させない。

## 何をすることを拒むか

**判定しない。** 機械層は候補を可視化し、採点はエージェントの仕事、決定は人間のものである。
fence は git が言うことを報告し、そこで止まる。

**捏造しない。** git が読めなかったとき、どの fence も**その言葉で**そう述べる。clean と
読める空の結果を描画したりしない。⚠ **確信を持って誤っているセンサーは、センサーが無いことに
劣る。** そして「空の fence」と「観測できなかった fence」は別の事実である。

**`aim:`・`parent:`・`state:` に触れない。** それらは人間のものである。エージェントは body を
保守し、どの目的についても変更を提案し、escalate する。

## 言語

この plugin が出す文と、同梱される正本は**日本語**である。⚠ **ただし fence の tag と field 名
（`bearing-drift-intra v1`、`slug | anchor_commit | …`）は機械が parse する契約であり、値も
slug も英語である。** 判別線は「人が読む文か、機械が parse する token か」に引かれている。

## ライセンス

MIT —— 傍らの [`LICENSE`](LICENSE) を見よ。⚠ **これは重複ではなく、配布物の一部である**
—— cache へ複製されるのは carrier の subtree だけであり、root の `LICENSE` は届かない。
repository の root の 1 枚と一致していることは CI が検める。

Copyright (c) 2026 TrustDelta
