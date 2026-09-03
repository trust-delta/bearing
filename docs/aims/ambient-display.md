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

⚠ **この面は、描くものではなく装着そのものが黙って消えうる。** `statusLine.command` は `$CLAUDE_PROJECT_DIR` を含む絶対パスで node を呼んでおり、**この env が statusline の script に渡ることは docs に記述が無い** —— 2026-09-01 の実測で在ることを確かめただけである。⚠ **渡らなくなれば `node "/carriers/.../statusline.mjs"` を呼んで即死し、画面からは 2 行が消えるだけで理由は一言も出ない。** ⚠ **同じ形の罠は既に別の env で踏んでいる**（2026-09-02、`$CLAUDE_PLUGIN_ROOT` が Bash の env に無く、それを前提にした呼び出しが `/bin/...` を見て落ちた）—— **ハーネスが渡す env を path に埋める呼び出しは、渡されなかった日に path が壊れる**、という一つの類である。∴ 上の「不在を黙って消さない」は描画の中だけの規律では足りない —— **装着そのものが黙って消える経路を塞げるかが、この面の問いである。**

⚠ **2026-09-03、その経路は塞げないことが確定した（公式 docs ＋ 実測）。** plugin の `bin/` が PATH に入るのは **Bash tool に対してだけ**であり（docs の file locations 表が "Executables added to the Bash tool's `PATH`" と明記する）、**statusline の process には入らない** —— 実測でも、Bash tool の PATH 58 要素に対し statusline は 52 要素で、**差はちょうど 6 つの plugin `bin/`** だった。∴ **裸のコマンド名へ移す道は無く、装着の 1 行から path は消せない。** ⚠ **同じ実測が `$CLAUDE_PROJECT_DIR` は statusline に渡ることを再確認した** ∴ この面は「docs に無いが実在する env」1 つに依り続ける。⚠ **前段の「絶対パスを捨てれば依存ごと消せる」は取り下げる** —— あのまま実装していれば statusline は解決しないコマンド名を呼んで即死し、**画面からは 2 行が消えるだけで理由は一言も出なかった。この node が warn している壊れ方を、この node の todo が自分で踏むところだった。**

⚠ **path が消せない帰結は、他 project のほうが重い。** bearing の checkout の外に `carriers/...` は無い ∴ 他 project の 1 行は cache を直に指すほかなく、**その path は version を含む**（`.../bearing/0.7.0/bin/statusline.mjs`）。⚠ **cache は旧版を消さない**（実測: `0.4.0` / `0.5.0` / `0.7.0` が並存）∴ bump しても 1 行は壊れず、**黙って古い版を描き続ける** —— [[bearing]] の「この repo は自分自身の古い版を食べていた」の、消費者側での形である。装着は原理的に人間の act ゆえ、**bump のたびに人間が書き換えねばならず、忘れても何も言わない。**

**⚠ 2026-09-03、公開されている statusline を 5 つ実測した —— 誰一人 plugin の cache から statusline を走らせていない。** 公式 docs の例と `levz0r/claude-code-statusline` は人間が `~/.claude/` に置いた script を指し、`sirmalloc/ccstatusline`（最有名）と `z80020100/claude-code-statusline` は npm、`fredrikaverpil/claudeline` は落とした binary を指す。⚠ **versioned な cache path を settings に書く例は 1 つも無かった。** そして **plugin として配られている 3 つは全て setup コマンドを持ち、1 行を*生成*している** —— ⚠ **∴「装着は人間の act」は正しいが、それは「人間が path を手で写す」という意味ではなかった。** 人間の act は *setup を打つこと*で足りる。⚠ **`z80020100`（plugin ＋ `bin/` ＋ hook という、この repo と同じ構造）ですら `bin/` を cache から呼ばず、npm global に入れ直して裸の名で呼ぶ** ∴ 我々が今日測った穴は、あちらでは `isOnPath()` の警告として既に実装されていた。

**∴ 同じ形を採る —— ただし npm は使わない**（第 2 の配布経路は「build 手順も無い」を破る）。`bin/bearing-statusline.mjs` が `~/.claude/` に置かれ、**走るたびに install record を読んで今の版へ橋渡しする** ∴ **settings の 1 行から version が消え、bump で腐らない。** 置くのと 1 行を書くのは `/bearing:statusline-setup` である。⚠ **これは machine-local な不可視の細工ではない** —— shim の中身は repo に在り、test が掛かり、置くのは repo の code である。⚠ **ただし置かれたものは複製である** ∴ 版の門が 1 つ増える（`lib/delegate.mjs` の shim と同じ性質で、shim 自体を変えたときだけ効く）。

⚠ **そして shim は、この面が塞げなかった穴を 1 つ塞ぐ。** record が無ければ本体は 1 枚も載っておらず、**載っていない機構は自分の不在を報告できない** —— だが **shim は plugin の外に住む ∴ 載っていなくても走り、そう述べられる。** ⚠ **これが shim を「薄い間接層」以上のものにしている理由であり、間接層が欲しかったのではない。** ⚠ 塞がるのは *statusline の面*だけである —— hook も skill も、載っていなければ依然として黙る。

⚠ **bearing 自身の repo は tracked な project settings で working tree を直に指し続ける。これは重複ではない**: あの 1 行は **bearing が載っていなくても clone しただけで描け**、machine-local な前提を 1 つも持たない。project settings は user settings に勝つ ∴ 両方在っても食い違わない。

**⚠ 2026-09-03、この面は「不在を述べる唯一の面」になった。** [[bearing]] の人間が「plugin 側は自分の実体が置かれているかを検査しない」を通例として採り、**plugin の範囲ではない statusline だけを例外的に検知対象として残した** ∴ 上段の「塞がるのは *statusline の面*だけである」は、**穴の記述から役割の記述へ変わった** —— hook と skill が黙るのは未了ではなく、決着した設計である。⚠ **∴ shim が描く「載っていない」の 1 行は、もはや補助ではない** —— あれが黙れば、不在を述べる面はどこにも無くなる。

# PROCESS

- [done] **CLI 向けの statusline を実装した。** 1 行目に model / effort / branch / context / rate limit、2 行目に aim・todo・観測待ち・未読 baton・未 commit / 未 push / drift。⚠ **fence は cache を経ず正本の lib を直接呼ぶ** —— 実測 70ms で debounce 300ms に十分収まり、間接層を挟めば二重実装が生まれるからである
- [done] **幅の規律を機構で固定した。** `widthUnsafeChars()` と test が、Ambiguous な文字を出力に混ぜようとした時点で落ちる —— 一度画面が重なる事故を起こしており、注意ではなく機構で止める
- [done] **不在を消さない規律を 3 箇所に引いた。** corpus 未取得 / git 未検知 / detached の描き分け。⚠ ついでに degrade が実装の bug をも「事実が採れない」に化けさせることが分かったので、debug の穴が開いているときだけ飲んだものを見せる
- [done] **どちらの複製が描いているかを label に出した**（working tree なら `bearing repo`、cache なら黙る）。⚠ **黙るのは cache のほうである** —— 他 project から見れば cache こそ正常であり、この行の法に従えば述べるべきは「今見ている事実は、他 project が受け取る版のものではない」のほう。⚠ **委譲の印ではなく自分の位置で判定する**: あの印は「委譲されて来た」ことしか語らず、**最初から working tree を直に指されている**この面では何も立たない —— 2026-09-02 の食い違いはまさにその経路で起きた
- [done] **装着を `/bearing:statusline-setup` にした。** `~/.claude/bearing-statusline.mjs` へ shim を置き、user settings に 1 行を書く。⚠ **書き先を user settings に限る** —— 絶対 path は home を含む ∴ tracked な project settings へ書けば、他の人間の面が黙って壊れる形を repo に commit することになる。⚠ **既存の statusline は上書きせず、述べて止まる**（面は 1 つしかなく、上書きは相手の面を消すことである）。⚠ **描画時に解決できるかを setup が確かめて述べる** —— 装着が失敗しても画面からは 2 行が消えるだけで理由は出ない ∴ **述べられる最後の場所が setup である**
- [done] **shim が「載っていない」を描くようにした。** record の不在・本体の不在・読めない record を畳まず、理由つきで 1 行にする。⚠ **本体を import できない場面で描く行ゆえ、幅の規律は literal として守るほかない** —— test が見張っている
- [todo] **置かれた shim が古いことを面に出す。** ⚠ **shim は複製である ∴ 版の門が 1 つ増えた** —— `bin/bearing-statusline.mjs` を変えても、`~/.claude/` の複製は setup を打ち直すまで古いままで、しかも**古い複製は正常に動いて見える**。⚠ 同じ構造の plugin（z80020100）は SessionStart hook で版を突き合わせている ∴ 形の前例は在る。⚠ **2026-09-03、同じ構造の複製が 2 つ目できることが決まった** —— [[bearing]] が `CLAUDE.md` へ置く法の block である ∴ **版の門は 1 つではなく 2 つになる。** ⚠ **あちらの marker は版と本文 sha の両方を持つ** —— shim には無い「人間が手を入れたか」の判別が要るからで、**この面の複製にも同じ問いは在る**（shim を手で書き換えた人間を、我々はまだ検出できない）

# DAG

- 関連: [[session-handoff]] —— context 使用率がこの面から見えるようになった。⚠ ただし発火点は動かない（statusline は hook ではない）
- 関連: [[purpose-drift]] —— 2 行目が運ぶ drift / 未 commit / 未 push は、あの node が可視化する事実そのものである
- 関連: [[aim-tree]] —— 2 行目の aim 数・open-todo・観測待ちは、あの木から数えている
- 関連: [[surface-parity]] —— *どこが揃っていないか*はあちらが述べ、**この面で埋める手段**を本 node が持つ
- 照合: [[aim-tree]] @ e7aecd63 —— 本 node は aim-tree の corpus を*読む*側であり、あちらの手段（所有で引く分割・置き場は repo・木で構造化）に触れていない ∴ 面が 1 つ増えても向こうに書き換える主張が無い
