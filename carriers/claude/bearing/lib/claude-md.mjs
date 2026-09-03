// `CLAUDE.md` へ差し込む「法」の block —— 置き、置き直し、外す。
//
// ═══ なぜ hook ではなく CLAUDE.md なのか ═══════════════════════════════════
//
// **法と事実は消えなさが違う。** SessionStart hook の出力は会話として要約され消える
// （docs: "Context that hooks added earlier — Summarized with the rest of the
// conversation"）が、**project-root の `CLAUDE.md` は compaction 後に disk から再注入
// される**。さらに `CLAUDE.md` は subagent にも階層ごと載る（組み込みの Explore と Plan
// だけが除かれる）。⚠ **どちらも「強い」のではない** —— docs は両方を「context であって
// 強制される設定ではない」と述べ、system prompt に載るのはどちらでもない。**差は位置と
// 消えなさだけで、それが層を決める**: 静的な法はここ、実行時にしか出せない事実
// （fence・数・時刻）は hook。
//
// ═══ なぜ marker が HTML コメントなのか ════════════════════════════════════
//
// docs: 「block-level の HTML コメントは、context へ注入される**前に**除かれる」。
// ∴ **識別子・版・本文 sha を持たせても、消費者の context を 1 token も食わない** ——
// そして `Read` tool で開けば人間には見える。⚠ **条件が 2 つある**: marker は**独立行**に
// 置かねばならず（block-level でなければ除かれない）、**fenced code block の中に置いては
// ならない**（code block 内のコメントは保存される ∴ 逆に context へ乗る）。
//
// ⚠ **本文 sha を持つのは、2 つの別物を別物として述べるためである。** sha が無ければ
// 「人間が手を入れた」も「版が古い」も等しく「中身が違う」に畳まれ、**前者を後者として
// 上書きする**ことになる。どちらの場合も置き直さず、述べて止まる —— `bearing-statusline-setup`
// が既存の statusLine を上書きしないのと同じ規律で、**どれが正かを機械が決めてよい場面では
// ない。**
//
// ⚠ **sha は LF へ正規化してから採る。** さもなくば CRLF の checkout と LF の checkout で
// 同じ block が別の sha を持ち、**git が改行を変換しただけで「人間が手を入れた」と報告する。**

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** marker の名。⚠ **他 plugin と衝突しない形であること** —— `bin/` の名前空間と同じ理由。 */
export const MARKER = 'bearing:aim'

// ⚠ **fenced block の中の marker は引用であって主張ではない。** これは `lib/process.mjs` が
// aim record の節に当てているのと**同じ法**であり、正規表現も同じ形を使う。走査する doc が
// 違う（あちらは我々の record、こちらは**他人の** `CLAUDE.md`）ので走査器は別だが、
// ⚠ **片方だけが引用を主張として読めば、我々は他人の doc に載った例示を書き換える。**
const FENCE_LINE = /^ {0,3}(```+|~~~+)/

const BEGIN = /^<!--\s*bearing:aim\s+v(\S+)\s+sha=([0-9a-f]{16})\s*-->\s*$/
const BEGIN_LOOSE = /^<!--\s*bearing:aim(\s|-->)/
const END = /^<!--\s*\/bearing:aim\s*-->\s*$/

const normalize = (s) => s.replace(/\r\n/g, '\n')

/**
 * その file が使っている改行。⚠ **1 つでも CRLF が在れば CRLF とみなす** —— 混在した file へ
 * LF を足せば、混在を増やすほうが安全側に見えるが、実際には diff が全行に出る。
 *
 * @param {string} text
 * @returns {string}
 */
export const detectEol = (text) => (text.includes('\r\n') ? '\r\n' : '\n')

/**
 * block 本文の指紋。⚠ **改行を正規化してから採る**（上の見出しコメントを見よ）。
 *
 * @param {string} body
 * @returns {string} sha256 の先頭 16 桁
 */
export const bodySha = (body) =>
  createHash('sha256').update(normalize(body).trimEnd(), 'utf8').digest('hex').slice(0, 16)

/**
 * `frame.md` を、他人の `CLAUDE.md` の中で成り立つ形へ変換する。
 *
 * 変換は 2 つだけで、**どちらも一致しなければ throw する**。⚠ **黙って no-op にしてはならない**
 * —— 前提が崩れたまま生成すれば、**他人の repo に解決しない link と H1 を配ることになり、
 * 壊れたことは誰にも告げられない。**
 *
 * ⚠ **条件文（「この repo が aim corpus を持つなら」）は落とさない。** marker が在ることは
 * *採用した*ことであって *corpus が在る*ことではない —— 採ったが node がまだ 0 の project
 * では、あの条件は今も真である。
 *
 * @param {string} frameText `skills/aim/frame.md` の中身
 * @returns {string} block の本文（LF・末尾空白なし）
 */
export function renderLaw(frameText) {
  // ⚠ **後ろの半角空白まで含めて置き換える。** 全角の閉じ括弧の直後に半角空白が残ると、
  // 差し込んだ 1 行だけが他人の doc の中で組版を外す。
  const LINK = '[`docs/aims/_guide/aim-authoring.md`](aim-authoring.md) '
  const LINK_TO = '`docs/aims/_guide/aim-authoring.md`（無ければ `aim` skill が同梱する複製）'

  const text = normalize(frameText).trimEnd()
  const hits = text.split(LINK).length - 1
  if (hits !== 1) {
    throw new Error(
      `frame の canon への link が ${hits} 個（1 個であるべき）—— 変換の前提が崩れている。` +
        'この link は消費者の repo では解決しない ∴ 書き換えずに配ってはならない。',
    )
  }

  let inFence = false
  let demoted = 0
  const lines = text.replace(LINK, LINK_TO).split('\n').map((line) => {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence
      return line
    }
    if (inFence) return line
    if (/^#{1,5}\s/.test(line)) {
      demoted += 1
      return `#${line}`
    }
    return line
  })
  if (demoted === 0) {
    throw new Error('frame に見出しが無い —— 変換の前提が崩れている。他人の CLAUDE.md で H1 を名乗らせない。')
  }
  return lines.join('\n')
}

/**
 * 差し込む法と、それが名乗る版。
 *
 * ⚠ **法の正本は `skills/aim/frame.md` 1 枚である。** ここで別に書き起こせば、同じ 6 箇条が
 * 2 つの正本を持つ —— そして片方だけが直される日が必ず来る。⚠ **CLI と hook の両方がこれを
 * 呼ぶ**（置く側と、置かれたものの版を突き合わせる側）∴ **導出は 1 箇所に置く。**
 *
 * @param {string} root plugin root
 * @returns {Promise<{version: string, law: string}>}
 */
export async function loadDesired(root) {
  const frame = await readFile(path.join(root, 'skills', 'aim', 'frame.md'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
  return { version: manifest.version, law: renderLaw(frame) }
}

/**
 * marker 込みの block を組み立てる。
 *
 * @param {string} version
 * @param {string} body
 * @returns {string} LF で綴じた block（前後に空行を持たない）
 */
export const renderBlock = (version, body) => {
  const b = normalize(body).trimEnd()
  return `<!-- ${MARKER} v${version} sha=${bodySha(b)} -->\n${b}\n<!-- /${MARKER} -->`
}

/**
 * `CLAUDE.md` の中の block を探す。
 *
 * ⚠ **anomaly は「無い」に畳まない。** 片方だけの marker・読めない marker・2 組以上 ——
 * どれも「block が無い」に見せれば、**次の apply が末尾へもう 1 つ足す**。壊れた記録は
 * 無い記録より声が大きい、という `checkpoint.mjs` と同じ形である。
 *
 * @param {string} text
 * @returns {{blocks: {from: number, to: number, version: string, sha: string, body: string}[], anomalies: string[]}}
 */
export function findBlocks(text) {
  const lines = normalize(text).split('\n')
  const blocks = []
  const anomalies = []
  let inFence = false
  let open = null

  lines.forEach((line, i) => {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const begin = line.match(BEGIN)
    if (begin) {
      if (open) anomalies.push(`${open.from + 1} 行目の開始 marker が閉じられないまま、${i + 1} 行目で次が開いている`)
      open = { from: i, version: begin[1], sha: begin[2] }
      return
    }
    if (BEGIN_LOOSE.test(line) && !END.test(line)) {
      anomalies.push(`${i + 1} 行目の marker を読めない（版と sha を持つ形ではない）: ${line.trim()}`)
      return
    }
    if (END.test(line)) {
      if (!open) {
        anomalies.push(`${i + 1} 行目に閉じ marker だけが在る（対応する開始が無い）`)
        return
      }
      blocks.push({ ...open, to: i, body: lines.slice(open.from + 1, i).join('\n') })
      open = null
    }
  })
  if (open) anomalies.push(`${open.from + 1} 行目の開始 marker が閉じられていない`)
  if (blocks.length > 1) anomalies.push(`block が ${blocks.length} 組ある（1 組であるべき）`)
  return { blocks, anomalies }
}

/**
 * 原文の改行で行の配列を書き戻す。
 *
 * ⚠ **末尾改行をここで足してはならない。** `split('\n')` は末尾改行を**最後の空要素として
 * 既に運んでいる** ∴ ここで足せば二重になり、**置いて外すたびに他人の file の末尾が 1 行ずつ
 * 伸びる**（実際にそうなっていた。round-trip の試験が捕まえた）。
 */
const restore = (lines, source) => lines.join(detectEol(source))

/**
 * block を置く／置き直す計画。**書き込みは行わない。**
 *
 * @param {string} text 現在の `CLAUDE.md`（無ければ空文字）
 * @param {{version: string, law: string}} desired
 * @returns {{action: 'create'|'update'|'unchanged'|'refuse', reason: string, text?: string}}
 */
export function planApply(text, { version, law }) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) {
    return { action: 'refuse', reason: `marker が壊れている ∴ 触らない —— ${anomalies.join('。')}` }
  }

  const block = renderBlock(version, law)
  const lines = normalize(text).split('\n')

  if (blocks.length === 0) {
    // 末尾へ足す。⚠ **前に空行をちょうど 1 つ置く** —— 人間が書いた最後の行にくっつけない。
    const kept = [...lines]
    while (kept.length > 0 && kept.at(-1).trim() === '') kept.pop()
    const body = kept.length === 0 ? block.split('\n') : [...kept, '', ...block.split('\n')]
    // ⚠ **末尾改行の有無は原文に従う** —— 持っていなかった file に足せば、我々の block とは
    // 無関係な 1 行が diff に出る。file が無かった場合だけは、足す側が既定である。
    const trailing = text === '' || /\n$/.test(normalize(text))
    return {
      action: 'create',
      reason: '末尾へ置いた',
      text: restore(trailing ? [...body, ''] : body, text || '\n'),
    }
  }

  const [found] = blocks
  const actual = bodySha(found.body)
  if (actual !== found.sha) {
    return {
      action: 'refuse',
      reason:
        `block の本文が marker の sha と一致しない（marker: ${found.sha} / 実際: ${actual}）` +
        ' ∴ **人間が手を入れている**と読む。置き直さない —— 消えるのはその編集だからである。' +
        ' 意図した編集なら、block を丸ごと消してから置き直すこと。',
    }
  }

  const current = lines.slice(found.from, found.to + 1).join('\n')
  if (current === block) {
    return { action: 'unchanged', reason: `既にこの block である（v${found.version}）` }
  }
  const next = [...lines.slice(0, found.from), ...block.split('\n'), ...lines.slice(found.to + 1)]
  return {
    action: 'update',
    reason: `v${found.version} から v${version} へ置き直した`,
    text: restore(next, text),
  }
}

/**
 * block を外す計画。**書き込みは行わない。**
 *
 * @param {string} text
 * @returns {{action: 'remove'|'absent'|'refuse', reason: string, text?: string}}
 */
export function planRemove(text) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) {
    return { action: 'refuse', reason: `marker が壊れている ∴ 触らない —— ${anomalies.join('。')}` }
  }
  if (blocks.length === 0) return { action: 'absent', reason: 'block は置かれていない' }

  const [found] = blocks
  const actual = bodySha(found.body)
  if (actual !== found.sha) {
    return {
      action: 'refuse',
      reason:
        `block の本文が marker の sha と一致しない（marker: ${found.sha} / 実際: ${actual}）` +
        ' ∴ **人間が手を入れている**と読む。消さない —— 消えるのはその編集だからである。',
    }
  }

  const lines = normalize(text).split('\n')
  // block の直前に我々が置いた空行も、それが空行であれば一緒に外す。
  let from = found.from
  if (from > 0 && lines[from - 1].trim() === '') from -= 1
  const next = [...lines.slice(0, from), ...lines.slice(found.to + 1)]
  return { action: 'remove', reason: `v${found.version} の block を外した`, text: restore(next, text) }
}

/**
 * 置かれた block の状態を述べる（書き込まない）。hook もこれを使う。
 *
 * @param {string} text
 * @param {{version: string, law: string}} desired
 * @returns {{state: 'absent'|'current'|'stale'|'edited'|'broken', version: string|null, detail: string}}
 */
export function inspect(text, { version, law }) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) return { state: 'broken', version: null, detail: anomalies.join('。') }
  if (blocks.length === 0) return { state: 'absent', version: null, detail: 'block が無い' }

  const [found] = blocks
  if (bodySha(found.body) !== found.sha) {
    return { state: 'edited', version: found.version, detail: '本文が marker の sha と一致しない' }
  }
  if (found.version === version && found.sha === bodySha(law)) {
    return { state: 'current', version: found.version, detail: '今の版と一致する' }
  }
  return {
    state: 'stale',
    version: found.version,
    detail: `置かれているのは v${found.version}、今の版は v${version}`,
  }
}
