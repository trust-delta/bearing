#!/usr/bin/env node
// 面へ辿り着く手段 —— **人間が bookmark できる 1 つの path を、home に置く。**
//
// ═══ なぜ複製であって、shim ではないのか ═══════════════════════════════════
//
// 罠は statusline と同じ層に在る: **plugin の cache path は version を含み、cache は旧版を
// 消さない**（実測 2026-09-04、1 台に 9 版）∴ 面を直接 bookmark すれば、bump 後も黙って
// 古い面が開く。⚠ **そして面は「古い」と名乗らない** —— 人間は自分の corpus を、旧い契約で
// 往復させることになる。
//
// ⚠ **だが statusline の解き方はここでは使えない。** あちらの shim は*走る* ∴ 走るたびに
// install record を読んで今の版へ橋渡しできる。**browser は HTML を開くだけであり、開かれた
// HTML は自分がどの版かを解決できない** —— `file://` では相対 `import` も `<script src>` も
// `fetch` も塞がれている（実測 2026-09-04、Chrome 140、headless と headed の両方で 3 つとも
// TypeError。`docs/aims/human-domain.md`）。∴ **橋渡しは原理的に成立せず、残るのは複製である。**
//
// ⚠ **複製でよい理由は、面が生成物ですらないことである** —— corpus は browser 自身が読み、
// 面は build も server も依存も持たない 1 枚である ∴ **置いてあればどの repo の `docs/aims/`
// を指しても動く。**
//
// ═══ 古さは黙る。∴ 観測できるようにする ═══════════════════════════════════
//
// ⚠ **毎回置き直す**（`bearing-setup-statusline.mjs` の shim と同じ規律）—— 既に在っても、
// それは古い複製かもしれない。**だが 2 回の setup の間は、古さが黙っている** —— shim には
// 無い費用であり、隠さずに述べる。∴ `--check` が「置かれた 1 枚は今の面と byte 同一か」を
// 答える。⚠ **違ったとき、それが「古い版」なのか「人間が手を入れた」のかは分けられない**
// —— 分けるには台帳が要り、台帳は `docs/aims/adoption-declaration.md` の `# HISTORY` が
// 棄却した形である ∴ **分けられないことを述べるほうを採る。**
//
// ═══ 書き先は人間の home である ═══════════════════════════════════════════
//
// これは scope の選択ではなく、置くものの性質による —— bookmark は machine-local な絶対
// path であり、tracked な project settings に書けば他の人間の面が黙って壊れる。
// `setup-statusline` が home にしか置けないのと同じ理由である。
//
// ⚠ **開かない。path を述べるだけである。** どの browser で、どの path 形で開くかは効く
// （人間の観測 2026-09-04、Windows の Chrome: `\\wsl.localhost\…` 越しに開くと picker が
// 「システムフォルダが含まれている」と拒んだ。WSL 側の Chrome から Linux の path を選ぶと
// 通った）∴ **我々が選べば、通らない側を黙って選びうる。**
//
// ⚠ **stdin を読む前に委譲する**（他の bin と同じ理由）。

import { copyFile, readFile, mkdir, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

import { delegateToCheckout } from '../lib/delegate.mjs'
await delegateToCheckout(import.meta.url)

import { resolveConfigDir } from './bearing-statusline.mjs'

/** 出荷物の中での面の在り処。 */
export const SURFACE = path.join('surface', 'aim.html')

/** home に置く名。⚠ **固定である** —— これが bookmark される 1 つの path だからである。 */
export const PLACED = 'bearing-aim.html'

const log = (s) => process.stdout.write(s + '\n')

/**
 * 置かれた 1 枚は、今の面と byte 同一か。
 *
 * ⚠ **3 値である。** 「不在」と「違う」を同じ答えに畳めば、まだ置いていない人間と、古い
 * 1 枚を開き続けている人間が、同じ言葉を受け取る。
 *
 * @returns {Promise<'same'|'differs'|'absent'>}
 */
export async function compare(sourceFile, placedFile) {
  let placed
  try {
    placed = await readFile(placedFile)
  } catch {
    return 'absent'
  }
  return placed.equals(await readFile(sourceFile)) ? 'same' : 'differs'
}

/** ⚠ **面が同梱されていなければ、置いたふりをしない。** この plugin の install が壊れている。 */
async function requireSurface(source) {
  try {
    await stat(source)
    return true
  } catch {
    log(`⚠ 面が同梱されていない（${source}）—— この plugin の install が壊れている。`)
    return false
  }
}

/**
 * 面の到達性について、我々が測っていないことを述べる。
 *
 * ⚠ **述べる場所はここしかない。** 面は session の外に在り、開いた先で誰も説明しない ——
 * picker が拒んでも、それは browser 自身のダイアログにしか出ない。
 */
function sayReach() {
  log('')
  log('⚠ 到達範囲は Chromium 系に限られる（File System Access API の対応状況からの引き継ぎ')
  log('  であって、我々の実測ではない）。Chrome / Edge で開くこと。')
  log('⚠ どの path 形で開き、どの corpus を選ぶかも効く（人間の観測 2026-09-04、Windows の')
  log('  Chrome: `\\\\wsl.localhost\\…` 越しに開くと picker が拒んだ。WSL 側の Chrome から')
  log('  Linux の path を選ぶと通った）—— **拒否は browser のダイアログにしか出ない。**')
}

async function main(argv) {
  const root = path.join(import.meta.dirname, '..')
  const source = path.join(root, SURFACE)
  const configDir = resolveConfigDir()
  const dest = path.join(configDir, PLACED)

  // ⚠ **解決した先を必ず述べる**（`setup-aim` と同じ理由）—— 書き先を黙って決めない。
  log(`対象: ${dest}`)

  if (!(await requireSurface(source))) return 1

  if (argv.includes('--check')) {
    const state = await compare(source, dest)
    if (state === 'absent') {
      log('置かれていない —— bearing-setup-surface.mjs を打てば置く。')
      return 1
    }
    if (state === 'same') {
      log('置かれた 1 枚は、今の面と byte 同一である。')
      return 0
    }
    // ⚠ **理由を 1 つに決めつけない**（見出しコメント）。
    log('置かれた 1 枚は、今の面と違う —— **古い版か、人間が手を入れたか、ここでは分けられない。**')
    log('置き直すなら: bearing-setup-surface.mjs')
    return 1
  }

  const before = await compare(source, dest)
  await mkdir(configDir, { recursive: true })
  // ⚠ **毎回置き直す** —— 既に在っても、それは古い複製かもしれない（shim と同じ規律）。
  await copyFile(source, dest)
  log(before === 'same' ? '既にこの 1 枚だった（置き直した）。' : before === 'absent' ? '面を置いた。' : '面を置き直した（前の 1 枚と違っていた）。')
  log('')
  log('browser で開く先（これを bookmark すること —— この path に version は入らない）:')
  log(`  ${pathToFileURL(dest).href}`)
  log('')
  log('⚠ **この 1 枚は複製である** —— plugin を上げても追随しない。上げたら打ち直すこと。')
  log('  今のかを確かめる: bearing-setup-surface.mjs --check')
  log('⚠ 消すときは手で消すこと —— home に在るものを、我々の都合で消さない。')
  sayReach()
  return 0
}

if (process.argv[1] && path.basename(process.argv[1]) === 'bearing-setup-surface.mjs') {
  process.exit(await main(process.argv.slice(2)))
}
