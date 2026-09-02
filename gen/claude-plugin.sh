#!/usr/bin/env bash
# aim ＋ handoff の方法を運ぶ vendor carrier を、`docs/aims/_guide/` の中立正本から生成する。
#
# なぜ: ⚠ **実体は commit された中立正本 1 つに住み、vendor への配置はすべて*生成物*である。**
# 手で書かれた carrier は drift し、しかもその drift は書かれた瞬間に入り込む: **要約は選択で
# あり、選択は既に judgment を運んでいる。** この script が、「drift しない」を約束ではなく
# 機械的な事実にしている。
#
# 宛先は 2 つ、carrier の本体は 1 組:
#
#   --plugin              carriers/claude/bearing/skills/   commit される build 生成物
#   --workspace <DIR>     <DIR>/.claude/skills/             非 tracked・machine-local
#
# 本体が違うのは 1 点だけであり、それは topology によって強制されている: **carrier が自らの
# source をどう名指すか。**
#
#   workspace —— commit された doc への相対 path（ここで計算する）。doc は同じ workspace に
#                在るので carrier はそれを指せ、単一の正本が直接読まれる。何も複製しない。
#   plugin   —— plugin は、消費する側の workspace がこの repository をどこへ置いたかを知ら
#                ない ∴ 相対 path を書きようがない。代わりに中立正本を skill directory へ
#                **同梱**し、carrier は自分の同梱物を指す。⚠ **その複製は生成物であって著述
#                物ではなく、同期していることは CI が検証する。**
#
# `--plugin` の出力は**意図して commit される。** plugin は clone した時点で install 手順
# 無しに動かねばならず、それが plugin をより良い配布手段にしている性質である
# （人間が 2026-08-31 に判断した）。⚠ **commit された生成物が安全なのは、両者の一致を何かが検査して
# いる場合だけである**: CI の `carriers are in sync` step を参照。

set -euo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
guide="$repo_root/docs/aims/_guide"

mode="plugin"
target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) mode="plugin"; shift ;;
    --workspace) mode="workspace"; target="${2:-}"; shift 2 ;;
    *) echo "使い方: $0 [--plugin | --workspace <DIR>]" >&2; exit 2 ;;
  esac
done

if [ "$mode" = "workspace" ]; then
  [ -n "$target" ] || { echo "error: --workspace には directory が要る" >&2; exit 2; }
  [ -d "$target" ] || { echo "error: そのような directory は無い: $target" >&2; exit 1; }
  out_root="$target/.claude/skills"
else
  out_root="$repo_root/carriers/claude/bearing/skills"
fi

# ── 中立正本 ─────────────────────────────────────────────────────────────────
for f in handoff.md aim-facts.md aim-authoring.md; do
  [ -f "$guide/$f" ] || { echo "error: 中立正本が無い: $guide/$f" >&2; exit 1; }
done

# carrier が handoff CLI をどう名指すか。CLI は plugin の生成物なので、2 つの mode は別の
# 経路でそこへ届く —— ⚠ **そしてこの言及は装飾ではない**: どの carrier も名指さない道具は
# 誰も走らせない道具であり、儀式は手作業へ戻る。そのとき archive の退避と read-at の順序は
# 記憶任せになる。
#
# ⚠ **placeholder は波括弧つきで書く。** docs が inline 展開を明記しているのは
# `${CLAUDE_PLUGIN_ROOT}` の形であり、対象は skill / agent の content と hook / monitor の
# command である。⚠ **波括弧なしの `$CLAUDE_PLUGIN_ROOT` は展開されず、文字列のまま skill に
# 載る** —— そして **Bash tool の env にその変数は無い** ∴ エージェントは `/bin/handoff.mjs`
# を見て落ちる。2026-09-02 から 4 セッション連続で起きた、たった 2 文字の欠落である。
cli_ref() {
  local rel="carriers/claude/bearing/bin/$1"
  if [ "$mode" = "plugin" ]; then
    printf 'node "${CLAUDE_PLUGIN_ROOT}"/bin/%s' "$1"
  else
    printf 'node %s' "$(realpath --relative-to="$target" "$repo_root/$rel")"
  fi
}

# この mode の carrier が正本の 1 つをどう名指すか。
#   plugin    -> 裸の file 名。file は SKILL.md の隣に同梱される
#   workspace -> エージェントが走る workspace からの相対 path
source_ref() {
  local file="$1"
  if [ "$mode" = "plugin" ]; then
    printf '%s' "$file"
  else
    realpath --relative-to="$target" "$guide/$file"
  fi
}

# carrier を 1 つ書く。plugin mode では、body が名指す正本を**すべて**傍らに同梱する ——
# ⚠ **同梱していない file を指す carrier は、この規律が警告するとおりの壊れ方をする**:
# 黙って壊れ、読み手は自分が framed されたと信じたままになる。同梱一覧と body が使う参照は
# 決して乖離してはならない。
#   $1 skill 名   $2 description   $3 同梱する正本（空白区切り）   $4 body
write_carrier() {
  local name="$1" desc="$2" srcs="$3" body="$4"
  local dir="$out_root/$name"
  mkdir -p "$dir"
  {
    printf -- '---\n'
    printf 'name: %s\n' "$name"
    printf 'description: %s\n' "$desc"
    printf -- '---\n\n'
    printf '# %s\n\n' "$name"
    printf '%s\n' "$body"
    printf '\n⚠ **この file は生成物である**（`gen/claude-plugin.sh`）。手で編集しても次の生成で消える —— 実体は `docs/aims/_guide/` にある。\n'
  } > "$dir/SKILL.md"
  echo "  $dir/SKILL.md"
  if [ "$mode" = "plugin" ]; then
    for s in $srcs; do
      cp "$guide/$s" "$dir/$s"
      echo "  $dir/$s (bundled)"
    done
  fi
}

# ── carrier 群 ───────────────────────────────────────────────────────────────
handoff_ref="$(source_ref handoff.md)"
facts_ref="$(source_ref aim-facts.md)"
guide_ref="$(source_ref aim-authoring.md)"
frame_ref="$(source_ref frame.md)"

echo "carrier を生成中 ($mode) → $out_root"

write_carrier "handoff-r" \
  "直前のセッションが残した baton（.handoff/active.md）を読み込み、未プッシュの aim を surface して作業を再開する。新しいセッションの最初に実行する。" \
  "handoff.md" \
  "手順の正本は **\`$handoff_ref\`** の「## 読む」節。**まずそれを読み、そこに書かれた通りに実行すること。**

手順 2〜4（前回 read-at の報告 → 新しい read-at の刻印 → 未 push/未 commit aim の trace）は**機械であって判断ではない**。次のコマンドが正しい順序で行う —— 手で刻むと、報告すべき旧 read-at を先に潰す事故が起きる:

\`\`\`bash
$(cli_ref handoff.mjs) read
\`\`\`

残り（baton を読むこと・Pointers の slug を読むこと・今どこに立っているかを人間に伝えること）は**あなたの仕事**である。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。"

write_carrier "handoff-w" \
  "このセッションの baton（会話引き継ぎ）を authoring して .handoff/active.md に書き出す。context を使い切る前、あるいは区切りの良いところで実行する。" \
  "handoff.md" \
  "手順の正本は **\`$handoff_ref\`** の「## 書く」節。**まずそれを読み、そこに書かれた通りに実行すること。**

**何を残し何を省くかの judgment があなたの仕事の全てであり**、それを機械に渡してはならない —— それが native な圧縮に欠けているものだからだ。⚠ **人間に見せて確認を得てから land すること。**

land だけは機械である（旧 baton の archive 退避 → \`composed-at\` の刻印 → 配置）:

\`\`\`bash
$(cli_ref handoff.mjs) write < <あなたが著した baton>
\`\`\`

⚠ \`read-at\` は書かない —— 新しい baton は「まだ読まれていない」が正で、この経路は書かれていても除去する。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。"

write_carrier "aim" \
  "aim corpus（docs/aims/）—— この project を駆動する purpose＝means の木 —— を読み・書き・保守する方法。aim node を読む／作る／編集する前、boot 時の drift / unpushed / checkpoint-stale の record が slug を名指したとき、open todo やこの project が何のためかを問われたとき、あるいは repository にまだ aim corpus が無く設置すべきときに使う。" \
  "aim-facts.md aim-authoring.md frame.md" \
  "\`docs/aims/<slug>.md\` の各ファイルが 1 つの **aim**（目的とその手段）であり、親子で目的を分解した木を成す。

**aim の作成と保守の正本は \`$guide_ref\`。aim に触れる前に読むこと。** slug の付け方・body の section・木の保守・drift の検出と修復は、そこが唯一の source である。⚠ この repo に \`docs/aims/_guide/\` が無い場合、**設置は人間の act である** —— plugin は不在を surface するところで止まり、自分では置かない。この skill には正本が同梱されているので、置かれるまではそれを読むこと。⚠ **multi-repo wrapper が cwd の場合、guide は member repo の側にある** —— cwd 直下を見て無いと決めつけないこと。

**セッション開始時に注入される事実の読み方の正本は \`$facts_ref\`。** fence の schema、各 fence が課すもの、open-todo 数の扱い、\`# PROCESS\` の機械 parse 形、CLI —— これらを知る必要が出たらそこを読む。⚠ **fence を parse せよ。prose を scrape するな。**

常時効く不変（frontmatter は人間のもの・body はあなたのもの 等）は \`$frame_ref\` にあり、通常はセッション開始時に自動で注入されている（plugin の SessionStart hook、または vendor ファイルの import）。**ここには複製しない** —— 同じ規則が context に二度入ることになり、しかも複製した側が先に古くなる。"

# ── carrier が名指す参照はすべて解決せねばならない ───────────────────────────
# ⚠ **読み手が開けない file を指す carrier は、ここで最も重大な「黙った失敗」である**:
# エージェントは framed されたと信じ、実際にはされていない。生成の時点が、それについて声を
# 上げられる最後の場所である ∴ CI だけでなくここでも走らせる。これは既に本物の破損を 2 件
# 捕まえている: `aim-authoring.md` が参照されているのに同梱されていなかった件と、`frame.md`
# が裸の名で hard-code されていて plugin mode では解決し workspace mode で宙に浮いた件。
fail=0
for d in "$out_root"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"

  # carrier の body: その中の `backtick 付き .md` はすべて、読み手に「開け」と告げた名で
  # ある。この text はまさにここで著されているので、広く読んで安全である。
  for ref in $(grep -oE '`[A-Za-z0-9_./-]+\.md`' "$d/SKILL.md" | tr -d '`' | sort -u); do
    case "$mode" in
      plugin)    probe="$d/$ref" ;;
      workspace) probe="$target/$ref" ;;
    esac
    if [ ! -f "$probe" ]; then
      echo "error: $name/SKILL.md が '$ref' を指しているが、解決しない（$probe）" >&2
      fail=1
    fi
  done

  # 同梱された正本については、本物の markdown link だけを見る。backtick 付きの名は見ない。
  # ⚠ 中立正本は我々が制御していない散文であり、**開くべき file ではない path** を言及する
  # —— `handoff.md` は baton である `.handoff/active.md` を名指す —— ∴ 広い pattern は
  # 完全に正しい text の上で失敗することになる。
  for f in "$d"*.md; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" = "SKILL.md" ] && continue
    for ref in $(grep -oE '\]\([A-Za-z0-9_./-]+\.md\)' "$f" | tr -d ']()' | sort -u); do
      if [ ! -f "$d$ref" ]; then
        echo "error: 同梱された $name/$(basename "$f") が '$ref' へ link しているが、同梱されていない" >&2
        fail=1
      fi
    done
  done
done
[ "$fail" -eq 0 ] || { echo "error: carrier が宙に浮いた参照を出荷することになる。拒否する。" >&2; exit 1; }

echo "完了。"
