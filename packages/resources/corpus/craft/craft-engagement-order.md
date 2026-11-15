---
id: craft-engagement-order
title: Start from the standard and the brief, not the machine
domain: craft
level: practitioner
basis: [ISA-101 HMI lifecycle, ARC/ASM HMI design guidance, field practice]
tags: [engagement, brief, inventory, template, standards, first-move]
applies_to: [l5x, ftview, optix, plc5, mwi, ecad, migration]
rules: [CRAFT-ORD-01, CRAFT-ORD-02, CRAFT-ORD-03, CRAFT-ORD-04]
---
## Principle

The first question of a new build is "what does the operator need?", not "what is on this machine?".
An inventory tells you what exists; the brief and the standard tell you what to make. The two are not
interchangeable, and treating the inventory as the brief is how a build starts with twenty-three minutes
of folder listings and no design decision.

## Rules

- **CRAFT-ORD-01** A new artefact starts from the standard and the brief. The host is read only when the
  operator points at it, or when the work is inside an existing project. Reading the workspace, the
  install directory, the operator's profile or the machine's drive tree to decide what to build is not
  preparation - it is the wrong first move.
- **CRAFT-ORD-02** The brief precedes the artefact. Settle what cannot be re-edited later - the target
  device, the screen or card size, the naming scheme, the deliverable's form and where it lives - before
  writing anything. An assumption discovered after the build is a rebuild.
- **CRAFT-ORD-03** Authorised inspection is bounded and stated. When the operator says to look, name the
  folder, say why, and report what was found. One path answered one question; a sweep of a home
  directory or an install tree answers none.
- **CRAFT-ORD-04** What exists is evidence, never the requirement. An inventory can inform a deviation or
  confirm a convention; it does not define the deliverable. "There is nothing like this on the machine"
  is not a finding about what the operator needs.

## When the host is the right source

Three cases only:

1. **The operator named it** - "use our Optix template", "match the HMI on line 3", "the export is in this
   folder". Inspect exactly what was named.
2. **The work is inside an existing project** - a screen, a routine, a tag, a NetLogic. Then the project
   is the subject, and its own tools are the first move.
3. **A real capability question** - is the product installed, which version, does a runtime exist, is a
   bridge answering. Ask, or make one bounded check and state the reason. "Which version of the product
   is installed" needs one command, not a directory walk.

## What a bounded check looks like

Name the question, choose the one path that answers it, and report both:

> "Checking whether the packaged Optix starter exists: `optix_template {}` - it answers with both
> starters and their questions, and writes nothing."

Not:

> Listing the workspace, then the install directory, then every `.optix` file under the user profile,
> to see what templates might be around.

## Worked example

A request to build a house template. The first move is the standards - the HMI baseline, the screen
architecture and the vendor style guide that the plant's platform is built on - plus the packaged
starters, which exist precisely so the agent does not have to invent a shell. Then the brief: targets,
canvas, levels, palette, naming, alarm strategy, startup and logout, and what the deliverable is
(a standard document, a starter-based project, or both). Only after that does anything get written.
An existing plant is the one case where the first move is `engineering_profile` - because there the
project is the subject, not the answer to "what should we build?".

## Apply

Before the first tool call of a new build, answer two questions in the reply: *what standard governs
this artefact?* and *what does the brief still leave open?* If either answer is missing, ask rather than
look. Cite `CRAFT-ORD-01` when declining to survey the machine.

## Anti-patterns

- Recursive searches for project files (`*.optix`, `*.L5X`, `*.RSS`) to infer what the operator wants.
- Listing the workspace "to get oriented", then reporting the inventory as the starting point.
- Reading an install directory to discover the tool surface - the tool surface is the session's tools.
- Treating an empty machine as an empty requirement, or a busy machine as a specification.

## Related

`hmi-standards-precedence` (who wins when the standard and the plant disagree), `craft-review-checklist`
(what to check before handover).
