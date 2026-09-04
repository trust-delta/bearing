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
that line and a bump never rots it. ⚠ **It writes user settings only** (the line holds an absolute
path through your home directory, so it is not something a repository can share). If another status
line is already configured it **stops and says so rather than overwriting**. ⚠ **The status line alone needs no restart**: the setting is picked up live.

### Updating

```
claude plugin marketplace update trust-delta
claude plugin update bearing@trust-delta
```

Then **start a fresh session**.

⚠ **Do not count on the startup pull.** Even with `"autoUpdate": true` declared on the
`extraKnownMarketplaces` entry, **there were days it pulled and days it did not** (measured, one
machine) — so run the two commands above when you want an update.

⚠ **If no update arrives, it may simply not be released yet** — the cache is not replaced until
`version` in `plugin.json` goes up.

> **Why it is shaped this way** — why supply splits into two layers (intent and fact), why the law
> lives in `CLAUDE.md`, why attaching stays a human act, and the measurements behind each — is in
> [`docs/aims/bearing.md`](docs/aims/bearing.md) and
> [`docs/aims/ambient-display.md`](docs/aims/ambient-display.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). ⚠ **It is written in Japanese only, and deliberately so.**
Development here happens in Japanese — the aim corpus, the canon and the commit messages are all
Japanese — so a translated contributor guide would hand you the surface while the *intent* behind
each change stayed out of reach. See Language below for the reasoning.

## Language

**The canonical language of this project is Japanese.** That is a means, not a
habit: instructions to an agent are judged to read better in one language than in
two, and that premise has not yet been measured — see
[`docs/aims/native-language.md`](docs/aims/native-language.md). Machine
contracts — fence tags and field names, slugs, identifiers — stay English. The
line is between prose a person reads and tokens a machine parses.

⚠ **The outward English stops at the reading surface.** [`CONTRIBUTING.md`](CONTRIBUTING.md)
is Japanese only and stays that way: development happens in Japanese, and so do the aim corpus, the
canon and every commit message — translating the guide alone would hand you the surface while the
intent behind each change stayed out of reach.

## Status

Early, and honest about it. The discipline grew inside a private project that ran
it on itself for months. The plugin has landed here and runs on the standard
harness — but whether the standard harness plus this plugin is *enough* to develop
with has not been measured yet. That is this project's central open question
([`docs/aims/bearing.md`](docs/aims/bearing.md)).

## Provenance

The discipline grew inside `tmai` (*tactful multi agents interface*), which set
out to build a place for coding agents to run. Two of its three pillars died when
the standard harnesses absorbed the job of being that place. What survived was
never the place — it was the method. This repository is where the method lives now.

**The history was deliberately not carried over.** That project's record is written
throughout on the premise of a role *within that place*, while this repository asks
how the method fares as an external graft — so the concepts were inherited and the
history was not.

## License

MIT. The single source of truth is [`LICENSE`](LICENSE); the copy shipped inside the plugin
is generated from it, and CI fails on divergence.

Copyright (c) 2026 TrustDelta
