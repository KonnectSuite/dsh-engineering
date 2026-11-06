# The Arya Automation Engineer preset

The agent this bundle is for. Installing `@aryacode/dsh-engineering` is what makes it available; it used to ship with
`@aryacode/dsh-aryacode-polish`, beside the Arya Standard and Arya Qwen presets, and moved here because everything it
tells the agent to do is a statement about **this** bundle's tools.

Select it from the preset picker — it is listed as *Arya Automation Engineer*, order 6, after Arya Claude — or pin it in
a profile with `agentPreset: arya-automation`.

## What the persona is

The five-step loop, stated as a contract rather than advice:

| Step | The agent must |
|---|---|
| 1. Point at the work | name the artifact before touching it — the file and its controller revision, the application name, the project folder, the controller IP and slot; ask if it cannot |
| 2. Read before writing | overview, structure, references, checks, quoting the identifiers the tools returned |
| 3. Act in a copy | write a **new** file or folder, never the source; when a tool edits in place it takes a verified backup first and says where |
| 4. Verify with the vendor engine | the SDK build, the ME re-export, the MWI compile or the Optix validation — a file written is not a change verified |
| 5. Hand off what is human | importing displays, creating runtime files, downloading to a controller, anything that moves a machine: named, never implied done |

Four gates sit under it: never write to a running controller, a live HMI or a loaded Optix project unless the request
names that target; never treat a successful download as proof the logic is right; never claim two programs are
equivalent from a textual diff; never invent an instruction, tag or address.

The full text is [`presets/arya-automation/persona.md`](../presets/arya-automation/persona.md), and it is what the
preset's persona row sends — plus the shared harness-capabilities section Arya Standard appends.

## What differs from Arya Standard

Only three things, and they are engineering-shaped rather than cosmetic:

- **Compaction tuned for read-heavy work.** Pre-warm at 65 % rather than later, drop the post-turn level to 85 %, fold
  at least 6 000 tokens, and keep 12 000 tokens of user text rather than more. An engineer's transcript is mostly quoted
  tool output — L5X reads, build logs, export diffs — so the user's own turns are cheap and the tool results are what
  needs folding.
- **A larger tool-result pruner.** 16 384 characters kept per tool result, 8 192 head, 2 048 tail, instead of Arya
  Standard's 8 192 / 4 096 / 1 024. A routine read is not useful truncated to a quarter.
- **A session projection — the engineering ledger.** A tab that records what was **read, checked, written and verified**,
  so a review has a trail rather than a memory. It is registered whether or not the preset is the active one: a session
  on another preset that happens to use the engineering tools still gets the ledger.

Everything else — the loop behaviour, plan mode, the pruner, the tool rows — is Arya Standard's. The row list is the
full DSH standard set: scheduling, delegation, ask-user, todo, web, present, and the conditional Host plugin manager and
market rows (the market stays disabled, the manager follows whether the composition provides `profileContext`). The
differences above change the prompt and how the session compacts; nothing is dropped from the toolbelt.

## When billion-context owns compaction

`billion-context` ("bili") is a proxy plus plugin bundle that compresses the outgoing model request and stands DSH's
own compaction rows down *by package name*. The Arya engine modules match none of those names, so without this the
preset would run its summarizer while bili compresses the wire — two compressors over one history — and bili has already
removed `/compact`, leaving the engine firing alone.

The preset therefore resolves `presets/billion-context.js` *before* it builds its definition. When bili owns the context
lane, the `arya-automation-compaction` engine row and the `command-compact` row are written `disabled: true`; the policy
row and the tool-result pruner are not compressors and stay mounted, and every other row is untouched. When bili is
absent or switched off, the definition is exactly what it was before.

Two facts must both hold, because neither is a published contract: the `biliBasicCompactionPolicy` service exists,
**and** `globalThis.__BILI_DSH_COMPACTION_VERDICT__ === 'active'`. An already-active gate wins even when the profile
does not list bili as a bundle, so a direct or custom bili row still stands the engine down. Only when bili is expected
does the resolver wait — 25 ms polls for up to 2 s for the service, then up to 500 ms for the verdict. A timeout, a
missing service or an inactive verdict all keep the engine and log one warning, because a double compressor is
recoverable and a silently missing one is not. `BILLION_CONTEXT_PLUGIN=0`, `BILI_NATIVE_DSH=0` or a defined
`BILI_PROVIDER_REWRITES` return immediately.

The stand-down lives in the definition, not in an `internal/config` overlay: a preset registered through the host's
`agentPresets.register()` is not an entry, so bili's own overlay cannot reach it.

## What it does not do

- **It does not grant capability.** A preset is a posture and a set of rows, not a permission: the write tools still
  refuse from inside their own entries, and the per-call approval lives where the controller traffic happens.
- **It does not make verification happen.** Step 4 is an instruction to run the vendor engine; if that engine is not
  installed, the honest outcome is "not verified", which is what the persona tells the agent to say.
- **It does not re-mount this bundle's tool rows.** They belong to the installed bundle and stay visible to every
  session; a preset that repeated them would double-register the tools.

## Where it lives now

```
presets/arya-automation/   persona.md, definition.js, plugin.js, projection.js, files.js
presets/arya-standard/     the base kit the preset derives from (definition, files, settings, engine, policy,
                           compaction, projection, prompt and the Codex licence)
presets/billion-context.js how the preset observes bili's compaction gate and when it stands down
entries/preset.js          the row: mounts the preset through agentPresets and sessionProjections
```

The row is `engineering-preset` in [`cordis.patch.yml`](../cordis.patch.yml), exported as
`@aryacode/dsh-engineering/preset`; its engine rows mount `@aryacode/dsh-engineering/arya-standard` and
`-policy`, which are this package's own exports.
