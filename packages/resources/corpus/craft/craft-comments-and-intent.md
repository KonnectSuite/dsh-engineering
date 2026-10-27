---
id: craft-comments-and-intent
title: Comments that explain why
domain: craft
level: intro
basis: [field practice]
tags: [comments, intent]
applies_to: [l5x, ftview, mwi, optix]
rules: [CRAFT-COMMENT-01, CRAFT-COMMENT-02, CRAFT-COMMENT-03]
---
## Principle

A comment that repeats the code is noise; a comment that explains the decision is maintenance.

## Rules

- **CRAFT-COMMENT-01** Comment the intent and the constraint (`// 250 ms: debounce for a bouncing
  proximity switch`), not the instruction.
- **CRAFT-COMMENT-02** Every non-obvious rung gets a rung comment; every routine gets one line of purpose.
- **CRAFT-COMMENT-03** Record the change reason and date where the project does that, and never leave
  commented-out logic as the only record.

## Apply

Write the comment as if the reader has the drawing but not the meeting.

## Anti-patterns

`// set bit`; a wall of comments at the top that no one updates; TODOs without an owner.
