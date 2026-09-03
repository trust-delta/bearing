// セッションごとの corpus signature —— 「事実が動いた」が何に解決されるか。
//
// 導出元の前提:
//
//   可視化        安い機械検知によって検査対象を可視化する
//   drift の源    「drift の可能性」は検査価値のあるものとして、git 履歴から得られる事実に
//                 基づいて機械的・安価に表面化できる
//   backlog       aim は開発の駆動力であり、エージェントは未実装の手段に注意を払う必要がある
//
// ⚠ **どの前提も「boot 時に」とは言っていない。** SessionStart の composer は snapshot で
// あり、corpus を編集してから作業を続けるセッションは**開始時点で真だった数**を抱えたまま
// である。陳腐化した数は「小さくなった真実」ではない —— **数は、正しくなくなった後も権威に
// 見え続ける**ので、これは「悪いセンサーはセンサーが無いことに劣る」場合そのものである。
//
// ═══ なぜ signature は tool 呼び出しではなく repo を観測するのか ═══════════════
//
// ⚠ **batch が何をしたかから「aim が変わった」を推論してはならない。** 素朴な matcher ——
// `docs/aims/` の path を持つ `Write`/`Edit` —— は、shell の heredoc・`sed -i`・
// `git checkout`・script を通じて行われた編集を**すべて取り落とす**。これは仮定の話では
// ない: この file を書いたセッション自身が、Bash 越しの python heredoc で aim node を編集
// しており、そういう matcher なら黙って飛ばしていた。**間違った扉を見張っていたせいで
// 「何も変わっていない」と報告するセンサーは、`]` の後に ASCII 空白を要求して 44 件中 41 件
// を数え落とした parser と同じ失敗である。**
//
// ∴ **transcript ではなく git に問う。**
//
// ═══ 厳密さとコスト ═════════════════════════════════════════════════════════
//
// この unit で実測（2 repo・77 node）: compose 全体が約 190ms、うち drift だけで約 169ms、
// 安い層（working-delta ＋ backlog）が約 65ms。⚠ **これは model への各要求の前に走る**
// ∴ どちらも払ってはならない。
//
// signature は厳密であると同時に安い: repo ごとに `HEAD` ＋ porcelain の path 集合 ＋
// **porcelain が挙げた path だけ**の内容 hash。dirty でもなく commit でも動いていない内容は
// 変わりようがない ∴ 残りを hash しても何も買えない。

import { createHash } from 'node:crypto'
import os from 'node:os'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readAimSlugs } from './corpus.mjs'
import { runGit } from './git.mjs'
import { parsePorcelainPaths } from './working-delta.mjs'

const DELETED = '<deleted-in-working-tree>'

/**
 * unit 内の全 corpus に対する、安く厳密な指紋。
 *
 * @param {{repos: {root: string, label: string}[]}} unit
 * @returns {Promise<{sig: string|null, heads: Record<string, string|null>}>}
 *   unit のどの repo も corpus を持たないとき `sig` は null —— 規律をまだ採っていない
 *   unit として構造的に正常な状態であり、⚠ **呼び出し側にとっては「空の corpus を報告
 *   する」のではなく「黙る」ための信号である。**
 */
export async function corpusSignature(unit) {
  const parts = []
  const heads = {}
  let any = false

  for (const repo of unit.repos) {
    const slugs = await readAimSlugs(repo.root)
    if (slugs.length === 0) continue
    any = true

    const head = await runGit(repo.root, ['rev-parse', 'HEAD'])
    heads[repo.label] = head?.trim() ?? null
    const status = await runGit(repo.root, ['status', '--porcelain', '--', 'docs/aims/'])
    const dirty = status === null ? new Set() : parsePorcelainPaths(status)

    const files = []
    for (const rel of [...dirty].sort()) {
      let body
      try {
        body = await readFile(path.join(repo.root, rel), 'utf8')
      } catch {
        // working tree で削除されている。その不在は状態の一部であり、専用の token が
        // 「削除された」と「空の file」の衝突を防ぐ。
        body = DELETED
      }
      files.push(`${rel}:${createHash('sha256').update(body).digest('hex').slice(0, 16)}`)
    }

    parts.push(`${repo.label}|${head ?? 'no-head'}|${slugs.length}|${files.join(',')}`)
  }

  if (!any) return { sig: null, heads }
  return { sig: createHash('sha256').update(parts.join('\n')).digest('hex'), heads }
}

/**
 * セッションの baseline signature の在り処。
 *
 * session id を key にしている ∴ 1 つの workspace の 2 つのセッションが互いの baseline を
 * 読むことは決して無い —— それぞれが与えられた boot 時の事実は別物だからである。
 *
 * ⚠ これを消費する hook ではなく `lib/` に置いてある: baseline を播くのは
 * `bin/aim-facts.mjs`、読むのは `bin/corpus-delta.mjs` であり、**一方の bin を他方から
 * import すると、その top-level の hook 本体が実行されてしまう。**
 *
 * @param {string|undefined} sessionId
 * @param {string} [tmpdir]
 */
export function deltaStatePath(sessionId, tmpdir = os.tmpdir()) {
  const safe = String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '') || 'unknown'
  return path.join(tmpdir, `aim-corpus-delta-${safe}.json`)
}

/**
 * working tree の層が**述べるであろうこと**の digest。言い回しにも、どの byte が動いたかにも
 * 依存しない。
 *
 * ⚠ **これが「corpus が動いた」と「事実が変わった」を隔てる門である。** aim の body を
 * 編集すれば signature は動くが、ここでは何も変わらない: node は依然として未 commit で
 * あり、`[todo]` を持つ node の数も同じままである。機械層が担うのは**可視化**であり、
 * ⚠ **batch のたびに自分自身を再度述べる面は、可視であることをやめる。**
 *
 * ⚠ **HEAD は意図して含めていない。** commit の移動は別の問い・別のコスト（履歴 fence）で
 * あり、ここへ畳み込めば**無関係な code の commit がすべて「aim の事実が変わった」ように
 * 見える**ことになる。
 *
 * @param {{label: string, working?: object[], backlog?: object}[]} repos
 * @returns {string}
 */
export function factsDigest(repos) {
  const norm = (repos ?? [])
    .map((r) => ({
      label: r.label,
      // ⚠ **`unavailable` は clean な tree と同じ hash になってはならない。** 第 2 の門が
      // 問うのは「事実が何か違うことを*述べる*か」であり、**見る能力を失ったことは、
      // 述べるべきことの不在ではなく、別の述べるべきことである。**
      working:
        r.working == null
          ? 'unavailable'
          : r.working
              .map((w) => [w.slug, !!w.uncommitted, !!w.uncommittedAnchorChange, !!w.untracked])
              .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      openTodo: r.backlog?.openTodoNodes ?? 0,
      // ⚠ **escalation は数ではなく slug で digest に入れる。** 数だけを入れると、**1 つが
      // 片付き別の 1 つが生まれた**セッション —— 判断待ちの中身が入れ替わったのに総数は
      // 動かない経路 —— で第 2 の門が「事実は変わっていない」と判定して黙る。⚠ **これは
      // 観測待ちを digest へ入れたときと同じ理由であり、同じ罠である。**
      escalation: [...(r.backlog?.escalationNodes ?? [])].sort(),
      escalationEmpty: [...(r.backlog?.escalationEmptyNodes ?? [])].sort(),
      unknown: [...(r.backlog?.unknownNodes ?? [])].sort(),
      // ⚠ **観測待ちも digest に入れる。** 入れなければ、最後の `[todo]` が `[done]` に
      // なった瞬間 —— **体制が人間へ番を渡すまさにその瞬間** —— を第 2 の門が「事実は
      // 変わっていない」と判定して黙る。open-todo の数は 1 減るので実際には気づけるが、
      // それに依存すると、**数が変わらない経路**（1 つが done になり別の 1 つに todo が
      // 増える）で黙ることになる。
      awaiting: [...(r.backlog?.awaitingNodes ?? [])]
        .map((a) => [a.slug, a.doneMarks, a.state])
        .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)),
      anomalies: (r.backlog?.anomalies ?? [])
        .map((a) => [a.slug, a.kind, a.no, a.line])
        .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)),
    }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
  return createHash('sha256').update(JSON.stringify(norm)).digest('hex')
}
