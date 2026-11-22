---
title: Engineering resources
order: 100
purpose: Use the authored standards corpus and the profile extractor without mistaking judgement for vendor text.
audience: Reviewers and style reviewers
---

## Two tools, two jobs

The engineering resources row carries two tools:

- `engineering_reference` searches the authored corpus. It has four ways in: `contents`, `query`, `id` and `domain`.
- `engineering_profile` extracts a style profile from an L5X project (`project_id`) or a FactoryTalk View ME view (`view_id`).

Both work locally. No model, no network and no vendor document is consulted at call time.

## The corpus

The corpus is 70 Markdown pages with 233 rule IDs across 8 domains: IEC, Rockwell, migration, Yaskawa, view, Optix, HMI and craft. A page declares its id, title, domain, level, basis, tags, target products and the rules it states; rule IDs are unique and follow `<AREA>-<TOPIC>-<NN>`.

The levels are intro, practitioner and specialist, and the corpus is deliberately small: it is judgement, written in the repository's own words and citing the standard or practice it rests on. It reproduces no standard text; the content licence is `packages/resources/LICENSE-CONTENT.md`.

Search ranking is deterministic and local: exact rule or title matches first, then tags, then substring, then a body scan. The generated index is built by `scripts/gen-resources.mjs` (`pnpm resources:build`), and `pnpm resources:check` fails when it is stale. Front matter, domains, levels, rule IDs and size budgets are validated; a page over 900 words or 12 KB fails.

## The profile

`engineering_profile` reads naming, idiom, HMI and comment habits plus evidence, confidence and source fields. It is extracted only from L5X and FactoryTalk View ME today; Optix and MotionWorks are not covered. The profile can be passed into the FTView display-drafting tools as a style input - it is a suggestion set, not a rule the vendor enforces.

## What these tools will not claim

- They return pages and profiles, not answers. A page states what the repository's practice is; it is not a vendor specification.
- A clean profile is not a review. It describes habits; it does not judge whether a line is correct.
- The corpus is not exhaustive: a missing topic is a gap in the authored set, not evidence that no rule exists.
