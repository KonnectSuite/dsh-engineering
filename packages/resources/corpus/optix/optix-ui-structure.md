---
id: optix-ui-structure
title: Optix screens and reusable types
domain: optix
level: practitioner
basis: [FactoryTalk Optix]
tags: [screens, types, objects]
applies_to: [optix]
rules: [OPTIX-UI-01, OPTIX-UI-02]
---
## Principle

Optix is object-oriented: types and instances, not copied panels. The screen is a composition of typed
objects.

## Rules

- **OPTIX-UI-01** Model repeated equipment as a type with instances; screens reference the instance, never
  a copy of its internals.
- **OPTIX-UI-02** Keep screen composition (layout) separate from behaviour (bindings, NetLogic); a screen
  that computes is harder to reuse.

## Apply

Read the type schema before creating objects; the object model decides what a binding can reference.

## Anti-patterns

Copy-pasted panels for each device; logic hidden in a display event; a type per device instance.
