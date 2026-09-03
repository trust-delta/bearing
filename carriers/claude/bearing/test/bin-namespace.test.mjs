// `bin/` の名前空間 —— **裸で呼べるものは、名乗ってよい名だけである。**
//
// ⚠ **plugin の `bin/` は Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs）
// ∴ そこは**全 plugin が共有する名前空間**である。`handoff.mjs` のような一般名を置くのは、
// path の一致を実行の根拠にするのと同じ弱さであり、他 plugin の同名を踏むか踏まれる。
//
// ⚠ **裸で呼べるかは exec bit が決める。** 2026-09-03、PATH では解決したのに exec bit が
// 無くて落ちた —— 名前と exec bit は**対で**決めねばならず、片方だけ変えると
// 「呼べるが危ない名」か「安全だが呼べない名」のどちらかになる。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, stat, readFile } from 'node:fs/promises'
import path from 'node:path'

const BIN = path.join(import.meta.dirname, '..', 'bin')
const entries = async () => (await readdir(BIN)).filter((f) => f.endsWith('.mjs')).sort()
const isExec = async (f) => ((await stat(path.join(BIN, f))).mode & 0o111) !== 0

test('exec bit を持つ bin は、すべて `bearing-` を冠している', async () => {
  for (const f of await entries()) {
    if (await isExec(f)) {
      assert.ok(f.startsWith('bearing-'), `${f} は裸で呼べるのに一般名である`)
    }
  }
})

test('`bearing-` を冠する bin は、すべて exec bit を持つ', async () => {
  // ⚠ **冠した名は「裸で呼んでよい」という約束である** —— exec bit が無ければ、その約束は
  // `Permission denied` で破れる。skill が名指すのはこの名だけである。
  for (const f of await entries()) {
    if (f.startsWith('bearing-')) {
      assert.ok(await isExec(f), `${f} は裸で呼ぶ名なのに exec bit が無い`)
    }
  }
})

test('exec bit を持つ bin は、すべて shebang を持つ', async () => {
  for (const f of await entries()) {
    if (!(await isExec(f))) continue
    const head = (await readFile(path.join(BIN, f), 'utf8')).slice(0, 32)
    assert.ok(head.startsWith('#!'), `${f} は shebang を持たない`)
  }
})

test('hook が呼ぶだけの bin は、PATH の名前空間に出ない', async () => {
  // ⚠ **hook は絶対 path で呼ぶ** ∴ exec bit は要らない。付けなければ裸で呼ばれることも
  // なく、**一般名のままで安全である** —— 改名が要るのは、人間やエージェントが打つものだけ。
  for (const f of ['aim-facts.mjs', 'boot-ritual.mjs', 'corpus-delta.mjs', 'precompact.mjs']) {
    assert.equal(await isExec(f), false, `${f} に exec bit が付いている`)
  }
})
