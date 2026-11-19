# The Arya Automation Engineer preset

`@aryacode/dsh-engineering` ships one agent preset, **Arya Automation Engineer**, that turns a general
assistant into an engineering one: it names the artifact before touching it, reads before writing, works in
copies, verifies with the vendor engine, and hands back what only a human may do.

The preset adds no tools. Every tool it describes belongs to this bundle and is visible to every session;
the preset is the posture those tools are used with, plus a few settings that suit read-heavy work.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `engineering-preset` — *Arya Automation Engineer preset* |
| Capability class | none — a preset grants no capability |
| Stability | beta, since `v0.76.0` |
| Preset name | **Arya Automation Engineer**, order 6 in the picker (after Arya Claude) |
| Profile pin | `"agentPreset": "arya-automation"` |
| Package / entry | `presets/arya-automation/` → `entries/preset.js` (row `engineering-preset`) |
| Tools | none of its own |
| Full persona | `presets/arya-automation/persona.md` |

Installing the bundle makes the preset available. It previously shipped beside Arya Standard and Arya Qwen
in another package; it moved here because everything it tells an agent to do is a statement about this
bundle's tools.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| `@aryacode/dsh-engineering` installed | 0.101.0 | the preset, and every tool it refers to | no |
| A host that mounts presets | `^0.2.1-rc.3 \|\| ^0.2.2-alpha.2` | the preset picker and `agentPreset` pinning | no |
| A vendor installation behind the work | — | step 4, verify with the vendor engine: Logix Designer, FactoryTalk View Studio, MotionWorks IEC, Optix Studio | yes — without one the answer is "not verified", which is the honest answer |

The preset's own recorded verification is empty. What it is measured on is the row set: one preset, no
tools, and a settings and file layout that may still change as the workflow layer is designed.

The preset does not re-mount the bundle's tool rows. They belong to the installed bundle and are already
visible to every session; mounting them again would double-register them.

## First session

Select **Arya Automation Engineer** from the preset picker, or pin it in the profile with
`"agentPreset": "arya-automation"`. The first turn looks different from a general assistant's because the
preset starts by asking for the artifact instead of guessing it.

```text
Open C:/Projects/Line/Line.L5X, run the checks, and tell me what would fail a review.
```

What you should see, in order:

| Step | What the preset does | What you check |
| --- | --- | --- |
| 1. Point at the work | names the file and asks for the controller revision if the export does not settle it | the answer quotes your path, not a path it invented |
| 2. Read before writing | `open_project`, `project_overview`, then `run_checks` | identifiers in the answer are the ones the tools returned |
| 3. Act in a copy | proposes a draft and an output path; writes nothing until you agree | no source file changed |
| 4. Verify | names the verification the claim needs — a build, a re-export, a compile — and says when one is unavailable | "verified" only appears next to something that ran |
| 5. Hand off | separates what it did from what you must do in Studio | the handoff is named, never implied done |

The engineering ledger is the second thing to check. It is a session projection the preset registers — a
tab recording what was read, checked, written and verified — and it is registered whether or not the
preset is active, so any session using these tools has it.

The four gates are not suggestions, and they are the fastest way to judge whether the preset is working:
it does not write to a running controller, a live HMI or a loaded Optix project unless you name that
target; it does not treat a successful download as proof the logic is right; it does not call two programs
equivalent from a textual diff; and it does not invent an instruction, tag or address.

## What it does

| Area | What the preset changes | Why |
| --- | --- | --- |
| The five-step loop | persona text: point at the work, read before writing, act in a copy, verify with the vendor engine, hand off what is human | each step maps to a failure mode these tools make easy |
| The four gates | persona text | a wrong diff and a wrong download are the two expensive mistakes in this domain |
| Compaction | pre-warm at 65% rather than later, post-turn level 85%, fold at least 6,000 tokens, keep 12,000 tokens of user text | the transcript is mostly quoted tool output; user turns are cheap and worth keeping |
| Tool-result pruner | 16,384 characters kept per result (8,192 head, 2,048 tail) instead of 8,192/4,096/1,024 | "a routine read is not useful truncated to a quarter" |
| Session projection | an engineering ledger tab: what was read, checked, written, verified | a long session needs its own record, not a scrollback |
| Everything else | Arya Standard's definition | the preset is a delta, not a second product |

The row list is the full DSH standard set: scheduling, delegation, ask-user, todo, web, present, and the
conditional host plugin-manager and market rows. The market row stays disabled; the manager row follows
whether the composition provides `profileContext`.

### When billion-context is installed

billion-context ("bili") is a proxy plus plugin bundle that compresses the outgoing request and stands
DSH's own compaction rows down by package name. The Arya engine modules match none of those names, so
without handling the preset would run its summarizer while bili compressed the wire — two compressors on
one request, and bili has already removed `/compact`.

The preset resolves `presets/billion-context.js` **before** it builds its definition. When bili owns the
context lane it writes the `arya-automation-compaction` engine row and disables the `command-compact` row,
leaves the policy row and the tool-result pruner mounted, and touches nothing else. When bili is absent or
off, the definition is exactly as it was.

Two facts must both hold, and neither is a published contract:

- the `biliBasicCompactionPolicy` service exists, and
- `globalThis.__BILI_DSH_COMPACTION_VERDICT__ === 'active'`.

An already-active gate wins even when the profile does not list bili as a bundle. Only when bili is
expected does the resolver wait: 25 ms polls up to 2 s for the service, then up to 500 ms for the verdict.
A timeout, a missing service or an inactive verdict all keep the engine and log one warning — two
compressors is recoverable, a silently missing one is not. `BILLION_CONTEXT_PLUGIN=0`, `BILI_NATIVE_DSH=0`
or a defined `BILI_PROVIDER_REWRITES` return immediately.

The stand-down lives in the definition rather than an `internal/config` overlay because a preset registered
through the host's `agentPresets.register()` is not an entry, so bili's own overlay cannot reach it.

## Limits

- A preset grants no capability. Write tools still refuse from their own entries, and per-call approval
  still lives where controller traffic happens; selecting this preset does not widen any switch.
- A preset cannot make verification happen. Step 4 instructs the agent to run the vendor engine; when the
  engine is not installed, the honest answer is "not verified", and the preset tells it to say so.
- The persona is instruction, not enforcement. The tools' own guards are what stop a write — the loop is
  how the session is meant to work, and a report that skipped it is still possible.
- The compaction and pruner numbers are tuned for read-heavy sessions. They are settings, and a very
  different workload may want different ones.
- The bili stand-down depends on two undocumented contracts. If either changes, the preset falls back to
  its own compaction and logs a warning rather than failing.
- The preset's recorded verification is empty; the settings and file layout may change in a later release.

## Where to go next

- [Getting started](getting-started.md) — install, the first session, and a paste-ready prompt per
  product.
- [Products](products/README.md) — the product pages the preset's loop is written for.
- [Engineering resources](products/resources.md) — the corpus and the profile the preset's authoring step
  consults.
- [Architecture](architecture.md) — how presets, rows and client faces compose.
