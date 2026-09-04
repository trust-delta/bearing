# bearing

*English: [README.en.md](README.en.md)*

**bearing は 2 つのことを同時に意味する: 進んでいる方位と、負っている荷重。**
この repo は、その両方を AI との coding セッションへ持ち込み、**セッションを跨いでも、
マシンを跨いでも、context window が埋まる瞬間を越えても**そこに保ち続ける。

> **これが仕えている目的。** *自前の場を供給しない。汎用ハーネスを器として受け入れ、
> そこへ接ぎ木するのは、そのハーネスが持ちえないものだけ —— 人間が pin した目的を運ぶ
> 機構と、注意の予算を守る機構である。*

**⚠ 想定するのは個人開発である。** 1 人の人間が 1 つのセッションと対話しながら進める形
—— いわゆる vibe coding —— が前提であり、**それは規模の遠慮ではなく、機構が成り立つ条件**
である。「目的は人間のもの」「迷ったら人間に escalate する」が 1 文で書けるのは、**その人間が
誰かを問う必要がない**からだ。複数人の project で使うなら、誰が目的を pin し誰が達成を宣言
するのかを、その project が自分で決めて書く必要がある。

コーディングハーネスは良くなった。⚠ **それでもなお持っていないのは、「これは何のためか」
「我々は何をなぜ決めたのか」「code はそれが書かれた理由から離れていないか」に対する持続的な
答えである。** これらの問いはセッションより長く生きる。セッションは生きない。

## 3 つの機構

| | 何をするか |
| --- | --- |
| **aim** | 目的と手段の木。1 つの目的につき 1 file。⚠ `aim:` の行は**人間のもの**で、エージェントはそれを書き換えてはならない。 |
| **handoff** | context が圧縮される**前に**著される baton。∴ 先へ運ばれるものは、切り詰めを生き延びたものではなく**選ばれたもの**になる。 |
| **drift** | body が、それが仕えると称する目的から離れていないか、隣接から離れていないかを、安く機械的に検知する。⚠ **候補を可視化するだけで、判定はしない。** |

## これが何ではないか

エージェントの framework ではないし、server でもないし、wrapper でもない。**何かが走るための
場を一切足さない。** 実体は plugin 1 つと、いくらかの Markdown と、git に問い合わせる数百行の
Node である。

**⚠ ここが敷く体制は、エージェントを*利する*ためではなく、エージェントに*対して*働く。**
エージェントは木を保守し、どの目的についても変更を提案してよい —— **だが目的を pin すること、
そして目的が達成されたと宣言することは、人間の act である。** この非対称が要点の全てである。

## 使い方

### 導入 —— user スコープに 1 度だけ

```
claude plugin marketplace add https://github.com/trust-delta/bearing.git --scope user
claude plugin install bearing@trust-delta --scope user
```

そのうえで**セッションを開き直す** —— skill と hook の一覧は**セッション開始時に固まる**。

⚠ **`enabledPlugins` の宣言は「載せる」ことではない。** `installed_plugins.json` に record が
無ければ skill も hook も 1 枚として走らず、⚠ **載っていない機構は自分の不在を報告できない**
∴ 画面には何も出ない。**載っているかを見るのは `claude plugin list` である** —— `claude plugin
details` は record が無くても版も skill も hook も列挙する ∴ 載っている証拠にならない。

### aim を採る —— project ごとの opt-in

```
/bearing:with-aim                    # 法の block を CLAUDE.md の末尾へ差し込む
/bearing:with-aim --check            # 状態だけ述べる
/bearing:with-aim --remove           # 外す
/bearing:with-aim --dir proj/aims    # corpus の在り処を宣言する（既定は docs/aims）
```

⚠ **marker は HTML コメント ∴ context を 1 token も食わない。** 版と本文 sha を運ぶので、
`--check` は**「版が古い」と「人間が block を編集した」を別のものとして述べる** —— 後者では
置き直さず、述べて止まる。

⚠ **採っていない project では hook は 1 byte も出さない**（例外は未読の baton 1 つ —— handoff は
aim に依存しない）。⚠ **corpus が既に在れば、marker が無くても従来どおり喋る。**

### 面を付ける

```
/bearing:statusline-setup            # 装着（--force で差し替え、--uninstall で外す）
```

`~/.claude/` に薄い shim を置き、user settings に 1 行を書く。⚠ **shim は走るたびに install
record を読んで今の版へ橋渡しする** ∴ **1 行に version が入らず、bump で腐らない。**
⚠ **書き先は user settings に限る** —— 絶対 path は home を含む ∴ tracked な project settings へ
書けば、他の人間の面が黙って壊れる形を repo に commit することになる。既に別の statusline が
在れば**上書きせず述べて止まる**。⚠ **statusline だけは再起動を要さない**（設定は live に拾われる）。

### 更新

```
claude plugin marketplace update trust-delta
claude plugin update bearing@trust-delta
```

そして**セッションを開き直す**。⚠ **`extraKnownMarketplaces` に `"autoUpdate": true` を宣言
すれば起動時に自動で引かれる** —— ただし**実測は 2 件あって食い違っている**（同じ宣言で、
2 日間 1 度も引かれなかった日と、11 commit が自動で引かれた日がある）∴ **「宣言すれば必ず」
とは読まないこと。**

⚠ **配る側が `plugin.json` の `version` を上げない限り、受ける側が何をしても cache は
差し替わらない。**

> **なぜこの形なのか** —— 供給が 2 層（宣言と実体）に分かれる理由、法を `CLAUDE.md` へ置いた
> 理由、装着が人間の act として残る理由、そのそれぞれの実測は
> [`docs/aims/bearing.md`](docs/aims/bearing.md) と
> [`docs/aims/ambient-display.md`](docs/aims/ambient-display.md) に在る。

## 開発

**⚠ clone したら 1 度だけ:**

```
git config core.hooksPath .githooks
```

⚠ **この repo は tracked な `.claude/settings.json` を持たない** ∴ **clone しただけでは skill も
hook も面も 1 枚も載らない** —— 上の「使い方」を 1 度通すこと。

⚠ **開発中に走るのは手元の code である。** marketplace は自分自身の remote を指す ∴ cache に
入るのは push 済みの版だが、**cache 側の `bin/` はすべて、`CLAUDE_PROJECT_DIR` が bearing の
checkout を指していると分かれば working tree へ委譲する** —— hook も statusline も同じ 1 経路
である。⚠ **委譲は cache 側の code が担う** ∴ **その shim 自体を変えたときだけ、版の門が
ふたたび効く。**（plugin を載せずに走らせるなら `claude --plugin-dir ./carriers/claude/bearing`。）

### push の規則

**非コードのドキュメント系は直プッシュ可、コードを含む場合は PR 必須。** 判定は
`scripts/classify-paths.mjs` が 1 箇所で持ち、pre-push hook と CI の `push-policy` workflow の
**両方がそれを呼ぶ** —— 別実装にすれば必ず乖離し、しかも乖離は黙って起きる。

⚠ **GitHub 側でこの規則を条件付きで強制することはできない**（path 条件で push を弾ける *push
ruleset* は、この repo が public かつ User 所有であるため拒否される —— 実測 2026-09-01）∴
強制の実体は 2 段しかない:

| | 何をするか | 破れるか |
| --- | --- | --- |
| `.githooks/pre-push` | **行為の瞬間に**止める | `--no-verify` で破れる。⚠ **上の設定をしていない clone では存在しないのと同じ** |
| `.github/workflows/push-policy.yml` | 着地した違反を**赤く恒久的に残す** | 破れない。ただし**防げない** |

⚠ **hook が破れるのは欠陥ではなく設計である** —— 規則を曲げる判断は人間のものであり、道具が
それを奪ってはならない。破った事実は CI に残る。

### 門

CI が落とす門は 2 つだけ: **test** と、**carrier が正本と同期していること**。言語の測定は
**報告であって門ではない**（[`native-language`](docs/aims/native-language.md) の前提がまだ
実測されていない以上、規律を硬い門にするのは早い）。

```
node --test carriers/claude/bearing/test/*.test.mjs   # test
bash gen/claude-plugin.sh --plugin                    # carrier の再生成
node scripts/lang-report.mjs                          # 言語の測定（落ちない）
```

### release

⚠ **`plugin.json` の `version` を上げない限り、変更は静かに、誰にも届かないまま着地する**
∴ bump は release の一部である。⚠ **`claude plugin validate <path>` は manifest を触ったときの
門として使える。**

> 供給で踏んだもの —— 宣言と実体が丸 1 日食い違った件、`autoUpdate` の食い違う実測、install を
> 打たずに record が生まれた経路 —— は [`docs/aims/bearing.md`](docs/aims/bearing.md) に在る。

## 言語

**このプロジェクトの正本は日本語である。** ⚠ これは慣習ではなく、**エージェントへの指示は
言語を統一した方が質が高い**という判断に基づく手段であり、その前提はまだ実測されていない
（[`docs/aims/native-language.md`](docs/aims/native-language.md) を参照）。英語版の
README は併置してあるが従属物であり、食い違ったときは日本語側が正である。

機械が parse する契約 —— fence の tag と field 名、slug、識別子 —— は英語のままである。
**判別線は「人が読む文か、機械が parse する token か」であって、内と外ではない。**

## 現況

初期段階であり、それを正直に述べる。規律そのものは、ある private project の中で数か月に
わたって自分自身に適用されながら育った。⚠ **plugin の実体はこの repo に移り、標準ハーネス上で
動いている。だが「標準ハーネスとこの plugin だけで開発が成り立つか」はまだ実測していない。**
それが root node の中心的な未検証項目である。

**⚠ 履歴は運ばなかった。** 3 機構は前身プロジェクト `tmai`（*tactful multi agents interface*）
の中で育ったが、あちらの履歴は一貫して「tmai という場所の中での役割・手段」を前提に書かれて
いる。この repo が問うのは「外付け拡張としてどうか」であり、出発点が違う。∴ **概念は継承し、
履歴は継承しない。**

## 来歴

規律は `tmai` の中で育った。あれは coding agent が走るための**場**を作ろうとした project で
あり、3 本の柱のうち 2 本は、標準ハーネスがその「場である」という仕事を吸収した時点で死んだ。
⚠ **生き残ったのは場ではなく、方法だった。** この repository は、その方法が今住んでいる場所
である。

## ライセンス

MIT。⚠ **正本は [`LICENSE`](LICENSE) 1 枚である。** plugin 側の複製は生成物であり
（`gen/claude-plugin.sh`）、食い違いは CI が赤くする —— ⚠ **marketplace entry の source は
`./carriers/claude/bearing` ∴ root の LICENSE は消費者の cache に届かない**（実測）。
複製は重複ではなく、配布物の一部である。

Copyright (c) 2026 TrustDelta
