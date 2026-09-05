---
aim: 配布するものは、消費者として動くことが機械的に確かめられている
parent: bearing
state: open
---

# IS

**この node が埋めるのは、既に在る運用と、それが実際に覆っている範囲との落差である。** 人間は「本リポで効果確認できていないものは配布しない」と述べていた（2026-09-04）。⚠ **だがこの repo は、消費者として異常な状態を原理的に持てない。**

⚠ **理由は「正常系を選んだから」ではなく、正本を持っているからである。** `_guide/` はここでは*置かれたもの*ではなく*著述されたもの*である ∴ 当時の `/bearing:with-aim` が持っていた 5 状態（`place` / `current` / `stale` / `edited` / `unknown`）のうち、**ここで起こりえたのは `current` だけだった**（実測 2026-09-04: この repo で `--check` は常に「canon は既に最新」を返す）。**`_guide/` が無い状態も、aim を採っていない状態も、ここには来ない。** ⚠ **∴ bearing は自分を正常系と*定める*のではなく、消費者の状態に対して**退化している** —— 定めるかどうかの選択肢が無い。

⚠ **2026-09-05、この退化は消えたのではなく形を変えた。** [[adoption-declaration]] が canon を消費者へ置く手段を棄却した ∴ **5 状態そのものが無くなり**、`with-aim` が消費者に残すのは `CLAUDE.md` の block だけになる。**状態が無ければ、状態を網羅するという問いも無い** —— 下の `[todo]` の 1 つは、その手段と一緒に落ちた。

⚠ **だが退化は残る。** `setup-aim` が置くものは 2 つになり（block と `.claude/skills/aim/`）、**置いた後は repo のもの** ∴ bearing が検められるのは*置く瞬間*だけである —— 置かれた 2 つが template と一致し、marker が正しく、既に在るものを潰していないこと。⚠ **plugin が無い場でそれがどう読まれるかは repo の開示であって、検査の対象ではない**（人間の決定 2026-09-05）。⚠ **一方で bearing 自身が消費者の 1 つになる** —— `docs/aims/_guide/` が廃され、bearing の `.claude/skills/aim/` も置かれたものになる ∴ 「正本を持つがゆえに退化している」の前提が 1 つ崩れ、**置く経路を bearing 自身で 1 度は通せる。** ⚠ **2026-09-05、実際に通した** —— `setup-aim` が bearing の `CLAUDE.md` の block を置き直し、`.claude/skills/aim/` を置いた。⚠ **置かれた skill を tracked にするかも、置かれる側としての bearing が決める。** 2026-09-04 の時点では `.claude/*` が例外 0 個で ignore されており ∴ 置かれた skill は untracked だった。⚠ **2026-09-05、人間が反転させた**（`.gitignore` は machine-local な `.claude/**/*.local.json` だけを閉じる）∴ **置かれた 3 枚は tracked になり、`templates/aim/` と byte 同一であることを test が見る。** ⚠ **どちらの答えも「置く側の原則が、置かれる側としての bearing にそのまま掛かる」ことの帰結である** —— 変わったのは原則ではなく、この repo の policy のほうである。

⚠ **出荷 copy は 0.17.0 で手で検めた**（実測 2026-09-05、`~/.claude/plugins/cache/trust-delta/bearing/0.17.0/` を名指し、委譲を通さず、temp repo で 8 点）: ⑴ 素の消費者へ block と `.claude/skills/aim/` を置く ⑵ block に `_guide` / cache path / 導入コマンドは 0 件で `aim` skill を名指す ⑶ 置かれた 3 枚は template と byte 同一 ⑷ 2 度目は「既に在る ∴ 触らない」 ⑸ `--check` は `current`・skill 在り・exit 0 ⑹ `--remove` は skill を残し `CLAUDE.md` を原文へ戻す ⑺ 採っていない repo で hook は 0 byte ⑻ shim は走る。⚠ **これは手検査であって job ではない** —— 下の `[todo]` は、これでは 1 つも閉じなかった。**閉じたのは次段の job である。**

⚠ **2026-09-05、その 8 点は job になった**（`scripts/consumer-check.mjs`、CI の `consumer` job）。carrier の **tracked file だけ**を mode ごと **checkout の外**の temp dir へ写して出荷 copy とし、合成した消費者 5 形（素／corpus を採った／既に `CLAUDE.md` 在り／既に skill 在り／baton だけ在り）を相手に 19 件を検める。⚠ **checkout の外へ出すことが要点である** —— corpus も `scripts/` も `.git` も伴わない場所に立たせなければ *path に依る振る舞い*は測れず、そこが cache と working tree の唯一のずれだからである。⚠ **`BEARING_DELEGATED` を立てるだけでは委譲を塞いだことにならない** ∴ **合成消費者が carrier の manifest を持たないこと**も併せて見る —— env は消えうるが、manifest の不在は構造である。

⚠ **cwd を消費者へ倒さなければ、この job は bearing 自身を測る**（実測 2026-09-05、この job を書く途中で踏んだ）—— hook は `process.cwd()` から unit を解決する（`CLAUDE_PROJECT_DIR` でも stdin の `cwd` でもない）∴ 倒し忘れた最初の実行は、**「採っていない消費者」について bearing の open-todo 9 を報告した。** ∴ 肯定側の検査は**合成消費者を名指していること**（`unit: adopted` と `open-todo: 1`）まで見る —— ⚠ **「空でないこと」だけを見る門は、bearing を測りながら緑になる。**

⚠ **落ちることを 6 つの変異で確かめた**（実測 2026-09-05、使い捨ての clone 上）: 法が cache path を名乗る／`placeSkill` が既存を潰す／`--remove` が skill も消す／装着する 1 行が版を含む／`aim-facts` の gate が壊れて採っていない repo でも述べる／**job 自身が cwd を倒し忘れる**。⚠ **6 つとも赤くなり exit 1 で終わった。** **落ちない門は門ではない** ∴ 再測は同じ 6 つを clone 上で当て直すこと。

⚠ **CI 側に罠が 1 つ在り、塞いだ**（実測 2026-09-05、`bash -e` で `false | tee` は exit 0）—— pipeline の exit code は `tee` のものである ∴ 素朴に `| tee "$GITHUB_STEP_SUMMARY"` と書けば**落ちた検査が緑の job になる。** `set -o pipefail` を置いた。⚠ **報告だけの `language` job と違い、ここは落ちる門である** —— 同じ書き方が、片方では正しく片方では嘘になる。

⚠ **そして正本そのものは、正常系からは生まれていない。** canon 4 枚を数えると、規則の根拠は事故の観測に偏っている（実測 2026-09-04、`docs/aims/_guide/` の 4 枚）: 「**黙って**」＝ 沈黙で嘘をつく形が **7 箇所**、「実測」7、「嘘をつく」2、「壊れた記録」「実際に起きた」各 1。[[aim-tree]] の `[todo]` の法は「`open-todo` が嘘をつく」から、fence の parse 規約は「厳格な parser は静かに数え落とし、寛容な parser は静かに埋める —— **どちらの沈黙も嘘をつく**」から生まれている。∴ **生成の源（異常系の観測）と保持の場（この repo）は別であり、後者は前者を再現できない。**

⚠ **実証は同じ日に 4 つ揃った。** どれも「bearing で確認する」では出ようがなかった:

| 何が壊れていたか | どこで出たか |
| :-- | :-- |
| `with-aim` が canon を置かず、置いた法の第 1 条が在らない file を指す | **人間が別 repo で踏んだ** |
| aim を採っていない repo で hook が `docs/aims/…` を正本と名指す | **合成した temp repo での実測** |
| 面が picker の拒否を握り潰す／UNC 越しに拒まれる | **人間が別マシン・別 browser で踏んだ** |
| 面が読めない file を「親が無い」と描く | **stub した描画経路** |

**手段は、合成した消費者を機械にすることである。** temp repo を作り（**採った／採っていない**の 2 形から始め、置く経路を検めるうちに **5 形**へ増えた —— 素／corpus を採った／既に `CLAUDE.md` 在り／既に skill 在り／baton だけ在り）、`BEARING_DELEGATED` を立てて**出荷 layout の carrier をそのまま**走らせ、**出力を突き合わせる**。⚠ **これは既存の `node --test` とは別の層である** —— あちらは*関数*を検め、こちらは**出荷物が消費者の前で何を言うか**を検める。

⚠ **委譲（`lib/delegate.mjs`）はこの落差の原因ではなく、別の落差への対処である。** あの file 自身が「ドッグフーディングのための機構であって、便利のためではない」と述べ、無ければこの repo が**自分自身の古い版を食べる**ことを記録している（2026-09-02、statusline は新しく hook は cache `0.5.0` を走らせて同じ flag を出し続けた）。⚠ **∴ 委譲は外せない。** 残る死角は限定的で、**cache は released commit の clone ゆえ内容はリリース時点で一致し、ずれるのは *path に依る振る舞い* だけである** —— そして 2026-09-04 の不具合はまさにそこに居た（version を含む cache path、cache から走ると exec bit が読めない、面へ辿り着く手段）。

⚠ **覆えない範囲が残り、それは字面に出さねばならない。** 合成した消費者が再現できるのは**我々の code の振る舞い**だけであり、**browser・OS・ハーネスの変異は覆えない** —— 上の 4 つのうち 2 つ（UNC の picker 拒否、別マシンの win32）は**人間が実機で踏んで初めて出た**。⚠ **覆った範囲と覆えない範囲を同じ場所で述べないかぎり、この機構自身が「覆ったように読ませる」側になる** —— それは canon が 7 箇所で禁じている形そのものである。

# PROCESS

- [done] **合成した消費者を CI の job にした。** `scripts/consumer-check.mjs` と CI の `consumer` job。carrier の tracked file だけを mode ごと checkout の外へ写して出荷 copy とし、`BEARING_DELEGATED` を立て、**消費者が carrier の manifest を持たないこと**も併せて見る。⚠ **各 bin の cwd は消費者へ倒す** —— 倒さなければ bearing 自身を測る（`# IS`）。⚠ **session id は毎回新しくする** —— `precompact` は `os.tmpdir()` の marker で「セッションにつき一度」を守る ∴ 使い回せば 2 度目以降は黙り、**その沈黙は検査の成功に見える**
- [done] **`setup-aim` を temp repo に打ち、置かれた block と `.claude/skills/aim/` が出荷 template と byte 同一であることを job が固定した。** 既に `CLAUDE.md` が在る／既に `.claude/skills/aim/` が在る、の 2 形も通る。⚠ **2 度目は中身も mtime も動かないことまで見る** —— 書き直して同じ byte を置く実装は「触らない」ではない。⚠ **足りない枚を補わないことも見る** —— 何を持つかはその repo が決めている
- [done] **その job が「何を覆っていないか」を同じ出力で述べる。** 6 つを名指す: cache そのものではないこと（出荷 copy は checkout からの複製である）／走ったのは 1 platform・1 node 版だけであること／statusline の probe が通るのは platform 既定のシェルであって harness のそれではないこと／ハーネスの登録（置いた skill・`$ARGUMENTS`・plugin の skill 一覧が固まる時点）は覆えないこと／plugin 不在の場で block がどう読まれるかは検査の対象ではないこと（repo の開示である）／browser の面は 1 行も走らせていないこと

# DAG

- 関連: [[adoption-declaration]] —— あちらは**どこへ配るか**（install の scope と採用の宣言）を持ち、本 node は**配ったものが向こうで動くか**を持つ。⚠ **2 つは黙って食い違いうる**: 正しい scope で配られた壊れたものは、あちらの法をすべて満たす
- 関連: [[observation-provenance]] —— あちらは*記録*が覆っていない範囲を字面に出せと述べる。本 node が扱うのは*検査*が覆っていない範囲であり、**同じ法の別の対象である**
- 関連: [[surface-parity]] —— あちらが測る非対称は**起動経路の間**にある。本 node のそれは**開発する場と使う場の間**にあり、⚠ **前者は同じ機体の中の話、後者は repo の役割の話**である
- 照合: [[bearing]] @ 4a4d83c4 —— 親。⚠ **3 柱（目的の保持・文脈の引き継ぎ・ズレの検知）を 1 つも増やしていない** —— 本 node が足すのは*供給されるもの*ではなく、**供給されたものが向こうで動くという証拠**である ∴ `aim:` に触れない。あちらの `# IS` が持つ供給の層の観測（scope の二律・`autoUpdate`・プロセスが解決を固めること）も、1 つも動かさない
- 照合: [[adoption-declaration]] @ 4a4d83c4 —— あちらの手段は**どこへ配り、どこで採用を宣言するか**（install の scope・`CLAUDE.md` の marker・hook が黙る述語）であり、**配ったものが向こうで何をするか**には触れていない ∴ 本 node が検証を足しても、あちらの述語も gate も動かない。⚠ **2 つが黙って食い違いうることは本 node の `# DAG` に書いた**（正しい scope で配られた壊れたものは、あちらの法をすべて満たす）—— それは食い違いの指摘であって、あちらへの書き換え要求ではない
- 照合: [[observation-provenance]] @ 4a4d83c4 —— 借りたのは法の*形*（覆っていない範囲を字面に出す）だけで、あちらの対象は**記録**、本 node の対象は**検査**である ∴ あちらの 3 手段（時制と日付・確信の階級・再測の 1 行）にも `[todo]` にも触れていない
- 照合: [[aim-tree]] @ 4a4d83c4 —— あちらの手段は「所有で目的を引く・置き場は repo・木で構造化する」であり、**その木を運ぶ道具がどう検証されるか**には触れていない ∴ 本 node はあちらに書き換える主張を持たない。⚠ **本 node が引用したのはあちらの `[todo]` の法が生まれた経緯**（`open-todo` が嘘をつく）であって、法そのものではない
- 照合: [[surface-parity]] @ 4a4d83c4 —— あちらが測る非対称は**同一機体の中の起動経路の間**にあり、本 node のそれは**repo の役割の間**（正本を持つ場と、消費する場）にある ∴ 軸が違い、あちらの表も `[todo]` も動かない
