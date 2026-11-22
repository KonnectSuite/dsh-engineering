---
title: Documentation tools and the knowledge plane
order: 110
purpose: The five documentation actions, the licensing posture, and the revision rules that keep lookups honest.
audience: Anyone looking up a vendor manual through the agent
---

## The idea

Every product row that has a documentation surface exposes a documentation tool: `l5x_docs`, `ftview_docs`, `migration_docs`, `plc5_docs` and, with the SLC 500 row, `slc500_docs`. The tool answers five actions and nothing else.

## The five actions

| Action | Question it answers | Result |
| --- | --- | --- |
| `contents` | What collections are there, and what sections does one have? | Collections with page counts, source kind, revisions and readiness; or a section table of contents. |
| `search` | Where is this topic discussed? | Up to 8 hits with id, title, section, score and a short snippet. |
| `read` | Give me the page. | The page text (up to 8,000 characters) plus source and revision fields. |
| `status` | Is this collection usable here? | Ready, index-only or absent, with the installed root and page count. |
| `lookup` | Is this identifier defined? | Exact identifier matches with the pages that define them. |

Errors are part of the contract: `INVALID_ACTION`, `QUERY_REQUIRED`, `NOT_FOUND` (with the closest ids), `SOURCE_NOT_INSTALLED` when the vendor help a collection describes is not on this machine, `REVISION_REQUIRED` when a revision-sensitive question names no revision, and `INSTRUCTION_NOT_IN_REVISION` when the named revision does not carry the page. A failed call names a fix.

## Licensing posture

The line is firm and easy to state:

- **Authored pages ship.** They are written in the repository's own words and may be redistributed.
- **Vendor help is never shipped.** A committed index carries ids, titles, sections and paths only - metadata, not page bodies.
- **A read of installed help happens locally**, at call time, against the vendor help installed on the machine. If the help is missing, the call reports `SOURCE_NOT_INSTALLED`; it does not substitute a cached copy.
- No network call is made to answer a documentation question.

This is why the bundle can search a 5,500-topic Studio 5000 help tree without carrying its 200 MB into the package.

## Revisions are not a footnote

A documentation answer that silently serves the wrong revision is worse than no answer. The tools therefore:

- accept an optional revision on `search` and `lookup`, and never silently fall back to the newest shard when a revision was named;
- return `REVISION_REQUIRED` when a revision-sensitive question names no revision, instead of implying the newest one matches;
- refuse with `INSTRUCTION_NOT_IN_REVISION` when a requested page or instruction is not recorded at the named revision;
- return a page whose index carries no revision with `revision: null`, rather than implying it matches.

The engineering resources corpus is a separate authored surface: `engineering_reference` remains the standards search tool, while the product documentation tools serve vendor-manual lookups.

## What the tools will not do

They will not answer a question the indexed text does not contain, will not fetch a manual from the internet, and will not decide whether a page applies to the project in front of you. That decision stays with the engineer.
