---
id: migration-placeholder-tags
title: Placeholder tags are the right answer for an unmodelled module
domain: migration
level: practitioner
basis: [Rockwell conversion guide, observed wizard runs]
tags: [migration, io, devicenet, placeholder, modules]
applies_to: [migration]
rules: [MIGRATION-IO-01, MIGRATION-IO-02, MIGRATION-IO-03]
---
## Principle

When the wizard meets a module it has no Logix equivalent for, it does not fail and it does not guess a
replacement. It writes a **tag** with the module's address shape and a generated data type, and leaves the logic
pointing at it. That is correct behaviour: the logic still resolves, and the choice of replacement hardware stays
where it belongs — with the engineer.

## Rules

- **MIGRATION-IO-01** Treat a placeholder tag as an open item, not a defect. The conversion did its job; the
  remaining work is a hardware decision, and it belongs in the report's decision section.
- **MIGRATION-IO-02** Count the logic references before proposing anything. A placeholder a rung uses is a
  migration task; one nothing references is a cleanup item, and the two deserve different places in the report.
- **MIGRATION-IO-03** Name the real replacement candidate, not the marketing category. A DeviceNet scanner
  (`1747-SDN`) becomes a `1756-DNB` on the bridge in the common case — say so, name the tags that then carry its
  I/O, and flag any logic that is DeviceNet-specific (explicit message blocks, scan-list-dependent bits).

## What it looks like

A module the wizard could not model produces a tag rather than a module:

```text
SLOT12_1747_SDN_Placeholder   SLOT12_UDT   referenced by 33 rungs
```

There is no `:12:` module in the I/O configuration, so nothing in the project will ever update that tag. The
DeviceNet scans it represented no longer exist. The logic is intact; the process is not connected.

## Apply

Read the wizard log for the line that names the unsupported device, find the generated tag, count its references
with the tag usage tools, and put it in the report with the candidate replacement and the open question. When the
engineer answers, the work is a module insert plus a tag remap — not another conversion.

## Anti-patterns

Deleting the placeholder to make the project compile. Renaming it to look like a real module. Promising a
replacement without checking the network it sat on.
