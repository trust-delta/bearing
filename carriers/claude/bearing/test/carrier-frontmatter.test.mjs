// command と skill の frontmatter —— **黙って全部落ちる壊れ方**を止める。
//
// ⚠ **2026-09-03、実際に壊した。** `argument-hint: [--dir <path>] [--check | --remove]` は
// YAML の flow sequence が 2 つ並んだ形で、parse に失敗する。⚠ **そして失敗は例外にならない**
// —— `claude plugin validate` の言葉では「At runtime this command loads with empty metadata
// (all frontmatter fields silently dropped)」であり、**`allowed-tools` も
// `disable-model-invocation` も黙って消える。**
//
// ⚠ **`claude plugin validate` は在るが、CI には無い**（`claude` CLI を runner に用意していない）
// ∴ **手で打つ門であり、手で打つ門は忙しいときにだけ飛ばされる** —— まさにそうなった。
//
// ⚠ **ここで YAML を実装しない。** 依存を足せば「build 手順も server も無い」を破る ∴
// **観測された壊れ方 1 つに絞った規則**を置く: **`[` で始まる値は quote する。** これは YAML の
// 検証ではなく、**踏んだ地雷の形**である —— 他の壊れ方は依然として素通りする。それを承知で置く。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')

/** carrier が持つ frontmatter 付きの markdown を全部集める。 */
async function carriers() {
  const found = []
  const commands = path.join(ROOT, 'commands')
  for (const e of await readdir(commands, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.md')) found.push(path.join(commands, e.name))
  }
  // ⚠ `templates/` は skill として登録されないが、`setup-aim` が消費者の `.claude/skills/aim/` へ
  // 置く ∴ 置かれた先で同じ壊れ方をする —— 同じ門を通す。
  for (const base of ['skills', 'templates']) {
    const dir = path.join(ROOT, base)
    for (const d of await readdir(dir, { withFileTypes: true })) {
      if (d.isDirectory()) found.push(path.join(dir, d.name, 'SKILL.md'))
    }
  }
  return found
}

/** frontmatter の生の行。⚠ **無ければ null**（「空」ではない）。 */
function frontmatterLines(text) {
  const lines = text.split(/\r?\n/)
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end === -1) return null
  return lines.slice(1, end)
}

const files = await carriers()

test('carrier は 1 枚残らず frontmatter を持つ', () => {
  assert.ok(files.length >= 4, `carrier が ${files.length} 枚しか見つからない`)
})

for (const file of files) {
  const rel = path.relative(ROOT, file)

  test(`${rel}: frontmatter が在り、key: value の形である`, async () => {
    const lines = frontmatterLines(await readFile(file, 'utf8'))
    assert.ok(lines !== null, 'frontmatter が無い')
    assert.ok(lines.length > 0, 'frontmatter が空')
    for (const line of lines) {
      if (line.trim() === '') continue
      assert.match(line, /^[A-Za-z][A-Za-z0-9_-]*:\s/, `key: value の形でない: ${line}`)
    }
  })

  test(`${rel}: [ で始まる値は quote されている`, async () => {
    // ⚠ **これが 2026-09-03 に踏んだ地雷そのものである。** quote されていない `[...] [...]` は
    // YAML の flow sequence が 2 つ並んだ形になり、**frontmatter が丸ごと黙って捨てられる。**
    const lines = frontmatterLines(await readFile(file, 'utf8')) ?? []
    for (const line of lines) {
      const value = line.slice(line.indexOf(':') + 1).trim()
      if (!value.startsWith('[')) continue
      assert.fail(
        `quote されていない値が in ${rel}: ${line}\n` +
          '  —— YAML は `[` を flow sequence の開始として読む ∴ 2 つ並べば parse に失敗し、' +
          '**frontmatter は例外を出さずに丸ごと捨てられる。**',
      )
    }
  })

  test(`${rel}: name / description のどちらかを名乗る`, async () => {
    // command は `description`、skill は `name` ＋ `description`。どちらも無ければ、
    // ⚠ **その carrier はエージェントの一覧に何と出るかを誰も決めていない。**
    const lines = frontmatterLines(await readFile(file, 'utf8')) ?? []
    const keys = lines.map((l) => l.slice(0, l.indexOf(':')).trim())
    assert.ok(keys.includes('description'), `description が無い（keys: ${keys.join(', ')}）`)
  })
}
