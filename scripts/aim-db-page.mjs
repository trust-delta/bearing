#!/usr/bin/env node
// repo の aim の記録（`docs/aim-db/`）から、人間が見るページ（HTML）を作る。
//
// 🔴 **正本は repo であり、ページはその写しである**（人間の決定 2026-10-29: `bearing-x02`・`x09`）。
// 記録はページへ埋め込む ∴ ページは何も読みに行かず、書き戻しもしない。DB を挟まないので、
// 記録の置き場が 2 か所に分かれて食い違うことが無い。
//
// ⚠ **写しは古くなる** ∴ ページには、どの commit を写したかと生成の時刻を出す。読み手が
// 「今の記録か」を字面で確かめられなければ、古い写しが今の記録として読まれる。
//
// 出したページの publish はエージェントの手で行う（Artifact の tool）。⚠ **publish 先の URL は
// repo に書かない** —— repo は公開であり、ページは非公開である。
//
// 使い方: node scripts/aim-db-page.mjs <出力する file> [正本の root = .]

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { COLLECTIONS, DEFAULT_AIM_DB_DIR, readStore, validateStore } from '../carriers/claude/bearing/lib/aim-db.mjs'
import { runGit } from '../carriers/claude/bearing/lib/git.mjs'

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'aim-db-page.html')
const PLACEHOLDER = '__AIM_DB_DATA__'

/**
 * 記録をページの HTML へ埋め込む。
 *
 * ⚠ **`<` を `<` へ逃がす** —— 記録の本文に `</script>` が在れば、埋め込んだ JSON がそこで切れ、
 * 残りが HTML として読まれる。JSON としては同じ値なので、読む側は何も変えずに済む。
 */
export function renderPage(template, store, { head = null, generatedAt }) {
  if (!template.includes(PLACEHOLDER)) throw new Error(`template に ${PLACEHOLDER} が無い`)
  const data = { head, generatedAt }
  for (const c of COLLECTIONS) data[c] = store[c] ?? []
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  // ⚠ 置換の文字列に `$` が在ると replace が特別に扱う ∴ 関数で渡す。
  return template.replace(PLACEHOLDER, () => json)
}

/** 正本を読み、形を検め、ページを書く。形が崩れていれば書かずに止まる。 */
export async function buildPage(outFile, repoRoot = '.', { dir = DEFAULT_AIM_DB_DIR, now = new Date() } = {}) {
  const r = await readStore(repoRoot, dir)
  if (!r.present) throw new Error(`${dir} が無い`)
  if (r.unreadable.length) throw new Error(`読めない記録が在る: ${r.unreadable.join('、')}`)
  // ⚠ 崩れた記録を写せば、ページは参照の切れた決定を黙って並べる ∴ 先に止める。
  const problems = validateStore(r.store)
  if (problems.length) throw new Error(`形が崩れている:\n${problems.join('\n')}`)
  let head = (await runGit(repoRoot, ['rev-parse', '--short', 'HEAD']))?.trim() || null
  // ⚠ 未 commit の記録を写したなら、そう出す —— でなければ sha が写した中身を指さない。
  const dirty = (await runGit(repoRoot, ['status', '--porcelain', '--', dir]))?.trim()
  if (head && dirty) head += '（未 commit の変更を含む）'
  // 時刻は日本時間で出す —— 読み手（人間）の暮らす時刻である。
  const generatedAt = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' })
  const html = renderPage(await readFile(TEMPLATE, 'utf8'), r.store, { head, generatedAt })
  await writeFile(outFile, html)
  return { head, counts: Object.fromEntries(COLLECTIONS.map((c) => [c, r.store[c].length])) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outFile, repoRoot = '.'] = process.argv.slice(2)
  if (!outFile) {
    console.error('使い方: node scripts/aim-db-page.mjs <出力する file> [正本の root = .]')
    process.exit(2)
  }
  try {
    const { head, counts } = await buildPage(outFile, repoRoot)
    console.log(`${outFile} を書いた（commit ${head ?? '不明'}）: ${Object.entries(counts).map(([c, n]) => `${c} ${n}`).join('、')}`)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
