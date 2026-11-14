---
id: hmi-isa101-baseline
title: The operating display, ISA-101 style: a neutral canvas and colour that means something
domain: hmi
level: practitioner
basis: [ISA-101, ASM Consortium, ISA-18.2]
tags: [hmi, isa-101, situational-awareness, colour, density, high-performance-hmi]
applies_to: [hmi]
rules: [HMI-101-01, HMI-101-02, HMI-101-03, HMI-101-04, HMI-101-05, HMI-101-06]
---
## Principle

An operating display has one job: let the operator see that something is wrong, work out what, and act —
in that order, under time pressure, on a screen they may not have looked at for an hour. Everything on
the screen either helps that or slows it down.

That is the ISA-101 position, and it is why the high-performance style strips the canvas back: a neutral,
low-chroma background, static graphics in greys, and colour spent only where it carries state. Decoration
competes with status for the operator's attention, and the operator loses that competition every time
because a red fill means "look here" whether or not it was meant to.

These rules are product-neutral. They hold for FactoryTalk View, Optix, Ignition, WinCC or a web HMI built
in-house, because they describe the display a person reads, not the tool that drew it.

## Rules

- **HMI-101-01** The base is neutral. Backgrounds and static graphics sit in low-chroma greys; a
  saturated fill is reserved for a state or a selected item. A coloured panel that never changes is
  decoration and must go.
- **HMI-101-02** State colours keep one meaning everywhere: red = abnormal, action required; amber =
  warning or deviation; green = normal running; blue, cyan, grey and white = information and selection.
  The same colour never carries two meanings, and none of the three state colours is used for branding.
- **HMI-101-03** Data over decoration. No drop shadows, bevels, gradients, photographic backdrops or
  animation that does not represent real process motion. A spinning fan may spin; a spinning logo may not.
- **HMI-101-04** Show what changed, not just what is. Where a value has a target, show the deviation
  (bar, delta, band or trend) as well as the number; a screen of raw numbers makes the operator compute
  the answer the display already knows.
- **HMI-101-05** Every number carries a unit and a precision its instrument can support, and every
  timestamp says whose clock it is. `72.4381 %` from a ±1 % sensor is false precision, and it hides which
  digits matter.
- **HMI-101-06** Consistency beats novelty. The same equipment, state and interaction look the same on
  every screen; a difference on two screens should mean the process is different, not that a different
  person drew the second one.

## Apply

Design the base first: pick the neutral background, the grey ramp for static graphics, and the three
state colours, and fix them in the shared palette so no widget invents its own. Then colour only what
changes. A useful test is a greyscale screenshot: if the screen still reads — values, states,
navigation — the layout is doing the work and colour is an accent; if the screenshot is meaningless, the
layout is leaning on colour it should not need.

Density is a judgement call, not a number: enough context to diagnose without paging, not so much that
nothing stands out. Group by equipment, keep the group order stable across screens, and put the thing
that can go wrong nearest the operator's eye-line, not in the corner.

## Anti-patterns

A saturated brand banner across every header; red used for "stop" buttons and for alarm text and for a
logo accent; a 3D tank that spins when it fills; ten values with no target and no trend; a palette that
drifts screen by screen because each screen typed its own hex; colour as the only cue for a state.

## Reference

The industry summary this page is aligned with, not a substitute for it:
[SCADA HMI Design Standards and ISA-101 Best Practices](https://industrialmonitordirect.com/blogs/knowledgebase/scada-hmi-design-standards-and-isa-101-best-practices).
This bundle's rule IDs are its own opinion about that material; they are not the standard's clause numbers
and citing one is not a claim of compliance.
