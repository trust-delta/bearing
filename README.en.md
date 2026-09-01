# bearing

> **This is a translation.** The canonical README is Japanese: [README.md](README.md).
> Where the two disagree, the Japanese one is right. Why the project is
> Japanese-first is stated in [`docs/aims/operator-language.md`](docs/aims/operator-language.md).

**A bearing is two things at once: the direction you are heading, and the load you carry.**
This carries both into an AI coding session — and keeps them there across sessions,
across machines, and across the moment the context window fills up.

> **The purpose this serves.** *Supply no place of your own; accept the general-purpose
> harness as the vessel, and graft onto it only what that harness cannot have — the
> machinery that carries a purpose the human fixed, and protects the attention budget.*

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
[`docs/aims/operator-language.md`](docs/aims/operator-language.md). Machine
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
operator's call, and a tool must not take that away. The bypass shows up in CI.

CI fails on two things only: the **123 tests**, and the **carriers being in sync**
with their canonical sources. The language measurement (`scripts/lang-report.mjs`)
reports and never fails — the premise behind
[`operator-language`](docs/aims/operator-language.md) has not been measured yet, so
making it a hard gate would be premature.

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
