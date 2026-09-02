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
list` is the side that reflects it. ⚠ Measured on a single machine (2026-09-03);
the official docs do not yet back it.

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

*Licensing is not yet decided; until it is, all rights are reserved.*
