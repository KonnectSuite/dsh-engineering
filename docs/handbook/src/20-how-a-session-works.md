---
title: How a session works
order: 20
purpose: Describe the shared loop, the read/write gate, and what a result can and cannot prove.
audience: Anyone starting a first session
---

## The five surfaces

A session has five kinds of surface, shared by every product:

1. **Tools** the agent calls, grouped by job: read, draft, verify, and where a product allows it, a gated write.
2. **A skill**, loaded when the product is involved, that states the order of work and the product's own rules.
3. **A capability or status probe** that reports what is installed and reachable before any claim is made.
4. **Documentation tools** that look up installed help and authored pages, without shipping vendor bytes.
5. **Preview faces** in the workbench that render a local file; they do not launch vendor software.

## Inspect, decide, call, verify

1. **Inspect.** List what exists before acting: projects, apps, displays, screens. A capability or status tool reports the installed software and any missing piece.
2. **Decide.** Pick the smallest tool that answers the question. Reading is the default; a draft is a new file, not an edit in place.
3. **Call.** Tools return an envelope. On success it carries the result; on failure it carries a code, a message, and a fix. A refusal is information, not an error to work around.
4. **Verify.** Trust the vendor engine, not the agent's intent. A Studio SDK build, a re-export from Studio, a MotionWorks compile, an Optix build or a schema validation is proof that the artifact was accepted. "The tool ran" is not proof.
5. **Hand off.** Where Studio or the IDE must act, produce a plan the engineer can follow, then stop.

## Read-only and write gated

Every product has a read path that needs no license and touches no project: parse a file, render a display, search installed help. Write paths are narrower:

- A draft tool writes a **new** artifact beside the source and refuses to overwrite.
- An apply or save tool is a gated write with per-call approval. If the session policy cannot ask for approval, the call returns `APPROVAL_UNAVAILABLE` and nothing is written.
- A few writes go to a device or IDE. Those are the most gated and are never the default.

Read-only rows are read-only by construction: they ship no write tool and no write switch. A profile switch can remove a capability; it cannot add one the build does not carry.

## What a result proves

A green check proves the artifact passed that check. It does not prove the line will run on a controller, the screen is safe to deploy, or the vendor would accept the project. Every entry on the workbench is a preview, not a replacement for the vendor's own environment. For a claim about behavior, the evidence is a test or a recorded measurement, and the evidence page (`docs/capabilities.md`) says which image proves what and — more importantly — what an image cannot prove.

## Where your work lands

- **L5X**: drafts are new `.L5X` files; an SDK build creates a new ACD and records the source hash.
- **FactoryTalk View**: a draft is a new ME export folder; the batch import XML is validated, then Studio imports it.
- **Optix**: the file channel writes the saved project; only one save is automated, and one build remains a human action.
- **MotionWorks IEC**: a staged copy is edited; the real project is backed up on open.
- **Migration / PLC-5 / SLC**: reads only, or a report written to a new file.
