---
id: optix-netlogic-usage
title: When to use NetLogic
domain: optix
level: specialist
basis: [FactoryTalk Optix]
tags: [netlogic, csharp]
applies_to: [optix]
rules: [OPTIX-NL-01, OPTIX-NL-02]
---
## Principle

NetLogic is C# inside the HMI. Use it for what bindings cannot express, and keep it small enough to test.

## Rules

- **OPTIX-NL-01** Prefer bindings and expressions for display logic; use NetLogic for calculations, state
  and integration that must run regardless of the visible screen.
- **OPTIX-NL-02** Keep NetLogic free of UI lookups where possible: pass values in, return values out, so it
  can be reasoned about without the screen.

## Apply

Check the NetLogic cheat-sheet snapshot for the lifecycle and API before writing a new script; the API is
version-specific. The practices that decide whether the class behaves at runtime - dispose, no blocking,
error isolation, logging, observers, design-time discipline - are written down as
`optix-netlogic-practices` and enforced by `optix_script action "review"`.

## Anti-patterns

NetLogic that duplicates PLC logic; scripts that block; UI code that reaches into other screens.
