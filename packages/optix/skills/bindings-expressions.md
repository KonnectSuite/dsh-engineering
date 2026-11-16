# bindings-expressions

The three ways a widget shows a value, and the one that always works.

| Shape | Op | Use when |
| --- | --- | --- |
| dynamic link | `bind` | one widget property follows one variable |
| expression converter | `attach_expression` | the text is computed from one or more variables |
| string formatter | `attach_formatter` | a value needs a unit, a number format or fixed text around it |

## `bind` — a dynamic link on a named property

```json
{"op":"bind","path":"UI/MainWindow/ShellHeaderUser","name":"Text","raw_path":"{Session}/User@BrowseName","mode":"Read"}
```

- `source_path` takes a node path and the bridge resolves it; `raw_path` takes a literal NodePath such as
  `{Session}/User@BrowseName`, which is what resolves per session at runtime.
- The same op refuses on a *module-typed variable's own value* — a logger's `VariableToLog`, an alarm's
  `InputValue` — with `unknown_property`. That is what `set_link` is for:

```json
{"op":"set_link","path":"Loggers/LineDataLogger/VariablesToLog/OEE","source":"Model/Smt/OEE","mode":"Read"}
```

## `attach_expression` — a computed value

```json
{"op":"attach_expression","path":"UI/Screens/Diagnostics/OeeExprLabel","prop_name":"Text",
 "expression":"if({0} >= 80, \"OEE HIGH\", \"OEE LOW\")","sources":"Model/Smt/OEE"}
```

- Placeholders are `{0}`, `{1}` in `sources` order; `sources` is a comma list of node paths.
- `+` is numeric-only. `+ " L"` is refused with `bad_expression` and told to use a formatter. Do not fight it.

## `attach_formatter` — a unit or a number format

```json
{"op":"attach_formatter","path":"UI/Screens/Diagnostics/OeeFmt2","prop_name":"Text",
 "format":"OEE {0} pct UPH {1}","sources":"oee=Model/Smt/OEE;uph=Model/Smt/UPH","mode":"Read"}
```

- `sources` is **`name=path` pairs separated by semicolons**. A comma list fails `source_not_variable`.
- The placeholder syntax is bare (`{0}`); `{0:0.0}` fails at runtime with
  `DynamicLinkFormatter: Unable to parse placeholders`.
- Under the hood the bridge builds a `StringFormatter` with children named `Source0`, `Source1`, … by
  placeholder index, and attaches it with `SetConverter` **while it is detached** — attaching the same
  structure to a target that already owns a converter paints nothing. If a formatted label stays blank,
  that ordering is the first thing to check.

## What "renders" means

A converter can be complete in the model, report `applied: true`, and paint nothing. Check with
`optix_preview action="text"`: if the text is not in that dump, no screenshot will show it.
