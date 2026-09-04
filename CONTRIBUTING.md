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

⚠ **この repo は tracked な `.claude/settings.json` を持たない** ∴ **clone しただけでは skill も
hook も面も 1 枚も載らない** —— [README の「使い方」](README.md#使い方) を 1 度通すこと。

⚠ **開発中に走るのは手元の code である。** marketplace は自分自身の remote を指す ∴ cache に
入るのは push 済みの版だが、**cache 側の `bin/` は、`CLAUDE_PROJECT_DIR` が bearing の checkout
を指していると分かれば working tree へ委譲する** —— hook も statusline も同じ 1 経路である。
（plugin を載せずに走らせるなら `claude --plugin-dir ./carriers/claude/bearing`。）

## PR で見られるもの

CI が落とす門は 2 つだけ —— **test** と、**carrier が正本と同期していること**。⚠ **言語の測定は
報告であって門ではない**（[`native-language`](docs/aims/native-language.md) の前提がまだ実測
されていない以上、硬い門にするのは早い）。

```
node --test carriers/claude/bearing/test/*.test.mjs   # test
bash gen/claude-plugin.sh --plugin                    # carrier の再生成
node scripts/lang-report.mjs                          # 言語の測定（落ちない）
```

## この repo の作法

- ⚠ **`carriers/**/skills/**` は生成物である**（`gen/claude-plugin.sh`）—— 手で直さず、
  `docs/aims/_guide/` を直して再生成する。食い違いは CI が赤くする
- ⚠ **開発は aim で駆動される** —— **なぜその変更なのかは `docs/aims/` の木に残す。**
  目的（`aim:` の 1 行）は人間のものであり、**動かす提案はできるが、書き換えるのは人間である**
- **正本は日本語である**（[README の「言語」](README.md#言語)）—— 英語版の README は従属物で、食い違えば日本語が正
- ⚠ **`plugin.json` の `version` を上げない限り、変更は誰にも届かない** —— bump は release の
  一部であり、maintainer が行う
