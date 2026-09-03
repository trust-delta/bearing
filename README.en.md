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

## Language

**The canonical language of this project is Japanese.** That is a means, not a
habit: instructions to an agent are judged to read better in one language than in
two, and that premise has not yet been measured — see
[`docs/aims/native-language.md`](docs/aims/native-language.md). Machine
contracts — fence tags and field names, slugs, identifiers — stay English. The
line is between prose a person reads and tokens a machine parses.

## Development

**Install the hook once per clone:**

```
git config core.hooksPath .githooks
```

The rule for pushing to `main` is: **documentation may be pushed directly; anything
containing code needs a pull request.** The decision lives in exactly one place,
`scripts/classify-paths.mjs`, and both the pre-push hook and the `push-policy`
workflow call it — two implementations would drift apart, and silently.

**GitHub cannot enforce this conditionally.** The *push ruleset* — the only rule
that can reject a push by path — is refused for this repository because it is
public and user-owned (measured 2026-09-01). So enforcement is two layers, and
neither is complete on its own:

| | what it does | can it be bypassed |
| --- | --- | --- |
| `.githooks/pre-push` | stops the act **as it happens** | yes, `--no-verify` — and it does not exist at all in a clone that skipped the config above |
| `.github/workflows/push-policy.yml` | leaves a violation **red and permanent** | no — but it cannot prevent anything |

That the hook can be bypassed is deliberate, not a defect: bending the rule is the
human's call, and a tool must not take that away. The bypass shows up in CI.

CI fails on two things only: the **tests**, and the **carriers being in sync**
with their canonical sources. The language measurement (`scripts/lang-report.mjs`)
reports and never fails — the premise behind
[`native-language`](docs/aims/native-language.md) has not been measured yet, so
making it a hard gate would be premature.

### Distribution — pushing alone reaches nobody

There are three gates, two on the receiving side and one on the publishing
side (docs plus measurement, 2026-09-01 / 09-03):

| gate | who clears it |
| --- | --- |
| a marketplace clone is never pulled automatically at startup | **the receiving side** — declare `"autoUpdate": true` on the `extraKnownMarketplaces` entry, or run `/plugin marketplace update trust-delta` → `/plugin update bearing` → restart |
| the cache is not replaced unless `plugin.json` raises `version` | **the publishing side** — bump it on every release. Forget it and nothing the receiver does will help |
| a tracked declaration **enables but never installs** — with no record in `installed_plugins.json`, not one piece of the plugin loads | **the receiving side** — run `claude plugin install bearing@trust-delta --scope project` once. ⚠ that file is machine-local and untracked, so **git holds the intent to load it, never the fact that it is loaded** |

The second gate exists only because this repository declares a `version` at all;
omitting the field falls back to a commit-derived one, and pushing would suffice.
Keeping the declaration makes the bump *part of* a release — forget it and the
change lands silently, reaching no one.

⚠ The third gate sits ahead of the other two, and it is the only one whose
failure says nothing on screen. Without the record not one skill and not one
hook runs, yet **a mechanism that is not loaded cannot report its own absence** —
nothing shows in the statusline or the fences, and even `/plugin update` stays
silent. ⚠ `claude plugin details` lists the version, the skills and the hooks
with no record present, so it is never evidence of being loaded — `claude plugin
list` is the side that reflects it. ⚠ The *silence* is measured on a single
machine (2026-09-03); the gate itself the docs back, as below.

#### Intent and fact — a plugin is decided in two layers

| layer | where it lives | tracked? | what it says |
| --- | --- | --- | --- |
| **intent** | `enabledPlugins` and `extraKnownMarketplaces` in `settings.json` (user / project / local) | **tracked** at project scope | which plugins should load, and where the marketplace is |
| **fact** | the record in `~/.claude/plugins/installed_plugins.json` (`scope` / `projectPath` / `installPath` / `version`) plus what is in the cache | **untracked, machine-local** | what is actually loaded, at which version, from where |

⚠ **`enabledPlugins` is a load switch, not an install** — the docs call it
"necessary but not sufficient" and say it "alone doesn't install a plugin". So a
declaration with no record means the plugin is *wanted*, not loaded. **Git holds
the intent; the fact of being loaded lives only on the untracked side** — and the
two can diverge in silence.

⚠ **`--scope` is the scope of the install, not merely of the declaration.** There
are three (user / project / local): a project-scoped record only counts inside
its `projectPath`, a user-scoped one counts everywhere, and **the same plugin can
hold records in both** — so "is it loaded" is not answerable from the plugin name
alone, only from the plugin name *and the project you are asking from*.

⚠ **The docs say a declaration in project settings installs with no separate
prompt once the folder is trusted; that did not reproduce here.** Measured in an
isolated config (2026-09-03, one machine): a **fresh clone that was already
trusted**, carrying the tracked declaration, registered no marketplace and
produced neither cache nor record simply by starting a session. ⚠ **Only
non-interactive (`-p`) sessions were measured**, so what happens *at the moment
the trust dialog is accepted* is **still untested** — that path needs a human at
an interactive first run. This README therefore assumes the receiving side runs
the install once.

### Attaching the status line — the human writes one line, but not a path

⚠ A plugin cannot declare a `statusLine` key (a plugin root's settings may only carry `agent`
and `subagentStatusLine`), so **attaching stays a human act.** ⚠ And a plugin's `bin/` is not on
the status line's `PATH` — the `PATH` the docs mean is **the Bash tool's**, which measurement
confirmed — so **there is no bare command name to call.**

One command does the attaching:

```
/bearing:statusline-setup
```

It drops a thin shim at `~/.claude/bearing-statusline.mjs` and writes one line into
`~/.claude/settings.json`. ⚠ **The shim reads the install record on every run and bridges to
whichever version is loaded**, so **the line carries no version and does not rot on a bump** —
the cache never deletes old versions, so a versioned path written directly keeps silently
drawing the old one.

⚠ **It writes user settings only.** An absolute path contains a home directory, so writing it
into tracked project settings would commit a surface that breaks silently for everybody else.
If a different status line is already configured it **says so and stops** rather than
overwriting (`--force` to replace, `--uninstall` to remove).

⚠ **This repository points at its own working tree from tracked project settings.** That is not
a duplicate: that line draws from a bare clone even when bearing is not installed at all, and
project settings win over user settings.

⚠ **When nothing is loaded, the shim says so.** With no record not one piece of the plugin is
loaded, and **a mechanism that is not loaded cannot report its own absence** — but the shim
lives outside the plugin, so it runs anyway and can say it.

### aim is opt-in per project — so the rest can load everywhere

bearing is not one unit. The two handoff skills and the status line's first
row depend on nothing under `docs/aims/` and are useful in **any** project,
while the aim discipline presumes a corpus and **gets in the way in a repo
that has not adopted it**. So the plugin itself can be installed at user
scope for every project, and only the aim discipline is opted into per
project:

```
/bearing:with-aim
```

That inserts a marker-delimited block of the law at the **end** of the
project-root `CLAUDE.md` (`--check` reports state only, `--remove` takes it
out).

Where the corpus lives is the project's call. The default is `docs/aims/`,
and `--dir` changes it:

```
/bearing:with-aim --dir proj/aims
```

The default itself never moves — moving it would make every existing corpus
vanish at once. The declaration rides in the marker, so it is the same single
declaration as opting in (no `dir=` means the default, so blocks written
before this existed keep working untouched). Globs are refused: the value is
handed to git as a pathspec, colliding slugs break `parent:` and `[[link]]`
resolution, and "there is no corpus" stops being distinguishable from "we were
looking somewhere else". Re-running without arguments keeps whatever the block
already declares, so updating the version never silently relocates a corpus.

Why `CLAUDE.md` rather than a hook: a SessionStart hook's output is
summarized away with the conversation on compaction ("Context that hooks
added earlier — Summarized with the rest of the conversation"), whereas the
project-root `CLAUDE.md` is re-injected from disk. `CLAUDE.md` also loads
into subagents (only the built-in Explore and Plan agents skip it), while the
subagent lifecycle the docs name is `SubagentStart` / `SubagentStop`. Neither
is "stronger" — the docs call both context rather than enforced
configuration, and neither lands in the system prompt. The difference is
position and persistence, and that is what decides the layer: the static law
goes in `CLAUDE.md`, the facts that only exist at runtime stay in the hook.

The markers are HTML comments. The docs state that block-level HTML comments
in `CLAUDE.md` are stripped before the content is injected, so carrying an
identifier, a version and a body hash costs no context at all — and a human
still sees them when opening the file.

Because the marker carries the body hash, two different things can be told
apart: the block is **stale**, or a **human edited it**. In the second case
nothing is rewritten — what a rewrite would erase is that edit. The same
holds when the markers are broken (one side only, unreadable, or two pairs).

The marker is also the opt-in declaration. The hook reads it and emits **not
one byte** in a repo that has not opted in — except for an unread baton,
which is handoff, not aim, and is useful anywhere. A repo that already has a
corpus keeps speaking without a marker: the marker arrived later, and a repo
already writing nodes is not silenced for lacking one.

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
