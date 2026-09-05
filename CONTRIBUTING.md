# 開発に加わる

⚠ **この file は日本語のみである。** 英語版は置かない —— **この project の開発は日本語で
進んでおり、aim の木も canon も commit message も日本語である** ∴ **翻訳を 1 枚足しても、
拾えるのは表面だけで、変更の意図は拾えない。** 郷に入りては郷に従え、であって、こちらから
過度に言語を寄せることはしない（[`docs/aims/native-language.md`](docs/aims/native-language.md)）。

**変更は fork して PR で出す** —— ⚠ **main へ直接 push できるのは write 権限を持つ者だけである。**

## 手元で走らせる

```
git config core.hooksPath .githooks
```

⚠ **clone すれば `.claude/skills/aim/` は載る**（2026-09-05 に tracked にした）—— だが **plugin は
1 枚も載らない**: hook も statusline も `/bearing:*` の command も、この repo が tracked な
`.claude/settings.json` を持たないからである ∴ [README の「使い方」](README.md#使い方) を 1 度
通すこと。

⚠ **開発中に走るのは手元の code である。** marketplace は自分自身の remote を指す ∴ cache に
入るのは push 済みの版だが、**cache 側の `bin/` は、`CLAUDE_PROJECT_DIR` が bearing の checkout
を指していると分かれば working tree へ委譲する** —— hook も statusline も同じ 1 経路である。
（plugin を載せずに走らせるなら `claude --plugin-dir ./carriers/claude/bearing`。）

## PR で見られるもの

CI が落とす門は 2 つだけ —— **test** と、**carrier が自分の中で閉じていること**。⚠ **言語の測定は
報告であって門ではない**（[`native-language`](docs/aims/native-language.md) の前提がまだ実測
されていない以上、硬い門にするのは早い）。

```
node --test carriers/claude/bearing/test/*.test.mjs   # test
bash scripts/carrier-check.sh                         # carrier の検査
node scripts/lang-report.mjs                          # 言語の測定（落ちない）
```

## carrier の作法

⚠ **`carriers/claude/bearing/` が正本である。この repo に生成物は無い**（人間の決定 2026-09-05）。

⚠ **以前は違った。** `original/<単位>/` に「中立な正本」を置き、`gen/claude-plugin.sh` が純粋な
複製で carrier を生成していた。⚠ **測ったら中立は名目だった**（実測 2026-09-05）—— 正本 11 枚の
うち Claude 固有語 0 件は 3 枚だけで、`setup-*.md` は `.claude/` と statusLine と plugin cache を
語る **Claude 専用の command そのもの**だった。∴ **複製が複製であることを守るためだけに、門を
3 つ持っていた**（生成 script・CI の再生成比較・byte 同一の test）。⚠ **2 つ目の carrier（Codex 用
など）が要る日は、`carriers/claude/` を正本として派生させる** ——「中立を先に作る」のではなく
**「Claude を優先し、他 vendor にも対応可能にする」**（人間の決定 2026-09-05）。

**単位ごとの住み処:**

| 単位 | carrier のどこに住むか |
| :-- | :-- |
| `aim` | `templates/aim/`（4 枚）・`commands/setup-aim.md` |
| `handoff` | `skills/handoff/`（3 枚） |
| `statusline` | `commands/setup-statusline.md` |
| `surface` | `commands/setup-surface.md`・`surface/aim.html` |

⚠ **aim の規律は plugin の skill として載らない。** `templates/aim/` は `setup-aim` が消費者の
`.claude/skills/aim/` へ置くための template であり、Claude Code の skill 一覧には出ない。`skills/`
へ置けば `bearing:aim` として登録され、**置かれた `aim` と同じ規律が 2 つ並ぶ** —— どちらが正か
誰にも決められない。**aim の規律は project ごとに置かれるものであって user scope に住まない**
（[`adoption-declaration`](docs/aims/adoption-declaration.md)）。⚠ **`frame.md` は置かれない** ——
`CLAUDE.md` の法の block と SessionStart hook が運ぶ ∴ 置けば同じ 6 箇条が 3 箇所に住む。

⚠ **handoff は plugin の skill として載る。** baton は repo に痕跡を残さない ∴ 宣言を要求せず、
どの project でも `/bearing:handoff r` / `w` で使える。

⚠ **carrier は必ず、それが名指す道具のコマンドを載せること。** 誰も名指さない道具は誰も走らせ
ない道具であり、儀式は手作業に戻る。

### 出荷される file は corpus を参照してはならない

carrier は corpus を持たない場所へも届く。∴ **corpus 内部への `[[slug]]` cross-ref を持っては
ならない** —— 届いた先にその node は存在せず、参照は必ず宙に浮く。⚠ **これは行儀の問題ではなく、
センサーの問題である。** 解決しない参照は「読むべき何かがある」と告げながら何処も指さない
＝ 読み手を無い情報の探索へ送る。**実測して維持する不変であり、今 0 件である。**

**方法論の正当化は、出荷される md の中で閉じること。** 「なぜこの規約なのか」を corpus の node へ
委ねると、出荷した瞬間に説明が欠ける。

### 手で編集してよい。ただし検査は通ること

⚠ **`scripts/carrier-check.sh` は何も書き換えない —— 述べて落ちるだけである。** 見るのは 2 つ:

- `carriers/claude/bearing/LICENSE` が root の `LICENSE` と一致すること。⚠ **cache へ複製される
  のは carrier subtree だけである**（実測 2026-09-03）∴ MIT が要求する「複製に著作権表示を含める」
  を満たしているのは**この 1 枚**であり、重複ではなく配布物の一部である。
- **carrier が名指す `.md` 参照がすべて同梱されていること。** ⚠ **読み手が開けない file を指す
  carrier は、最も重大な「黙った失敗」である** —— エージェントは framed されたと信じ、実際には
  されていない。**これは既に本物の破損を 2 件捕まえている。**

### 置いた後は、その repo のものである

`setup-aim` が置く `CLAUDE.md` の block と `.claude/skills/aim/` は、置いた瞬間からその repo の
ものである。track するか・直すか・古いままにするか —— すべて repo の policy であって、plugin は
関与しない。⚠ **plugin は置いたものを追随させない。追随しないことは中立である**（人間の決定
2026-09-05）。⚠ **bearing 自身は track する側を選んだ**（人間の決定 2026-09-05）∴ 置かれた 3 枚が
`templates/aim/` と食い違えば test が落ちる —— **これは plugin の義務ではなく、この repo の
policy である。**

## この repo の作法

- ⚠ **開発は aim で駆動される** —— **なぜその変更なのかは `docs/aims/` の木に残す。**
  目的（`aim:` の 1 行）は人間のものであり、**動かす提案はできるが、書き換えるのは人間である**
- **正本は日本語である**（[README の「言語」](README.md#言語)）—— 英語版の README は従属物で、食い違えば日本語が正
- ⚠ **`plugin.json` の `version` を上げない限り、変更は誰にも届かない** —— bump は release の
  一部であり、maintainer が行う
