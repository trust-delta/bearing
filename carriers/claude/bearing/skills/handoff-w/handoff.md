# handoff — セッションを跨ぐ会話の引き継ぎ

長い対話は、いずれ context の天井に当たる。そこで agent の native な圧縮／リセットに任せると、**何が失われたかが不可視**になり、軌跡が機械的に捨てられる。handoff はその代わりに、**現エージェント自身が「何を残すか」を選んで書き出す** baton を置く。

**この方式の価値は baton の構造ではなく、authoring の judgment にある。** 何を残し、何を再導出可能／不要として省くか —— それが native な圧縮に欠けているものであり、極性も逆だ。native の圧縮は**天井の回避**が目的で reactive（劣化してから発火する）。handoff は**品質のため**に proactive に、区切りの良いところで早めに選ぶ。

∴ **これは operator が呼ぶもの**であって、閾値で自動発火させるものではない。

手順は 2 つだけ。**書く**と**読む**。

---

## 書く

1. 既存の baton があれば archive へ退避する（`archive/<UTC>.md`、`YYYY-MM-DDTHHMMSSZ.md`）。
2. 下記の形で baton を書く。
3. **何を残し何を省いたか**を 1〜2 行で operator に報告する。

### 原則

- **再導出できるものは省く。** code の実体は git から、目的の木は `docs/aims/` から後任が読める。書くのは*そこに無いもの*だけ —— 今どこに立っていて、何を試して捨てて、次に何を拾うか。
- **forward に選ぶ。** 網羅ではなく、後任が次の一手を打つために要るものを選ぶ。
- **迷ったら短く。** 長い baton は authoring を怠けた証拠であることが多い。

### 形

```markdown
---
composed-at: <ISO8601 UTC>
task: <今取り組んでいることの 1 文>
---

## ▶ Task
<何をしようとしているか。1〜3 行>

## Settled
<この session で確定したこと。後任が蒸し返さなくてよいもの>

## Open & next
<未決のまま残すもの。次に拾うべき一手を先頭に>

## Tried & set aside
<試して捨てた手段と、その理由。同じ轍を踏ませない>

## Pointers
<読むべき aim slug / file:line / PR 番号。内容ではなく在り処だけ>
```

セクションは空なら省いてよい。**`Tried & set aside` は特に価値が高い** —— これだけは後任が git からも aim からも再導出できない。

⚠ **`read-at:` は書かない。** 読む側が刻む欄で、新しい baton は「まだ読まれていない」が正。退避された旧 baton は自分の `read-at` を持ったまま archive に残る。

---

## 読む

1. baton を読む。無ければその旨を報告して終わり（fresh start）。

2. **`composed-at` と `read-at` を控える。**
   - `read-at` が**在る** ＝ この baton は過去に読まれている。最後の報告に **1 行だけ**添える（例: 「この baton は 8月28日 にも読まれています」）。
   - `composed-at` が数日前なら、同様に 1 行添える。
   - ⚠ **どちらも読むのを止める理由にはならない。** 警告もしない、確認も求めない。古い baton をあえて読ませたい場面はある。**事実だけ述べ、判断は operator に残す。**

3. **`read-at` を現在時刻（UTC・ISO8601）に更新する。** `read-at:` 行が在れば置換、無ければ `composed-at:` 行の直後に挿入。（旧値は手順 2 で既に控えてあること。）

4. **未プッシュ aim を surface する。** workspace 配下の各 git repo に対して:

   ```bash
   git -C <repo> status --porcelain -- docs/aims/                                # uncommitted
   git -C <repo> log @{u}..HEAD --oneline --name-only -- docs/aims/ 2>/dev/null  # committed but unpushed
   ```

   baton は forward 選択ゆえ「**道中どう aim を触ったか**」を過少報告する。ここで挙がった slug は必ず re-read すること —— aim を読み直しても得られるのは*到達状態*であって*変化*ではないため、この差分だけが変化を運ぶ。

   ⚠ **この surface は tracked な `docs/aims/` しか見ない。** untracked なローカル設定の変化は原理的に映らないので、そちらは baton の記述だけが頼り。

5. `Pointers` に挙がった aim slug も読む。

6. **今どこに立っていて何を拾うかを operator に伝える。** そこから共に作業する。

### 注意

- 読む側は baton を archive しない（次に**書く**ときに退避される）。∴ 同じ baton を二度読むことは起こりうる —— **それを検出するのが `read-at` の役目**であって、防ぐことは目的ではない。
- **baton に無いことを baton から推測しない。** 分からないことは operator に聞く。

---

## 置き場

baton は **machine-local**（越境しない。git に載せない）。cwd 相対で `.handoff/active.md`、退避先は `.handoff/archive/`。

multi-repo の wrapper が cwd の場合、wrapper 直下に置かれる —— どの repo にも属さないので、commit されえないことが構造として保たれる。

⚠ **越境しないのは制約の受容ではなく目的の帰結である**（operator 2026-08-31 確定）。handoff が回避する摩擦は「新しいセッションで説明と調査をやり直すこと」であり、それが移動を鈍らせ、劣化した context のまま話し続けさせる。∴ 守っているのは **operator と 1 つのセッションの間にある対話の継続**であって、別マシンの別セッションはそもそも別の対話である。**この不変は実装形態に依らない** —— engine（Rust）でも harness でも 2 コマンド形でも同じゆえ、越境する手段が手に入っても baton は越境させない。上段の「commit されえない」は目的に構造が沿っているという確認であって、machine-local の理由ではない。
