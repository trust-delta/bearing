// statusline の test —— **描くのは事実であって、装飾ではない**という条項と、
// **幅が確定した文字だけを使う**という条項を固定する。
//
// ⚠ ここで検査するのは pure な render / format だけである。gather 側は既に
// working-delta / unpushed / process の test が持っており、statusline がそれらを
// 呼び直すことに新しい主張は無い —— 新しいのは 2 点だけである:
// 「**採れなかった**」と「**0 だった**」を描き分けること、そして
// **East Asian Ambiguous 幅の文字を出力に混ぜないこと**。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  humanTokens, untilReset, displayWidth, widthUnsafeChars, fit, bar, resolveCwd,
  renderSession, renderBearing, foldRepos, heat, provenance,
} from '../bin/statusline.mjs'

const ESC = String.fromCharCode(27)
/** 色は表示の関心であって主張ではない ∴ assert の前に剥ぐ。 */
const strip = (s) => s.replace(new RegExp(ESC + '\\[[0-9;]*m', 'g'), '')
const line = (segments) => strip(fit(segments, 1000))

test('humanTokens —— 桁を落とすのは幅のためだけで、誤差を足さない', () => {
  assert.equal(humanTokens(105_300), '105.3k')
  // 意味を持たない `.0` は落とす —— `840.0k` の 0 は読み手に何も伝えない。
  assert.equal(humanTokens(840_000), '840k')
  assert.equal(humanTokens(1_000_000), '1M')
  assert.equal(humanTokens(1_500_000), '1.5M')
  assert.equal(humanTokens(12_000_000), '12M')
  assert.equal(humanTokens(999), '999')
  // ⚠ 数でないものは「0」ではなく「無い」へ落ちる。
  assert.equal(humanTokens(undefined), null)
  assert.equal(humanTokens(Number.NaN), null)
})

test('untilReset —— 窓の長さに応じて単位が変わる', () => {
  const now = 1_700_000_000_000
  const at = (mins) => now / 1000 + mins * 60
  assert.equal(untilReset(at(30), now), '30m')
  assert.equal(untilReset(at(66), now), '1:06')
  // ⚠ 週の窓を `55:33` と描いても読めない ∴ 24 時間を超えたら日で見る。
  assert.equal(untilReset(at(60 * 55), now), '2d')
  assert.equal(untilReset(undefined, now), null)
})

test('untilReset —— 過ぎた窓を負の残りとして描かない', () => {
  const now = 1_700_000_000_000
  assert.equal(untilReset(now / 1000 - 600, now), '0m')
})

test('widthUnsafeChars —— 桁がずれる文字を名指しで捕らえる', () => {
  // ⚠ **一度この事故を起こしている。** 中黒・矢印・ギリシャ文字・絵文字はいずれも
  // East Asian Ambiguous 幅であり、日本語フォントでは全角に描かれるのに terminal は
  // 半角として桁を進める ∴ 隣の文字と重なる。
  assert.deepEqual(widthUnsafeChars('5h 12%'), [])
  assert.deepEqual(widthUnsafeChars('観測待ち 3'), [])
  assert.deepEqual(widthUnsafeChars('a' + String.fromCodePoint(0x21bb)), ['↻'])
  assert.deepEqual(widthUnsafeChars(String.fromCodePoint(0xb7)), ['·'])
  assert.deepEqual(widthUnsafeChars(String.fromCodePoint(0x394)), ['Δ'])
  assert.deepEqual(widthUnsafeChars(String.fromCodePoint(0x26a0)), ['⚠'])
  // ⚠ ANSI は幅を持たない ∴ 安全でないとは数えない。
  assert.deepEqual(widthUnsafeChars(ESC + '[2mabc' + ESC + '[0m'), [])
})

test('bar —— 塗るのは空白だけで、幅は割合に依らず一定である', () => {
  // ⚠ **これがバーを空白で描く理由そのものである。** ブロック文字なら環境ごとに
  // 幅が揺れ、桁がずれる。空白なら揺れない —— 形を作るのは色であって文字ではない。
  for (const pct of [-5, 0, 11, 50, 84, 100, 150]) {
    assert.match(strip(bar(pct, 8)), /^ {8}$/)
    assert.equal(displayWidth(bar(pct, 8)), 8)
    assert.deepEqual(widthUnsafeChars(bar(pct, 8)), [])
  }
})

test('bar —— 塗られた長さが割合を運ぶ', () => {
  /** 最初の背景色に続く空白が、塗られた部分である。 */
  const filled = (s) => s.match(/48;5;\d+m( *)/)[1].length
  assert.equal(filled(bar(0, 8)), 0)
  assert.equal(filled(bar(50, 8)), 4)
  assert.equal(filled(bar(100, 8)), 8)
  // ⚠ 範囲外は畳む —— spend_limit の `used_percentage` は 100 を超えうる。
  assert.equal(filled(bar(150, 8)), 8)
  assert.equal(filled(bar(-5, 8)), 0)
})

test('displayWidth —— ANSI は幅を持たず、日本語は 2 を占める', () => {
  assert.equal(displayWidth('abc'), 3)
  assert.equal(displayWidth(ESC + '[2mabc' + ESC + '[0m'), 3)
  assert.equal(displayWidth('観測待ち'), 8)
})

test('fit —— 狭いときは後ろから捨て、先頭は必ず残る', () => {
  const segs = ['aaaa', 'bbbb', 'cccc']
  assert.equal(strip(fit(segs, 1000)), 'aaaa   bbbb   cccc')
  assert.equal(strip(fit(segs, 14)), 'aaaa   bbbb')
  // ⚠ 1 つも残らないより、はみ出してでも最優先の 1 つを残す —— 空行は
  // 「statusline が壊れた」と読まれ、幅の問題だと分からない。
  assert.equal(strip(fit(segs, 1)), 'aaaa')
})

test('renderSession —— 在るものだけを描く', () => {
  const input = {
    model: { display_name: 'Opus 5' },
    effort: { level: 'high' },
    context_window: { used_percentage: 11.2, current_usage: 105_300, context_window_size: 1_000_000 },
  }
  // ⚠ 判断に使うのは割合であって token 数ではない ∴ 割合が先、量が後。
  const BAR = ' '.repeat(8)
  assert.equal(line(renderSession(input, 'main')),
    `Opus 5 high   git main   ctx ${BAR} 11% 105.3k/1M`)
})

test('renderSession —— rate_limits の欠落を 0% と偽らない', () => {
  const input = { model: { display_name: 'Opus 5' } }
  // ⚠ Pro / Max 以外、あるいは最初の API 応答より前では `rate_limits` は来ない。
  // そこで「5h 0%」と描けば、使っていないという**嘘**になる。
  assert.equal(line(renderSession(input, 'main')), 'Opus 5   git main')
})

test('renderSession —— 窓ごとに独立して欠けうる', () => {
  const now = 1_700_000_000_000
  const input = {
    model: { display_name: 'Opus 5' },
    rate_limits: {
      seven_day: { used_percentage: 24, resets_at: now / 1000 + 3600 },
      spend_limit: { used_percentage: 0 },
    },
  }
  assert.equal(line(renderSession(input, 'main', now)), 'Opus 5   git main   7d 24% 1:00   $ 0%')
})

test('renderSession —— context の量が無くても割合だけは描く', () => {
  const input = { context_window: { used_percentage: 42 } }
  assert.equal(line(renderSession(input, 'main')), `git main   ctx ${' '.repeat(8)} 42%`)
})

test('renderBearing —— 静かなときは静かである', () => {
  const facts = {
    aimCount: 5, openTodo: 0, awaiting: 0, batonUnread: false,
    working: 0, unpushed: 0, drift: 0,
  }
  assert.equal(line(renderBearing('ok', facts)), 'bearing   aim 5')
})

test('renderBearing —— 異常だけが現れる', () => {
  const facts = {
    aimCount: 5, openTodo: 2, awaiting: 3, batonUnread: true,
    working: 2, unpushed: 1, drift: 4,
  }
  assert.equal(
    line(renderBearing('ok', facts)),
    'bearing   aim 5   todo 2   観測待ち 3   baton 未読   未commit 2   未push 1   drift 4',
  )
})

test('renderBearing —— 採れなかったことを 0 と描かない', () => {
  // ⚠ **これがこの file の中心的な主張である。** git を読めなかった `null` を 0 として
  // 畳めば、読み手は「未 push は無い」と読む —— corpus fence が一貫して拒んできた誤読で
  // あり、statusline でだけ許す理由は無い。
  const facts = {
    aimCount: 5, openTodo: 0, awaiting: 0, batonUnread: false,
    working: null, unpushed: null, drift: null,
  }
  assert.equal(line(renderBearing('ok', facts)), 'bearing   aim 5   未commit ?   未push ?   drift ?')
})

test('renderBearing —— 行そのものは決して消さない', () => {
  // ⚠ **これがもう 1 つの中心的な主張である。** 初版は corpus を採れないとき行を黙って
  // 落としていた —— 読み手はそれを「bearing は何も言っていない ＝ 問題が無い」と読む。
  // corpus fence が一貫して拒んできた誤読を、statusline でだけ許していた。

  // `docs/aims/` を持たない repo は構造的に正常 ∴ 静かに、しかし在ると述べる。
  assert.equal(line(renderBearing('no-corpus', null)), 'bearing   corpus 無し')

  // ⚠ 一方これは正常ではない。`resolveUnit` は cwd から*下*を探す ∴ repo の
  // subdirectory で起動すれば、corpus は在るのに見つからない —— clean ではなく不在である。
  assert.equal(line(renderBearing('unavailable', null)), 'bearing   corpus 未取得')

  // ⚠ state が ok でも facts が無ければ、事実を持たないことに変わりはない。
  assert.equal(line(renderBearing('ok', null)), 'bearing   corpus 未取得')
})

test('描かれる文字はすべて幅が確定している', () => {
  // ⚠ **これは飾りの検査ではない。** 次に Ambiguous な記号を足そうとする者を、
  // 実際に画面が重なる前に止めるのがこの test の役目である。
  const now = 1_700_000_000_000
  const input = {
    model: { display_name: 'Opus 5' },
    effort: { level: 'high' },
    fast_mode: true,
    context_window: { used_percentage: 84, current_usage: 840_000, context_window_size: 1_000_000 },
    rate_limits: {
      five_hour: { used_percentage: 12, resets_at: now / 1000 + 1800 },
      seven_day: { used_percentage: 96, resets_at: now / 1000 + 400_000 },
      spend_limit: { used_percentage: 0 },
    },
  }
  const facts = {
    aimCount: 5, openTodo: 2, awaiting: 3, batonUnread: true,
    working: 2, unpushed: null, drift: 4,
  }
  // ⚠ **`state` を渡し忘れないこと。** 1 引数で呼ぶと `facts` が `state` の位置に入り、
  // `renderBearing` は `corpus 未取得` の枝へ落ちる ∴ **掃討は 2 segment しか見なくなり、
  // 数を描く枝を素通りする** —— 実際にそうなっていた。掃討の test が黙って何も掃かなく
  // なるのは、掃討そのものが無いより悪い。
  //
  // ⚠ **痩せの検査は行ごとに置く。** 合計で数えると、片方が 2 segment に落ちても
  // もう片方の 6 segment が閾値を満たしてしまい、**痩せが合計に隠れる**。
  const first = renderSession(input, 'feature/x', now)
  const second = renderBearing('ok', facts)
  assert.equal(first.length, 6, `1 行目が痩せている: ${first.map(strip).join(' / ')}`)
  assert.equal(second.length, 8, `2 行目が痩せている: ${second.map(strip).join(' / ')}`)
  for (const seg of [...first, ...second]) {
    assert.deepEqual(widthUnsafeChars(seg), [], `幅の確定しない文字: ${strip(seg)}`)
    // ⚠ 色名の綴り誤りは色を落とさず、文字列 `undefined` を値の前に置く（`heat` を見よ）。
    assert.ok(!seg.includes('undefined'), `色名が解決していない: ${strip(seg)}`)
  }
})

test('heat —— 閾値の外でも、存在する色だけを返す', () => {
  // ⚠ **これは到達しない枝の検査である。** 呼び手が数を保証しているうちは踏まないが、
  // 踏んだ日に画面へ出るのは色ではなく `undefined` という文字列であり、
  // **「読めなかった」ではなく「壊れて見える」** ∴ 到達しないうちに固定する。
  for (const c of [heat(null, 70, 90), heat(0, 70, 90), heat(75, 70, 90), heat(95, 70, 90)]) {
    assert.equal(typeof c, 'string')
    assert.notEqual(c, 'undefined')
    assert.match(c, /^\x1b\[38;5;\d+m$/)
  }
})

test('resolveCwd —— unit の root は project_dir であって current_dir ではない', () => {
  // ⚠ **agent が `cd` しても unit は動かない。** `resolveUnit` は与えられた root から
  // *下*しか探さない ∴ 作業位置を root と読めば、corpus は在るのに見失う。
  assert.equal(
    resolveCwd({ workspace: { project_dir: '/p', current_dir: '/p/carriers/claude' } }), '/p')
  // project_dir が無い場（古い版など）では、在るものへ順に落ちる。
  assert.equal(resolveCwd({ workspace: { current_dir: '/c' } }), '/c')
  assert.equal(resolveCwd({ cwd: '/x' }), '/x')
  assert.equal(resolveCwd({}, '/fallback'), '/fallback')
})

test('renderSession —— git の項目も決して消さない', () => {
  const input = { model: { display_name: 'Opus 5' } }
  // ⚠ repo を読めなかったときに項目ごと消せば、読み手には「branch が無い」のか
  // 「statusline が壊れた」のか「幅が足りない」のかが区別できない。
  assert.equal(line(renderSession(input, null)), 'Opus 5   git 未検知')
  // ⚠ detached HEAD は「読めなかった」ではない —— 読めた上で branch に居ないのである。
  assert.equal(line(renderSession(input, '')), 'Opus 5   git detached')
  assert.equal(line(renderSession(input, 'main')), 'Opus 5   git main')
})

test('foldRepos —— unit の全 repo を畳む（primary は filter ではない）', () => {
  // ⚠ `lib/unit.mjs` は primary を「表示順であって filter ではない: どの repo も事実を
  // 運び、どの repo の事実も出力される」と定めている。1 つだけ見れば、unit 横断で合算する
  // `bin/aim-facts.mjs` と**同じ画面で数が食い違う**。
  const repo = (n) => ({
    slugs: Array(n).fill('x'),
    backlog: { openTodoNodes: n, awaitingNodes: Array(n).fill({}) },
    working: [], unpushed: [], drift: { intra: [], inter: [] },
  })
  const f = foldRepos([repo(2), repo(3)])
  assert.equal(f.aimCount, 5)
  assert.equal(f.openTodo, 5)
  assert.equal(f.awaiting, 5)
  assert.equal(f.working, 0)
})

test('foldRepos —— 1 つでも採れなければ合計は null', () => {
  // ⚠ 「一部は読めた」は「読めた」ではない —— 3 repo のうち 1 つを読み落とした合計を
  // 数として出せば、それは過少報告である。
  const ok = {
    slugs: ['a'], backlog: { openTodoNodes: 1, awaitingNodes: [] },
    working: [{}], unpushed: [], drift: { intra: [], inter: [] },
  }
  const blind = { ...ok, working: null, backlog: null }
  const f = foldRepos([ok, blind])
  assert.equal(f.aimCount, 2)      // slug は両方から読めている
  assert.equal(f.working, null)    // ⚠ 片方が盲であれば合計は不明
  assert.equal(f.openTodo, null)
  assert.equal(f.unpushed, 0)      // こちらは両方読めている
})

test('foldRepos —— corpus を持つ repo が 1 つも無ければ null', () => {
  assert.equal(foldRepos([]), null)
})

// ── どちらの複製が走っているか ──────────────────────────────────────────────
//
// ⚠ **2026-09-02 に、2 つの複製が同じ問いへ違う答えを出した。** statusline は working tree
// の code で照合記録を読み flag を落としたのに、hook は cache 0.5.0 を走らせて同じ flag を
// 出し続けた。⚠ **食い違い自体は避けられないが、黙って起きることは避けられる。**

test('provenance —— working tree の複製は repo、cache の複製は黙る', () => {
  const project = '/home/someone/works/bearing'
  assert.equal(provenance(`${project}/carriers/claude/bearing/bin`, project), 'repo')
  assert.equal(provenance('/home/someone/.claude/plugins/cache/x/bearing/0.6.0/bin', project), null)
  // ⚠ 黙るのは cache のほうである: 他 project から見れば cache こそ正常な状態であり、
  // 述べるべきは「今見ている事実は、他 project が受け取る版のものではない」のほう。
})

test('provenance —— 材料が欠けたら黙る。推測で repo と言わない', () => {
  assert.equal(provenance('/anywhere/bin', null), null)
  assert.equal(provenance(null, '/home/someone/works/bearing'), null)
})

test('provenance —— 名前が前方一致するだけの別 project を repo と呼ばない', () => {
  // ⚠ `path.sep` を足さずに startsWith すると `bearing-old` が `bearing` の中と判定される。
  assert.equal(provenance('/works/bearing-old/carriers/claude/bearing/bin', '/works/bearing'), null)
})

test('renderBearing —— repo の複製であることは label に出る', () => {
  const facts = { aimCount: 5, openTodo: 0, awaiting: 0, batonUnread: false, working: 0, unpushed: 0, drift: 0 }
  assert.equal(line(renderBearing('ok', facts, 'repo')), 'bearing repo   aim 5')
  assert.deepEqual(widthUnsafeChars(line(renderBearing('ok', facts, 'repo'))), [])
})
