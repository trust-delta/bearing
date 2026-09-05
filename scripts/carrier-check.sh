#!/usr/bin/env bash
# carrier が自分の中で閉じているかを検める。⚠ **何も書き換えない —— 述べて落ちるだけである。**
#
# ⚠ **2026-09-05 まで、この script は生成器だった**（`gen/claude-plugin.sh`）。`original/<単位>/`
# に「中立な正本」を置き、純粋な複製で carrier を作っていた。⚠ **測ったら中立は名目だった** ——
# 正本 11 枚のうち Claude 固有語 0 件は 3 枚だけで、`setup-*.md` は `.claude/` と statusLine と
# plugin cache を語る Claude 専用の command そのものだった（実測 2026-09-05）。∴ **複製が複製で
# あることを守るためだけの門を 3 つ持っていた** —— 生成・CI の再生成比較・byte 同一の test。
# 人間が 2026-09-05 に畳み、`carriers/claude/bearing/` が正本になった。
#
# ⚠ **消えたのは複製であって、検査ではない。** むしろ重みが増した: **再生成が無くなった以上、
# 手編集は直に着地する。** 以前は「生成し直せば直る」と言えたが、今は**壊れたまま commit される。**
#
# ⚠ **2 つ目の carrier（Codex 用など）が要る日は、`carriers/claude/` を正本として派生させる**
# ——「中立を先に作る」のではなく「Claude を優先し、他 vendor にも対応可能にする」
# （人間の決定 2026-09-05）。

set -euo pipefail

repo_root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
plugin="$repo_root/carriers/claude/bearing"

[ -d "$plugin" ] || { echo "error: carrier が無い: $plugin" >&2; exit 1; }

fail=0

# ── LICENSE ─────────────────────────────────────────────────────────────────
# ⚠ **root の LICENSE は消費者に届かない。** marketplace entry の source は
# `./carriers/claude/bearing` であり、cache へ複製されるのはその subtree だけである
# （実測 2026-09-03: cache 直下は README 2 枚と bin / commands / hooks / lib / skills / test
# のみ）。∴ MIT が要求する「複製に著作権表示を含める」を満たすには carrier 自身が 1 枚
# 持つほかない —— **これは重複ではなく、配布物の一部である。**
#
# ⚠ **写さずに検める。** 以前はここで `cp` していたが、**黙って書き換える門は、食い違いが
# 起きたことを人間に一度も見せずに消す。** 落ちれば人間が直す —— LICENSE はほぼ動かない ∴
# 費用は無く、動いた日には必ず目に入る。
if [ ! -f "$repo_root/LICENSE" ]; then
  echo "error: root に LICENSE が無い —— 著作権表示を欠いた plugin を出荷することになる。" >&2
  fail=1
elif ! cmp -s "$repo_root/LICENSE" "$plugin/LICENSE"; then
  echo "error: carrier の LICENSE が root の LICENSE と食い違っている。" >&2
  echo "  直し方:  cp LICENSE carriers/claude/bearing/LICENSE" >&2
  fail=1
fi

# ── carrier が名指す参照はすべて解決せねばならない ───────────────────────────
# ⚠ **読み手が開けない file を指す carrier は、ここで最も重大な「黙った失敗」である**:
# エージェントは framed されたと信じ、実際にはされていない。これは既に本物の破損を 2 件
# 捕まえている: `aim-authoring.md` が参照されているのに同梱されていなかった件と、`frame.md`
# が裸の名で hard-code されていて宙に浮いた件。
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
  # 同梱された md については、本物の markdown link だけを見る。⚠ 規律の散文は開くべき file では
  # ない path を言及する —— baton の file 名（`active.md`）等 —— ∴ 広い pattern は完全に正しい
  # text の上で失敗することになる。
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

[ "$fail" -eq 0 ] || { echo "error: carrier は今の形では出荷できない。" >&2; exit 1; }

echo "carrier は閉じている。"
