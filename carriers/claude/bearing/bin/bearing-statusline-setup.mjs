#!/usr/bin/env node
// 装着 —— **人間の act だが、人間が path を手で書く act ではない。**
//
// ⚠ **plugin は `statusLine` key を宣言できない**（plugin root の settings が持てるのは
// `agent` と `subagentStatusLine` だけ）∴ 装着は user / project の settings に落ちるほかなく、
// **供給は plugin、装着は人間**という分割は原理的に残る。⚠ **だが「人間の act」は「人間が
// versioned な絶対 path を手で写す」ことを意味しない** —— 公開されている statusline plugin は
// 3 つとも setup コマンドを持ち、1 行を*生成*している（2026-09-03 に実測）。ここも同じ形を採る。
//
// 置くのは `bin/bearing-statusline.mjs` の複製 1 枚と、settings.json の 1 行だけである。
// ⚠ **書き先は user settings に限る。** 絶対 path は home を含む ∴ tracked な project
// settings へ書けば、他の人間の面が黙って壊れる形を repo に commit することになる。
//
// ⚠ **名前に `bearing-` を冠している。** plugin の `bin/` は Bash tool の PATH に入り、
// **裸のコマンド名で呼べる** ∴ そこは全 plugin が共有する名前空間である —— `statusline-setup`
// のような一般名を置くのは、path の一致を実行の根拠にするのと同じ弱さである。
//
// ⚠ **stdin を読む前に委譲する**（他の bin と同じ理由。ここは stdin を読まないが、規律を
// 破る例外を 1 つ作れば、次に読む者はどれが例外かを毎回確かめねばならない）。

import { readFile, writeFile, copyFile, chmod, rename, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { quotePathForShell } from '../lib/shell.mjs'

import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)

import { resolveConfigDir, readInstallRecord } from './bearing-statusline.mjs'

const SHIM = 'bearing-statusline.mjs'

/** 装着後に settings が持つべき値。⚠ **形の正本はここ 1 箇所である。** */
export const statusLineFor = (command) => ({ type: 'command', command })

/**
 * settings に書く 1 行。⚠ **これは path ではなく、シェルを通る文字列である。**
 *
 * ⚠ **2026-09-04、ここが生の path を書いていて面が消えた**（win32、実測）—— harness は
 * statusLine をシェル経由で走らせ、**POSIX シェルは `\` を escape として食う** ∴
 * `C:\Users\...` は `C:Usersumu_s...` に化けて `command not found`（exit 127）で終わり、
 * ⚠ **statusline は失敗を描かない ∴ 画面からは黙って消える。**
 *
 * ⚠ **同じ罠は既に 1 度塞がれており、その正本が `lib/shell.mjs` である** —— 塞いだのに
 * **新しい emission 地点がそこを通らなかった。** 法を 1 箇所に置くだけでは足りず、
 * **通っていることを門が見ていなければならない**（`test/statusline-setup.test.mjs`）。
 *
 * ⚠ **`node` を前置する。** hook 4 枚も同じ形であり、**shebang と exec bit の扱いが
 * シェルごとに違う**ことに依らない —— emission の時点で、どのシェルが受けるかは分からない。
 */
export const commandFor = (shimPath, platform = process.platform) =>
  `node ${quotePathForShell(shimPath, platform)}`

/**
 * 既存の `statusLine` をどう扱うか。
 *
 * ⚠ **人間が書いた別の statusline を黙って踏まない。** 面は 1 つしかなく、上書きは相手の
 * 面を消すことである ∴ 同じなら何もせず、違うなら**述べて止まる**（`--force` で越える）。
 *
 * @returns {'same'|'absent'|'foreign'}
 */
export function classifyExisting(settings, command) {
  const sl = settings?.statusLine
  if (!sl) return 'absent'
  return sl.type === 'command' && sl.command === command ? 'same' : 'foreign'
}

export function withStatusLine(settings, command) {
  return { ...settings, statusLine: statusLineFor(command) }
}

export function withoutStatusLine(settings) {
  const { statusLine, ...rest } = settings ?? {}
  return rest
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    if (err?.code === 'ENOENT') return {}
    // ⚠ 壊れた settings を空扱いして書き戻せば、人間の設定を丸ごと消す。止まるほうが安い。
    throw new Error(`${file} を読めない（${err.message}）`)
  }
}

/** ⚠ tmp + rename で置く —— 途中で死んだ settings.json は、無い settings.json より遥かに高い。 */
async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n')
  await rename(tmp, file)
}

const log = (s) => process.stdout.write(s + '\n')

async function main(argv) {
  const force = argv.includes('--force')
  const uninstall = argv.includes('--uninstall')

  const configDir = resolveConfigDir()
  const settingsFile = path.join(configDir, 'settings.json')
  const shimPath = path.join(configDir, SHIM)
  const command = commandFor(shimPath)
  const settings = await readJson(settingsFile)

  if (uninstall) {
    if (classifyExisting(settings, command) !== 'same') {
      log(`settings の statusLine は bearing のものではない。触らない: ${settingsFile}`)
      return 0
    }
    await writeJsonAtomic(settingsFile, withoutStatusLine(settings))
    log(`statusLine を外した: ${settingsFile}`)
    log(`⚠ shim は残してある（消すなら手で）: ${shimPath}`)
    return 0
  }

  const state = classifyExisting(settings, command)
  if (state === 'foreign' && !force) {
    log('既に別の statusLine が設定されている。上書きしない:')
    log(`  ${JSON.stringify(settings.statusLine)}`)
    log(`これを bearing に差し替えるなら --force を付けて再実行する（${settingsFile}）。`)
    return 1
  }

  // shim を置く。⚠ **毎回置き直す** —— 既に在っても、それは古い複製かもしれない。
  await copyFile(path.join(import.meta.dirname, SHIM), shimPath)
  await chmod(shimPath, 0o755)
  log(`shim を置いた: ${shimPath}`)

  if (state === 'same') {
    log(`statusLine は既にこの 1 行である。変更なし: ${settingsFile}`)
  } else {
    await writeJsonAtomic(settingsFile, withStatusLine(settings, command))
    log(`statusLine を書いた: ${settingsFile}`)
    log(`  ${JSON.stringify(statusLineFor(command))}`)
  }

  // ⚠ **描画時に解決できるかを、ここで確かめて述べる。** 装着が失敗しても画面からは 2 行が
  // 消えるだけで理由は一言も出ない ∴ **述べられる最後の場所がここである。**
  //
  // ⚠ **書いた 1 行を、書いた形のまま、シェルを通して走らせる。** 2026-09-04 まで、ここは
  // `access(shimPath, X_OK)` を見ていた —— **win32 では常に成功する述語**であり、しかも
  // **検査していたのは書いた文字列ではなく file の属性だった** ∴ 面が消えている間ずっと
  // 緑を返していた。**門は、実際に通る経路の上に張らねばならない。**
  //
  // ⚠ **この probe が使うのは platform 既定のシェルであって、harness が使うシェルとは限らない**
  // （win32 では cmd.exe が立つが、harness は Git Bash を使う —— 2026-09-04 の事故はまさに
  // 後者で起きた）∴ **証明できるのは「どこでも走らない」ことであって「harness で走る」ことでは
  // ない。** 形そのものをシェル非依存にするのは `lib/shell.mjs` の側の仕事であり、ここは
  // **その形が壊れていたら気づく**ための門である。
  const probe = spawnSync(command, {
    shell: true, encoding: 'utf8', timeout: 15_000,
    input: JSON.stringify({ cwd: process.cwd(), workspace: { current_dir: process.cwd() } }),
  })
  if (probe.status !== 0 || !probe.stdout) {
    log(`⚠ **書いたその 1 行が、シェルで走らない** —— 画面には理由が一言も出ない:`)
    log(`  ${command}`)
    const why = (probe.stderr ?? '').trim().split('\n')[0] || probe.error?.message || '(出力なし)'
    log(`  exit=${probe.status} ${why}`)
  }
  // ⚠ **`CLAUDE_PROJECT_DIR` は Bash tool の env に無い**（実測 2026-09-03）∴ setup は常に
  // それを欠いた状態で走る。⚠ **欠いたまま record を引くと「この project に効く record が
  // 無い」と*断言*してしまう** —— 判定できないことを不在として述べる形であり、しかも
  // ここは「装着が効くかを述べられる最後の場所」として置いた行である。**そこが嘘をつく。**
  const record = await readInstallRecord({
    configDir,
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  })
  if (record.installPath) {
    log(`今この shim が橋渡しする先: ${record.installPath}（${record.scope} / ${record.version}）`)
  } else {
    log(`⚠ install record が無い（${record.reason}）∴ shim は「載っていない」と描く。`)
    log('  載せるには: claude plugin install bearing@trust-delta --scope project')
  }
  log('⚠ project の settings.json に別の statusLine が在れば、そちらが勝つ。')
  return 0
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-statusline-setup.mjs') {
  process.exit(await main(process.argv.slice(2)))
}
