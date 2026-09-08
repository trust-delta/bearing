# Before you adopt — what is asked of you, and what stays your act

> **This is a translation.** The canonical page is Japanese: [adoption.md](adoption.md).
> Where the two disagree, the Japanese one is right.

This page is for **deciding whether to adopt bearing**. The install and usage steps live in
[`README.en.md`](../README.en.md). What this page states is the **contract** — **what gets
placed in your repository if you adopt, and which acts stay yours afterwards.**

## What bearing is aiming at

What coding harnesses do not have is a durable answer to the questions that **outlive a
session** — "what is this for", "what did we decide and why", "has the code drifted from the
reason it was written". bearing grafts three mechanisms onto that gap: **aim** (a tree of
purposes and means), **handoff** (a baton authored *before* compaction), and **drift** (cheap
mechanical surfacing of divergence). ⚠ **It replaces no harness and adds no place for
anything to run.** The table of what each does is in [`README.en.md`](../README.en.md), under
"Three mechanisms".

🔴 **And all of it stands on one asymmetry** — **pinning a purpose, and declaring a purpose
achieved, are the human's acts.** The agent maintains the tree, proposes means, and implements
them. **But "what is this for" and "has it been satisfied" are not handed over.** ⚠ **This is
not a setting; it is the shape of the mechanism itself** — every requirement and every
remaining act below follows from it.

## What gets placed if you adopt

⚠ **Only three things stay in the repository.** Everything else is placed under your home
directory, and nothing is written into the repository at all.

| What you run | Where it lands | What |
| --- | --- | --- |
| `claude plugin install` | `~/.claude/plugins/` | The plugin itself. ⚠ **Nothing stays in the repository** |
| `/bearing:setup-aim` | **your repo's `CLAUDE.md`, at the end** | The law block (the invariants the agent is held to). Its marker is an HTML comment ∴ **it costs zero context tokens** |
| ditto | **your repo's `.claude/skills/aim/`** | The aim skill. ⚠ **Yours from the moment it is placed** — whether to track it, fix it, or leave it old is your call |
| (you write them) | **your repo's `docs/aims/`** | The aim nodes themselves. `--dir` declares a different location |
| `/bearing:setup-statusline` | `~/.claude/` and one line in user settings | The statusline. ⚠ **Nothing is written to the project** |
| `/bearing:setup-surface` | `~/.claude/bearing-aim.html` | One page for reading the tree in a browser |
| `/bearing:handoff-w` | `~/.bearing/units/<unit>/` | The baton. ⚠ **Outside the repository** (`BEARING_HOME` moves it) |

⚠ **In a repository that has not adopted aim, the hooks emit zero bytes.** Without the law
block they stay silent — **even if a corpus is present.** Using something is not a declaration
that you want this mechanism engaged. (The one exception is an unread baton; handoff does not
depend on aim.)

⚠ **Removal is provided as fully as placement** — `/bearing:setup-aim --remove` takes the
block out (the skill stays; once placed it is yours). `/bearing:setup-statusline --uninstall`
removes the line. **The corpus you wrote stays in your repository** — it was never the
plugin's property.

## Which acts stay yours afterwards

⚠ **This is not a list of things you may do.** 🔴 Each is something **the agent cannot do for
you**, and if you do not do it, **nobody does**. **The mechanism will prompt; it will not
substitute.**

1. **Pin `aim:`** — the purpose, in one sentence. ⚠ **The agent never rewrites it.** It will
   propose candidates when it thinks the purpose should move, **but confirming is your act.**
2. **Decide `parent:`** — where that purpose sits in the tree.
3. **Declare `state:`** — `open` / `done` / `dead`. 🔴 **Even when the agent has exhausted its
   `[todo]`s, that means "implemented", not "the purpose is satisfied".** ⚠ **Only you can say
   the latter.**
4. **Answer `# ESCALATION`** — only "cannot proceed on a Go alone" points are written there.
   ⚠ **Until you answer, that node moves for nobody.**
5. **Read the `# OBSERVATION` ballots** — the agent writes down what one would have to see for
   the aim to count as satisfied. ⚠ **Seeing it is yours.**
6. **Run handoff** — `/bearing:handoff-w` (author) and `/bearing:handoff-r` (read).
   ⚠ **The model cannot invoke them** (archiving a baton cannot be undone) ∴ **you always run them.**
7. **Take updates** — `claude plugin update`, plus `/bearing:setup-aim --update` to realign
   what was placed. ⚠ **Some surfaces say nothing when they fall behind** ∴ updating is an
   explicit act.

## What an aim node looks like

**One purpose is one file.** `docs/aims/<slug>.md`:

```markdown
---
aim: <the purpose in one sentence. Yours. The agent does not rewrite it>
parent: <the parent slug. Omitted at the root>
state: open
---

# IS
<how the agent read the aim, and which means it chose>

# PROCESS
- [done] <a means that has been implemented>
- [todo] <a means still to implement>
```

⚠ **A node may be born with just this.** The other sections are added when they are needed.

**What the sections separate is not kinds of content — it is whose turn it is.**

| Section | What goes in it | Whose turn |
| --- | --- | --- |
| `# IS` | The means the agent chose, and why | The surface where **you check that it is sound** |
| `# PROCESS` | `[done]` / `[todo]` — **implemented or not**, nothing else | The agent |
| `# ESCALATION` | Points that cannot move on a Go alone | **You** — nobody proceeds until you answer |
| `# OBSERVATION` | What one would have to see for this to count as satisfied | **You** — the seeing is yours |
| `# HISTORY` | Means that were abandoned, with reasons | So the same ditch is not walked twice |
| `# DAG` | Dependencies the tree cannot reach, and reconciliations found to need no change | The agent |

🔴 **`[todo]` and `# OBSERVATION` are mirror images.** A `[todo]` may only hold **what the
agent can confirm complete on its own**; `# OBSERVATION` may only hold **what the agent cannot
confirm**. ∴ ⚠ **"measure whether one cycle is enough" is not a `[todo]`** — its subject is
you. **It splits into a `[todo]` ("make it measurable") and a ballot ("what to look at").**

⚠ **∴ where something is written decides who it reaches.** Burying a pending decision in the
prose of `# IS` **is choosing for it not to arrive.**

🔴 **And `[done]` does not mean "satisfied".** It is ***the fact that something was
implemented***, and the agent may flip it itself. ⚠ **Saying it is satisfied is `state:`, and
that is your act.**

**The real thing**: [`docs/aims/`](aims/) — [`bearing.md`](aims/bearing.md) is the root, and
following `parent:` from there gives you the tree.

## The numbers on screen count turns, not volume

With the statusline installed, the second line reads:

```
bearing   aim <n>   todo <n>   宣言待ち <n>   escalation <n>
```

| Number | What it counts | Whose turn |
| --- | --- | --- |
| `aim` | Nodes in the corpus | —— |
| `todo` | Nodes holding at least one `[todo]` | **The agent** |
| `宣言待ち` (awaiting declaration) | Nodes whose marks are all `[done]` ＝ **the agent is spent** | **You** — the `state:` declaration |
| `escalation` | Nodes with content under `# ESCALATION` | **You** — the judgement itself |
| `観測票なし` (no ballots) | Nodes awaiting declaration with zero `# OBSERVATION` ballots | ⚠ **Zero when healthy** |

⚠ **A zero is not drawn.** Width is the scarcest budget here, and a zero means "no turn has
been handed over", not "there is no fact". (A `?` means the fact **could not be read** — it is
not a zero.)

🔴 **Read `todo` / `宣言待ち` / `escalation` together.** **Only when all three are zero** has
nothing been handed to either the agent or you. ⚠ **Never read two of them** — a node with
`# ESCALATION` sits at **zero `todo` and zero awaiting**, stopped at you.

⚠ **`宣言待ち` at zero does not mean "nothing to do"; it means "no turn has come to you yet".**
And 🔴 **what stands in `宣言待ち` is not a list of finished aims** — **only that the agent's
side is spent. Whether they are satisfied is yours alone to say, and this number never
presumes it.**

🔴 **`観測票なし` is the one number that, when it appears, indicts the mechanism.** It counts
nodes that **hand you a turn while handing you nothing to look at** ∴ ⚠ **you are not the one
who overlooked something.**

⚠ **The surface says nothing beyond this.** 🔴 **It does not say which is heavier or what to
clear first** — **allocating attention is judgement, not observation, and it is your act.**

(The same line also shows `baton 未読` / `未commit` / `未push` / `drift`. Those are facts about
git, not about the corpus.)

## What is not asked of you

- **Learning the whole authoring discipline** — not required. ⚠ **The agent writes the body.**
  Three frontmatter lines (`aim:` / `parent:` / `state:`) are all you touch.
- **Designing the tree up front** — not required. ⚠ **A node may be born with a purpose and a
  parent, and have its body added later.** The tree **accretes backwards from verification**;
  a specification does not come first and drive it.
- **Adopting all of it** — not required. ⚠ **handoff does not depend on aim** ∴ you can use the
  baton alone. The statusline and the browser surface install independently too.

## The shape this assumes

⚠ **One human, working with one session at a time.** This is not modesty about scale; it is
**the condition under which the mechanism holds** — "the purpose belongs to the human" and
"escalate to the human when in doubt" fit in one sentence each **only because there is no
question of which human**. 🔴 **If several people use it, that project must decide and write
down who pins `aim:` and who declares `state:`.** ⚠ **The tool will not decide it for you.**

## See the real thing

This repository is itself driven by aim. **[`docs/aims/`](aims/) is that corpus — the contract
written here, in force** — the one-sentence purposes, the means the agent wrote, the nodes
stopped at a human declaration. ⚠ **These are not fabricated examples.**
