---
aim: 対象ハーネスが提供する可能範囲内で作業に有効な情報を表示する機能をもつ
parent: bearing
state: open
---

# IS

**埋めるのは「面ごとの欠落」であって、新しい事実ではない。** 同じ Claude Code でも、デスクトップの Code は usage ring（context と plan usage）・footer の PR badge・CI status bar を **UI として持ち**、CLI は 1 つも持たない。⚠ **∴「作業に有効な情報」とは、道具が持っていない情報のことではなく、*その面に出ていない*情報のことである** —— 何が有効かは面ごとに違い、両面に同じものを描けば片方では重複になる。

**statusline が別の面である理由は、位置ではなく費用である。** hook は CLI にもデスクトップにも届く（設定は共有される）が、**token を食い、会話に割り込む**。statusline は CLI にしか無い代わりに **token を一切消費せず、assistant message ごとに更新され、黙って在り続ける**。∴ ここに置くべきは「**常に見えていてほしいが、毎ターン喋られると邪魔なもの**」であり、それは hook が運ぶべきものとは重ならない。⚠ **[[bearing]] の 3 柱が運ぶ事実の多くはこの性質を持つ** —— aim の数も未読 baton も drift も、毎ターン述べれば邪魔で、消えれば見失う。

⚠ **不在を黙って消さない。この面でも同じ規律が要る。** 初版は corpus を採れないとき行ごと落とし、branch を読めないとき項目ごと落とし、detached HEAD を「読めなかった」に畳んでいた —— **どれも読み手に「何も言っていない ＝ 問題が無い」と読ませる**。corpus fence が一貫して拒んできた誤読であり、面が新しいというだけで許される理由は無い。⚠ **表示の面では、消えたものと元から無いものが同じ見た目になる** ∴ fence より起きやすく、しかも起きたことに気づきにくい。

**⚠ 本 node は柱ではなく、柱を滑らかにするものである**（人間が 2026-09-02 に判定）。statusline は **標準ハーネスが既に備える面**であり、ここに ctx / aim / drift を載せるのは*我々が付与する追加の情報表示*にすぎない ∴ [[bearing]] の 3 点は動かない。具体的には —— ctx が見えることは [[session-handoff]] を*いつ打つか*の判断に、aim と観測待ちは [[aim-tree]] に、未 commit / 未 push / drift は [[purpose-drift]] に、それぞれ効く。**新しい柱を立てているのではない。**

⚠ **∴ どの面とどの面を揃えるべきかは本 node の問いではない** —— それは [[surface-parity]] が述べ、本 node は*この面に何をどう描くか*だけを持つ。

⚠ **幅が確定した文字だけを使う。** 中黒・矢印・ギリシャ文字・絵文字は East Asian **Ambiguous** 幅であり、日本語フォントでは全角に描かれるのに terminal は半角として桁を進める ∴ **隣の文字と重なる**。使えるのは ASCII printable と Wide が確定した日本語だけで、**構造は記号ではなく色と余白が作る**。これは美意識ではなく、実際に画面が壊れて得た制約である。

# PROCESS

- [done] **CLI 向けの statusline を実装した。** 1 行目に model / effort / branch / context / rate limit、2 行目に aim・todo・観測待ち・未読 baton・未 commit / 未 push / drift。⚠ **fence は cache を経ず正本の lib を直接呼ぶ** —— 実測 70ms で debounce 300ms に十分収まり、間接層を挟めば二重実装が生まれるからである
- [done] **幅の規律を機構で固定した。** `widthUnsafeChars()` と test が、Ambiguous な文字を出力に混ぜようとした時点で落ちる —— 一度画面が重なる事故を起こしており、注意ではなく機構で止める
- [done] **不在を消さない規律を 3 箇所に引いた。** corpus 未取得 / git 未検知 / detached の描き分け。⚠ ついでに degrade が実装の bug をも「事実が採れない」に化けさせることが分かったので、debug の穴が開いているときだけ飲んだものを見せる
- [todo] **plugin の carrier として配れる形にし、project ごとの手書き設定なしに載るようにする。** 現状は本 repo の `.claude/settings.json` に `statusLine` を手で書いており、他 project へ運ぶ手順が無い

# DAG

- 関連: [[session-handoff]] —— context 使用率がこの面から見えるようになった。⚠ ただし発火点は動かない（statusline は hook ではない）
- 関連: [[purpose-drift]] —— 2 行目が運ぶ drift / 未 commit / 未 push は、あの node が可視化する事実そのものである
- 関連: [[aim-tree]] —— 2 行目の aim 数・open-todo・観測待ちは、あの木から数えている
- 関連: [[surface-parity]] —— *どこが揃っていないか*はあちらが述べ、**この面で埋める手段**を本 node が持つ
