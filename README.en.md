# bearing

> **This is a translation.** The canonical README is Japanese: [README.md](README.md).
> Where the two disagree, the Japanese one is right. Why the project is
> Japanese-first is stated in [`docs/aims/native-language.md`](docs/aims/native-language.md).

**A bearing is two things at once: the direction you are heading, and the load you carry.**
This carries both into an AI coding session — and keeps them there across sessions,
across machines, and across the moment the context window fills up.

> **The purpose this serves.** *Supply no place of your own; accept the general-purpose
> harness as the vessel, and graft onto it only what that harness cannot have — the
> machinery that carries a purpose the human fixed, and protects the attention budget.*

**This is built for solo development** — one person working with one session, what
people now call vibe coding. That is not modesty about scale; it is the condition
the machinery rests on. "The purpose belongs to the human" and "escalate to the
human when in doubt" fit in one sentence each precisely because *which* human is
never in question. Used on a project with several people, that project has to
decide and write down who pins a purpose and who declares it achieved.

Coding harnesses got good. What they still do not have is a durable answer to
*what is this for*, *what did we decide and why*, and *has the code drifted away
from the reason it was written*. Those questions outlive a session. A session does not.

## Three mechanisms

| | what it does |
| --- | --- |
| **aim** | A tree of purpose-and-means, one file per purpose. The `aim:` line is the human's, and the agent may not rewrite it. |
| **handoff** | A baton authored before the context is compacted, so what carries forward is *chosen* rather than whatever survived truncation. |
| **drift** | Cheap machine detection of purposes whose body has moved away from the purpose it claims to serve, or away from its neighbours. It makes candidates visible. It does not judge them. |

## What this is not

Not an agent framework, not a server, not a wrapper. It adds no place for
anything to run. It is a plugin, some Markdown, and a few hundred lines of Node
that ask git questions.

**The régime it enforces is against the agent, not for it.** The agent maintains
the tree and may propose changes to any purpose — but pinning a purpose, and
declaring one achieved, are the human's acts. That asymmetry is the whole point.

## Usage

### Install — once, at user scope

```
claude plugin marketplace add https://github.com/trust-delta/bearing.git --scope user
claude plugin install bearing@trust-delta --scope user
```

Then **start a fresh session** — the skill and hook inventories are fixed when a session starts.

⚠ **Declaring `enabledPlugins` is not the same as loading it.** With no record in
`installed_plugins.json`, not one skill or hook runs — and ⚠ **a mechanism that is not loaded
cannot report its own absence**, so nothing appears on screen. **`claude plugin list` is what
shows whether it is loaded**; `claude plugin details` enumerates versions, skills and hooks even
with no record at all, so it is no evidence.

### Adopting aim — opt-in per project

```
/bearing:with-aim                    # place the law block at the end of CLAUDE.md
/bearing:with-aim --check            # report the state only
/bearing:with-aim --remove           # take it out
/bearing:with-aim --dir proj/aims    # declare where the corpus lives (default docs/aims)
```

⚠ **The marker is an HTML comment, so it costs the consumer's context nothing.** It carries the
version and a hash of the body, so `--check` tells **"the version is old" apart from "a human
edited the block"** — in the second case it stops and says so instead of replacing it.

⚠ **In a project that has not opted in the hooks emit zero bytes** (one exception: an unread
baton — handoff does not depend on aim). ⚠ **A project that already has a corpus keeps speaking
even without the marker.**

### Attaching the surface

```
/bearing:statusline-setup            # attach (--force to replace, --uninstall to remove)
```

It drops a thin shim into `~/.claude/` and writes one line into user settings. ⚠ **The shim reads
the install record on every run and bridges to the current version**, so no version is baked into
that line and a bump never rots it. ⚠ **It writes user settings only** — an absolute path contains
the home directory, so writing it into tracked project settings would commit a surface that breaks
silently for everybody else. If another status line is already configured it **stops and says so
rather than overwriting**. ⚠ **The status line alone needs no restart**: the setting is picked up live.

### Updating

```
claude plugin marketplace update trust-delta
claude plugin update bearing@trust-delta
```

Then **start a fresh session**. ⚠ Declaring `"autoUpdate": true` on the `extraKnownMarketplaces`
entry is supposed to pull at startup — but **two measurements disagree**: the same declaration went
two days without a single pull, and on another day pulled 11 commits on its own. **Do not read the
row as "declare it and it always happens".**

⚠ **Until the publishing side raises `version` in `plugin.json`, nothing the receiving side does
replaces the cache.**

> **Why it is shaped this way** — why supply splits into two layers (intent and fact), why the law
> lives in `CLAUDE.md`, why attaching stays a human act, and the measurements behind each — is in
> [`docs/aims/bearing.md`](docs/aims/bearing.md) and
> [`docs/aims/ambient-display.md`](docs/aims/ambient-display.md).

## Development

**Run this once per clone:**

```
git config core.hooksPath .githooks
```

⚠ **This repository carries no tracked `.claude/settings.json`**, so **a bare clone loads no
skill, no hook and no surface at all** — run the Usage steps above once.

⚠ **What runs while you develop is the code in front of you.** The marketplace points at this
repository's own remote, so the cache holds the **pushed** version — but every `bin` entry in the
cache delegates to the working tree once `CLAUDE_PROJECT_DIR` shows it is inside a bearing
checkout. Hooks and the status line take that same single route. ⚠ The delegation itself lives in
the cached copy, so the version gate still bites when that shim changes. (To run the working tree
without installing anything: `claude --plugin-dir ./carriers/claude/bearing`.)

### The push rule

**Documentation may be pushed directly; anything containing code needs a pull request.** The
decision lives in exactly one place, `scripts/classify-paths.mjs`, and both the pre-push hook and
the `push-policy` workflow call it — two implementations would drift apart, and silently.

⚠ **GitHub cannot enforce this conditionally.** The *push ruleset* — the only rule that can reject
a push by path — is refused for this repository because it is public and user-owned (measured
2026-09-01). So enforcement is two layers, and neither is complete on its own:

| | what it does | can it be bypassed |
| --- | --- | --- |
| `.githooks/pre-push` | stops the act **as it happens** | yes, `--no-verify` — and it does not exist at all in a clone that skipped the config above |
| `.github/workflows/push-policy.yml` | leaves a violation **red and permanent** | no — but it cannot prevent anything |

That the hook can be bypassed is deliberate, not a defect: bending the rule is the human's call,
and a tool must not take that away. The bypass shows up in CI.

### Gates

CI fails on two things only: the **tests**, and the **carriers being in sync** with their canonical
sources. The language measurement reports and never fails —
[`native-language`](docs/aims/native-language.md) has not been measured yet, so making it a hard
gate would be premature.

```
node --test carriers/claude/bearing/test/*.test.mjs   # tests
bash gen/claude-plugin.sh --plugin                    # regenerate the carriers
node scripts/lang-report.mjs                          # language measurement (never fails)
```

### Releasing

⚠ **Unless `version` in `plugin.json` goes up, a change lands quietly and reaches nobody**, so the
bump is part of the release. ⚠ `claude plugin validate <path>` works as a gate whenever the
manifest is touched.

> What supply has cost us — intent and fact disagreeing for a whole day, the contradictory
> `autoUpdate` measurements, a record appearing without anyone running install — is in
> [`docs/aims/bearing.md`](docs/aims/bearing.md).

## Language

**The canonical language of this project is Japanese.** That is a means, not a
habit: instructions to an agent are judged to read better in one language than in
two, and that premise has not yet been measured — see
[`docs/aims/native-language.md`](docs/aims/native-language.md). Machine
contracts — fence tags and field names, slugs, identifiers — stay English. The
line is between prose a person reads and tokens a machine parses.

## Status

Early, and honest about it. The discipline grew inside a private project that ran
it on itself for months. The plugin has landed here and runs on the standard
harness — but whether the standard harness plus this plugin is *enough* to develop
with has not been measured yet. That is the root node's central open question.

**The history was deliberately not carried over.** The three mechanisms grew
inside `tmai`, whose history is written throughout on the premise of a role
*within that place*. This repository asks a different question — how the method
fares as an external graft — so the concepts were inherited and the history was
not.

## Provenance

The discipline grew inside `tmai` (*tactful multi agents interface*), which set
out to build a place for coding agents to run. Two of its three pillars died when
the standard harnesses absorbed the job of being that place. What survived was
never the place — it was the method. This repository is where the method lives now.

## License

MIT. The single source of truth is [`LICENSE`](LICENSE); the copy inside the plugin is a
generated artifact (`gen/claude-plugin.sh`) and CI fails on divergence — the marketplace
entry sources `./carriers/claude/bearing`, so the root LICENSE never reaches a consumer’s
cache (measured). That copy is not duplication; it is part of what ships.

Copyright (c) 2026 TrustDelta
