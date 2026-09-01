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
| `SessionStart` | セッションが開いたとき | frame・未処理の baton・repo ごとの corpus fence・open-todo 数を注入する |
| `UserPromptSubmit` | 最初の turn が動く前に一度だけ | baton を読む手順を述べる —— ⚠ `SessionStart` hook の出力は context であり、**context は turn ではない** ∴ 他の何も儀式の実行を保証しない |
| `PostToolBatch` | セッションの足元で corpus が動いたとき | **実際に変わった事実だけ**を述べ直す |
| `PreCompact` | 自動圧縮が起ころうとしているとき | **一度だけ**差し止める ∴ context が選ばれないまま捨てられる代わりに baton を著せる |

⚠ **`PreCompact` は、人間が求めた圧縮を決して遮断しない。** 人に仕えるための儀式で、その人
自身の act を上書きすることは、この plugin が拒む反転である。

3 つの skill が同梱される: `/bearing:aim`・`/bearing:handoff-r`・`/bearing:handoff-w`。

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
