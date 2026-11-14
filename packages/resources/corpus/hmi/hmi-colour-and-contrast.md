---
id: hmi-colour-and-contrast
title: Contrast numbers and where a palette comes from
domain: hmi
level: practitioner
basis: [WCAG 2.1, ISA-101]
tags: [hmi, colour, contrast, palette]
applies_to: [ftview, optix]
rules: [HMI-CONTRAST-01, HMI-CONTRAST-02]
---
## Principle

Two different failures make a screen unreadable: text that does not stand out from what it sits on, and
a screen whose colours were chosen one object at a time. The first is a number you can compute. The
second is a decision you make once, for the whole application.

This page carries the numbers. `view-colour-and-contrast` carries what the colours mean: red, amber and
green are reserved for abnormal, warning and normal.

## Rules

- **HMI-CONTRAST-01** Text and its own background differ by at least 4.5:1. Compare a control with the
  object it actually sits on, not with the screen backdrop: a label on a header band is judged against
  the band.
- **HMI-CONTRAST-02** A screen takes its colours from the shared style sheet or theme the product ships,
  not from values typed into each object. Per-object colours are how a palette drifts, screen by screen,
  until no screen matches another.

## Apply

4.5:1 is the ordinary-text threshold; large text is held to 3:1. Contrast is computed from relative
luminance, so a mid-tone fails against a near-black far more often than intuition suggests — a white
title on a saturated brand blue commonly lands near 4:1 and fails. Compute it, do not eyeball it.

A header band is the usual offender because it is the one place a design keeps a strong colour while
still carrying text. Either darken the band until both the title and the subtitle clear 4.5:1, or move
the text off the band. Darkening is cheaper and keeps the identity.

Both products ship a palette: FactoryTalk View has theme colours on the display, Optix ships StyleSheets
(`FriendlyLight`, `FriendlyDark`, `MaterialDark`, `ISAStyleSheet`) that a screen references. Import one
and use its values instead of inventing hex per widget.

## Anti-patterns

White text on a mid-tone brand colour; a different grey on every screen; a colour chosen for decoration
that is also the colour reserved for an alarm state; contrast measured against the backdrop so a label
on a dark card looks fine and is not.
