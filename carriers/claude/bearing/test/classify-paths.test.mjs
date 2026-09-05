// 直プッシュ可否の判定 —— carrier の md は docs、`.claude/skills/` は置かれた複製、bin / lib は code。
//
// ⚠ **2026-09-05、極性が 2 つ同時に動いた。** `original/` が畳まれて carrier の md が正本になり
// （∴ ただの docs）、代わりに `.claude/skills/` が置かれた複製になった（∴ 同期の検証が要る側）。
// ⚠ **どちらか片方だけを直せば、正本を直しただけの docs 変更が code 扱いで PR を要求するか、
// 逆に検証を要する複製が黙って通る。**
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'classify-paths.mjs')
const present = await access(SCRIPT).then(() => true, () => false)

test('carrier の md は docs、.claude/skills/ は複製、bin は code', async (t) => {
  if (!present) return t.skip('scripts/ が無い —— cache から走っている')
  const { classify } = await import(pathToFileURL(SCRIPT).href)
  const r = classify([
    'docs/aims/bearing.md',
    'CONTRIBUTING.md',
    'carriers/claude/bearing/skills/handoff/read.md',
    'carriers/claude/bearing/templates/aim/SKILL.md',
    'carriers/claude/bearing/commands/setup-aim.md',
    '.claude/skills/aim/SKILL.md',
    'carriers/claude/bearing/bin/bearing-setup-aim.mjs',
  ])
  assert.deepEqual(r.docs, [
    'docs/aims/bearing.md',
    'CONTRIBUTING.md',
    'carriers/claude/bearing/skills/handoff/read.md',
    'carriers/claude/bearing/templates/aim/SKILL.md',
    'carriers/claude/bearing/commands/setup-aim.md',
  ])
  assert.deepEqual(r.generated, ['.claude/skills/aim/SKILL.md'])
  assert.deepEqual(r.code, ['carriers/claude/bearing/bin/bearing-setup-aim.mjs'])
  assert.equal(r.needsPullRequest, true)
  assert.equal(r.needsSyncCheck, true)

  // 置かれた複製だけが動いた場合は docs 扱い ∴ 直プッシュ可。ただし同期の検証が前提である。
  const only = classify(['.claude/skills/aim/SKILL.md', 'carriers/claude/bearing/commands/y.md'])
  assert.equal(only.needsPullRequest, false)
  assert.equal(only.needsSyncCheck, true)
})

test('畳まれた original/ は docs に残っていない —— 消えた dir が黙って開いたままにならない', async (t) => {
  if (!present) return t.skip('scripts/ が無い —— cache から走っている')
  const { classify } = await import(pathToFileURL(SCRIPT).href)
  // ⚠ `original/` は 2026-09-05 に畳まれた。allowlist に残せば、その名の dir を誰かが作った日に
  // **黙って直プッシュ可になる** —— 既定 deny の原則が、消えた規則の跡で破れる形である。
  assert.deepEqual(classify(['original/aim/frame.md']).code, ['original/aim/frame.md'])
})

test('.claude/ のうち開いているのは skills/ だけである', async (t) => {
  if (!present) return t.skip('scripts/ が無い —— cache から走っている')
  const { classify } = await import(pathToFileURL(SCRIPT).href)
  // ⚠ `.claude/` は 2026-09-05 に tracked になった。**settings は置かれた複製ではない** ∴
  // docs 扱いにしてはならない —— 動けばそれは harness の設定変更であって、docs の変更ではない。
  const r = classify(['.claude/settings.json'])
  assert.deepEqual(r.code, ['.claude/settings.json'])
})
