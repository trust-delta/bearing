# plugin marketplace の更新機構 —— 「push すれば各 project に自動で届く」は成り立たない

調査日: 2026-09-01
出典: https://code.claude.com/docs/en/plugin-marketplaces （`docs.claude.com/en/docs/claude-code/plugin-marketplaces` から 301）
併せて実測: `claude plugin --help` / `~/.claude/plugins/` の実体

## 問い

bearing を他の project にも載せたい。remote git の marketplace を指せば、以降 remote が
更新されたら各 project の plugin も自動で更新される —— という認識で良いか。

## 答え —— 2 段の門があり、どちらも自動ではない

### 門 1: marketplace の clone は明示 update でしか動かない

> "Once your marketplace is live, you can update it by pushing changes to your repository.
> Users refresh their local copy with `/plugin marketplace update`."

**起動時に自動 pull はされない。** clone の実体は `~/.claude/plugins/marketplaces/<name>/`
（丸ごと git clone。`origin` は marketplace の git URL）。更新は
`/plugin marketplace update [name]` または `claude plugin marketplace update [name]`。

### 門 2: `version` を上げない限り cache は差し替わらない

> "`version` pins the plugin for every source type except `command` […]. If you declare
> `"version": "1.0.0"` in `plugin.json` and push new commits without changing that string,
> existing users of those sources keep the cached copy, because Claude Code sees the same
> version. Bump the field on every release, or omit it to fall back to the resolved version."

> "Setting `version` means users only receive updates when you change this field, so bump it
> on every release."

⚠ **bearing は `carriers/claude/bearing/.claude-plugin/plugin.json` で `"version": "0.4.0"`
を宣言している** ∴ この条項に真正面から当たる。cache も version 名の dir に置かれる
（`~/.claude/plugins/cache/trust-delta/bearing/0.4.0/`）—— **version を上げずに main を
push しても、既存の利用者は 0.4.0 の cache を持ち続ける。**

`version` を**省く**と resolved version（commit 由来）に落ちる ∴ 「push が届く」挙動が
欲しいなら選択肢は 2 つ: **毎リリース bump する**か、**宣言をやめる**か。

## 関連する CLI（実測 `claude plugin --help`）

- `claude plugin update <plugin>` —— "Update a plugin to the latest version (**restart required to apply**)"
- `claude plugin marketplace update [name]` —— marketplace clone の refresh（名前を省くと全部）
- `claude plugin tag [path]` —— `{name}--v{version}` の git tag を作り、**`plugin.json` と
  marketplace entry の version が一致していることを検証する**。version が release の単位で
  あることを、道具の側も前提にしている。

## 載せる範囲（scope）—— 実測

`installed_plugins.json` は entry ごとに `scope: "user" | "project"` を持つ。bearing は
そこに entry を持たず、**project の `.claude/settings.json` の
`extraKnownMarketplaces` + `enabledPlugins` 経由**で載っている（この repo の形）。

∴ 他 project へ広げる形は 3 つあり、選択は「どこに宣言を置くか」に尽きる:

1. **各 project の `.claude/settings.json`** に同じ 2 key を書く —— その project 限定。
   tracked ゆえ **repo を clone した誰にでも載る**（＝ 宣言が git に載る）。
2. **`~/.claude/settings.json`** に書く —— cwd に依らず**全 project**に載る。
   ⚠ untracked ∴ どこにも記録が残らない。前身 `aim` が `~/.claude/skills/aim` の symlink で
   全 dir に載っていて所在が分からなくなったのと、**同じ層の同じ罠**である。
3. `claude plugin install bearing@trust-delta` を user scope で —— 2 と同じ効果を CLI 経由で。

## 帰結

「remote を指せば以降は自動」ではない。実際に必要なのは:

- 配る側: **release ごとに `plugin.json` の `version` を bump**（しないと誰にも届かない）
- 受ける側: `claude plugin marketplace update` → `claude plugin update bearing` → **再起動**
