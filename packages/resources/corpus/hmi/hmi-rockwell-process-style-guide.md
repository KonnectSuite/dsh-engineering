---
id: hmi-rockwell-process-style-guide
title: The Rockwell process HMI style guide: levels, template, palette and touch
domain: hmi
level: practitioner
basis: [Rockwell PROCES-WP023, ANSI/ISA-101.01-2015, ANSI/ISA-18.2-2016, ANSI/ISA-5.1]
tags: [hmi, rockwell, plantpax, factorytalk, palette, touch, screen-levels]
applies_to: [ftview, optix]
rules: [HMI-RW-01, HMI-RW-02, HMI-RW-03, HMI-RW-04, HMI-RW-05, HMI-RW-06, HMI-RW-07, HMI-RW-08]
---
## Principle

Rockwell's *Process HMI Style Guide* (publication PROCES-WP023) is the vendor layer under the general
baseline: it takes the ISA-101.01 idea of an HMI philosophy, style guide and toolkit and turns it into
concrete levels, a template, a palette with hex values and touch dimensions. It was written with
FactoryTalk View SE and PlantPAx in mind, and it states plainly that its purpose is to be a starting
point for a plant's own style guide.

That is how to use this page: it is the vendor default when the plant is a Rockwell plant and has not
decided otherwise. Where the plant's own style guide differs, the plant wins (see
`hmi-standards-precedence`).

## Rules

- **HMI-RW-01** Four display levels, progressive disclosure: Level 1 overview (no control from it), Level
  ­2 process unit control (the primary operating display, designed first), Level 3 unit detail for
  non-routine investigation, Level 4 support and diagnostics (interlocks, help, point detail) usually on
  faceplates or popups. One overview display per operating position.
- **HMI-RW-02** Every display uses the same template: a header carrying the display navigation map,
  system status, home, login/logout, alarm banner, alarm access and alarm silence; context button bars
  for the level-2 and level-3 displays of the current process area. Only the content area changes.
- **HMI-RW-03** The palette is fixed and semantic. Non-saturated background (light grey `#E0E0E0`),
  static text and headings dark grey `#3F3F3F`, process lines and equipment borders `#A0A0A4`, grouping
  boxes `#E8E8E8`. Live data in cool colours. Alarm colours are reserved by priority: urgent red
  `#E22028`, high orange `#EC8629`, medium yellow `#F5E11B`, low magenta `#916AAD`. No gradients, and no
  alarm colour on anything that is not an alarm.
- **HMI-RW-04** State is never shown by colour alone: combine fill, shape or text. Equipment colours are
  themselves a scheme — stopped/disabled grey `#808080`, running off-white `#F0F0F0`, transitions and
  manual/jog light blue `#93C2E4`. A control the user may not operate is greyed out, not made invisible.
- **HMI-RW-05** Touch geometry: command buttons at least 40 x 40 px, navigation buttons 35 x 35 px
  (help and trend navigation 32 x 32), pagination 36 x 26, and 40 x 40 px as the default hit area for a
  screen object (30 x 30 is the absolute minimum for a unique case). Keep 10 px between command touch
  targets, no extra padding between navigation targets, and never less than 4 px between any two objects.
- **HMI-RW-06** Commands and navigation are different animals: a command names the action it starts (not
  the current state), equipment gets a separate Start and a separate Stop button rather than one
  two-state button, command and navigation styling differ, the press is acknowledged, and a consequential
  action asks for confirmation. Login/logout follows the navigation style.
- **HMI-RW-07** Data presentation: labels left justified with data to the right or below, related numbers
  right justified with decimal points aligned, engineering units left justified beside the value, analog
  entry showing units, minimum, maximum and tag description, significant digits matching the instrument,
  and integers without a decimal point. Group with boxes, align to a grid.
- **HMI-RW-08** Alarms and motion: unacknowledged alarms blink between the alarm colour and a grey border,
  acknowledged alarms hold the colour; blinking is for immediate attention only, never applied to text,
  and the operator can stop it. Do not base the display on a P&ID and do not use equipment photographs or
  pictorials as the display — use limited P&IDs, state diagrams and data elements.

## Apply

Start from the template: header first, then the level-2 button bar, then the content area. Take the
palette hex values above rather than inventing colours, and put them in the shared style sheet or global
objects so no screen retypes them. Size touch controls before laying them out — Rockwell's numbers are
smaller than the 44 px general baseline for command buttons, so on a touch-only panel prefer the larger
of the two and say which number you used.

## Reference

[Process HMI Style Guide, PROCES-WP023](https://literature.rockwellautomation.com/idc/groups/literature/documents/wp/proces-wp023_-en-p.pdf)
— 56 pages; an editable version is available from the Rockwell Automation KnowledgeBase (answer 1086840).
This page summarises the vendor layer; it is not the document and quoting a rule ID here is not a claim of
compliance with it.
