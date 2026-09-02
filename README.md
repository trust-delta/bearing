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

**⚠ clone したら 1 度だけ、hook を設置すること:**

```
git config core.hooksPath .githooks
```

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

⚠ **作業ツリーの plugin を走らせるには** `claude --plugin-dir ./carriers/claude/bearing`。
marketplace は自分自身の remote を指すので、通常のセッションは **push 済みの版**を読む。

### 配布 —— push しただけでは誰にも届かない

⚠ 門は 3 つあり、**受ける側に 2 つ・配る側に 1 つ**在る（公式 docs と実測、2026-09-01 / 09-03）:

| 門 | 誰が外すか |
| --- | --- |
| marketplace の clone は起動時に自動 pull されない | **受ける側** —— `extraKnownMarketplaces` に `"autoUpdate": true` を宣言すれば起動時に自動。しなければ `/plugin marketplace update trust-delta` → `/plugin update bearing` → 再起動の 3 手 |
| `plugin.json` の `version` を上げない限り cache は差し替わらない | **配る側** —— 毎リリース bump する。⚠ これを忘れると、受ける側が何をしても届かない |
| tracked な宣言は **enable であって install ではない** —— `installed_plugins.json` に record が無い限り、plugin は 1 枚も載らない | **受ける側** —— `claude plugin install bearing@trust-delta --scope project` を 1 度打つ。⚠ この file は machine-local かつ untracked ∴ **載せる意志は git に残り、載っている事実は残らない** |

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

⚠ **bearing 自身の repo は、tracked な project settings で working tree を直に指している** ——
これは重複ではない: あちらは **bearing が載っていなくても、clone しただけで描ける**（そして
project settings は user settings に勝つ）。

⚠ **載っていなければ shim はそう描く。** record が無ければ本体は 1 枚も載っておらず、**載って
いない機構は自分の不在を報告できない** —— だが shim は plugin の外に住む ∴ **載っていなくても
走り、そう述べられる。**

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

*license は未定。決まるまでは all rights reserved。*
