// handoff の別名 command —— **入口は 2 つ、正本は 1 つ。**
//
// ⚠ **なぜ別名が要るのか**: `/bearing:handoff r` は**サジェストから選んでもそのままでは
// 打てない** —— 選んだ後に `r` / `w` を人間が手で足すことになる（人間の指摘 2026-09-07、
// CLI とデスクトップの両方）。∴ 引数を名前に畳んだ 2 枚を置いた。
//
// 🔴 **そして、この 2 枚が中身を持ってはならない。** ⚠ **かつて handoff は `r` / `w` の
// 2 skill であり、2 枚が同じ 110 行を運んでいた** —— 2026-09-05 に 1 枚へ畳んだ理由は
// **「割れば共有部分が 2 正本になる」**である。⚠ **拒まれたのは canon を 2 つ持つことで
// あって、入口が 2 つ在ることではない** ∴ **別名が手順を書き写した瞬間、畳んだ意味が消える。**
// ここが見張るのはその 1 点である。
//
// ⚠ **これは「中身が無いこと」を直接は測れない** —— 測るのは**書き写せば必ず持ち込まれるもの**
// （儀式の CLI の名）と、**行数の上界**である。**他の写し方は素通りする。それを承知で置く。**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')

/** 別名 2 枚と、それぞれが呼ぶ側。 */
const ALIASES = [
  { file: 'handoff-r.md', arg: 'r', canon: 'read.md', hook: 'bin/aim-facts.mjs' },
  { file: 'handoff-w.md', arg: 'w', canon: 'write.md', hook: 'bin/precompact.mjs' },
]

const read = (rel) => readFile(path.join(ROOT, rel), 'utf8')

for (const { file, arg, canon } of ALIASES) {
  test(`commands/${file}: 出荷され、frontmatter で description を名乗る`, async () => {
    const text = await read(path.join('commands', file))
    assert.match(text, /^---\n/, 'frontmatter が無い')
    assert.match(text, /^description:\s*\S/m, 'description が無い')
  })

  test(`commands/${file}: モデルが自分では起動できない`, async () => {
    // ⚠ **`w` の側は baton を退避する ∴ 取り消せない。** 🔴 **人間が呼ぶものであって、
    // 閾値で自動発火させるものではない**（`SKILL.md`）—— **`r` にも同じ蓋をする**: 片方だけ
    // 閉じれば、どちらが安全かを読む側が判断することになる。
    const text = await read(path.join('commands', file))
    assert.match(text, /^disable-model-invocation:\s*true\s*$/m)
  })

  test(`commands/${file}: handoff skill を \`${arg}\` で呼ぶだけである`, async () => {
    const text = await read(path.join('commands', file))
    assert.match(text, /`handoff`\s*skill/, 'handoff skill を名指していない')
    assert.match(text, new RegExp(`引数 \`${arg}\``), `引数 \`${arg}\` を名指していない`)
  })

  test(`commands/${file}: 呼ぶ先の skill と canon が実在する`, async () => {
    // ⚠ **在らないものを名指す別名は、人間を行き止まりへ送る。** carrier-check は
    // `skills/` と `templates/` しか走査しない ∴ commands 側はここが唯一の門である。
    assert.ok(await stat(path.join(ROOT, 'skills', 'handoff', 'SKILL.md')).catch(() => null))
    assert.ok(await stat(path.join(ROOT, 'skills', 'handoff', canon)).catch(() => null))
  })

  test(`commands/${file}: 儀式を書き写していない`, async () => {
    // 🔴 **ここが本丸である。** ⚠ 手順を写せば **`bearing-handoff.mjs` の呼び出しが必ず付いてくる**
    // （それが `read.md` / `write.md` の骨である）∴ その名の不在を見張る。⚠ **行数の上界も置く**
    // —— 名前を変えただけの写しを、名前で避けられないようにするためである。
    const text = await read(path.join('commands', file))
    assert.doesNotMatch(text, /bearing-handoff\.mjs/, '儀式の CLI を名指している —— 別名が手順を持ち始めた')
    const lines = text.split('\n').filter((l) => l.trim() !== '').length
    assert.ok(lines <= 20, `${lines} 行 —— 別名にしては長い（上界 20）`)
  })
}

test('hook が渡す文言は、人間がそのまま選べる形を名指す', async () => {
  // ⚠ **hook の括弧の中は、人間が打つ字である。** 引数つきの形を名指し続ければ、
  // **面が別名の存在を告げないまま、打てない字を配ることになる。**
  for (const [rel, want] of [
    ['bin/aim-facts.mjs', '/bearing:handoff-r'],
    ['bin/boot-ritual.mjs', '/bearing:handoff-r'],
    ['bin/precompact.mjs', '/bearing:handoff-w'],
  ]) {
    assert.ok((await read(rel)).includes(want), `${rel} が ${want} を名指していない`)
  }
})

test('SKILL.md は別名の存在を述べる', async () => {
  // ⚠ **正本が入口を知らなければ、別名は正本の外の伝聞になる。**
  const text = await read(path.join('skills', 'handoff', 'SKILL.md'))
  for (const name of ['/bearing:handoff-r', '/bearing:handoff-w']) {
    assert.ok(text.includes(name), `SKILL.md が ${name} を述べていない`)
  }
})
