// 直プッシュ可否の判定 —— `original/` は docs、carrier の生成物 3 dir は生成物、bin / lib は code。
//
// ⚠ 2026-09-05、`commands/` と `templates/` が生成物になった。`GENERATED` に足し忘れれば、正本を直した
// だけの docs 変更が code 扱いで PR を要求する —— 過剰な門は目に見えるが、それでも門は嘘をつく。
// ⚠ `scripts/` は plugin の外に在る ∴ cache から走れば無い —— skip する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const SCRIPT = path.join(import.meta.dirname, '..', '..', '..', '..', 'scripts', 'classify-paths.mjs')
const present = await access(SCRIPT).then(() => true, () => false)

test('original/ は docs、skills/templates/commands は生成物、bin/lib は code', async (t) => {
  if (!present) return t.skip('scripts/ が無い —— cache から走っている')
  const { classify } = await import(pathToFileURL(SCRIPT).href)
  const r = classify([
    'original/aim/frame.md',
    'docs/aims/bearing.md',
    'carriers/claude/bearing/skills/handoff/read.md',
    'carriers/claude/bearing/templates/aim/SKILL.md',
    'carriers/claude/bearing/commands/setup-aim.md',
    'carriers/claude/bearing/bin/bearing-setup-aim.mjs',
  ])
  assert.deepEqual(r.docs, ['original/aim/frame.md', 'docs/aims/bearing.md'])
  assert.deepEqual(r.generated, [
    'carriers/claude/bearing/skills/handoff/read.md',
    'carriers/claude/bearing/templates/aim/SKILL.md',
    'carriers/claude/bearing/commands/setup-aim.md',
  ])
  assert.deepEqual(r.code, ['carriers/claude/bearing/bin/bearing-setup-aim.mjs'])
  assert.equal(r.needsPullRequest, true)
  assert.equal(classify(['original/x.md', 'carriers/claude/bearing/commands/y.md']).needsPullRequest, false)
})
