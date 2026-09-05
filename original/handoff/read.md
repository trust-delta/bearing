# handoff — 読む

⚠ **「なぜ」と「置き場」は傍らの `SKILL.md` が持つ。** ここは `r` で呼ばれたときの手順だけを持つ。

手順 2〜4（前回 read-at の報告 → 新しい read-at の刻印 → 未 push/未 commit aim の trace）は**機械であって判断ではない**。次のコマンドが正しい順序で行う —— 手で刻むと、報告すべき旧 read-at を先に潰す事故が起きる:

```bash
bearing-handoff.mjs read
```

残り（baton を読むこと・Pointers の slug を読むこと・今どこに立っているかを人間に伝えること）は**あなたの仕事**である。

## 手順

1. baton を読む。無ければその旨を報告して終わり（fresh start）。

2. **`composed-at` と `read-at` を控える。**
   - `read-at` が**在る** ＝ この baton は過去に読まれている。最後の報告に **1 行だけ**添える（例: 「この baton は 8月28日 にも読まれています」）。
   - `composed-at` が数日前なら、同様に 1 行添える。
   - ⚠ **どちらも読むのを止める理由にはならない。** 警告もしない、確認も求めない。古い baton をあえて読ませたい場面はある。**事実だけ述べ、判断は人間に残す。**

3. **`read-at` を現在時刻（UTC・ISO8601）に更新する。** `read-at:` 行が在れば置換、無ければ `composed-at:` 行の直後に挿入。（旧値は手順 2 で既に控えてあること。）

4. **未プッシュ aim を surface する。** workspace 配下の各 git repo に対して:

   ```bash
   git -C <repo> status --porcelain -- docs/aims/                                # uncommitted
   git -C <repo> log @{u}..HEAD --oneline --name-only -- docs/aims/ 2>/dev/null  # committed but unpushed
   ```

   baton は forward 選択ゆえ「**道中どう aim を触ったか**」を過少報告する。ここで挙がった slug は必ず re-read すること —— aim を読み直しても得られるのは*到達状態*であって*変化*ではないため、この差分だけが変化を運ぶ。

   ⚠ **この surface は tracked な `docs/aims/` しか見ない。** untracked なローカル設定の変化は原理的に映らないので、そちらは baton の記述だけが頼り。

5. `Pointers` に挙がった aim slug も読む。

6. **今どこに立っていて何を拾うかを人間に伝える。** そこから共に作業する。

### 注意

- 読む側は baton を archive しない（次に**書く**ときに退避される）。∴ 同じ baton を二度読むことは起こりうる —— **それを検出するのが `read-at` の役目**であって、防ぐことは目的ではない。
- **baton に無いことを baton から推測しない。** 分からないことは人間に聞く。

