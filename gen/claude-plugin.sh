#!/usr/bin/env bash
# `original/` の正本から、vendor carrier（Claude Code plugin）を生成する。
#
# なぜ: ⚠ **実体は commit された正本 1 つに住み、vendor への配置はすべて*生成物*である。**
# 手で書かれた carrier は drift し、しかもその drift は書かれた瞬間に入り込む: **要約は選択で
# あり、選択は既に judgment を運んでいる。** この script が、「drift しない」を約束ではなく
# 機械的な事実にしている。
#
# ⚠ **生成は純粋な複製である。** substitution も合成も無い —— 正本の text がそのまま carrier に
# 載る。以前は `docs/aims/_guide/` から `--plugin` と `--workspace` の 2 mode で生成し、mode ごとに
# 参照 path を書き換えていたが、⚠ **正本が同時に bearing 自身の消費者側 canon でもあったことが、
# 複製の矢印を消費者から見て逆に向けた**（`docs/aims/adoption-declaration.md` の `# HISTORY`）。
# `original/` は bearing にしか存在せず、出荷も配置もされない ∴ 書き換える参照が無い。
#
# 配布機能の単位ごとに、正本がどこへ写されるかを下の配置表が 1 行ずつ述べる。
#
# ⚠ **aim の規律は `skills/` ではなく `templates/` へ写す。** `skills/` に置けば Claude Code が
# `bearing:aim` として登録し、`setup-aim` が消費者の `.claude/skills/aim/` へ置いた `aim` と
# **同じ規律が 2 つの skill として並ぶ** —— どちらが正か誰にも決められない。aim の規律は project
# ごとに置かれるものであって user scope に住まない ∴ plugin の中では template でしかない。
#
# 出力は**意図して commit される。** plugin は clone した時点で install 手順無しに動かねばならず、
# それが plugin をより良い配布手段にしている性質である（人間が 2026-08-31 に判断した）。
# ⚠ **commit された生成物が安全なのは、両者の一致を何かが検査している場合だけである**:
# CI の `carriers-in-sync` step と `test/original-sync.test.mjs` を参照。

set -euo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
src="$repo_root/original"
plugin="$repo_root/carriers/claude/bearing"

[ -d "$src" ] || { echo "error: 正本が無い: $src" >&2; exit 1; }

placed=()
place() {
  local from="$src/$1" to="$plugin/$2"
  [ -f "$from" ] || { echo "error: 正本が無い: $from" >&2; exit 1; }
  mkdir -p "$(dirname "$to")"
  cp "$from" "$to"
  placed+=("$to")
  echo "  $2"
}

echo "carrier を生成中 → $plugin"

# ── 配置表 ──────────────────────────────────────────────────────────────────
# aim: template（skill として登録しない）＋ command
for f in SKILL.md aim-authoring.md aim-facts.md frame.md; do place "aim/$f" "templates/aim/$f"; done
place "aim/setup-aim.md" "commands/setup-aim.md"

# handoff: skill（baton は痕跡を残さない ∴ どの project でも使える）
for f in SKILL.md read.md write.md; do place "handoff/$f" "skills/handoff/$f"; done

# statusline: command
place "statusline/setup-statusline.md" "commands/setup-statusline.md"

# ── LICENSE ─────────────────────────────────────────────────────────────────
# ⚠ **root の LICENSE は消費者に届かない。** marketplace entry の source は
# `./carriers/claude/bearing` であり、cache へ複製されるのはその subtree だけである
# （実測 2026-09-03: cache 直下は README 2 枚と bin / commands / hooks / lib / skills / test
# のみ）。∴ MIT が要求する「複製に著作権表示を含める」を満たすには carrier 自身が 1 枚
# 持つほかない —— **これは重複ではなく、配布物の一部である。**
#
# ⚠ **だからこそ生成物にする。** 手で置いた複製は、root の LICENSE が動いた日に黙って
# 古くなる。ここで写せば、CI の `carriers-in-sync` が食い違いを赤くする。
[ -f "$repo_root/LICENSE" ] || { echo "error: root に LICENSE が無い —— 著作権表示を欠いた plugin を出荷することになる。拒否する。" >&2; exit 1; }
cp "$repo_root/LICENSE" "$plugin/LICENSE"
echo "  LICENSE"

# ── 正本の無い生成物が残っていないか ────────────────────────────────────────
# ⚠ **改名や削除の跡が carrier に残れば、それは誰も更新しない file として出荷される** ——
# 2026-09-05、`skills/handoff-r/` と `skills/handoff-w/` が 1 枚の `skills/handoff/` へ
# 畳まれたとき、旧 dir を消し忘れれば 3 つの handoff skill が並ぶ形になった。
stale=0
for d in skills templates commands; do
  [ -d "$plugin/$d" ] || continue
  while IFS= read -r f; do
    hit=0
    for p in "${placed[@]}"; do [ "$p" = "$f" ] && hit=1 && break; done
    if [ "$hit" -eq 0 ]; then
      echo "error: 正本の無い生成物が残っている: ${f#"$plugin/"}" >&2
      stale=1
    fi
  done < <(find "$plugin/$d" -type f)
done
[ "$stale" -eq 0 ] || { echo "error: 正本に対応しない file が carrier に在る。消してから再生成すること。" >&2; exit 1; }

# ── carrier が名指す参照はすべて解決せねばならない ───────────────────────────
# ⚠ **読み手が開けない file を指す carrier は、ここで最も重大な「黙った失敗」である**:
# エージェントは framed されたと信じ、実際にはされていない。生成の時点が、それについて声を
# 上げられる最後の場所である ∴ CI だけでなくここでも走らせる。これは既に本物の破損を 2 件
# 捕まえている: `aim-authoring.md` が参照されているのに同梱されていなかった件と、`frame.md`
# が裸の名で hard-code されていて workspace mode で宙に浮いた件。
fail=0
for d in "$plugin"/skills/*/ "$plugin"/templates/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  # SKILL.md の body: その中の `backtick 付き .md` はすべて、読み手に「開け」と告げた名である。
  for ref in $(grep -oE '`[A-Za-z0-9_./-]+\.md`' "$d/SKILL.md" | tr -d '`' | sort -u); do
    # ⚠ `CLAUDE.md` は消費者の file であって同梱物ではない —— SKILL.md が法の block の在り処として
    # 名指すのは正しく、ここで「同梱されていない」と呼ぶのは誤検知である。
    [ "$ref" = "CLAUDE.md" ] && continue
    if [ ! -f "$d/$ref" ]; then
      echo "error: $name/SKILL.md が '$ref' を指しているが、同梱されていない" >&2
      fail=1
    fi
  done
  # 同梱された正本については、本物の markdown link だけを見る。⚠ 正本は我々が制御していない
  # 散文であり、開くべき file ではない path を言及する —— baton の file 名（`active.md`）等 ——
  # ∴ 広い pattern は完全に正しい text の上で失敗することになる。
  for f in "$d"*.md; do
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
