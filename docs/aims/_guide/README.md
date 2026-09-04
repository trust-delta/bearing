# `_guide/` — 規律の中立正本

この directory が **aim の規律そのもの**を持つ。corpus（`docs/aims/*.md`）が *この project の目的*を持つのに対し、ここは *目的をどう書き、どう保つか*を持つ。∴ **corpus が入れ替わってもここは変わらない。**

| file | 何の正本か | 出荷 |
| :-- | :-- | :-- |
| `frame.md` | 常時効く不変（所有の分割・escalate の線） | ✔ |
| `aim-authoring.md` | aim の作成と保守の方法論（slug・section・木・drift） | ✔ |
| `handoff.md` | セッション跨ぎの引き継ぎ儀式 | ✔ |
| `aim-facts.md` | セッションに注入される事実の読み方と、それが課す義務 | ✔ |

## 出荷される file は corpus を参照してはならない

上の 4 枚は carrier（skill）として**生成・同梱**され、corpus を持たない場所へも届く。∴ **corpus 内部への `[[slug]]` cross-ref を持ってはならない** —— 届いた先にその node は存在せず、参照は必ず宙に浮く。

⚠ **これは行儀の問題ではなく、センサーの問題である。** 解決しない参照は「読むべき何かがある」と告げながら何処も指さない ＝ 読み手を無い情報の探索へ送る。現在 4 枚とも **0 件**で、これは実測して維持する不変である。

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

置くのは **3 枚**（`aim-authoring.md` / `aim-facts.md` / `handoff.md` ＝ carrier へ同梱される中立正本と同じ集合）。⚠ **`frame.md` と この `README.md` は置かない** —— 前者は SessionStart hook と `CLAUDE.md` の block が運び、後者は `_guide/` を*著述する側*の doc である。

⚠ **既に在って中身が違う枚は触らない** —— 置いた後の `_guide/` は**その repo の doc**であり、人間が直しているかもしれない。断るなら `--no-canon`、`--remove` は canon を消さない。

⚠ **multi-repo で wrapper が cwd の場合、guide は member repo の側にある。** cwd 直下を見て「無い」と決めつけないこと。
