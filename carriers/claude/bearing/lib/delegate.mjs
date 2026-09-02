// cache の複製が、bearing の checkout の中に居るときだけ working tree 側へ委譲する。
//
// ⚠ **これはドッグフーディングのための機構であって、便利のためではない。** hook の宣言は
// `${CLAUDE_PLUGIN_ROOT}` に釘付けであり（`hooks/hooks.json`）、statusline は project の
// path に釘付けである ∴ **同じ機構の 2 つの複製が同時に走り、片方だけが新しい**という状態
// が起きる。2026-09-02 に実際に起きた: statusline は照合記録を読んで flag を落としたのに、
// hook は cache 0.5.0 を走らせて同じ flag を出し続けた —— **この repo は自分自身の古い版を
// 食べていた。**
//
// ∴ 委譲は「開発中は working tree、他 project では cache」を*自動で*選ぶ。切り替えの手作業
// も設定の分岐も要らず、⚠ **判定が repo の code に載る** —— cache を working tree へ symlink
// する案と違い、machine-local な不可視の細工にならない。
//
// ⚠ **この shim は cache 側に住む ∴ shim 自体が届くまでは効かない。** 版の門は消えず、
// 「毎リリース効く門」から「shim を変えたときだけ効く門」へ縮むだけである。
//
// ⚠ **安全側は「委譲しない」である。** 判定材料が 1 つでも欠けたら自分で走る —— 誤射して
// 他 project の code を実行するより、cache が古いまま走るほうが遥かに安い。

import path from 'node:path'
import { spawn } from 'node:child_process'
import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** 委譲済みであることの印。⚠ 無ければ委譲先が自分を委譲しようとして無限に spawn する。 */
export const DELEGATE_GUARD = 'BEARING_DELEGATED'

const CARRIER = ['carriers', 'claude', 'bearing']

/**
 * 委譲先を選ぶ。委譲しないなら `null`。
 *
 * ⚠ **`plugin.json` の `name` まで見るのは、path の一致が弱すぎるからである。** 他 project
 * が bearing を vendor していれば同じ path が存在しうる ∴ 「そこに file が在る」だけを根拠に
 * 実行すると、無関係な repo の code を走らせる。
 *
 * @param {string} selfPath 走っている file の絶対 path
 * @param {string|null|undefined} projectDir `CLAUDE_PROJECT_DIR`
 * @param {Record<string, string|undefined>} env
 */
export async function chooseDelegate(selfPath, projectDir, env = process.env) {
  if (env[DELEGATE_GUARD]) return null // 既に委譲された側である。
  if (!projectDir) return null // ⚠ 材料が無い ∴ 自分で走る。推測で他所の code を呼ばない。

  const carrier = path.join(projectDir, ...CARRIER)
  let manifest
  try {
    manifest = JSON.parse(await readFile(path.join(carrier, '.claude-plugin', 'plugin.json'), 'utf8'))
  } catch {
    return null // bearing の checkout ではない —— 圧倒的多数の project がここで抜ける。
  }
  if (manifest?.name !== 'bearing') return null

  const target = path.join(carrier, 'bin', path.basename(selfPath))

  // ⚠ **2 つの失敗を同じ catch に畳まない。** 「委譲先が無い」は委譲しない理由だが、
  // 「自分の path が解決できない」は違う —— 畳むと、解決できない self を持つ呼び出しが
  // すべて黙って委譲を諦める。実際にこれを書いて test が落ちた。
  let targetReal
  try {
    targetReal = await realpath(target)
  } catch {
    return null // 委譲先が無い（あるいは読めない）∴ 自分で走る。
  }
  // ⚠ realpath で比べる: symlink 越しに同じ file を指していれば、自分自身を spawn して
  // しまう。guard が在るので無限にはならないが、無駄な process が 1 つ増える。
  let selfReal = selfPath
  try {
    selfReal = await realpath(selfPath)
  } catch {
    // 走っている file が消えている —— 実運用では起きない。解決できないなら、委譲先とは
    // 別物である（あちらは今 realpath できた）。
  }
  if (targetReal === selfReal) return null
  return target
}

/**
 * 委譲先が在れば、そこへ丸ごと明け渡して**この process を終える**。返ったなら委譲しなかった。
 *
 * ⚠ **`stdio: 'inherit'` である。** hook も statusline も stdin で JSON を受け取る ∴ 親が
 * 一度でも読めばその分は失われる。fd をそのまま渡せば、中継も buffer も要らない —— そして
 * **この関数は import 直後に、stdin を読む前に呼ばれねばならない。**
 *
 * @param {string} selfUrl 呼び出し側の `import.meta.url`
 */
export async function delegateToCheckout(selfUrl, env = process.env) {
  const selfPath = fileURLToPath(selfUrl)
  const target = await chooseDelegate(selfPath, env.CLAUDE_PROJECT_DIR, env)
  if (!target) return false

  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...env, [DELEGATE_GUARD]: '1' },
    })
    // ⚠ spawn に失敗したらそのまま自分で走る。'inherit' ゆえ親は stdin を一切読んでおらず、
    // 子も起動していない ∴ 続きを走らせても入力は無傷である。
    child.on('error', () => resolve(false))
    child.on('exit', (code, signal) => {
      // ⚠ signal で死んだ子を exit 0 に畳まない —— hook の失敗が成功に見える。
      process.exit(signal ? 1 : (code ?? 1))
    })
  })
}
