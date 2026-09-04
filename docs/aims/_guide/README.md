# `_guide/` — 規律の中立正本

この directory が **aim の規律そのもの**を持つ。corpus（`docs/aims/*.md`）が *この project の目的*を持つのに対し、ここは *目的をどう書き、どう保つか*を持つ。∴ **corpus が入れ替わってもここは変わらない。**

| file | 何の正本か | 出荷 |
| :-- | :-- | :-- |
| `frame.md` | 常時効く不変（所有の分割・escalate の線） | ✔ |
| `aim-authoring.md` | aim の作成と保守の方法論（slug・section・木・drift） | ✔ |
| `handoff.md` | セッション跨ぎの引き継ぎ儀式 | ✔ ⚠ **ここに在るのは誤りである（下記）** |
| `aim-facts.md` | セッションに注入される事実の読み方と、それが課す義務 | ✔ |

## 出荷される file は corpus を参照してはならない

上の 4 枚は carrier（skill）として**生成・同梱**され、corpus を持たない場所へも届く。∴ **corpus 内部への `[[slug]]` cross-ref を持ってはならない** —— 届いた先にその node は存在せず、参照は必ず宙に浮く。

⚠ **これは行儀の問題ではなく、センサーの問題である。** 解決しない参照は「読むべき何かがある」と告げながら何処も指さない ＝ 読み手を無い情報の探索へ送る。現在 4 枚とも **0 件**で、これは実測して維持する不変である。

## ⚠ `handoff.md` がここに在るのは誤りである

**この directory の 1 文目が「aim の規律そのものを持つ」と述べている。** ⚠ **`handoff.md` はそれではない** —— **handoff は aim と明確に分離されており、`with-aim` 無しで動かねばならず、aim の側も handoff の機構を必要としない**（人間が 2026-09-04 に明示）。

⚠ **実害は測れている。** `bin/boot-ritual.mjs` は **aim の gate を持たず**、baton が未読ならどの repo でも発火する。先行版はそこで `docs/aims/_guide/handoff.md` を正本として名指しており、**実測すると corpus も `CLAUDE.md` も無い repo でそう述べた**（2026-09-04）—— **そこには何も無い。** 今は hook も skill も **`handoff-r` / `handoff-w` の同梱物**を名指す。

⚠ **`with-aim` は `handoff.md` を置かない。** ここは aim の opt-in が置く場所であり、入れれば**handoff の canon が aim の採用に依存する**。⚠ **入れる必要も無い** —— skill は自分の同梱物を裸の名で指しており、repo 側の `_guide/handoff.md` を 1 度も要求しない（実測 2026-09-04）。

⚠ **残っているのは file の物理的な置き場だけであり、それは人間の判断である**（[[session-handoff]] の `# ESCALATION`）。今この file が果たしている役割は **carrier 生成の源**の 1 つだけで、人間向けの doc からは誰も指していない。

**方法論の正当化は、この directory の中で閉じること。** 「なぜこの規約なのか」を corpus の node へ委ねると、出荷した瞬間に説明が欠ける。

## carrier の生成

```
gen/claude-plugin.sh --plugin              # plugin へ同梱（commit される生成物）
gen/claude-plugin.sh --workspace <DIR>     # <DIR>/.claude/skills へ（machine-local・非 commit）
```

⚠ **生成物を手で編集しない。** 次の生成で消える。実体は常にここにある。

⚠ **carrier は必ず、それが名指す道具のコマンドを載せること。** 誰も名指さない道具は誰も走らせない道具であり、儀式は手作業に戻る。

## 設置は `with-aim` が行う

ある repo で規律を使うには、この directory がその repo に**在る**必要がある。⚠ **`/bearing:with-aim` が置く**（人間の決定 2026-09-04）。

⚠ **以前はここに「plugin は自分では置かない —— 置くかどうかは、その repo が規律を採るかどうかの判断であって、道具が代行してよいものではない」と書いてあった。理由そのものは正しいが、`with-aim` には掛からない** —— **あの CLI が置く marker は「opt-in の宣言」そのものであり、打った時点で判断は既に下されている** ∴ 置くことは代行にならない。

⚠ **そして「人間が手で置く」道には腐る経路が在った。** 同梱の複製は `~/.claude/plugins/cache/<owner>/<plugin>/<version>/skills/aim/…` に住み、**path が version を含む。cache は旧版を消さない**（実測 2026-09-04、1 台に 8 版が並んでいた。最古 `0.4.0`）∴ 手で辿らせれば、**黙って古い canon を置く日が来る**。道具が置けば、人間は version を 1 度も見ない。

置くのは **2 枚**（`aim-authoring.md` / `aim-facts.md`）—— ⚠ **aim の canon だけである。** `frame.md` は SessionStart hook と `CLAUDE.md` の block が運び、この `README.md` は `_guide/` を*著述する側*の doc、⚠ **`handoff.md` は aim の canon ではない**（上記）。

### 既に在るときどうなるか

⚠ **「人間が直した」と「版が古い」は別の状態として扱う。** `CLAUDE.md` の block は marker が版と本文 sha を運ぶので既にこれを分けている —— **canon 側だけが分けていなければ、同じ repo の中で片方だけが解かれていることになる。**

⚠ **canon の file に marker は挿せない** —— 挿せば中身が書き換わり、**bearing 自身の `_guide/`（正本・marker 無し）と食い違う**。∴ 足場は file の外に置く: **`_guide/.bearing-canon.json`** が、我々が最後に置いた枚とその sha を記録する。⚠ **この台帳は commit すること** —— 記録が越境しなければ、別の機体では同じ canon が「由来不明」に見える。

| `_guide/` の状態 | 判定 | 処置 |
| :-- | :-- | :-- |
| 在らない | — | **置く** |
| 中身が今の正本と同じ | `current` | 何もしない（⚠ **台帳が無くてもこう読む** —— 手で正しく置いた repo を「由来不明」と呼ばない） |
| 台帳の sha と一致し、正本は新しい | `stale` | ⚠ **黙って最新へ更新する** —— 置いたときのままである ∴ 上書きが安全（人間の決定 2026-09-04） |
| 台帳は在るが sha が違う | `edited` | **触らない**・名指しで述べる |
| 台帳に記録が無く、中身も違う | `unknown` | **触らない**・名指しで述べる（古い版か、別経路で置かれたもの） |

⚠ **台帳が壊れていたら、記録が無いものとして扱う** —— **読めない記録を根拠に他人の file を上書きしない。** 壊れていること自体は述べる。

⚠ **触らなかった枚について、台帳に今の正本の sha を書いてはならない** —— 次の実行がそれを「我々のまま」と読み、**人間の編集を踏む**。

断るなら `--no-canon`。⚠ **`--remove` は canon を消さない** —— opt-in を外すことと、その repo が持つ doc を捨てることは別の act である。

⚠ **multi-repo で wrapper が cwd の場合、guide は member repo の側にある。** cwd 直下を見て「無い」と決めつけないこと。
