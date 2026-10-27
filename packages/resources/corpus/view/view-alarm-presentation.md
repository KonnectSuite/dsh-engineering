---
id: view-alarm-presentation
title: Alarm presentation the operator can use
domain: view
level: practitioner
basis: [ISA-18.2]
tags: [alarms, banner, priority]
applies_to: [ftview, optix]
rules: [VIEW-ALM-01, VIEW-ALM-02, VIEW-ALM-03]
---
## Principle

An alarm is an abnormal condition requiring a timely response. Everything else is a message or a log
entry and must not compete for attention.

## Rules

- **VIEW-ALM-01** Each alarm has a cause, a consequence and an action in its text. "Fault" is not an alarm
  message.
- **VIEW-ALM-02** Present by priority, newest first, with a persistent banner for unacknowledged alarms.
  Do not let the list scroll the operator past a trip.
- **VIEW-ALM-03** Acknowledge does not clear. The condition clears; the acknowledgement is recorded with
  who and when.

## Apply

Review the alarm list with the operator: for each entry, can they say what to do? If not, rewrite or
delete it.

## Anti-patterns

Alarm flood from one root cause; alarms that re-announce every scan; a silent alarm with no banner.
