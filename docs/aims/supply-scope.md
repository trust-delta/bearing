---
aim: リポジトリに痕跡を残す機能はプロジェクト単位で採用の是非を選択でき、痕跡を残さない汎用的な機能はユーザ単位で有効になる
parent: bearing
state: open
---

# IS

**軸は「repo に触れるか」ではなく「repo に痕跡が残るか」である。** 触れるだけの機能は在る —— [[ambient-display]] の 1 行目は branch を読むが、**repo の履歴には何も残さない**。∴ 触れることを基準にすると、汎用であるべきものが project 側へ落ちる。⚠ **残るものだけが、その project の持ち物になる。**

⚠ **[[session-handoff]] はかつてこちら側の例だった** —— baton は cwd の傍らの `.handoff/` に住んでおり、「触れるが残さない」ものとして数えていた。⚠ **2026-09-03、それが「残さない」ではなく「残しうるが隠す」だと分かり、置き場を repo の外へ出した**（下の `[done]`）∴ **今は触れてすらいない。** ⚠ **動いたのは軸ではなく実装のほうである** —— 軸に照らして測り直した結果、例が side を移った。

∴ 2 つの側は、こう分かれる:

| | 痕跡 | 有効になる単位 |
| --- | --- | --- |
| [[aim-tree]] / [[purpose-drift]] | `docs/aims/`（tracked）・`CLAUDE.md` の法の block（tracked） | **project ごとに選ぶ** |
| [[session-handoff]] | 無い（baton は `~/.bearing/units/<unit>/handoff/` ＝ home の下。**unit root には何も作らない**） | **user ごとに一度** |
| [[ambient-display]] の 1 行目 | 無い（何も置かず、branch を読むだけ） | **user ごとに一度** |

⚠ **前半は文字通り「選択できる」でなければならない**（人間が 2026-09-03 に確定）—— **aim を使っている project が、この plugin の aim 機能は有効にしない、という選択もありうる。** ∴ gate は「corpus が在るか」では足りない: 在ることは**使っている証拠**であって**この機構を通したいという宣言**ではない。宣言は `CLAUDE.md` の marker が担い、`/bearing:with-aim` が置く。

⚠ **供給の単位と採用の宣言は、別の層である。** install の scope（user / project / local）は**どこへ配るか**を決め、marker は**この project がそれを通すか**を決める。⚠ **2 つは黙って食い違いうる** —— user スコープで全 project に配りながら、採用していない project では 1 つも働かない、が正しい姿である。逆に、配られていなければ marker が在っても何も起きない。

⚠ **同じ事実を運ぶ面が複数あるなら、黙る述語は 1 つでなければならない。** 2026-09-03、hook は marker を見て黙るのに statusline は corpus の有無しか見ておらず、**採っていない全 project に 2 行目を描いていた** —— **同じ project が面ごとに別の姿を持つ**形である。⚠ **そしてそれは user スコープで載せるまで見えなかった**: 採った repo でしか面を見ていなかったからである。

⚠ **例外は 1 つだけ在り、それは例外として明示されねばならない。** baton の未読は、採っていない project でも述べる —— handoff は `docs/aims/` に何も依存せず、そこで黙らせることは **aim の沈黙ではなく handoff の欠落**になる。hook も面も同じ例外を持つ。

⚠ **宣言を置くことと、宣言した規律が働けることは別である**（2026-09-04、別 repo への適用で人間が踏んだ）。`with-aim` は `CLAUDE.md` の marker を置くが、**`_guide/` には何も置いていなかった** ∴ **置かれた法の第 1 条が、在らない file を指す**（`<corpus>/_guide/aim-authoring.md`）。⚠ **不在を述べる機構は在った。だが鳴るのは次のセッションの boot であり、相手はエージェントである** —— **人間が居合わせるのは `with-aim` の一度きりで、そこでは一言も無かった。** ⚠ **surface が在ることと、それが*居合わせる者*へ届くことは別である** —— 本 node が上段で述べている「面ごとに述語が違えば姿が食い違う」の、**時間軸における形**である。

⚠ **∴ `with-aim` が canon も置く**（人間の決定 2026-09-04）。⚠ **`_guide/README.md` は長く「plugin は自分では置かない —— 置くかどうかはその repo が規律を採るかどうかの判断であって、道具が代行してよいものではない」と述べていた。理由は正しいが、`with-aim` には掛からない** —— **あの marker は「opt-in の宣言」そのものであり、判断は既に下されている。** ⚠ **加えて「人間が手で置く」道には腐る経路が在った**: 同梱の複製は version を含む path に住み、**cache は旧版を消さない**（実測 2026-09-04、1 台に 8 版。最古 `0.4.0`）∴ 手で辿らせれば黙って古い canon を置く日が来る —— [[ambient-display]] と [[human-domain]] が 2 度名指した腐り方である。**道具が置けば、人間は version を 1 度も見ない。**

# PROCESS

- [done] **hook 3 枚が、採用していない project で黙るようになった。** `aim-facts` / `boot-ritual` / `precompact` はいずれも出力 0 byte（実測）。⚠ **判定は `CLAUDE.md` の marker であり、`docs/aims/` の有無ではない** —— 後者では「aim と無関係な repo」と「採ったが node がまだ 0 の project」を区別できない
- [done] **`/bearing:with-aim` が採用の宣言を置く。** marker 付きの block を `CLAUDE.md` へ差し込み、外すこともできる ∴ **採用は宣言であって、file の存在から推測されるものではない**
- [done] **[[ambient-display]] の 2 行目を、hook と同じ述語で gate した。** 例外は baton 未読 1 つ。⚠ **面ごとに述語が違えば、同じ project が面ごとに別の姿を持つ**
- [done] **user スコープの install で、汎用側を全 project へ供給した。** 装着は `/bearing:statusline-setup` の 1 手で、shim は install record を読むので 1 行に version が入らない
- [done] **`/bearing:with-aim` が canon も置くようにした。** 置くのは 3 枚（`aim-authoring.md` / `aim-facts.md` / `handoff.md` ＝ carrier へ同梱される中立正本と同じ集合）。⚠ **`frame.md` と `_guide/README.md` は置かない** —— 前者は hook と block が運び、後者は `_guide/` を*著述する側*の doc である。⚠ **既に在って中身が違う枚は触らず、触っていないことと理由を同じ息で述べる** —— 置いた後の `_guide/` はその repo の doc である。⚠ **比較の前に改行を正規化する** —— `core.autocrlf=true` の機体では checkout が CRLF へ変え、素朴な比較は**中身が同じ file を「違う」と呼ぶ**。そして「違う」は人間を呼び出す合図ゆえ、**偽陽性はそのまま雑音になる**。⚠ **同梱物が読めないときはそう述べる**（「置かなかった」と「置く元が無かった」を同じ沈黙にしない）。断る道は `--no-canon`、⚠ **`--remove` は canon を消さない** —— opt-in を外すことと、その repo が持つ doc を捨てることは別の act である
- [todo] **corpus が在っても「採用しない」を選べるようにする。** ⚠ **現在の述語は `corpus 在り || marker 在り` であり、corpus を持つ project は有効を降りられない** —— これは移行の便宜として入ったものだが、**`aim:` が述べる「選択できる」を満たしていない。** 降りる宣言をどの形で持つか（marker の変種か、settings の key か）を決めて、hook と面の両方がそれに従うようにする
- [done] **baton を repo の外へ出した。** `~/.bearing/units/<path を平坦化したもの>/handoff/` へ移し、**unit root の下には何も作らない** ∴ `.gitignore` に頼らず、**痕跡になりようがない**形になった。⚠ **添える案（`.handoff/.gitignore`）は採らなかった** —— あれは「痕跡を残しうるが隠す」であって、`aim:` が述べる「痕跡を残さない」ではない。⚠ **引くのは unit root の path であって repo 名ではない**（同名 repo や複数 worktree が黙って同じ baton を共有する形を塞ぐ）。⚠ **旧い置き場に残ったものは機構がもう読まない** ∴ 在ることを述べ、`bearing-handoff.mjs migrate` を名指すところで止まる —— **移動は人間の act である**。⚠ **2026-09-03、bearing 自身の `.gitignore` からも `.handoff/` の行を落とした**（人間が移行完了を宣言した）—— **残せば「置き場は repo 側に在るが隠している」と読める** ∴ `.gitignore` に頼らない形と、ignore の記述そのものが食い違う

# DAG

- 関連: [[aim-tree]] / [[purpose-drift]] —— 痕跡を残す側の代表。**採用の宣言を要求するのはこちらである**
- 関連: [[session-handoff]] —— 痕跡を残さない側の代表。⚠ **今はそれが構造で担保されている**（上の `[done]`）—— baton は home の下に住み、**unit root には何も作らない** ∴ `.gitignore` に頼っていない
- 関連: [[ambient-display]] —— この法を面で実装した先。1 行目は汎用、2 行目は採用した project にだけ
- 関連: [[surface-parity]] —— **面ごとに述語が違えば姿が食い違う**。あちらは「どこが揃っていないか」を述べ、本 node は**何を基準に揃えるか**を持つ
- 照合: [[aim-tree]] @ 98ba8c28 —— あちらの手段は「所有で目的を引き、置き場は repo、木で構造化する」であり、**その木がどの単位で有効になるか**には触れていない ∴ 本 node が単位を述べても、あちらに書き換える主張は無い
- 照合: [[purpose-drift]] @ 98ba8c28 —— あちらの手段は「安く機械的に可視化し、判定はしない」である。**可視化がどの project で働くか**は本 node が決めるが、**何を可視化するか・判定しないこと**は動かない ∴ 食い違いは無い
