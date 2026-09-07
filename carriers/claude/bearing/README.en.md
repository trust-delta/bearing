# bearing — a Claude Code plugin

> **This is a translation.** The canonical README is Japanese: [README.md](README.md).
> Where the two disagree, the Japanese one is right.

Carries a purpose the human fixed into every session, and keeps it there.

**What this plugin emits, and the canon it bundles, are in Japanese.** Fence tags
and field names (`bearing-drift-intra v1`, `slug | anchor_commit | …`) are a
machine contract and stay English, as do values and slugs. The line is between
prose a person reads and tokens a machine parses.

Install from the marketplace in this repository:

```
/plugin marketplace add trust-delta/bearing
/plugin install bearing@trust-delta
```

Or non-interactively, adding the marketplace for one project only:

```
claude plugin marketplace add https://github.com/trust-delta/bearing.git --scope project
claude plugin install bearing@trust-delta
```

Requires Node. There is no build step, no daemon and no server — the hooks are
`node` invocations over files and `git`.

## What it does, and when

| hook | when | what |
| --- | --- | --- |
| `SessionStart` | a session opens | injects the frame, the outstanding baton, per-repo corpus fences, the open-todo and escalation counts |
| `UserPromptSubmit` | once, before the first turn acts | states the baton's reading procedure — a `SessionStart` hook's output is context, and context is not a turn, so nothing else guarantees the ritual runs |
| `PostToolBatch` | the corpus moved under the session | re-states only the facts that actually changed |
| `PreCompact` | auto-compaction is about to happen | stops it **once**, so a baton can be authored instead of the context being dropped unchosen |

⚠ `PreCompact` never blocks a compaction a human asked for. Overriding a person's
own act with a ritual meant to serve them is the inversion this refuses.

One skill ships with it: `/bearing:handoff` (`r` to read, `w` to write) — ⚠ **two aliases carry the argument in the name** so they can be picked straight from the suggestion list: `/bearing:handoff-r` and `/bearing:handoff-w` (**they hold no procedure — they just call the skill with the argument**). ⚠ **The aim discipline is
not a plugin skill** — `/bearing:setup-aim` places it under the adopting project's `.claude/skills/aim/`
as a project skill, and from then on it belongs to that repo.

### aim is opt-in per project

The handoff skills and the status line's first row are useful in any
project, but the aim discipline presumes a corpus — so in a repo that has
not opted in, the SessionStart hook emits **not one byte** (except an unread
baton, which is handoff, not aim). Once, in a project that wants it:

```
/bearing:setup-aim
```

That inserts a marker-delimited block of the law at the end of the
project-root `CLAUDE.md`, and the aim skill under `.claude/skills/aim/`
(`--check`, `--remove` and `--update` are there too). **The block and the
skill are one pair** (human decision, 2026-09-07): update both or keep both,
and which one it is belongs to the side using aim — a version bump may
require rewriting the aim nodes already in hand. So if the placed skill does
not match the shipped canon, the command asks the stamp — one frontmatter
line in `SKILL.md` carrying the version and a fingerprint of all three files.
If the stamp points at what is there now, this repo has not touched it and
running the command is enough; if there is no stamp or it disagrees, the
command stops without touching the block either, and `--update` says the copy
may be discarded. The stamp lives in frontmatter, so it costs the consumer's
context nothing (measured 2026-09-07, Claude Code 2.1.263, one machine). The
markers are HTML comments, which the docs state are stripped before the
content is injected — so they cost no context. The hook reads them: if the
block is stale it says so, and if a human edited the block it stops instead
of rewriting it.

A corpus is not enough: without the marker the machinery stays silent
(on 2026-09-05 the corpus was dropped from the predicate — `isEngaged` in
`lib/claude-md.mjs` reads `adopted` alone). Having a corpus is evidence of
use, not a declaration that this machinery is wanted. The one exception is
the statusline's second line, which reports `aim 未採用` and `corpus N`
when it finds a corpus.

Where the corpus lives is configurable with `--dir` (default `docs/aims/`):
`/bearing:setup-aim --dir proj/aims`. The declaration rides in the marker, so
it is the same declaration as opting in, and a missing `dir=` means the
default. Re-running with no arguments keeps whatever the block declares, so a
version update never relocates a corpus.

## What it refuses to do

**It does not judge.** The machine layer makes candidates visible; grading them
is an agent's job and deciding them is the human's. A fence reports what git
says and stops there.

**It does not fabricate.** When git cannot be read, every fence says so in those
words rather than rendering an empty result that reads as "clean". A sensor that
is wrong with confidence is worse than no sensor, and an empty fence and an
unavailable one are different facts.

**It does not touch `aim:`, `parent:` or `state:`.** Those are the human's. The
agent maintains the body, proposes changes to any purpose, and escalates.

## License

MIT — see [`LICENSE`](LICENSE) next to this file. This is not a duplicate but part of the
distribution: only the carrier subtree is copied into the plugin cache, so the repository
root's `LICENSE` never reaches you. CI checks that the two match.

Copyright (c) 2026 TrustDelta
