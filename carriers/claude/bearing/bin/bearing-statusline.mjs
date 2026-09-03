#!/usr/bin/env node
// 装着の shim —— **人間が settings.json に書く 1 行から version を外すためだけに在る。**
//
// ⚠ **plugin の `bin/` は statusline の PATH に入らない。** 公式 docs は "Executables added
// to the **Bash tool's** `PATH`" と明記しており、実測も一致した（Bash tool の PATH 58 要素に
// 対し statusline は 52 要素、差はちょうど plugin の `bin/`）∴ **裸のコマンド名で本体を呼ぶ
// 道は無い。** 残る手は絶対 path だが、cache の path は version を含み、**cache は旧版を
// 消さない** ∴ bump しても 1 行は壊れず、黙って古い版を描き続ける。
//
// ∴ この file が `~/.claude/` に住み（`bin/statusline-setup.mjs` が置く）、**走るたびに
// install record を読んで今の版へ橋渡しする。** 1 行は `~/.claude/bearing-statusline.mjs`
// で固定され、bump で腐らない。
//
// ⚠ **これは machine-local な不可視の細工ではない。** 中身はこの repo に在り、test が掛かり、
// 置くのは repo の code である。⚠ **ただし置かれたものは複製である** ∴ この file を変えた
// ときだけ効く版の門が 1 つ増える（`lib/delegate.mjs` の shim と同じ性質）。
//
// ⚠ **自己完結でなければならない。** `~/.claude/` に単独で置かれる ∴ plugin の lib を
// import できない。**∴ 解決の logic はここが正本であり、plugin 側が要るときはここから
// import する** —— 二重実装を作らないための向きであって、bin に logic を置きたいのではない。
//
// ⚠ **不在を黙って消さない。** record が無ければ本体は 1 枚も載っておらず、**載っていない
// 機構は自分の不在を報告できない** —— だがこの shim は plugin の外に住む ∴ **載っていなくても
// 走り、そう述べられる。** それがこの層に置いた理由であって、間接層が欲しかったのではない。

import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import os from 'node:os'

/** plugin 名。⚠ marketplace 名は問わない —— fork や rename が在りうる。 */
const PLUGIN = 'bearing'

/**
 * Claude Code の config directory。⚠ `CLAUDE_CONFIG_DIR` で移設できる ∴ `~/.claude` を
 * 決め打ちにしない —— 移設した人間の面だけが黙って壊れる。
 */
export function resolveConfigDir(env = process.env, home = os.homedir()) {
  return env.CLAUDE_CONFIG_DIR || path.join(home, '.claude')
}

/** ⚠ semver として比べる —— `0.10.0` は `0.9.0` より新しい。文字列比較は逆に答える。 */
export function compareVersions(a, b) {
  const parse = (v) => String(v ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0)
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const newest = (records) => [...records].sort((a, b) => compareVersions(b.version, a.version))[0]

/**
 * 同名 plugin の record が複数在るとき、どれが今のセッションのものか。
 *
 * ⚠ **`projectPath` の一致を最優先する** —— project スコープの record はその project の中
 * でだけ効く。次に user スコープ（どの project でも効く）。⚠ **最後の砦は version の新しさで
 * あって file 中の順序ではない** —— 順序は install の履歴であって優先順位ではない。
 *
 * ⚠ **他 project の project スコープ record しか無いときは「無い」と答える。** それはこの
 * セッションのものではなく、**誤って他所の版を走らせるより不在を述べるほうが遥かに安い。**
 *
 * @param {Array<{scope?: string, projectPath?: string, installPath?: string, version?: string}>} records
 * @param {string|null|undefined} projectDir
 */
export function chooseRecord(records, projectDir) {
  const usable = (records ?? []).filter((r) => r && typeof r.installPath === 'string')
  if (usable.length === 0) return null

  const byProject = projectDir
    ? usable.filter((r) => r.projectPath && path.resolve(r.projectPath) === path.resolve(projectDir))
    : []
  if (byProject.length > 0) return newest(byProject)

  const byUser = usable.filter((r) => r.scope === 'user')
  if (byUser.length > 0) return newest(byUser)

  const unscoped = usable.filter((r) => !r.projectPath)
  return unscoped.length > 0 ? newest(unscoped) : null
}

/**
 * 載っている bearing の record を読む。
 *
 * ⚠ **失敗の種類を畳まない。** file が無い／読めない／key が無い —— どれも「載っていない」で
 * 正しいが、**呼び出し側が理由を述べられるように `reason` を返す。** 黙って `null` を返せば、
 * 面はまた「何も言っていない ＝ 問題が無い」に見える。
 */
export async function readInstallRecord({ configDir, projectDir } = {}) {
  const none = (reason) => ({ installPath: null, version: null, scope: null, reason })
  const file = path.join(configDir ?? resolveConfigDir(), 'plugins', 'installed_plugins.json')

  let parsed
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (err) {
    return none(err?.code === 'ENOENT' ? 'record file が無い' : 'record を読めない')
  }

  const keys = Object.keys(parsed?.plugins ?? {}).filter((k) => k.split('@')[0] === PLUGIN)
  if (keys.length === 0) return none('record が無い')

  const chosen = chooseRecord(keys.flatMap((k) => parsed.plugins[k] ?? []), projectDir)
  if (!chosen) return none('この project に効く record が無い')
  return {
    installPath: chosen.installPath,
    version: chosen.version ?? null,
    scope: chosen.scope ?? null,
    reason: null,
  }
}

/**
 * ⚠ **幅が確定した文字だけを使う**（本体の `widthUnsafeChars` と同じ規律）。em dash や中黒は
 * Ambiguous 幅で、日本語フォントでは桁がずれて隣と重なる。ここは本体を import できない場面で
 * 描く行ゆえ、規律は literal として守るほかない —— **test がそれを見張っている。**
 */
export function absentLine(reason) {
  return `bearing  載っていない（${reason}）。claude plugin install bearing@trust-delta --scope project`
}

export async function run({ env = process.env, write = (s) => process.stdout.write(s) } = {}) {
  const record = await readInstallRecord({
    configDir: resolveConfigDir(env),
    // ⚠ **statusline には `CLAUDE_PROJECT_DIR` が渡る**（実測）が、**Bash tool から直に
    // 叩いたときは渡らない** ∴ 欠けたら cwd へ落とす —— さもなくば project スコープの
    // record が「無い」と読まれ、載っているのに載っていないと描く。
    projectDir: env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  })
  if (!record.installPath) {
    write(absentLine(record.reason) + '\n')
    return
  }

  const entry = path.join(record.installPath, 'bin', 'statusline.mjs')
  let main
  try {
    // ⚠ **stdin はまだ読んでいない。** 本体は load 時に working tree への委譲を試み、委譲した
    // なら fd ごと子へ渡して `process.exit()` する ∴ そのときここより先は走らない。
    ;({ main } = await import(pathToFileURL(entry).href))
  } catch {
    // record は在るのに本体が無い（cache が消された等）。⚠ 「読めなかった」を「問題が無い」
    // に畳まない —— それは面が最も間違えやすい畳み方である。
    write(absentLine('本体が無い') + '\n')
    return
  }
  await main()
}

// ⚠ import されたとき（test / plugin 側からの再利用）は走らせない。
if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-statusline.mjs') {
  await run()
}
