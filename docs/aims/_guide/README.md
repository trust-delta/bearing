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

## 設置は人間の act

ある repo で規律を使うには、この directory がその repo に**在る**必要がある。⚠ **plugin は自分では置かない** —— 不在を surface するところで止まる。置くかどうかは、その repo が規律を採るかどうかの判断であって、道具が代行してよいものではない。

⚠ **multi-repo で wrapper が cwd の場合、guide は member repo の側にある。** cwd 直下を見て「無い」と決めつけないこと。
