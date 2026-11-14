---
id: hmi-standards-precedence
title: When the baseline yields: precedence, deviations and the release checklist
domain: hmi
level: practitioner
basis: [ISA-101, ASM Consortium]
tags: [hmi, standards, precedence, conventions, review, release]
applies_to: [hmi]
rules: [HMI-PREC-01, HMI-PREC-02, HMI-PREC-03]
---
## Principle

A standard that is applied without looking at the plant is a source of defects. Many real applications
were built with a house style, a customer standard, a corporate theme or a deliberate decision that a
particular screen should look different — and a rule applied on top of that produces churn the operator
has to relearn.

So the baseline is a default, not a mandate. It is what to do when nobody has decided otherwise, and it is
the yardstick for judging a screen that has no convention of its own. When the project has decided, the
project wins — provided the deviation is deliberate, recorded, and not itself the defect.

## Rules

- **HMI-PREC-01** Precedence, highest first: (1) the user's explicit instruction; (2) the project's
  documented standard, theme or style sheet; (3) a convention the existing application follows
  consistently, as reported by `engineering_profile` with its evidence and confidence; (4) this bundle's
  baseline pages. Follow the highest layer that speaks. Do not "correct" a deliberate house style.
- **HMI-PREC-02** A waiver is recorded, never silent. When a higher layer wins over a baseline rule, state
  which rule was waived, what the project does instead, and why — in the delivery notes and in the review
  finding that would otherwise have fired.
- **HMI-PREC-03** Stop and ask when the layers conflict in a way you cannot judge: the application mixes
  styles with no clear majority, the "convention" looks accidental (a drift, not a decision), the
  deviation would change what the operator must do, or following the baseline means rebuilding screens
  that already work.

## How to find the project's own layer

Read before writing. `engineering_profile` reports naming, idioms and visual conventions with evidence and
a confidence level; `engineering_reference` with the project's product pages tells you what the product
can express. Look at two or three existing screens and ask: is the palette, header, navigation and layout
consistent across them? Consistency is the signal that a decision was made. A single screen that looks
different is usually drift.

Where the profile is confident, follow it. Where it is low or silent, follow the baseline and say that is
what you did. Never present a rule ID as a standards clause or a certification: the corpus is this
bundle's opinion, and the standards are referenced, not reproduced.

## Release checklist

Before an HMI is called production ready, whoever is handing it over can answer all of these:

- The start screen is the overview, and the alarm summary is one action away from everywhere.
- Alarms are visible, prioritised and acknowledgeable; no alarm text is a placeholder.
- Every screen is reachable and has a way back; no dead ends, popups included.
- Commands and indications are distinguishable; hazardous commands confirm; the resulting state is shown.
- Units, precision, timestamps and tag names are correct and consistent with the plant's own.
- The shared palette and style sheet are used, not per-object colours.
- Contrast and touch targets pass at the smallest screen and the darkest/worst lighting the application
  will run in, not only on the design workstation.
- Communication failure, startup and logged-out states are designed, not left to the runtime default.
- Placeholder text, test tags, debug values and commented-out code are gone.
- Someone has looked at the running screen, not only at the export.

## Related

`hmi-isa101-baseline` is the visual layer; `hmi-screen-architecture` is the navigation layer;
`hmi-colour-and-contrast` and `hmi-targets-and-labels` are the numbers the design checks can compute.
