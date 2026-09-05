---
aim: plugin はリポジトリに痕跡を残す前に、その repo が宣言した採用を要求する。痕跡を残さないものには何も要求しない
parent: bearing
state: open
---

# IS

**軸は「repo に触れるか」ではなく「repo に痕跡が残るか」である。** 触れるだけの機能は在る —— [[ambient-display]] の 1 行目は branch を読むが、**repo の履歴には何も残さない**。∴ 触れることを基準にすると、汎用であるべきものが project 側へ落ちる。⚠ **残るものだけが、その project の持ち物になる。**

⚠ **[[session-handoff]] はかつてこちら側の例だった** —— baton は cwd の傍らの `.handoff/` に住んでおり、「触れるが残さない」ものとして数えていた。⚠ **2026-09-03、それが「残さない」ではなく「残しうるが隠す」だと分かり、置き場を repo の外へ出した**（下の `[done]`）∴ **今は触れてすらいない。** ⚠ **動いたのは軸ではなく実装のほうである** —— 軸に照らして測り直した結果、例が side を移った。

∴ 2 つの側は、こう分かれる:

| | 痕跡 | 宣言を要求するか |
| --- | --- | --- |
| [[aim-tree]] / [[purpose-drift]] | `CLAUDE.md` の法の block・`.claude/skills/aim/`（どちらも `setup-aim` が置く。corpus `docs/aims/` はその project 自身のもの） | **要求する** —— `CLAUDE.md` の marker が宣言である |
| [[session-handoff]] | 無い（baton は `~/.bearing/units/<unit>/handoff/` ＝ home の下。**unit root には何も作らない**） | **要求しない** |
| [[ambient-display]] の 1 行目 | 無い（何も置かず、branch を読むだけ） | **要求しない** |

⚠ **この node の `aim:` は 2026-09-05 に pin し直された**（人間の act）。旧い文は「痕跡を残す機能は**プロジェクト単位で**採用の是非を選択でき、痕跡を残さない汎用的な機能は**ユーザ単位で有効になる**」で、**痕跡の同意と install の scope を 1 つの規則に畳んでいた。** ⚠ **だが install の scope は plugin の範囲外である** —— 親 [[bearing]] は供給の 3 形を並べたうえで「どちらを取るかは、機構の性能ではなく**人間が何を失う覚悟をするかの問い**である」と先に述べていた。**子が、親の言う人間の問いを機構の規則にしていた。** ∴ 本 node が持つのは**宣言の要求**だけであり、どの scope に載せるかは install する人間のものである。slug も `supply-scope` から改めた。bearing 自身を user scope で載せた事実は親に在り、**それは bearing の選択であって消費者への規則ではない。**

⚠ **宣言は文字通り「選択できる」でなければならない**（人間が 2026-09-03 に確定）—— **aim を使っている project が、この plugin の aim 機能は有効にしない、という選択もありうる。** ∴ gate は「corpus が在るか」では足りない: 在ることは**使っている証拠**であって**この機構を通したいという宣言**ではない。宣言は `CLAUDE.md` の marker が担い、`/bearing:setup-aim` が置く。

⚠ **供給の単位と採用の宣言は、別の層である。** install の scope は**どこへ配るか**を決め、marker は**この project がそれを通すか**を決める。⚠ **2 つは黙って食い違いうる** —— 全 project に配りながら、採用していない project では 1 つも走らない、が正しい姿である。⚠ **逆に配られていなければ hook も skill も走らない** —— だが `CLAUDE.md` の block は text であり、plugin が無くても読まれる。**その状態で何が見えるかは、下段のとおり repo の開示の問題である。**

⚠ **同じ事実を運ぶ面が複数あるなら、黙る述語は 1 つでなければならない。** 2026-09-03、hook は marker を見て黙るのに statusline は corpus の有無しか見ておらず、**採っていない全 project に 2 行目を描いていた** —— **同じ project が面ごとに別の姿を持つ**形である。⚠ **そしてそれは user スコープで載せるまで見えなかった**: 採った repo でしか面を見ていなかったからである。

⚠ **例外は 1 つだけ在り、それは例外として明示されねばならない。** baton の未読は、採っていない project でも述べる —— handoff は `docs/aims/` に何も依存せず、そこで黙らせることは **aim の沈黙ではなく handoff の欠落**になる。hook も面も同じ例外を持つ。

⚠ **宣言を置くことと、宣言した規律が働けることは別である**（2026-09-04、別 repo への適用で人間が踏んだ）。`with-aim` は `CLAUDE.md` の marker を置くが、**`_guide/` には何も置いていなかった** ∴ **置かれた法の第 1 条が、在らない file を指す**（`<corpus>/_guide/aim-authoring.md`）。⚠ **不在を述べる機構は在った。だが鳴るのは次のセッションの boot であり、相手はエージェントである** —— **人間が居合わせるのは `with-aim` の一度きりで、そこでは一言も無かった。** ⚠ **surface が在ることと、それが*居合わせる者*へ届くことは別である** —— 本 node が上段で述べている「面ごとに述語が違えば姿が食い違う」の、**時間軸における形**である。

**∴ `setup-aim` は宣言と一緒に規律も置く —— そして置いたところで責任が終わる**（人間の決定 2026-09-05）。置くのは `CLAUDE.md` の block と `.claude/skills/aim/`（plugin が template として運ぶ aim skill）の 2 つで、**どちらも置いた瞬間からその repo のものである。** track するか・直すか・古いままにするか・clone した誰もが読めるようにするか —— ⚠ **すべて repo の policy であって、plugin は関与しない。** aim は仕様書ではないが、独特な読み方を要する corpus を採る repo が**その読み方を開示するかどうかは repo が決める** —— plugin が cover することではない。

⚠ **∴ plugin は置いたものを追随させない。** 先行の手段 —— canon を `_guide/` へ置き、台帳で最新へ追随させる —— は「古いまま黙っていること自体が drift」を前提にしていたが、**置いた後の古さは repo のものである ∴ 追随しないことは中立である。** 経緯と、行き詰まりが測って出た形は `# HISTORY` に在る。⚠ **棄却されたのは手当てであって、上段の欠陥の観測ではない** —— 「置かれた法の第 1 条が、在らない file を指す」は実在し、人間が別 repo で踏んでいる。

**block は path ではなく skill 名を指す。** ⚠ **path を書けば version で腐る** —— plugin の cache path は version を含み、**cache は旧版を消さない**（実測 2026-09-04、1 台に 9 版）。⚠ **`${CLAUDE_PLUGIN_ROOT}` は hook の `command` と skill / command の本文では展開されるが、`CLAUDE.md` での展開は測っていない** —— そして `CLAUDE.md` は commit される。**skill 名は version を持たない ∴ commit しても嘘にならない。** ⚠ **skill が無いときの手当ては書かない** —— それは開示であり、repo のものである。

⚠ **規律が corpus の中に住まなくなる。** `.claude/skills/aim/` は「repo が自分のエージェントに与える指示」の置き場であり、`docs/aims/_guide/` のように corpus の中へ規律を混ぜない。⚠ **`docs/aims/_guide/` は廃される** —— あそこは bearing の build の源でありながら、bearing 自身の消費者側 canon でもあった。**同じ dir が 2 つの役を持っていたことが、複製の矢印が逆を向いた原因である**（`# HISTORY`）。正本は `original/<単位>/` へ集め（`aim` / `handoff` / `statusline`）、carrier の `skills/` と `commands/` はすべてそこからの生成物になる ∴ **bearing 自身の `.claude/skills/aim/` も置かれたものになり、bearing は自分の消費者の 1 つになる。**

⚠ **`setup-*` は、どこへ書くかを説明文で明示する**（人間の決定 2026-09-05）。`setup-aim` は実行した project の `CLAUDE.md` と `.claude/skills/aim/` へ、`setup-statusline` は人間の home（`~/.claude/`）へ書く。⚠ **これは scope の選択ではなく、置くものの性質である** —— aim の採用は repo の corpus についての宣言ゆえ repo にしか置けず、statusline の shim は home を含む path ゆえ home にしか置けない。**同じ `setup-*` の名で並ぶことが、並行に見せる** ∴ 説明文が層の違いを述べる。

# PROCESS

- [done] **hook 3 枚が、採用していない project で黙るようになった。** `aim-facts` / `boot-ritual` / `precompact` はいずれも出力 0 byte（実測）。⚠ **判定は `CLAUDE.md` の marker であり、`docs/aims/` の有無ではない** —— 後者では「aim と無関係な repo」と「採ったが node がまだ 0 の project」を区別できない
- [done] **`/bearing:with-aim`（現 `setup-aim`）が採用の宣言を置く。** marker 付きの block を `CLAUDE.md` へ差し込み、外すこともできる ∴ **採用は宣言であって、file の存在から推測されるものではない**
- [done] **[[ambient-display]] の 2 行目を、hook と同じ述語で gate した。** 例外は baton 未読 1 つ。⚠ **面ごとに述語が違えば、同じ project が面ごとに別の姿を持つ**
- [todo] **corpus が在っても「採用しない」を選べるようにする。** ⚠ **現在の述語は `corpus 在り || marker 在り` であり、corpus を持つ project は有効を降りられない** —— これは移行の便宜として入ったものだが、**`aim:` が述べる「選択できる」を満たしていない。** 降りる宣言をどの形で持つか（marker の変種か、settings の key か）を決めて、hook と面の両方がそれに従うようにする
- [done] **baton を repo の外へ出した。** `~/.bearing/units/<path を平坦化したもの>/handoff/` へ移し、**unit root の下には何も作らない** ∴ `.gitignore` に頼らず、**痕跡になりようがない**形になった。⚠ **添える案（`.handoff/.gitignore`）は採らなかった** —— あれは「痕跡を残しうるが隠す」であって、`aim:` が述べる「痕跡を残さない」ではない。⚠ **引くのは unit root の path であって repo 名ではない**（同名 repo や複数 worktree が黙って同じ baton を共有する形を塞ぐ）。⚠ **旧い置き場に残ったものは機構がもう読まない** ∴ 在ることを述べ、`bearing-handoff.mjs migrate` を名指すところで止まる —— **移動は人間の act である**。⚠ **2026-09-03、bearing 自身の `.gitignore` からも `.handoff/` の行を落とした**（人間が移行完了を宣言した）—— **残せば「置き場は repo 側に在るが隠している」と読める** ∴ `.gitignore` に頼らない形と、ignore の記述そのものが食い違う


- [todo] **`with-aim` を `setup-aim` へ改め、canon 置きをやめ、`.claude/skills/aim/` の template と block を置く。** ⚠ **既に置かれた `_guide/` の複製と台帳は消さない** —— opt-in を外すことと、その repo が持つ doc を捨てることは別の act である。`--remove` も消さない。⚠ **既に在る `.claude/skills/aim/` は潰さずに述べて止まる** —— 置いた後は repo のものであり、2 度目の `setup-aim` はそれを「我々のもの」として扱えない
- [todo] **block が skill 名を指し、path も version も、不在の手当ても持たない。**
- [todo] **`setup-aim` / `setup-statusline` の説明文が、どこへ書くかを述べる。** aim は実行した project へ、statusline は home へ —— 層が違うことを字面に出す
- [todo] **statusline の shim が「載っていない」と描くとき、install の scope を勧めない。** `absentLine()` の `--scope project` を落とす —— scope は install する人間のものである
- [todo] **正本を `original/<単位>/` へ集め、`docs/aims/_guide/` を廃し、carrier の `skills/` と `commands/` を生成物にする。** ⚠ `scripts/classify-paths.mjs` の `GENERATED` に `commands/` を足すこと —— さもないと生成物の変更が code 扱いで PR を要求する

# HISTORY

## 棄却: `with-aim` が消費者の `_guide/` へ canon を置き、台帳で最新へ追随させる

**立てた**: 2026-09-04（人間の決定）。**棄却**: 2026-09-05（人間の決定）。

⚠ **立てた理由は今も真である。** 「置かれた法の第 1 条が、在らない file を指す」は実在の欠陥であり、人間が別 repo で踏んだ。**棄却されたのは欠陥の観測ではなく、それへの手当てのほうである。**

**行き詰まりは 3 つとも測って出た**（実測 2026-09-05）:

- ⚠ **複製の矢印が、消費者から見ると逆を向いていた。** 実行時に canon を読む経路は 3 本ともplugin の `skills/` を読んでおり（`lib/canon.mjs` の `CANON_FILES` は `from: ['skills','aim',…]`、`lib/claude-md.mjs` と `bin/aim-facts.mjs` は `skills/aim/frame.md`）、**`docs/aims/_guide/` を canon として読む経路は 1 本も無かった** —— あそこは build 時にしか読まれない。∴ 消費者の `_guide/` は *skill から置かれた複製*であるのに、同じ `with-aim` が置く `CLAUDE.md` の文は **skill のほうを「同梱する複製」と呼び、手元の `_guide/` を先に読めと述べていた。**
- ⚠ **出荷物の中で 2 文が矛盾していた。** `lib/claude-md.mjs` は「**法の正本は `skills/aim/frame.md` 1 枚である**」と述べ、`gen/claude-plugin.sh` は全 `SKILL.md` の末尾に「**実体は `docs/aims/_guide/` にある**」と刻んで出荷していた。⚠ **後者は消費者の repo では*その repo 自身の `_guide/`*（＝置かれた複製）を指す** —— **一方の視点でだけ真な文が配られていた。**
- ⚠ **手当ての費用が、手当てする欠陥より大きく育っていた。** 5 状態（`place` / `current` / `stale` / `edited` / `unknown`）・台帳 `.bearing-canon.json`・CRLF 正規化比較・「触らなかった枚に今の sha を書かない」—— **どれも「消費者側に複製を置いた」ことからのみ生じる問題である。** 置かなければ 1 つも要らない。

**この手段の下で実装され、棄却とともに撤去されるもの**: `lib/canon.mjs`（5 状態と台帳）・`_guide/.bearing-canon.json`・`with-aim --no-canon`・`--remove` は canon を消さないという規約（⚠ **最後の 1 つだけは新 IS へ引き継ぐ** —— 理由が手段ではなく所有に属するため）。

⚠ **同じ轍**: 置く手段が同期の義務を連れてきたのは、**置いたものを我々のものだと見ていたから**である。新 IS は置いた後の所有を repo へ渡した ∴ 義務は生まれない。⚠ **「古いまま黙っていること自体が drift であり、追随しないことは中立ではない」は前提ごと棄却された** —— 置いた後の古さは repo のものであり、**追随しないことは中立である**（人間の決定 2026-09-05）。

# DAG

- 関連: [[aim-tree]] / [[purpose-drift]] —— 痕跡を残す側の代表。**採用の宣言を要求するのはこちらである**
- 関連: [[session-handoff]] —— 痕跡を残さない側の代表。⚠ **今はそれが構造で担保されている**（上の `[done]`）—— baton は home の下に住み、**unit root には何も作らない** ∴ `.gitignore` に頼っていない
- 関連: [[ambient-display]] —— この法を面で実装した先。1 行目は汎用、2 行目は採用した project にだけ
- 関連: [[surface-parity]] —— **面ごとに述語が違えば姿が食い違う**。あちらは「どこが揃っていないか」を述べ、本 node は**何を基準に揃えるか**を持つ
- 照合: [[aim-tree]] @ 654e7aef —— あちらの手段は「所有で目的を引き、置き場は repo、木で構造化する」であり、**plugin がその repo に書く前に何を要求するか**には触れていない。corpus は「その project 自身のもの」であって我々が置くものではない、という本 node の表の記述も、あちらの「置き場は repo」と同じ側に立つ ∴ `aim:` を同意へ pin し直しても、あちらに書き換える主張は無い
- 照合: [[purpose-drift]] @ 654e7aef —— あちらの手段は「安く機械的に可視化し、判定はしない」である。本 node が持つのは**可視化が走る前に宣言を要求すること**であり、**何を可視化するか・判定しないこと**には触れていない ∴ `aim:` が scope から同意へ動いても、あちらの 3 層も 2 種のズレも動かない
- 関連: [[consumer-evidence]] —— 本 node が**何を置かないか**を決め、あちらが**置かなかった結果が向こうでどう見えるか**を検める。⚠ **置くのをやめた以上、`CLAUDE.md` の block だけが消費者に届く** ∴ あちらの検査は安全網として本 node に依存している
