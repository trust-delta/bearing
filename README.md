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

## 言語

**このプロジェクトの正本は日本語である。** ⚠ これは慣習ではなく、**エージェントへの指示は
言語を統一した方が質が高い**という判断に基づく手段であり、その前提はまだ実測されていない
（[`docs/aims/native-language.md`](docs/aims/native-language.md) を参照）。英語版の
README は併置してあるが従属物であり、食い違ったときは日本語側が正である。

機械が parse する契約 —— fence の tag と field 名、slug、識別子 —— は英語のままである。
**判別線は「人が読む文か、機械が parse する token か」であって、内と外ではない。**

## 開発

**⚠ clone したら 1 度だけ、次を通すこと** —— ⚠ **この repo は tracked な `.claude/settings.json` を
持たない**（2026-09-04 に外した）∴ **clone しただけでは skill も hook も面も 1 枚も載らない。**

```
git config core.hooksPath .githooks                    # push の規則を手元で効かせる
claude plugin marketplace add https://github.com/trust-delta/bearing.git --scope user
claude plugin install bearing@trust-delta --scope user
```

ここで**セッションを開き直し**（slash command と hook の一覧は**セッション開始時に固まる**）、

```
/bearing:with-aim            # aim の法を CLAUDE.md へ差し込む（この repo の CLAUDE.md は untracked）
/bearing:statusline-setup    # 面を装着する（⚠ こちらは即時に効く —— 設定は live に拾われる）
```

⚠ **`autoUpdate` を効かせたいなら、`~/.claude/settings.json` の `extraKnownMarketplaces.trust-delta`
へ `"autoUpdate": true` を手で足す** —— `marketplace add` にその flag は無い。

`main` への push の規則はこうである —— **非コードのドキュメント系は直プッシュ可、コードを
含む場合は PR 必須。** 判定は `scripts/classify-paths.mjs` が 1 箇所で持ち、pre-push hook と
CI の `push-policy` workflow の**両方がそれを呼ぶ**（別実装にすれば必ず乖離し、しかも乖離は
黙って起きる）。

⚠ **GitHub 側でこの規則を条件付きで強制することはできない。** path 条件で push を弾ける
*push ruleset* は、この repo が **public かつ User 所有**であるため 2 つの理由で拒否される
（実測 2026-09-01）。∴ 強制の実体は 2 段しかない:

| | 何をするか | 破れるか |
| --- | --- | --- |
| `.githooks/pre-push` | **行為の瞬間に**止める | `--no-verify` で破れる。⚠ **上の設定をしていない clone では存在しないのと同じ** |
| `.github/workflows/push-policy.yml` | 着地した違反を**赤く恒久的に残す** | 破れない。ただし**防げない** |

⚠ **hook が破れるのは欠陥ではなく設計である** —— 規則を曲げる判断は人間のものであり、
道具がそれを奪ってはならない。破った事実は CI に残る。

CI が落とす門は 2 つだけ: **test** と、**carrier が正本と同期していること**。
言語の測定（`scripts/lang-report.mjs`）は**報告であって門ではない** —— [`native-language`](docs/aims/native-language.md)
の前提がまだ実測されていない以上、規律を硬い門にするのは早い。

```
node --test carriers/claude/bearing/test/*.test.mjs   # test
bash gen/claude-plugin.sh --plugin                    # carrier の再生成
node scripts/lang-report.mjs                          # 言語の測定（落ちない）
```

⚠ **開発中に走るのは手元の code である。** marketplace は自分自身の remote を指す ∴ cache に入るのは
**push 済みの版**だが、**cache 側の `bin/` はすべて、`CLAUDE_PROJECT_DIR` が bearing の checkout を
指していると分かれば working tree へ委譲する** —— hook も statusline も同じ 1 経路である（実測:
cache の複製に印を入れると、この repo の中では印が出ず、外の project では出る）。⚠ **委譲は cache 側の
code が担う** ∴ **その shim 自体を変えたときだけ、版の門がふたたび効く。**

⚠ **plugin を載せずに working tree だけで走らせるなら** `claude --plugin-dir ./carriers/claude/bearing`。

### 配布 —— push しただけでは誰にも届かない

⚠ 門は 3 つあり、**受ける側に 2 つ・配る側に 1 つ**在る（公式 docs と実測、2026-09-01 / 09-03）:

| 門 | 誰が外すか |
| --- | --- |
| marketplace の clone は起動時に自動 pull されない | **受ける側** —— `extraKnownMarketplaces` に `"autoUpdate": true` を宣言すれば起動時に自動。しなければ `/plugin marketplace update trust-delta` → `/plugin update bearing` → 再起動の 3 手 ⚠ **宣言の効きには実測が 2 件あり、食い違っている**（1 台、clone の reflog）: `2026-09-01` の clone から `09-03` まで **2 日間 pull が 1 本も無く**（その間に 14 commit が push されている）、一方 `09-04` の起動では **11 commit 分が自動で引かれた** —— どちらも同じ project スコープの宣言である。∴ ⚠ **「project スコープの entry は対象外」ではない**（それなら後者が起きない）が、**何が 2 つを分けているかはまだ分かっていない** ∴ **この行は「宣言すれば必ず引かれる」とまでは読まないこと。** |
| `plugin.json` の `version` を上げない限り cache は差し替わらない | **配る側** —— 毎リリース bump する。⚠ これを忘れると、受ける側が何をしても届かない |
| tracked な宣言は **enable であって install ではない** —— `installed_plugins.json` に record が無い限り、plugin は 1 枚も載らない | **受ける側** —— `claude plugin install bearing@trust-delta --scope project` を 1 度打つ。⚠ この file は machine-local かつ untracked ∴ **載せる意志は git に残り、載っている事実は残らない** ⚠ **2026-09-04、install を打たずに record が生まれる経路が観測された**: `/plugin` の UI で更新 → 再起動、の直後に、tracked な宣言から project スコープの record（当時の最新版）が生えた —— **install コマンドは打たれていない**。⚠ **UI の更新と再起動のどちらが生んだかを分ける観測は無い** ∴ **この 1 手は確実な道であって、唯一の道ではない。** |

⚠ **2 つ目が在るのは、この repo が `version` を宣言しているからである** —— 宣言を省けば
commit 由来の resolved version に落ち、「push すれば届く」挙動になる。宣言を残す以上、
**bump は release の一部であって、忘れれば変更は静かに、誰にも届かないまま着地する。**

⚠ **3 つ目は他の 2 つより手前に在り、しかも唯一、外れていることが画面に一言も出ない。**
record が無ければ skill も hook も 1 枚として走らないが、**載っていない機構は自分の不在を
報告できない** ∴ statusline にも fence にも現れず、`/plugin update` すら黙る。⚠ **`claude
plugin details` は record が無くても版も skill も hook も列挙する ∴ 載っている証拠にならない**
—— 映すのは `claude plugin list` の側である。⚠ **沈黙のほうは 1 台での実測（2026-09-03）で
ある** が、門そのものは docs が裏づけている（下記）。

#### 宣言と実体 —— plugin は 2 層で決まる

| 層 | どこに住むか | tracked か | 何を言うか |
| --- | --- | --- | --- |
| **宣言** | `settings.json` の `enabledPlugins` ＋ `extraKnownMarketplaces`（user / project / local） | project スコープなら **tracked** | どれを載せたいか・marketplace はどこか |
| **実体** | `~/.claude/plugins/installed_plugins.json` の record（`scope` / `projectPath` / `installPath` / `version`）と cache の実物 | **untracked・machine-local** | 実際に載っている（どの版が、どこから） |

⚠ **`enabledPlugins` は load の switch であって install ではない** —— docs は
"necessary but not sufficient"、"alone doesn't install a plugin" と明記している。∴ **宣言だけが
在って record が無い状態は、「載せたい」と書いてあるだけで載っていない。** git に残るのは
**意志**であり、**載っている事実は untracked な側にしか無い** —— そして 2 つは黙って食い違いうる。

⚠ **`--scope` は install の scope であって「宣言をどこに書くか」だけの話ではない。** user /
project / local の 3 つが在り、**project スコープの record は `projectPath` のその project の中
でだけ効き**、user スコープの record はどの project でも効く。⚠ **同じ plugin が両方に record を
持つこともある** ∴ 「載っているか」は plugin 名だけでは決まらず、**どの project から見ているか**
に依る。

⚠ **docs は「project settings に書いておけば、フォルダを信頼した時点で別のプロンプト無しに
入る」と書いているが、そうならない場合が在る。** 隔離した config で実測した（2026-09-03、
1 台）—— **既に信頼済みの新しい clone** に tracked な宣言が在っても、セッションを開始しただけ
では marketplace は登録されず、cache も record も生まれなかった。⚠ **ただし測ったのは
非対話（`-p`）のセッションだけである** ∴ *信頼ダイアログを受け入れる瞬間*に何が起きるかは
**まだ測っていない** —— そこは人間が対話で通るほかない。∴ この README は「受ける側が 1 度
install を打つ」を前提に書いてある。

### statusline の装着 —— 1 行は人間が書くが、path は書かない

⚠ **plugin は `statusLine` key を宣言できない**（plugin root の settings が持てるのは `agent`
と `subagentStatusLine` だけ）∴ **装着は原理的に人間の act として残る。** ⚠ **そして plugin の
`bin/` は statusline の PATH に入らない** —— docs が言う PATH は **Bash tool のもの**であり、
実測も一致した ∴ **裸のコマンド名で呼ぶ道は無い。**

∴ 装着はコマンド 1 つで済ませる:

```
/bearing:statusline-setup
```

これが `~/.claude/bearing-statusline.mjs` に薄い shim を置き、`~/.claude/settings.json` に 1 行を
書く。⚠ **shim は走るたびに install record を読んで今の版へ橋渡しする** ∴ **1 行に version が
入らず、bump で腐らない** —— cache は旧版を消さないので、versioned な path を直に書けば bump 後も
黙って古い版が描かれ続ける。

⚠ **書き先は user settings に限る。** 絶対 path は home を含む ∴ tracked な project settings へ
書けば、他の人間の面が黙って壊れる形を repo に commit することになる。既に別の statusline が在れば
**上書きせず述べて止まる**（差し替えるなら `--force`、外すのは `--uninstall`）。

⚠ **bearing 自身の repo も、この 1 行だけで足りる**（2026-09-04 に project settings を外した）。
**cache 側の bin はすべて `CLAUDE_PROJECT_DIR` を見て、bearing の checkout の中に居るときは
working tree へ委譲する** ∴ **user スコープの 1 行で、開発中は working tree の面が出る** ——
repo の中に絶対 path を書いた行を持つ必要は無い。⚠ **実測**: cache の複製に印を入れて走らせると、
この repo の中では印が出ず（＝ working tree が走る）、外の project では出る。hook 側も同じ。

⚠ **代わりに失うものが 1 つ在る —— clone しただけでは、この repo でも何も出ない。** 面も hook も
skill も、受ける側が user スコープで 1 度 install するまで 1 枚も載らない ∴ **「載っている事実は
untracked な側にしか無い」は、いまやこの repo 自身にも等しく当てはまる。**

⚠ **載っていなければ shim はそう描く。** record が無ければ本体は 1 枚も載っておらず、**載って
いない機構は自分の不在を報告できない** —— だが shim は plugin の外に住む ∴ **載っていなくても
走り、そう述べられる。**

### aim は project ごとの opt-in —— 全 project に載せても邪魔にならないために

⚠ **bearing は 1 つの単位ではない。** handoff の 2 枚と statusline の 1 行目は `docs/aims/`
に何も依存せず**どの project でも使える**が、aim の規律は corpus を前提にし、**採っていない
repo では邪魔になる**。∴ **plugin 本体は user スコープで全 project に載せてよく、aim の規律
だけを project ごとに opt-in する。**

```
/bearing:with-aim
```

これが project-root の `CLAUDE.md` の**末尾**に、marker で挟んだ法の block を差し込む
（`--check` で状態だけ、`--remove` で外す）。

⚠ **corpus の在り処は project が決める。** 既定は `docs/aims/` で、`--dir` で変えられる:

```
/bearing:with-aim --dir proj/aims
```

⚠ **既定は動かさない** —— 既定が動けば、既に在る corpus が一斉に行方不明になる。⚠ **在り処の
宣言は marker が運ぶ ∴ 採用の宣言と同じ 1 つの宣言である**（`dir=` が無ければ既定 ∴ 既に置かれた
block は何もしなくてよい）。⚠ **glob は受け付けない**: git の pathspec として渡る値であり、
slug の衝突は `parent:` と `[[link]]` の解決を壊し、「corpus が無い」と「別の場所を見ていた」の
区別も失われる。⚠ **引数を付けずに打ち直したときは、既に置かれた宣言が正である** —— 版の更新の
ためだけに打った人間の corpus を、黙って既定へ引っ越させない。

⚠ **なぜ hook ではなく `CLAUDE.md` か。** SessionStart hook の出力は**会話として要約され
消える**（docs: "Context that hooks added earlier — Summarized with the rest of the
conversation"）が、**project-root の `CLAUDE.md` は compaction 後に disk から再注入される**。
さらに `CLAUDE.md` は **subagent にも階層ごと載る**（組み込みの Explore と Plan だけが除かれる）
のに対し、docs が subagent の lifecycle として挙げるのは `SubagentStart` / `SubagentStop`
である。⚠ **どちらも「強い」のではない** —— docs は両方を「context であって強制される設定
ではない」と述べ、system prompt に載るのはどちらでもない。**差は位置と消えなさだけで、
それが層を決める**: 静的な法は `CLAUDE.md`、実行時にしか出せない事実は hook。

⚠ **marker は HTML コメントである。** docs が「block-level の HTML コメントは context へ
注入される**前に**除かれる」と明記している ∴ **識別子・版・本文 sha を持たせても、
context を 1 token も食わない** —— そして `Read` で開けば人間には見える。

⚠ **本文 sha が在るので、2 つの別物を別物として述べられる**: **版が古い**のか、**人間が
block の中を編集した**のか。⚠ **後者では置き直さず、述べて止まる** —— 置き直せば消えるのは
その編集だからである。marker が壊れている（片方だけ・読めない・2 組ある）ときも同じく
触らない。

⚠ **そして marker は opt-in の宣言でもある。** hook はこれを読み、**採っていない repo では
1 byte も出さない** —— ただし **未読の baton だけは述べる**（handoff は aim ではなく、
どの project でも使える）。⚠ **corpus が在れば、marker が無くても従来どおり喋る**:
印は後から入った機構であり、既に node を書いている repo を「印が無い」で黙らせない。

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
