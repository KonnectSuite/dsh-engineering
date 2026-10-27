---
id: optix-bindings-and-expressions
title: Bindings and expressions
domain: optix
level: practitioner
basis: [FactoryTalk Optix]
tags: [bindings, expressions, converters]
applies_to: [optix]
rules: [OPTIX-BIND-01, OPTIX-BIND-02, OPTIX-BIND-03]
---
## Principle

A binding moves a value; an expression computes one. Mixing them hides where a number comes from.

## Rules

- **OPTIX-BIND-01** Bind raw values point to point; put formatting and unit conversion in a formatter or a
  converter with a name, not inline in the binding.
- **OPTIX-BIND-02** Validate expressions with the expression tool before attaching them, and handle the
  null/empty case explicitly.
- **OPTIX-BIND-03** Keep one source of truth per value: do not bind and also write the same property from
  NetLogic.

## Apply

When a value looks wrong, trace binding → converter → source before editing any of them.

## Anti-patterns

Long inline expressions in a property; two writers for one property; conversions that silently round.
