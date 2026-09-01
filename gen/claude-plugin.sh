#!/usr/bin/env bash
# Generate the vendor carriers for the aim + handoff methods from their neutral
# sources in `docs/aims/_guide/`.
#
# WHY: `docs/aims/neutral-source-vendor-carrier.md` — the substance lives in ONE
# committed neutral source; every vendor placement is a *generated* artifact.
# A hand-written carrier drifts, and the drift enters the moment it is written:
# a summary is a selection, and a selection already carries judgment. This
# script is what makes "no drift" a mechanical fact instead of a promise.
#
# Two destinations, ONE set of carrier bodies:
#
#   --plugin              carriers/claude/bearing/skills/          committed build artifact
#   --workspace <DIR>     <DIR>/.claude/skills/        untracked, machine-local
#
# The bodies differ in ONE respect only, and it is forced by topology: how the
# carrier names its source.
#
#   workspace — a relative path to the committed doc, computed here. The doc is
#               in the same workspace, so the carrier can point at it and the
#               single source is read directly. Nothing is copied.
#   plugin    — the plugin does not know where the consuming workspace put
#               this repository, so no relative path can be written. The
#               neutral source is BUNDLED into the skill directory instead, and
#               the carrier points at its own bundle. That copy is generated,
#               never authored, and CI verifies it is in sync.
#
# `--plugin` output is COMMITTED on purpose. A plugin must work on clone with no
# install step, which is the property that made it the better distribution
# vehicle (operator, 2026-08-31). Committed-and-generated is only safe when
# something checks the two agree: see the `carriers are in sync` CI step.

set -euo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
guide="$repo_root/docs/aims/_guide"

mode="plugin"
target=""
while [ $# -gt 0 ]; do
  case "$1" in
    --plugin) mode="plugin"; shift ;;
    --workspace) mode="workspace"; target="${2:-}"; shift 2 ;;
    *) echo "usage: $0 [--plugin | --workspace <DIR>]" >&2; exit 2 ;;
  esac
done

if [ "$mode" = "workspace" ]; then
  [ -n "$target" ] || { echo "error: --workspace needs a directory" >&2; exit 2; }
  [ -d "$target" ] || { echo "error: no such directory: $target" >&2; exit 1; }
  out_root="$target/.claude/skills"
else
  out_root="$repo_root/carriers/claude/bearing/skills"
fi

# ── the neutral sources ──────────────────────────────────────────────────────
for f in handoff.md aim-facts.md producer-guide.md; do
  [ -f "$guide/$f" ] || { echo "error: neutral source missing: $guide/$f" >&2; exit 1; }
done

# How a carrier names the handoff CLI. The CLI is a plugin artifact, so the two
# modes reach it differently — and the mention is not decoration: a tool no
# carrier names is a tool nobody runs, and the ritual goes back to being executed
# by hand with the archive rotation and the read-at ordering left to memory.
cli_ref() {
  local rel="carriers/claude/bearing/bin/$1"
  if [ "$mode" = "plugin" ]; then
    printf 'node "$CLAUDE_PLUGIN_ROOT"/bin/%s' "$1"
  else
    printf 'node %s' "$(realpath --relative-to="$target" "$repo_root/$rel")"
  fi
}

# How a carrier in this mode names one of the sources.
#   plugin    -> bare filename; the file is bundled next to SKILL.md
#   workspace -> path relative to the workspace the agent runs in
source_ref() {
  local file="$1"
  if [ "$mode" = "plugin" ]; then
    printf '%s' "$file"
  else
    realpath --relative-to="$target" "$guide/$file"
  fi
}

# Write one carrier. In plugin mode EVERY source the body names is bundled
# alongside it — a carrier that points at a file it did not bundle fails the way
# the discipline warns about: silently, with the reader believing they were
# framed. The bundle list and the refs the body uses must not diverge.
#   $1 skill name   $2 description   $3 sources to bundle (space separated)   $4 body
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
    printf '\n⚠ **この file は生成物である**（`scripts/gen-carriers.sh`）。手で編集しても次の生成で消える —— 実体は `docs/aims/_guide/` にある。\n'
  } > "$dir/SKILL.md"
  echo "  $dir/SKILL.md"
  if [ "$mode" = "plugin" ]; then
    for s in $srcs; do
      cp "$guide/$s" "$dir/$s"
      echo "  $dir/$s (bundled)"
    done
  fi
}

# ── the carriers ─────────────────────────────────────────────────────────────
handoff_ref="$(source_ref handoff.md)"
facts_ref="$(source_ref aim-facts.md)"
guide_ref="$(source_ref producer-guide.md)"
frame_ref="$(source_ref frame.md)"

echo "generating carriers ($mode) into: $out_root"

write_carrier "handoff-r" \
  "直前のセッションが残した baton（.handoff/active.md）を読み込み、未プッシュの aim を surface して作業を再開する。新しいセッションの最初に実行する。" \
  "handoff.md" \
  "手順の正本は **\`$handoff_ref\`** の「## 読む」節。**まずそれを読み、そこに書かれた通りに実行すること。**

手順 2〜4（前回 read-at の報告 → 新しい read-at の刻印 → 未 push/未 commit aim の trace）は**機械であって判断ではない**。次のコマンドが正しい順序で行う —— 手で刻むと、報告すべき旧 read-at を先に潰す事故が起きる:

\`\`\`bash
$(cli_ref handoff.mjs) read
\`\`\`

残り（baton を読むこと・Pointers の slug を読むこと・今どこに立っているかを operator に伝えること）は**あなたの仕事**である。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。"

write_carrier "handoff-w" \
  "このセッションの baton（会話引き継ぎ）を authoring して .handoff/active.md に書き出す。context を使い切る前、あるいは区切りの良いところで実行する。" \
  "handoff.md" \
  "手順の正本は **\`$handoff_ref\`** の「## 書く」節。**まずそれを読み、そこに書かれた通りに実行すること。**

**何を残し何を省くかの judgment があなたの仕事の全てであり**、それを機械に渡してはならない —— それが native な圧縮に欠けているものだからだ。⚠ **operator に見せて確認を得てから land すること。**

land だけは機械である（旧 baton の archive 退避 → \`composed-at\` の刻印 → 配置）:

\`\`\`bash
$(cli_ref handoff.mjs) write < <あなたが著した baton>
\`\`\`

⚠ \`read-at\` は書かない —— 新しい baton は「まだ読まれていない」が正で、この経路は書かれていても除去する。

この file は carrier であって手順ではない。ここに手順を複製しない —— 正本が動けば追従する。"

write_carrier "aim" \
  "How to read, write and maintain the aim corpus (docs/aims/) — the purpose=means tree this project is driven by. Use whenever you are about to read, create or edit an aim node, when a boot-time aim-drift / unpushed / checkpoint-stale record names a slug, when asked about open todos or what a project is for, or when a repository has no aim corpus yet and one should be provisioned." \
  "aim-facts.md producer-guide.md frame.md" \
  "\`docs/aims/<slug>.md\` の各ファイルが 1 つの **aim**（目的とその手段）であり、親子で目的を分解した木を成す。

**aim の作成と保守の正本は \`$guide_ref\`。aim に触れる前に読むこと。** slug の付け方・body の section・木の保守・drift の検出と修復は、そこが唯一の source である。⚠ この repo に \`docs/aims/_guide/\` が無い場合、**設置は operator の act である** —— plugin は不在を surface するところで止まり、自分では置かない。この skill には正本が同梱されているので、置かれるまではそれを読むこと。⚠ **multi-repo wrapper が cwd の場合、guide は member repo の側にある** —— cwd 直下を見て無いと決めつけないこと。

**セッション開始時に注入される事実の読み方の正本は \`$facts_ref\`。** fence の schema、各 fence が課すもの、open-todo 数の扱い、\`# PROCESS\` の機械 parse 形、CLI —— これらを知る必要が出たらそこを読む。⚠ **fence を parse せよ。prose を scrape するな。**

常時効く不変（frontmatter は人間のもの・body はあなたのもの 等）は \`$frame_ref\` にあり、通常はセッション開始時に自動で注入されている（plugin の SessionStart hook、または vendor ファイルの import）。**ここには複製しない** —— 同じ規則が context に二度入ることになり、しかも複製した側が先に古くなる。"

# ── every ref a carrier names must resolve ───────────────────────────────────
# A carrier that points at a file the reader cannot open is the silent failure
# that matters most here: the agent believes it was framed and was not. Generation is the last place that can still be loud
# about it, so this runs here rather than only in CI. It has already caught two
# real breaks: `producer-guide.md` referenced but not bundled, and `frame.md`
# hard-coded as a bare name so it resolved in plugin mode and dangled in
# workspace mode.
fail=0
for d in "$out_root"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"

  # The carrier body: every `backticked.md` in it is a name we told the reader to
  # open. Safe to read this broadly because this text is authored right here.
  for ref in $(grep -oE '`[A-Za-z0-9_./-]+\.md`' "$d/SKILL.md" | tr -d '`' | sort -u); do
    case "$mode" in
      plugin)    probe="$d/$ref" ;;
      workspace) probe="$target/$ref" ;;
    esac
    if [ ! -f "$probe" ]; then
      echo "error: $name/SKILL.md points at '$ref', which does not resolve ($probe)" >&2
      fail=1
    fi
  done

  # The bundled sources: only real markdown links, never backticked names. The
  # neutral sources are prose we do not control, and they mention paths that are
  # not files to open — `handoff.md` names `.handoff/active.md`, the baton — so
  # the broader pattern would fail on text that is perfectly correct.
  for f in "$d"*.md; do
    [ -f "$f" ] || continue
    [ "$(basename "$f")" = "SKILL.md" ] && continue
    for ref in $(grep -oE '\]\([A-Za-z0-9_./-]+\.md\)' "$f" | tr -d ']()' | sort -u); do
      if [ ! -f "$d$ref" ]; then
        echo "error: bundled $name/$(basename "$f") links to '$ref', which is not bundled with it" >&2
        fail=1
      fi
    done
  done
done
[ "$fail" -eq 0 ] || { echo "error: carriers would ship dangling references; refusing." >&2; exit 1; }

echo "done."
