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

Three skills ship with it: `/bearing:aim`, `/bearing:handoff-r`,
`/bearing:handoff-w`.

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

MIT — see [`LICENSE`](LICENSE) next to this file. That file is a generated artifact:
`gen/claude-plugin.sh` copies it from the repository root.

Copyright (c) 2026 TrustDelta
