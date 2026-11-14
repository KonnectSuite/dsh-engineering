---
id: optix-opcua-model-structure
title: Structure the Optix model as an OPC UA information model
domain: optix
level: practitioner
basis: [measured on Studio 1.8.1 with the Studio bridge, 2026-11-14]
tags: [model, opc ua, information model, object types, variables, structure]
applies_to: [optix]
rules: [OPTIX-MDL-01, OPTIX-MDL-02, OPTIX-MDL-03, OPTIX-MDL-04, OPTIX-MDL-05, OPTIX-MDL-06]
---
## Principle

An Optix project is an OPC UA information model, whether or not anyone designed it as one. Tags dropped
straight under `Model` still bind to a screen, but they carry no hierarchy an alarm server, a historian or
the next engineer can walk, and every device ends up with its own invented names for the same three
signals.

The shape that scales is plant, area, line, equipment, signal:

```
Model/
  Types/                         one ObjectType per kind of equipment
    Filler                       Speed, Running (+ metadata children)
  Bottling/                      plant
    Packaging/                   area
      LineA/                     line
        Filler1                  instance of Model/Types/Filler
        Palletiser/              untyped equipment, its own signals
          Count
```

- Three named levels between `Model` and the line, then equipment, then the signal: six levels for a leaf.
  A tag two levels deep is a tag someone will not find.
- Equipment that exists more than once belongs to an `ObjectType` under `Model/Types`; instances then say
  what they are. A tag belongs on the type, not on one instance.
- Names are PascalCase, letters/digits/underscore, forty characters at most - the length Studio itself
  accepts before paths stop resolving.
- Units, range and a sentence of description travel with each signal.

## Why the metadata looks like variables

Studio 1.8.1 writes only `DisplayName` as a node attribute; a plain variable declares no property children,
and the bridge refuses to fabricate undeclared properties because that can corrupt the model. So
`EngineeringUnits`, `EURange` and `Description` are created as child String variables and given values.
They read correctly in Optix's own tree and in the UI, but a companion-spec OPC UA client will not see a
typed property. That is a bridge limitation, stated rather than hidden.

## Types are real, their members are copied

`model/type` creates a genuine `ObjectType`, and `model/object` instantiates it. What the bridge does not
do yet is give a type's members a modelling rule other than None, and a None member is not instantiated
into instances - the instance looks right in the designer and has no members at runtime. Until the bridge
sets a modelling rule for declared members, `optix_model` copies the members onto each instance. The
instance still reports its type; it is simply complete on its own.

## Checking an existing model

`optix_model` with `action: "check"` reads the live `Model` tree and returns `structured` or `needs-work`
with findings `OPTIX-MDL-01` to `OPTIX-MDL-06` - a signal outside the hierarchy, an analog value with no
units, a signal with no description, a name that breaks the convention, a folder holding more than twelve
variables, and equipment folders with no `ObjectType` behind them. Every finding names the path and the
fix. Moving tags afterwards changes NodeIds and breaks bindings, so treat a flat model as a planned
migration, not a cleanup: report it and let the engineer choose the moment.

The workflow that puts this in order with screens, commands and the release review is
`optix-application-recipe`; the rules for colour, targets and navigation are `hmi-colour-and-contrast`,
`hmi-targets-and-labels` and `optix-navigation-patterns`.
