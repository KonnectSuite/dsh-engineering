---
id: optix-variables-and-properties
title: Variables on a component — the data a screen owns
domain: optix
level: specialist
basis: FactoryTalk Optix Studio 1.8.1 help, creating-projects/project-nodes: Variables.html, Create-a-variable.html, Create-an-analog-variable.html, Create-a-node-pointer.html, Create-a-variable-from-a-type.html, Add-limits-to-a-variable.html, Set-the-unit-of-measure-for-a-variable.html, Change-the-unit-of-measure-for-a-variable.html, Remove-the-unit-of-measure-for-a-variable.html, Delete-a-range-from-a-variable.html, Create-a-variable-type.html; measured against Studio 1.8.1.27 with bridge 1.0.9 on 2026-11-15 (New menu offers Variable, Analog variable, Node pointer and Alias; create_variable refuses a VariableType name as a datatype; a Range value cannot be assigned through set_property).
tags: [variables, analog, node-pointer, alias, units, range, bindings]
applies_to: [optix]
rules: [OPTIX-VAR-01, OPTIX-VAR-02, OPTIX-VAR-03, OPTIX-VAR-04, OPTIX-VAR-05, OPTIX-VAR-06, OPTIX-VAR-07]
---

## Principle

A variable is an attribute of an object, not a separate tag list: Studio's own definition is that a variable
belongs to the node that shows or owns the value, and every object — a screen, a button, a faceplate instance,
a NetLogic class — can carry its own. That is how an instance keeps its state (a panel's setpoint, a lamp's
current colour) and how a faceplate gets parameterised without a global namespace full of near-duplicates.

**The UI folder itself cannot contain variables.** A variable lives on an object inside it, so a value that has
no owner is a sign the composition is wrong, not that a variable is missing.

Four kinds cover the work, and the difference matters because each one buys formatting, clamping or
parameterisation that a plain variable does not:

| Kind | What it is | What it buys |
| --- | --- | --- |
| Variable | a typed value on an object (`BaseDataVariableType`) | state that belongs to that object |
| Analog variable | a numeric variable with engineering units and a range | formatting, limits, and an operator sees what the number means |
| Node pointer | a value that is a link to another node (`NodePointer`, with Kind and Node class) | a screen that switches which object it shows |
| Alias | a named indirection that an instance resolves for itself | one screen type reused by many panels |

## Rules

- **OPTIX-VAR-01** — Put a value on the object that owns it. A setpoint the operator edits on a faceplate
  belongs on that faceplate instance; a value two screens must agree on belongs in `Model`, and both screens
  bind to it.
- **OPTIX-VAR-02** — Never create a variable directly in `UI`. It is not allowed there; name the widget,
  screen type or model object it belongs to and create it there.
- **OPTIX-VAR-03** — A number an operator reads or types is an analog variable: set the unit of measure and
  the range (low limit, high limit, and constrain when the value must not leave the range). A bare Float shows
  a number with no meaning and cannot be clamped.
- **OPTIX-VAR-04** — Link, do not copy. When a widget shows a model or PLC value, bind its property to that
  node with a dynamic link; a copied value is a second truth that goes stale silently.
- **OPTIX-VAR-05** — Parameterise a reused screen with an alias or node pointer, not with a per-instance
  duplicate screen. The alias is resolved per instance at runtime, which is the whole point of a screen type.
- **OPTIX-VAR-06** — Keep the BrowseName stable and machine-readable; write the operator's words into the
  DisplayName and the description. Paths, links and code use the BrowseName, so renaming it breaks references
  that the DisplayName never touches.
- **OPTIX-VAR-07** — Declare an array's shape and document its bounds. An unconstrained array invites
  index arithmetic that nobody can review, and a multi-dimensional shape is easier to state than to discover.

## Apply

- `optix_schema { action: "type", name: "AnalogItemType" }` before choosing the metadata children, so the
  property names come from this Studio build rather than from memory.
- `optix_edit` with `{ op: "create_variable", parent, name, datatype }` creates the value; add
  `kind: "analog"` with `units` and `range: [low, high]` to write `EngineeringUnits`, `EURange` and the two
  limit variables beside it, `array` or `dims` for a shape, and `display_name` for what the operator reads.
- Two measured limits, so the result is not overstated: the bridge cannot create a variable *of*
  `AnalogItemType` (it takes a datatype, and a VariableType name is refused), and a `Range` value cannot be
  assigned, so the limits live in `EURangeLow` and `EURangeHigh` next to an empty `EURange`.
- `optix_read { request: { action: "node", path } }` reads the variable's own value; a property of a widget is
  a `UAVariable` child, so read it through the node rather than counting it as a widget.
- `optix_design_check` reports `OPTIX-DATA-01` when a label shows a model number that has a recorded unit but
  no formatter, which is the symptom of a value carried without its unit.
