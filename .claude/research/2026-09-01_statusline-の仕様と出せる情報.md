# statusline の仕様 —— 何でも出せる。制約は「内容」ではなく「実行モデル」の側にある

調査日: 2026-09-01
出典: https://code.claude.com/docs/en/statusline

## 「標準で用意されたもの以外も出せるか」→ 出せる

> "Claude Code runs your script with JSON session data on stdin and displays
> **whatever the script prints to stdout**."

任意の shell script。stdin の JSON は**タダで手に入る材料**であって制限ではない ——
git を叩こうが file を読もうが自由。出力も自由:

- **複数行**: `echo` / `print` ごとに 1 行。
- **色**: ANSI escape（`\033[32m`）。
- **リンク**: OSC 8 で clickable（iTerm2 / Kitty / WezTerm 等）。
- **幅**: ⚠ `tput cols` は効かない（stdout が terminal に繋がっていない）。
  **`COLUMNS` / `LINES` 環境変数**を読むこと。Claude Code が実行前に設定する。

> "The status line runs locally and **does not consume API tokens**."

⚠ **これが大きい。** frame / fence は context を食うが、**statusline はタダ**である。

## 実行モデル —— ここが本当の制約

**走るとき:**
- session 開始時（resume 含む）
- **新しい assistant message が届いたとき** ← 会話の各ターンで最新化される
- `/compact` 完了 / permission mode 変更 / vim mode 切り替え
- `statusLine.command` 自体を変更したとき（debounce を skip して即実行）
- `refreshInterval` の timer（設定時。最小 1 秒）
- rate-limit window が `resets_at` に達したとき / warm な prompt cache が `expires_at` に達したとき

**制約:**
- **300ms debounce。** 連続変化はまとめて 1 回。
- ⚠ **実行中に次の trigger が来ると、走っている script は cancel される** ∴ **重い処理は禁物**。
  （旧 `~/.claude/statusline.sh` は毎回 `npx ccstatusline@latest` を起動していた —— 相当重い）
- ⚠ **idle 中は event が来ない**（background subagent 待ちなど）∴ 時間依存や外部由来のものは
  `refreshInterval` が要る。

**設定の場所:** user settings (`~/.claude/settings.json`) **または project settings** —— docs が明記。
他に `padding`（既定 0）、`refreshInterval`、`hideVimModeIndicator`。

## 標準で stdin に来る全フィールド

| 群 | フィールド |
|---|---|
| model | `model.id` / `model.display_name` |
| 場所 | `cwd` / `workspace.current_dir` / `workspace.project_dir` / `workspace.added_dirs` / `workspace.git_worktree` |
| repo | `workspace.repo.host` / `.owner` / `.name` |
| cost | `cost.total_cost_usd` / `.total_duration_ms` / `.total_api_duration_ms` / `.total_lines_added` / `.total_lines_removed` |
| **context** | `context_window.used_percentage` / `.remaining_percentage` / `.current_usage` / `.total_input_tokens` / `.total_output_tokens` / `.context_window_size` / `exceeds_200k_tokens` |
| 実行様態 | `fast_mode` / `effort.level` / `thinking.enabled` / `output_style.name` / `vim.mode` |
| **rate limit** | `rate_limits.five_hour.used_percentage` / `.resets_at`、`seven_day.*`、`spend_limit.*` |
| cache | `prompt_cache`（`warm` / `expires_at`） |
| session | `session_id` / `session_name` / `prompt_id` / `transcript_path` / `version` |
| agent | `agent.name` |
| PR | `pr.number` / `.url` / `.review_state` / `.kind` |
| worktree | `worktree.name` / `.path` / `.branch` / `.original_cwd` / `.original_branch` |

⚠ **通常の branch は標準フィールドに無い。** `worktree.branch` は worktree 使用時のもの ∴
普段の branch は script 側で `git branch --show-current` を叩く必要がある。

## bearing にとっての含意

statusline は **token を食わずに、assistant message ごとに更新される、常に見えている面**である。
∴ **「会話に注入すると邪魔だが、見失うと事故になるもの」**の置き場として、
frame / fence（context を食う）とは性質が違う。

⚠ ただし cancel される ∴ **statusline 側で fence を計算してはならない。**
hook が既に計算した結果を**読むだけ**にする形が、実行モデルと噛み合う。

---

## 追記: 2 つの面（CLI / Claude デスクトップの Code）で「同じもの」は成り立つか

人間の実測: **Claude デスクトップの Code（リモート表示）では statusline が出ない。**
（docs に明記は無いが、statusline は terminal UI の row ∴ 自然な帰結。）

∴ **両方の面に届く出し口は「会話」しかない。**

| 出し口 | CLI | デスクトップ | token | 常時性 | 割り込み |
|---|---|---|---|---|---|
| statusline | ○ | **×** | **0** | 常時 | なし |
| hook の会話注入（変化時） | ○ | ○ | 食う | 離散 | あり |
| skill / command（on-demand） | ○ | ○ | 呼んだ時だけ | 呼んだ時 | 人間が選ぶ |

### ⚠ hook には context 使用率が来ない —— これは原理的な非対称である

出典: https://code.claude.com/docs/en/hooks

hook が共通で受け取るのは `session_id` / `prompt_id` / `transcript_path` / `cwd` /
`permission_mode` / `effort` / `hook_event_name` **のみ**。
**`context_window` に相当するフィールドは、どの hook event にも無い。**

∴ 材料は 2 つに割れる:

- **両方の面で出せる**（repo / file から取れる）: branch、未 commit / 未 push の aim、
  未読 baton、open-todo 数、aim slug、drift fence、PR 番号（`gh` 経由）
- **statusline でしか出せない**（stdin JSON 固有）: **`context_window.*`**、`rate_limits.*`、
  `cost.*`、`model` / `effort` / `fast_mode`、`session_id` / `session_name`、`agent.name`、`prompt_cache`

⚠ 逃げ道は `transcript_path`（hook にも来る）を自前で数えること —— ccstatusline が採っていた手法だが、
**近似であり重い**。hook は毎ターン走る ∴ 割に合いにくい。

### bearing にとっての帰結

ctx% が要る理由は **handoff-w をいつ打つか**である。そして**その瞬間は既に PreCompact hook が
受け持っている**（沈黙の自動圧縮を差し止め、baton を著させる）∴ デスクトップでは
**数字は見えないが、打つべき瞬間は届く**。数字の欠落は、機構の欠落ではない。

∴ 設計の形:

1. **計算は hook が 1 回**（corpus を見ているのは既に hook）→ machine-local な cache に書く
2. **statusline は cache を読むだけ** ＋ stdin の ctx% を足す（⚠ 自分で fence を計算しない ——
   in-flight cancel と噛み合わない）
3. **デスクトップ側は同じ cache を会話注入と on-demand が読む** —— 面が 2 つでも**材料は 1 つ**

---

## 追記 2: デスクトップ UI が出している項目と、statusline での再現度

人間のスクショ（2026-09-01）で、Claude デスクトップの Code が UI として出していた項目:

| デスクトップ UI の項目 | statusline のフィールド | 再現 |
|---|---|---|
| コンテキストウィンドウ `105.3k / 1M (11%)` | `context_window.current_usage` / `.context_window_size` / `.used_percentage` | ✓ |
| 5時間制限 `10%` / `1時間6分後にリセット` | `rate_limits.five_hour.used_percentage` / `.resets_at`（Unix epoch 秒） | ✓ |
| 週間・全モデル `24%` / `2:00 (日)` | `rate_limits.seven_day.used_percentage` / `.resets_at` | ✓ |
| **週次・Fable `0%`** | —— | ⚠ **不可。モデル別の週次枠は JSON に無い**（窓は `five_hour` / `seven_day` / `spend_limit` の 3 つだけ） |
| 使用クレジット `$50.00 のうち $0.00` | `rate_limits.spend_limit.used_percentage` / `.resets_at` | △ **% のみ。金額は来ない** |
| `Opus 5` | `model.display_name` | ✓ |
| `高` | `effort.level`（`"high"`） | ✓ |

⚠ 欠落条件: `rate_limits` は **Claude.ai Pro / Max のみ**、かつ**最初の API 応答の後**にしか現れない。
各窓は独立に欠けうるし、`resets_at` を過ぎた窓は Claude Code 側が落とす ∴
`jq -r '.rate_limits.five_hour.used_percentage // empty'` の形で耐えること。

## ⚠ 前段の整理を訂正する

「ctx はデスクトップで見えない」は不正確だった。正しくは —— **会話には出せないが、
デスクトップ UI はそれを持っている。** ∴ **両方の面で見える状態は作れる。同じ出し口である
必要がない**だけである。

| 材料 | CLI に UI | デスクトップに UI | 手当て |
|---|---|---|---|
| ctx / rate limit / cost / model / effort | **無い** | **有る**（スクショ） | **statusline で CLI 側を埋める** |
| branch / aim / baton / drift / open-todo | 無い | **無い** | statusline（CLI）＋ 会話注入 or on-demand（両面） |

∴ 役割分担が確定する:

- **statusline** = 「デスクトップ UI 相当」＋「bearing 固有」を CLI で埋める
- **会話注入 / on-demand** = **bearing 固有だけ**。デスクトップ UI が既に持っているものを
  会話に重複させない（token を食い、vibe coding の邪魔になる）

---

## 追記 3: デスクトップの PR 表示は 2 つの別機構である

出典: https://code.claude.com/docs/en/interactive-mode（PR review status）/
https://code.claude.com/docs/en/desktop.md（Monitor pull request status）

### 機構 1: footer の PR badge —— ⚠ CLI にも既にある

> "When working on a branch with an open pull request, Claude Code displays a clickable PR link
> in the footer, such as \"PR #446\". The link has a colored underline indicating the review state:
> Green: approved / Yellow: pending review / Red: changes requested / Gray: draft"

- merge / close で badge は消える。Cmd/Ctrl+click でブラウザが開く
- 更新頻度: feature-flag fetching on なら**約 90 秒**（idle / 非フォーカス時はより疎）、
  Bedrock 等や flag off なら**60 秒**。`git push` や `gh pr create` / `gh pr merge` の成功で**即更新**。
  ⚠ **1 時間入力が無いと更新を止め、次の prompt で再開する**
- ⚠ **`gh` CLI のインストールと `gh auth login` が必須**（GitLab は `glab`、badge は `MR !N`）
- SSH / tmux でも hyperlink として描く。`FORCE_HYPERLINK=0` で plain text

statusline の `pr.number` / `.url` / `.review_state` / `.kind` は docs いわく
**"Mirrors the PR badge in the footer"** ∴ **CLI では footer に既に出ている** ——
statusline に出すのは重複である。

### 機構 2: CI status bar —— ⚠ デスクトップ固有

> "After you open a pull request, a **CI status bar** appears in the session. Claude Code uses
> the GitHub CLI to poll check results and surface failures."

- **Auto-fix** トグル: 失敗した CI を Claude が出力を読んで自動で直しにいく
- **Auto-merge** トグル: 全 check 通過で **squash** merge（GitHub 側の auto-merge 有効化が前提）
- **CI 完了時にデスクトップ通知**。PR が merge / close したらセッションを auto-archive（設定）

⚠ **CI の状態は statusline の stdin JSON に無い** ∴ CLI で出したければ `gh` を自分で叩くしかなく、
in-flight cancel を踏む ∴ **hook / 別プロセスが cache に書き、statusline は読むだけ**の形が要る。

### ctx / usage も同じ構図

> "Click the **usage ring** next to the model picker to see your current context window usage and
> your plan usage for the period. **Context usage is per session; plan usage is shared across all
> your Claude Code surfaces.**"

∴ デスクトップで常時見えているのは **ring** であり、人間のスクショはそれを開いたポップオーバー。

### ⚠ 決定的な事実: hook と skill はデスクトップでも動く

> "**Hooks** and **skills** defined in settings apply to both"
> "Settings in `~/.claude.json` and `~/.claude/settings.json` are shared."

∴ **bearing の hook 注入は CLI とデスクトップの両面で機能する。**
`statusLine` の設定も共有されるが、**描画されるのは CLI だけ**（desktop.md は statusline に一切触れない）。

### 埋めるべき穴の再定義

| 材料 | CLI | デスクトップ | bearing がやること |
|---|---|---|---|
| PR の review state | **footer badge が既にある** | footer badge ＋ CI status bar | **無し**（重複） |
| CI の通過/失敗 | 無い | **CI status bar が持つ** | CLI 側だけ穴。埋めるなら `gh` → cache → statusline |
| ctx / plan usage | 無い | **usage ring が持つ** | **statusline で CLI 側を埋める** |
| aim / baton / drift / open-todo | **無い** | **無い** | **statusline（CLI）＋ hook 注入（両面・既に動く）** |

---

## 追記 4: 実行環境の実測（2026-09-01、Claude Code v2.1.252）

statusline の script に実際に渡るものを、一度だけ env ごと落として確認した。

### ⚠ `CLAUDE_PROJECT_DIR` は statusline にも渡る

docs に記述は無いが、**実測で在った**（`/home/trustdelta/works/bearing`）。
statusline 実行時の `CLAUDE_*`:

```
CLAUDECODE / CLAUDE_CODE_BRIDGE_SESSION_ID / CLAUDE_CODE_CHILD_SESSION /
CLAUDE_CODE_ENTRYPOINT / CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS /
CLAUDE_CODE_MESSAGING_SOCKET / CLAUDE_CODE_MESSAGING_TOKEN /
CLAUDE_CODE_SESSION_ID / CLAUDE_EFFORT / CLAUDE_PID / CLAUDE_PROJECT_DIR
```

∴ **tracked な project settings に絶対パスを焼かずに済む**:

```json
"statusLine": { "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/carriers/claude/bearing/bin/statusline.mjs\"" }
```

`COLUMNS` も渡っていた（実測 118）。

### 実際に来た stdin の top-level key

```
context_window / cost / cwd / effort / exceeds_200k_tokens / fast_mode / model /
output_style / prompt_cache / prompt_id / rate_limits / session_id / session_name /
thinking / transcript_path / version / vim / workspace
```

⚠ **`pr` は無い** —— docs の通り、open な PR がある branch でのみ現れる。
⚠ `agent` / `worktree` も同様に、その状況でのみ現れる。

## ⚠ East Asian Ambiguous 幅 —— 実際に踏んだ地雷

初版で `↻`（U+21BB）を使ったところ、**人間の画面で `12%` と `30m` が重なった**。

原因は fontの不調ではない。⚠ **Ambiguous 幅の文字は日本語フォントでは全角に描かれるのに、
terminal は半角として桁を進める** ∴ 次の文字と重なる。初版は 5 つ踏んでいた:

| 文字 | 用途 | 判定 |
|---|---|---|
| `↻` U+21BB | リセットまで | ⚠ Ambiguous |
| `·` U+00B7 | 区切り | ⚠ Ambiguous |
| `Δ` U+0394 | 未 commit | ⚠ Ambiguous |
| `↑` U+2191 | 未 push | ⚠ Ambiguous |
| `⚠` U+26A0 | 警告 | ⚠ 絵文字、幅が揺れる |

∴ **statusline に使ってよいのは ASCII printable と、Wide が確定した日本語の帯だけである。**
構造は記号ではなく**色と余白**が作る。この規律は `widthUnsafeChars()` と、それを使う
test（`描かれる文字はすべて幅が確定している`）で固定した —— 次に Ambiguous な記号を
足そうとする者を、画面が重なる前に止めるのが役目である。
