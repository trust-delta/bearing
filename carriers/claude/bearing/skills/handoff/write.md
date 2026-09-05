# handoff — 書く

⚠ **「なぜ」と「置き場」は傍らの `SKILL.md` が持つ。** ここは `w` で呼ばれたときの手順だけを持つ。

**何を残し何を省くかの judgment があなたの仕事の全てであり**、それを機械に渡してはならない —— それが native な圧縮に欠けているものだからだ。⚠ **人間に見せて確認を得てから land すること。**

land だけは機械である（旧 baton の archive 退避 → `composed-at` の刻印 → 配置）:

```bash
bearing-handoff.mjs write < <あなたが著した baton>
```

⚠ `read-at` は書かない —— 新しい baton は「まだ読まれていない」が正で、この経路は書かれていても除去する。

## 手順

1. 既存の baton があれば archive へ退避する（`archive/<UTC>.md`、`YYYY-MM-DDTHHMMSSZ.md`）。
2. 下記の形で baton を書く。
3. **何を残し何を省いたか**を 1〜2 行で人間に報告する。

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

