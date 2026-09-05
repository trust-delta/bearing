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
// 上書きする**ことになる。どちらの場合も置き直さず、述べて止まる —— `bearing-setup-statusline`
// が既存の statusLine を上書きしないのと同じ規律で、**どれが正かを機械が決めてよい場面では
// ない。**
//
// ⚠ **sha は LF へ正規化してから採る。** さもなくば CRLF の checkout と LF の checkout で
// 同じ block が別の sha を持ち、**git が改行を変換しただけで「人間が手を入れた」と報告する。**

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { DEFAULT_AIMS_DIR, normalizeAimsDir } from './corpus.mjs'

/** 法の本文の中で、corpus の在り処が入る場所。⚠ **残ったまま配ってはならない。** */
export const AIMS_PLACEHOLDER = '{{aims}}'

/** marker の名。⚠ **他 plugin と衝突しない形であること** —— `bin/` の名前空間と同じ理由。 */
export const MARKER = 'bearing:aim'

// ⚠ **fenced block の中の marker は引用であって主張ではない。** これは `lib/process.mjs` が
// aim record の節に当てているのと**同じ法**であり、正規表現も同じ形を使う。走査する doc が
// 違う（あちらは我々の record、こちらは**他人の** `CLAUDE.md`）ので走査器は別だが、
// ⚠ **片方だけが引用を主張として読めば、我々は他人の doc に載った例示を書き換える。**
const FENCE_LINE = /^ {0,3}(```+|~~~+)/

/**
 * **旧い「降りる宣言」の字面。** ⚠ **もう誰も書かない —— 読むためだけに残っている。**
 *
 * ⚠ **2026-09-05 まで、述語は `adopted || hasCorpus` だった** ∴ corpus を持つ repo は
 * 採用を宣言していなくても機構が口を開き、**降りるには専用の宣言が要った**（`--decline`）。
 * 同日、人間が述語を `adopted` だけに絞った（`isEngaged`）—— **推測をやめれば、推測を覆す
 * 手も要らない。**
 *
 * ⚠ **∴ 旧い宣言は、今や既定と同じ意味を持つ**（＝ 採用していない ＝ 黙る）—— 消さなくても
 * 正しく働く。**残っているのは、それを「壊れた marker」と読まないためである**: `bearing:aim`
 * で始まる行ゆえ、除外しなければ「読めない marker」＝ anomaly と判定され、
 * ⚠ **anomaly は採用の事実として数えられる** ∴ **降りたはずの repo が有効になる** ——
 * 意味がちょうど反転する。
 */
const DECLINED_LINE = /^<!--\s*bearing:aim\s+declined\s*-->\s*$/

const BEGIN_ANY = /^<!--\s*bearing:aim\s+(.*?)\s*-->\s*$/
const BEGIN_LOOSE = /^<!--\s*bearing:aim(\s|-->)/
const END = /^<!--\s*\/bearing:aim\s*-->\s*$/

/**
 * 開始 marker の中身を読む。**読めなければ null**（「無い」ではない）。
 *
 * 形は `v<version>` に続く `key=value` の並びで、⚠ **`dir` は省略可能である** ——
 * 省略は既定を意味する ∴ **`dir=` を持たない古い block は、何もしなくてもそのまま読める。**
 *
 * @param {string} line
 * @returns {{version: string, sha: string, dir: string}|null}
 */
function parseBegin(line) {
  const m = line.match(BEGIN_ANY)
  if (!m) return null
  const [head, ...rest] = m[1].split(/\s+/).filter(Boolean)
  if (!head || !head.startsWith('v') || head.length < 2) return null
  const attrs = new Map()
  for (const token of rest) {
    const at = token.indexOf('=')
    if (at <= 0) return null
    attrs.set(token.slice(0, at), token.slice(at + 1))
  }
  const sha = attrs.get('sha')
  if (!/^[0-9a-f]{16}$/.test(sha ?? '')) return null
  // ⚠ **扱えない dir は「既定」に落とさない。** 落とせば、誤った宣言が既定として黙って動く。
  const dir = attrs.has('dir') ? normalizeAimsDir(attrs.get('dir')) : DEFAULT_AIMS_DIR
  if (dir === null) return null
  return { version: head.slice(1), sha, dir }
}

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
 * 変換は 1 つだけ —— 見出しを 1 段下げる（他人の doc で H1 を名乗らない）—— と、placeholder の
 * 充填である。⚠ **前提が崩れたら黙って no-op にせず throw する**: frame が `aim` skill を名指して
 * いなければ、法は読み手をどこへも送らない。
 *
 * ⚠ **法は path も version も持たない**（人間の決定 2026-09-05）。plugin の cache path は version を
 * 含み cache は旧版を消さない ∴ path を書けば bump で腐る。skill 名は version を持たない ∴ commit
 * しても嘘にならない。⚠ **skill が無いときの手当ても持たない** —— それは開示であり、repo のもの
 * である。
 *
 * ⚠ **条件文（「この repo が aim corpus を持つなら」）は落とさない。** marker が在ることは
 * *採用した*ことであって *corpus が在る*ことではない —— 採ったが node がまだ 0 の project
 * では、あの条件は今も真である。
 *
 * @param {string} frameText `templates/aim/frame.md` の中身
 * @returns {string} block の本文（LF・末尾空白なし）
 */
export function renderLaw(frameText, dir = DEFAULT_AIMS_DIR) {
  const text = normalize(frameText).trimEnd()
  if (!text.includes('`aim` skill')) {
    throw new Error(
      'frame が `aim` skill を名指していない —— 変換の前提が崩れている。' +
        '法は読み手を skill へ送らねばならず、path を書けば version で腐る。',
    )
  }

  let inFence = false
  let demoted = 0
  const lines = text.split('\n').map((line) => {
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
  return substituteAims(lines.join('\n'), dir)
}

/**
 * 法の本文の placeholder を、宣言された在り処で埋める。
 *
 * ⚠ **埋め残しは throw する。** `{{aims}}` を含んだまま配れば、**他人の repo のセッションが
 * 存在しない path を正本として読む** —— そして placeholder は、prose の中では意味ありげな
 * 記号にしか見えないので、誰も壊れたと気づかない。
 *
 * @param {string} text
 * @param {string} dir
 */
export function substituteAims(text, dir) {
  const out = text.split(AIMS_PLACEHOLDER).join(dir)
  if (out.includes(AIMS_PLACEHOLDER) || out.includes('{{')) {
    throw new Error(`法の本文に埋められていない placeholder が残っている（dir=${dir}）`)
  }
  return out
}

/**
 * 差し込む法と、それが名乗る版。
 *
 * ⚠ **plugin の中で法の text を持つのは `templates/aim/frame.md` 1 枚である**（正本であり、
 * 生成物ではない —— 2026-09-05 に `original/` は畳まれた）。ここで別に書き起こせば、同じ 6 箇条が 2 つの
 * text を持つ —— そして片方だけが直される日が必ず来る。⚠ **CLI と hook の両方がこれを
 * 呼ぶ**（置く側と、置かれたものの版を突き合わせる側）∴ **導出は 1 箇所に置く。**
 *
 * @param {string} root plugin root
 * @returns {Promise<{version: string, law: string}>}
 */
export async function loadDesired(root, dir = DEFAULT_AIMS_DIR) {
  const frame = await readFile(path.join(root, 'templates', 'aim', 'frame.md'), 'utf8')
  const manifest = JSON.parse(await readFile(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
  return { version: manifest.version, law: renderLaw(frame, dir), dir }
}

/**
 * marker 込みの block を組み立てる。
 *
 * @param {string} version
 * @param {string} body
 * @returns {string} LF で綴じた block（前後に空行を持たない）
 */
export const renderBlock = (version, body, dir = DEFAULT_AIMS_DIR) => {
  const b = normalize(body).trimEnd()
  // ⚠ **`dir=` は既定であっても書く。** 省略できる形にしておきながら省くと、file を開いた
  // 人間は「どこを見ているか」を知るために既定を覚えていなければならない。**読み取りは省略を
  // 許し、書き出しは省略しない** —— 古い block を読めることと、新しい block が黙ることは別。
  return `<!-- ${MARKER} v${version} dir=${dir} sha=${bodySha(b)} -->\n${b}\n<!-- /${MARKER} -->`
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

    // ⚠ **降りる宣言は「読めない marker」ではない。** ここで弾かなければ anomaly になり、
    // `readAdopted` が anomaly を採用と読む ∴ **降りたことが採用に化ける。**
    if (DECLINED_LINE.test(line)) return

    const begin = BEGIN_LOOSE.test(line) && !END.test(line) ? parseBegin(line) : null
    if (begin) {
      if (open) anomalies.push(`${open.from + 1} 行目の開始 marker が閉じられないまま、${i + 1} 行目で次が開いている`)
      open = { from: i, ...begin }
      return
    }
    if (BEGIN_LOOSE.test(line) && !END.test(line)) {
      anomalies.push(
        `${i + 1} 行目の marker を読めない（版・sha・扱える dir を持つ形ではない）: ${line.trim()}`,
      )
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
 * この project は aim を**採ったか**。`CLAUDE.md` に法の block が在るか、だけを見る。
 *
 * ⚠ **これは「採用したか」であって「corpus が在るか」ではない。** 2 つは別の事実であり、
 * どちらか一方でも真なら aim は engaged である —— corpus を先に置いて marker を後から置く
 * 順序も、marker を置いて最初の node をこれから書く順序も、どちらも正規だからである。
 *
 * ⚠ **壊れた block は「採っていない」ではない。** anomalies が出るのは marker が在って
 * 形が崩れている場合であり、**採用の事実そのものは立っている** ∴ ここで `false` を返せば、
 * 採った project が block を壊した瞬間に面ごと消える —— 直すべきときに黙る形である。
 *
 * @param {string} root unit root
 * @returns {Promise<boolean>}
 */
export async function readAdopted(root) {
  return (await readDeclaration(root)).adopted
}

/**
 * その `CLAUDE.md` は**降りると宣言している**か。
 *
 * ⚠ **fenced code block の中の marker は引用である** —— 採用の marker と同じ法を当てる。
 * 他人の doc に載った例示を、降りる宣言として読んではならない。
 *
 * @param {string} text
 * @returns {boolean}
 */
export function findDeclined(text) {
  let inFence = false
  for (const line of normalize(text).split('\n')) {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence
      continue
    }
    if (!inFence && DECLINED_LINE.test(line)) return true
  }
  return false
}

/**
 * その unit root の `CLAUDE.md` が述べている事実。**読むのはここ 1 箇所である。**
 *
 * ⚠ **旧い「降りる宣言」だけを持つ file は、ここで自然に `adopted: false` になる** ——
 * `findBlocks` があの行を除外するからである（除外しなければ anomaly として採用に数えられ、
 * **意味が反転する**）。∴ **移行のための特別扱いは要らない。**
 *
 * @param {string} root unit root
 * @returns {Promise<{adopted: boolean}>}
 */
export async function readDeclaration(root) {
  let text
  try {
    text = await readFile(path.join(root, 'CLAUDE.md'), 'utf8')
  } catch {
    return { adopted: false }
  }
  const { blocks, anomalies } = findBlocks(text)
  return { adopted: blocks.length > 0 || anomalies.length > 0 }
}

/**
 * **この project で aim の機構は口を開くか。** hook も面も、必ずこの 1 つを通る。
 *
 * ⚠ **述語が 2 箇所に住めば、同じ project が面ごとに別の姿を持つ。** 2026-09-03、hook は
 * marker を見て黙るのに statusline は corpus の有無しか見ておらず、**採っていない全 project
 * に 2 行目を描いていた**（`docs/aims/adoption-declaration.md`）—— 同じ結論を 2 つの形で
 * 書いていたことが原因である ∴ **結論そのものを 1 箇所に置く。**
 *
 * ⚠ **corpus の有無を見てはならない。** `docs/aims/` が在ることは*使っている証拠*であって、
 * **この機構を通したいという宣言ではない。** 2026-09-05 まで述語は `adopted || hasCorpus`
 * であり、**採用を宣言していない repo でも corpus さえ在れば口を開いていた** —— 共同開発の
 * repo で、team が採っていない機構が黙って喋る形である。⚠ **その推測を覆すために専用の
 * 「降りる宣言」が要り、`--remove` は「黙るようになる」と言えず、状態が 3 つに増えていた**
 * ∴ **推測をやめたことで、そのすべてが同時に消えた**（人間の決定 2026-09-05）。
 *
 * ⚠ **代償は発見面である** —— 採用するまで機構は完全に黙る ∴ **黙る機構は自分の存在を
 * 告げられない。** それは [[ambient-display]] の 2 行目が引き受ける（corpus を見つけたが
 * 採用されていない、と 1 行で述べる）。
 *
 * ⚠ **baton はこの述語に掛からない。** handoff は `docs/aims/` に何も依存せず、どの project
 * でも使える ∴ ここで黙らせることは aim の沈黙ではなく **handoff の欠落**になる。呼ぶ側が
 * baton をこの gate の外で読むこと。
 *
 * @param {{adopted: boolean}} facts
 * @returns {boolean}
 */
export function isEngaged({ adopted }) {
  return Boolean(adopted)
}

/**
 * その `CLAUDE.md` が宣言している corpus の在り処。
 *
 * ⚠ **「宣言が無い」と「宣言が壊れている」を分ける。** 前者は既定でよいが、後者で既定へ
 * 落とせば、**誤った宣言が既定として黙って動き、人間は自分の宣言が効いていると信じ続ける。**
 *
 * @param {string} text
 * @returns {{dir: string|null, declared: boolean, reason: string|null}}
 */
export function declaredAimsDir(text) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) return { dir: null, declared: false, reason: anomalies.join('。') }
  if (blocks.length === 0) return { dir: null, declared: false, reason: null }
  return { dir: blocks[0].dir, declared: true, reason: null }
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
 * 末尾へ 1 つ足す。⚠ **前に空行をちょうど 1 つ置く** —— 人間が書いた最後の行にくっつけない。
 *
 * ⚠ **末尾改行の有無は原文に従う** —— 持っていなかった file に足せば、我々とは無関係な
 * 1 行が diff に出る。file が無かった場合だけは、足す側が既定である。
 *
 * ⚠ **法の block と降りる宣言が同じ経路を通る。** 別々に書けば、片方だけが末尾改行を
 * 伸ばす日が来る —— それは既に 1 度起きている（round-trip の試験が捕まえた）。
 */
function appendAtEnd(text, piece) {
  const lines = normalize(text).split('\n')
  const kept = [...lines]
  while (kept.length > 0 && kept.at(-1).trim() === '') kept.pop()
  const body = kept.length === 0 ? piece.split('\n') : [...kept, '', ...piece.split('\n')]
  const trailing = text === '' || /\n$/.test(normalize(text))
  return restore(trailing ? [...body, ''] : body, text || '\n')
}

/** 降りる宣言の行を落とす。⚠ 直前の空行も、我々が置いたものであれば一緒に落とす。 */
function stripDeclined(text) {
  const lines = normalize(text).split('\n')
  const out = []
  let inFence = false
  for (const line of lines) {
    if (FENCE_LINE.test(line)) inFence = !inFence
    if (!inFence && DECLINED_LINE.test(line)) {
      if (out.length > 0 && out.at(-1).trim() === '') out.pop()
      continue
    }
    out.push(line)
  }
  return restore(out, text)
}

/**
 * block を置く／置き直す計画。**書き込みは行わない。**
 *
 * @param {string} text 現在の `CLAUDE.md`（無ければ空文字）
 * @param {{version: string, law: string}} desired
 * @returns {{action: 'create'|'update'|'unchanged'|'refuse', reason: string, text?: string}}
 */
export function planApply(text, { version, law, dir = DEFAULT_AIMS_DIR }) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) {
    return { action: 'refuse', reason: `marker が壊れている ∴ 触らない —— ${anomalies.join('。')}` }
  }

  const block = renderBlock(version, law, dir)
  const lines = normalize(text).split('\n')

  if (blocks.length === 0) {
    return { action: 'create', reason: '末尾へ置いた', text: appendAtEnd(text, block) }
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
    return { action: 'unchanged', reason: `既にこの block である（v${found.version} / ${found.dir}）` }
  }
  const next = [...lines.slice(0, found.from), ...block.split('\n'), ...lines.slice(found.to + 1)]
  const moved = found.dir !== dir ? `、在り処を ${found.dir} から ${dir} へ` : ''
  return {
    action: 'update',
    reason: `v${found.version} から v${version} へ置き直した${moved}`,
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
  // ⚠ **降りる宣言も「置かれた宣言」である** —— `--remove` はこの repo を*宣言していない*
  // 状態へ戻す act ゆえ、どちらの宣言でも外す。**片方だけ外せば、外したつもりの人間が
  // 降りたままになる。**
  if (findDeclined(text)) {
    // ⚠ **旧い「降りる宣言」は、今は既定と同じ意味しか持たない**（`DECLINED_LINE` の説明）
    // ∴ 残っていても正しく黙る。ここで落とすのは掃除であって、意味の変更ではない。
    return {
      action: 'remove',
      reason: '旧い「降りる宣言」を外した —— 今は既定と同じ意味である（採用していない ∴ 黙る）',
      text: stripDeclined(text),
    }
  }
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
export function inspect(text, { version, law, dir = DEFAULT_AIMS_DIR }) {
  const { blocks, anomalies } = findBlocks(text)
  if (anomalies.length > 0) {
    return { state: 'broken', version: null, dir: null, detail: anomalies.join('。') }
  }
  if (blocks.length === 0) {
    return { state: 'absent', version: null, dir: null, detail: 'block が無い' }
  }

  const [found] = blocks
  if (bodySha(found.body) !== found.sha) {
    return {
      state: 'edited',
      version: found.version,
      dir: found.dir,
      detail: '本文が marker の sha と一致しない',
    }
  }
  if (found.version === version && found.dir === dir && found.sha === bodySha(law)) {
    return { state: 'current', version: found.version, dir: found.dir, detail: '今の版と一致する' }
  }
  // ⚠ **在り処が動いたことは、版が古いことと別の理由で起きる** ∴ 別の言葉で述べる ——
  // 「古い」とだけ言えば、人間は plugin を更新して直らない理由を探すことになる。
  const detail = found.dir !== dir
    ? `宣言された在り処は ${found.dir}、今の解決は ${dir}`
    : `置かれているのは v${found.version}、今の版は v${version}`
  return { state: 'stale', version: found.version, dir: found.dir, detail }
}
