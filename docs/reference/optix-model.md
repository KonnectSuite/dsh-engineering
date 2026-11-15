# The OPC UA information model under `Model`

Optix projects are OPC UA information models. A folder of tags under `Model` is legal and useless; a
plant/area/line/equipment tree with types behind it is what an OPC UA client, a future alarm server and
the next engineer can navigate. `optix_model` exists to make the second shape the default, and to report
the first one honestly.

## The convention

```
Model/
  Types/                        ObjectTypes, one per kind of equipment
    Filler                      members: Speed, Running (+ their metadata)
  Bottling/                     plant
    Packaging/                  area
      LineA/                    line
        Filler1                 instance of Model/Types/Filler (members copied)
        Palletiser/             untyped equipment: its own folder of signals
          Count
```

- Three levels between `Model` and the line are configurable (`hierarchy`, default `Plant / Area / Line`);
  the tool refuses a hierarchy that is not exactly three names.
- Names are PascalCase, letters/digits/underscore, at most 40 characters — the longest Studio itself
  accepts, and the point where paths stop resolving.
- A typed instance declares `type: Model/Types/<Type>` and then carries copies of the type's members.
  A tag belongs on the type, not on one instance of it.
- A signal carries its metadata as child variables, written by `create_variable` with `kind: "analog"`:
  `EngineeringUnits` (a `LocalizedText`), `EURange` (an empty `Range` node) with `EURangeLow` and
  `EURangeHigh` Floats beside it, and `Description` (a `String`).

## Rules (`optix_model action: "check"`)

| Rule | Severity | Catches |
| --- | --- | --- |
| `OPTIX-MDL-01` | critical | a variable shallower than `Model/<plant>/<area>/<line>/<equipment>/<signal>` |
| `OPTIX-MDL-02` | warning | an analog (Float/Double/Int) value with no `EngineeringUnits` |
| `OPTIX-MDL-03` | warning | a variable with no `Description` |
| `OPTIX-MDL-04` | warning | a name that is not PascalCase, or longer than 40 characters |
| `OPTIX-MDL-05` | info | a folder holding more than twelve variables directly |
| `OPTIX-MDL-06` | info | two or more equipment folders with no `ObjectType` behind them |

The verdict is `structured` when no finding fires and `needs-work` otherwise. Every finding names the
path and the fix, because "your model is unstructured" is not something an engineer can act on.

## Two measured limits

1. **Metadata is emulated, not typed.** Studio 1.8.1 writes only `DisplayName` as a node attribute
   (`node/displayname`), and a plain variable declares no property children, so `DeclaredPropertyGuard`
   refuses `EngineeringUnits`/`EURange` as UA properties. `optix_model` writes them as child variables in
   the shape measured on 2026-11-15: `EngineeringUnits` as a `LocalizedText`, `Description` as a `String`,
   and the limits as an empty `EURange` `Range` node with `EURangeLow` and `EURangeHigh` Floats beside it.
   Two facts forced that shape and are reported in every result: `create_variable` takes a datatype and
   refuses a VariableType, so a variable of `AnalogItemType` cannot be created through the bridge at all,
   and a `Range` value cannot be assigned (`Conversion to Struct not supported`), so the limits cannot live
   inside `EURange`. A companion-spec client will therefore see the limits as separate Floats, not as a UA
   `Range` property. The bridge needs a route that declares a typed analog item for that to change.
2. **Type members are copied, not inherited.** `model/variable` writes members with `ModellingRule` None,
   and a None member is not instantiated into instances (bridge comment in `StudioMCPBridge.cs` around
   the model writer). The planner therefore copies the type's members — same names, datatypes and
   metadata — onto each instance. The instance still reports its `type`; it is just complete on its own.
   The bridge-side fix is to call `SetModellingRuleRecursive()` for declared members.

Both are reported in every `optix_model` result (`metadata` and `inheritance`), and neither is hidden in
the skill text.

## What it will not do

- It does not rewrite an existing flat model. `check` reports it; the operator decides whether to move
  tags (a move changes NodeIds and breaks bindings, so it is a planned change, not a cleanup).
- It does not create alarm configurations, loggers or recipes — those are separate node trees with their
  own bridge routes.
- It is not a certified UA companion specification. The hierarchy is the engineering convention this
  bundle teaches, with rule ids that are the bundle's opinion, not a clause from a standard.
