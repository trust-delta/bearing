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

⚠ **この面は、描くものではなく装着そのものが黙って消えうる。** `statusLine.command` は `$CLAUDE_PROJECT_DIR` を含む絶対パスで node を呼んでおり、**この env が statusline の script に渡ることは docs に記述が無い** —— 2026-09-01 の実測で在ることを確かめただけである。⚠ **渡らなくなれば `node "/carriers/.../statusline.mjs"` を呼んで即死し、画面からは 2 行が消えるだけで理由は一言も出ない。** ⚠ **同じ形の罠は既に別の env で踏んでいる**（2026-09-02、`$CLAUDE_PLUGIN_ROOT` が Bash の env に無く、それを前提にした呼び出しが `/bin/...` を見て落ちた）—— **ハーネスが渡す env を path に埋める呼び出しは、渡されなかった日に path が壊れる**、という一つの類である。∴ 上の「不在を黙って消さない」は描画の中だけの規律では足りない: **plugin の `bin/` は PATH に入る ∴ 絶対パスを捨てれば、この依存ごと消せる。**

# PROCESS

- [done] **CLI 向けの statusline を実装した。** 1 行目に model / effort / branch / context / rate limit、2 行目に aim・todo・観測待ち・未読 baton・未 commit / 未 push / drift。⚠ **fence は cache を経ず正本の lib を直接呼ぶ** —— 実測 70ms で debounce 300ms に十分収まり、間接層を挟めば二重実装が生まれるからである
- [done] **幅の規律を機構で固定した。** `widthUnsafeChars()` と test が、Ambiguous な文字を出力に混ぜようとした時点で落ちる —— 一度画面が重なる事故を起こしており、注意ではなく機構で止める
- [done] **不在を消さない規律を 3 箇所に引いた。** corpus 未取得 / git 未検知 / detached の描き分け。⚠ ついでに degrade が実装の bug をも「事実が採れない」に化けさせることが分かったので、debug の穴が開いているときだけ飲んだものを見せる
- [todo] **装着の 1 行から path を外し、どの project へでもそのまま書き写せる形にする。** ⚠ **「手書きなしで載る」は達成できない** —— plugin root の `settings.json` が宣言できる key は `agent` と `subagentStatusLine` だけで、`statusLine` は user / project の settings にしか置けない ∴ **装着の 1 行は原理的に人間の act として残る**（供給は plugin、装着は人間）。エージェントにできるのは、その 1 行を `$CLAUDE_PROJECT_DIR` 依存の絶対パスから `bin/` の名前へ移し、**どこへ貼っても同じ 1 行**にすることまでである

# DAG

- 関連: [[session-handoff]] —— context 使用率がこの面から見えるようになった。⚠ ただし発火点は動かない（statusline は hook ではない）
- 関連: [[purpose-drift]] —— 2 行目が運ぶ drift / 未 commit / 未 push は、あの node が可視化する事実そのものである
- 関連: [[aim-tree]] —— 2 行目の aim 数・open-todo・観測待ちは、あの木から数えている
- 関連: [[surface-parity]] —— *どこが揃っていないか*はあちらが述べ、**この面で埋める手段**を本 node が持つ
- 照合: [[aim-tree]] @ e7aecd63 —— 本 node は aim-tree の corpus を*読む*側であり、あちらの手段（所有で引く分割・置き場は repo・木で構造化）に触れていない ∴ 面が 1 つ増えても向こうに書き換える主張が無い
