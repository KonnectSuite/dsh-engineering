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
   Two facts forced that shape and are reported in every result: `create_variable` takes a datatype that is
   either a builtin or an FTOptix **module** type BrowseName (see the next section), and a UA base variable
   type such as `AnalogItemType` is in no FTOptix catalog, so a variable of `AnalogItemType` cannot be
   created through the bridge at all; and a `Range` value cannot be assigned (`Conversion to Struct not
   supported`), so the limits cannot live inside `EURange`. A companion-spec client will therefore see the
   limits as separate Floats, not as a UA `Range` property. The bridge needs a route that declares a typed
   analog item for that to change.
2. **Type members are copied, not inherited.** `model/variable` writes members with `ModellingRule` None,
   and a None member is not instantiated into instances (bridge comment in `StudioMCPBridge.cs` around
   the model writer). The planner therefore copies the type's members — same names, datatypes and
   metadata — onto each instance. The instance still reports its `type`; it is just complete on its own.
   The bridge-side fix is to call `SetModellingRuleRecursive()` for declared members.

Both are reported in every `optix_model` result (`metadata` and `inheritance`), and neither is hidden in
the skill text.

## Module-typed children and structured properties

A logger, a trend and a data store are not single nodes: each owns a collection of module-typed children —
`DataLogger.VariablesToLog`, `Trend.Pens`, an `SQLiteStore` table's `Columns`,
`EventLogger.EventFieldPaths`. Two bridge routes author that shape, and `optix_model` uses neither: it
writes the tag model, not the logging tree. Stated here because the tag model is where the question starts.

`POST /bridge/model/variable?parent=<path>&name=<name>&datatype=<type>` resolves `datatype` against the
18 builtins first and then against the FTOptix module catalogs, so `VariableToLog`, `StoreColumn`,
`EventFieldPath`, `EventFieldToLog` and `TrendPen` are accepted. A bare name takes the first module that
carries it, and `FTOptix.DataLogger.VariableToLog` pins one, because each module keeps its own catalogs —
its own types in `ObjectTypes` and its children's types in `VariableTypes`. A module type becomes the
variable's *variable type* (`MakeVariable(name, BaseDataType, moduleTypeId, null)`), which the answer
reports as `variable_type`; the builtin path is unchanged, and a name that resolves to neither is still
refused with the builtin list plus the module-type hint. `display_name` is an optional query param on the
same route, so one call can create and label; `POST /bridge/node/displayname` remains the follow-up form.

`POST /bridge/node/set-structured?path=<node>&name=<property>&effect=append|replace` writes the element
objects of one placeholder child collection, with the JSON array body as the items:

    POST /bridge/node/set-structured?path=Logging/DataLogger1&name=VariablesToLog&effect=append
    [{"Name":"LineSpeed","DeadBandMode":"Absolute","DeadBandValue":0.5}]

    {"ok":true,"path":"Logging/DataLogger1","name":"VariablesToLog","element_type":"VariableToLog",
     "effect":"append","added":1,"total":1,"fields":["DeadBandMode","DeadBandValue"],
     "element_names":["LineSpeed"],"mode":"inline","thread":"http-bg"}

The property must be declared on the node's type and must be a placeholder collection — the route never
fabricates a variable, which is the crash the `set_property` array guard exists to prevent. Everything is
validated before the model changes: an unknown field is refused with the valid field list, a non-collection
property is refused with the collections the node does have, a read-only collection is refused by name, a
blank body, a non-array body, more than 200 items and a duplicate name are refused before anything is
written. Each item is a `{"Name": "...", <field>: <value>}` object; `Name` (or `BrowseName`) sets the
element's browse name, `DisplayName`/`Description` are node attributes, `DataType` takes the same datatype
rules as `create_variable`, and every other field is coerced by the same code `set_property` uses, so a
field behaves like the property of the same name. `effect=replace` removes the existing elements first and
says so if a later item fails; a failed batch rolls back the elements it created.

One gap is recorded rather than implied: no plugin tool maps `set-structured` yet. `optix_edit`'s op
vocabulary has `set_property`, not a structured write, so the route is reachable through an armed bridge
and by a future op; until then a logger's `VariablesToLog`, a table's `Columns` and a trend's `Pens` are
authorable only that way.

`POST /bridge/node/set-link?path=<variable>&source=<variable>&mode=Read|Write|ReadWrite` writes a
dynamic link **on the variable itself**, which is the one thing `bind` cannot do: `bind` reaches a
*property* of an object, and a module-typed variable such as `VariableToLog` has no property for its own
value, so nothing could point a logged variable at a tag and the logger wrote null columns.

    POST /bridge/node/set-link?path=Loggers/LineDataLogger/VariablesToLog/OEE&source=Model/Smt/OEE&mode=Read

    {"ok":true,"path":"Loggers/LineDataLogger/VariablesToLog/OEE","source":"Model/Smt/OEE",
     "mode":"Read","via":"dynamiclink","link":"../../../../Model/Smt/OEE (String)"}

The target must be a variable (`IUAVariable`) and the source must resolve to a variable; a source that
does not resolve is refused rather than stored as a literal, because a literal path is `bind`'s `raw=`
form where an alias or template path is the point. The link is created with the same
`SetDynamicLink(source, mode)` call `bind` uses, so a relative path is produced automatically when target
and source live under the same `ObjectType` (an absolute link reads the type's value for every instance).
Verified live on the demo project: four `VariableToLog` elements linked to their model tags, links present
in `Nodes/Loggers/Loggers.yaml` after a Studio save, and the DataLogger's table then carries the columns.

The remaining known limit for a logger's table: it is created on first sample, so a `DataGrid` or `Trend`
bound to it renders empty until rows exist; author the link first, then look at the widget.

### PLC tags: `import_tags`

    POST /bridge/station/import-tags?station=CommDrivers/RAEtherNetIPDriver1/RAEtherNet_IPStation1
                                   &mode=offline&file=C:/tags/controller.L5X&tags=Line1
                                   &replace=0&timeout_s=120

`optix_edit` exposes this as the op `import_tags` with the same fields, so a batch can carry it:

    {"op":"import_tags","station":"CommDrivers/RAEtherNetIPDriver1/RAEtherNet_IPStation1",
     "mode":"offline","file":"C:/tags/controller.L5X","tags":"Line1,Line2","replace":false}

A station's `TagImporter` is a **design-time** SDK object (`UAManagedCore.TagImporterAPI`): it exists in
Studio and not in a running runtime, which is why the bridge is the only place this can happen and why no
screen can do it. `mode=offline` needs `file` (absolute path): the root element decides the kind and the
file is refused with `invalid_import_file` unless it is `RSLogix5000Content` (an L5X) or `PlcProjectInfo`
(a TPY). `mode=online` fetches from the configured controller and takes no file.

`tags` is a filter with the dot-boundary rule the documented partner tool uses: a symbol matches when it
is the requested name, sits below it (`Line1.Motor`) or above it (`Line1` matches a request for
`Line1.Motor`). Omitted means every symbol the source carries.

`replace` decides what happens to station tags the source does not carry. With `replace=false` (the
default) nothing is removed and the call refuses up front with `would_remove_tags` and a
`removed_would_be` list, so a merge can never silently drop a tag; `replace=true` removes them.
`dry_run=true` answers `would_add`/`would_remove` from the file and the station without touching the
importer.

Verified live on the demo project: an RA EtherNet/IP station imported from a generated L5X, `added`
listing the source symbols and `already_present` counting the repeats, and a screen label bound to an
imported tag then showing its value.

## What it will not do

- It does not rewrite an existing flat model. `check` reports it; the operator decides whether to move
  tags (a move changes NodeIds and breaks bindings, so it is a planned change, not a cleanup).
- It does not create alarm configurations, loggers or recipes — those are separate node trees; the two
  bridge routes that write their module-typed children are described above, and the tool leaves them to a
  caller that means them.
- It is not a certified UA companion specification. The hierarchy is the engineering convention this
  bundle teaches, with rule ids that are the bundle's opinion, not a clause from a standard.
