// `bin/` の名前空間 —— **裸で呼べるものは、名乗ってよい名だけである。**
//
// ⚠ **plugin の `bin/` は Bash tool の PATH に入り、裸のコマンド名で呼べる**（公式 docs）
// ∴ そこは**全 plugin が共有する名前空間**である。`handoff.mjs` のような一般名を置くのは、
// path の一致を実行の根拠にするのと同じ弱さであり、他 plugin の同名を踏むか踏まれる。
//
// ⚠ **裸で呼べるかは exec bit が決める。** 2026-09-03、PATH では解決したのに exec bit が
// 無くて落ちた —— 名前と exec bit は**対で**決めねばならず、片方だけ変えると
// 「呼べるが危ない名」か「安全だが呼べない名」のどちらかになる。
//
// ⚠ **そして「exec bit が在るか」の答えは、platform によって別の場所に在る** —— 下の
// `isExecMode` を見よ。2026-09-04 まで、ここは working tree の mode だけを見ており
// **win32 では常に赤かった**（CI は ubuntu ゆえ緑であり続けた）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdir, stat, readFile } from 'node:fs/promises'
import path from 'node:path'

const BIN = path.join(import.meta.dirname, '..', 'bin')
const entries = async () => (await readdir(BIN)).filter((f) => f.endsWith('.mjs')).sort()

/**
 * exec bit をどこで見るか。**答えは 2 箇所に在り、どちらが正かは platform で変わる。**
 *
 * ⚠ **win32 は exec bit を持たない** —— node は `bin/` の全 file に `0o100666` を返す
 * （2026-09-04 実測）∴ working tree の mode だけを見れば、この門は win32 で**常に赤い**。
 * ⚠ **常時赤い門は、門を持たないより悪い**（`docs/aims/purpose-drift.md`）—— 落ち続ける
 * 1 本は、読む側にやがて失敗そのものを読み飛ばさせる。
 *
 * **配布されるのは git が記録した mode である。** 消費者の cache は clone であり、POSIX 側の
 * exec bit は index の `100755` から生える ∴ **index は両 platform で同じ答えを持つ唯一の
 * 場所である。** ⚠ **index が無いとき**（cache から走れば `.git` は無い）**だけ** working
 * tree へ落ちる。
 *
 * ⚠ **純関数にしてあるのは、どちらの platform からも両方の分岐を検査できるようにするため
 * である** —— 片方でしか踏めない分岐は、直したそばから同じ穴を隣に空ける。
 */
export function isExecMode({ gitMode, fsMode }) {
  if (gitMode != null) return (gitMode & 0o111) !== 0
  return fsMode != null && (fsMode & 0o111) !== 0
}

/** git の index が持つ mode。⚠ **読めなければ空を返す** —— 例外ではなく、落ちる先を持つ。 */
function gitModes() {
  try {
    const out = execFileSync('git', ['ls-files', '-s', '--', '.'], {
      cwd: BIN, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })
    const map = new Map()
    for (const line of out.split('\n')) {
      const m = /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/.exec(line)
      if (m) map.set(path.basename(m[2].trim()), parseInt(m[1], 8))
    }
    return map
  } catch {
    return new Map()
  }
}

const MODES = gitModes()
const isExec = async (f) =>
  isExecMode({ gitMode: MODES.get(f), fsMode: (await stat(path.join(BIN, f))).mode })

// ⚠ **どちらの源からも読めないときは、黙って緑にしない。** win32 かつ index が無い
// （cache から走った）ときだけ起きる —— **「検査した」と「検査できなかった」を同じ緑に
// 畳まない。**
const unreadable = () => MODES.size === 0 && process.platform === 'win32'
const SKIP = 'exec bit をどちらの源からも読めない —— win32 かつ git の index が無い'

test('exec bit の在処は 2 つ在り、両方をどちらの platform からも検査できる', () => {
  // ⚠ win32 の working tree は常に 0o666 を返す ∴ index が答えである。
  assert.equal(isExecMode({ gitMode: 0o100755, fsMode: 0o100666 }), true)
  // ⚠ index が「無い」と言うなら無い —— **配布されるのは index の側である。**
  assert.equal(isExecMode({ gitMode: 0o100644, fsMode: 0o100777 }), false)
  // ⚠ cache から走れば index は無い ∴ working tree へ落ちる。
  assert.equal(isExecMode({ gitMode: undefined, fsMode: 0o100755 }), true)
  assert.equal(isExecMode({ gitMode: undefined, fsMode: 0o100644 }), false)
})

test('exec bit を持つ bin は、すべて `bearing-` を冠している', async (t) => {
  if (unreadable()) return t.skip(SKIP)
  for (const f of await entries()) {
    if (await isExec(f)) {
      assert.ok(f.startsWith('bearing-'), `${f} は裸で呼べるのに一般名である`)
    }
  }
})

test('`bearing-` を冠する bin は、すべて exec bit を持つ', async (t) => {
  // ⚠ **冠した名は「裸で呼んでよい」という約束である** —— exec bit が無ければ、その約束は
  // `Permission denied` で破れる。skill が名指すのはこの名だけである。
  if (unreadable()) return t.skip(SKIP)
  for (const f of await entries()) {
    if (f.startsWith('bearing-')) {
      assert.ok(await isExec(f), `${f} は裸で呼ぶ名なのに exec bit が無い`)
    }
  }
})

test('exec bit を持つ bin は、すべて shebang を持つ', async (t) => {
  if (unreadable()) return t.skip(SKIP)
  for (const f of await entries()) {
    if (!(await isExec(f))) continue
    const head = (await readFile(path.join(BIN, f), 'utf8')).slice(0, 32)
    assert.ok(head.startsWith('#!'), `${f} は shebang を持たない`)
  }
})

test('hook が呼ぶだけの bin は、PATH の名前空間に出ない', async (t) => {
  // ⚠ **hook は絶対 path で呼ぶ** ∴ exec bit は要らない。付けなければ裸で呼ばれることも
  // なく、**一般名のままで安全である** —— 改名が要るのは、人間やエージェントが打つものだけ。
  if (unreadable()) return t.skip(SKIP)
  for (const f of ['aim-facts.mjs', 'boot-ritual.mjs', 'corpus-delta.mjs', 'precompact.mjs']) {
    assert.equal(await isExec(f), false, `${f} に exec bit が付いている`)
  }
})
