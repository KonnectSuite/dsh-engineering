---
id: optix-alarms-and-trends
title: Alarms and trends in Optix
domain: optix
level: practitioner
basis: [FactoryTalk Optix, ISA-18.2]
tags: [alarms, trends]
applies_to: [optix]
rules: [OPTIX-ALM-01, OPTIX-ALM-02]
---
## Principle

Alarms and trends are process evidence. Their configuration is part of the design, not a runtime
afterthought.

## Rules

- **OPTIX-ALM-01** Configure alarm limits and priorities in the model (type or instance), so every
  instance inherits a reviewed definition.
- **OPTIX-ALM-02** Choose trend sampling from the process dynamics, and keep the same time base across
  pens that will be compared.

## Apply

Review the alarm list as a document: condition, limit, priority, message, action. Trends should answer a
specific question the operator or engineer has.

## Anti-patterns

Alarms enabled per instance with different limits; trend pens on unrelated time bases.
