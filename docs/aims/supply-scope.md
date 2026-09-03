---
aim: リポジトリに痕跡を残す機能はプロジェクト単位で採用の是非を選択でき、痕跡を残さない汎用的な機能はユーザ単位で有効になる
parent: bearing
state: open
---

# IS

**軸は「repo に触れるか」ではなく「repo に痕跡が残るか」である。** 触れるだけの機能は在る —— [[session-handoff]] の baton は repo 直下に dir を作り、[[ambient-display]] の 1 行目は branch を読む —— が、**どちらも repo の履歴には何も残さない**。∴ 触れることを基準にすると、汎用であるべきものが project 側へ落ちる。⚠ **残るものだけが、その project の持ち物になる。**

∴ 2 つの側は、こう分かれる:

| | 痕跡 | 有効になる単位 |
| --- | --- | --- |
| [[aim-tree]] / [[purpose-drift]] | `docs/aims/`（tracked）・`CLAUDE.md` の法の block（tracked） | **project ごとに選ぶ** |
| [[session-handoff]] | `.handoff/`（machine-local・git に載らない） | **user ごとに一度** |
| [[ambient-display]] の 1 行目 | 無い（何も置かず、branch を読むだけ） | **user ごとに一度** |

⚠ **前半は文字通り「選択できる」でなければならない**（人間が 2026-09-03 に確定）—— **aim を使っている project が、この plugin の aim 機能は有効にしない、という選択もありうる。** ∴ gate は「corpus が在るか」では足りない: 在ることは**使っている証拠**であって**この機構を通したいという宣言**ではない。宣言は `CLAUDE.md` の marker が担い、`/bearing:with-aim` が置く。

⚠ **供給の単位と採用の宣言は、別の層である。** install の scope（user / project / local）は**どこへ配るか**を決め、marker は**この project がそれを通すか**を決める。⚠ **2 つは黙って食い違いうる** —— user スコープで全 project に配りながら、採用していない project では 1 つも働かない、が正しい姿である。逆に、配られていなければ marker が在っても何も起きない。

⚠ **同じ事実を運ぶ面が複数あるなら、黙る述語は 1 つでなければならない。** 2026-09-03、hook は marker を見て黙るのに statusline は corpus の有無しか見ておらず、**採っていない全 project に 2 行目を描いていた** —— **同じ project が面ごとに別の姿を持つ**形である。⚠ **そしてそれは user スコープで載せるまで見えなかった**: 採った repo でしか面を見ていなかったからである。

⚠ **例外は 1 つだけ在り、それは例外として明示されねばならない。** baton の未読は、採っていない project でも述べる —— handoff は `docs/aims/` に何も依存せず、そこで黙らせることは **aim の沈黙ではなく handoff の欠落**になる。hook も面も同じ例外を持つ。

# PROCESS

- [done] **hook 3 枚が、採用していない project で黙るようになった。** `aim-facts` / `boot-ritual` / `precompact` はいずれも出力 0 byte（実測）。⚠ **判定は `CLAUDE.md` の marker であり、`docs/aims/` の有無ではない** —— 後者では「aim と無関係な repo」と「採ったが node がまだ 0 の project」を区別できない
- [done] **`/bearing:with-aim` が採用の宣言を置く。** marker 付きの block を `CLAUDE.md` へ差し込み、外すこともできる ∴ **採用は宣言であって、file の存在から推測されるものではない**
- [done] **[[ambient-display]] の 2 行目を、hook と同じ述語で gate した。** 例外は baton 未読 1 つ。⚠ **面ごとに述語が違えば、同じ project が面ごとに別の姿を持つ**
- [done] **user スコープの install で、汎用側を全 project へ供給した。** 装着は `/bearing:statusline-setup` の 1 手で、shim は install record を読むので 1 行に version が入らない
- [todo] **corpus が在っても「採用しない」を選べるようにする。** ⚠ **現在の述語は `corpus 在り || marker 在り` であり、corpus を持つ project は有効を降りられない** —— これは移行の便宜として入ったものだが、**`aim:` が述べる「選択できる」を満たしていない。** 降りる宣言をどの形で持つか（marker の変種か、settings の key か）を決めて、hook と面の両方がそれに従うようにする
- [done] **baton を repo の外へ出した。** `~/.bearing/units/<path を平坦化したもの>/handoff/` へ移し、**unit root の下には何も作らない** ∴ `.gitignore` に頼らず、**痕跡になりようがない**形になった。⚠ **添える案（`.handoff/.gitignore`）は採らなかった** —— あれは「痕跡を残しうるが隠す」であって、`aim:` が述べる「痕跡を残さない」ではない。⚠ **引くのは unit root の path であって repo 名ではない**（同名 repo や複数 worktree が黙って同じ baton を共有する形を塞ぐ）。⚠ **旧い置き場に残ったものは機構がもう読まない** ∴ 在ることを述べ、`handoff.mjs migrate` を名指すところで止まる —— **移動は人間の act である**

# DAG

- 関連: [[aim-tree]] / [[purpose-drift]] —— 痕跡を残す側の代表。**採用の宣言を要求するのはこちらである**
- 関連: [[session-handoff]] —— 痕跡を残さない側の代表。⚠ **ただし今は担保が無い**（上の `[todo]`）
- 関連: [[ambient-display]] —— この法を面で実装した先。1 行目は汎用、2 行目は採用した project にだけ
- 関連: [[surface-parity]] —— **面ごとに述語が違えば姿が食い違う**。あちらは「どこが揃っていないか」を述べ、本 node は**何を基準に揃えるか**を持つ
- 照合: [[aim-tree]] @ 98ba8c28 —— あちらの手段は「所有で目的を引き、置き場は repo、木で構造化する」であり、**その木がどの単位で有効になるか**には触れていない ∴ 本 node が単位を述べても、あちらに書き換える主張は無い
- 照合: [[purpose-drift]] @ 98ba8c28 —— あちらの手段は「安く機械的に可視化し、判定はしない」である。**可視化がどの project で働くか**は本 node が決めるが、**何を可視化するか・判定しないこと**は動かない ∴ 食い違いは無い
