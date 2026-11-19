# Project

A FactoryTalk Optix project can be worked on through two authoring channels: the **live model** inside
Studio, through the bridge (`optix_edit`, `optix_action`, `optix_screen`, `optix_model`), or the **files
on disk**, through `optix_project` and `optix_build` when Studio must stay closed. This page covers the
session tools — `optix_status` and `optix_read` first, then batches and their validation, the schema
catalog and expressions, the OPC UA model, the file channel, saving and building, the emulator and the
logs.

## Two channels

| | Live model | Files |
| --- | --- | --- |
| Tools | `optix_edit`, `optix_action`, `optix_model` and the screen tools | `optix_project`, `optix_build` |
| What it writes | the design model inside Studio | `Nodes/**/*.yaml`, the NetSolution sources, the `.optix` file |
| Needs the bridge | yes | no |
| Needs a save | yes — the runtime loads the saved project | no; the write is already on disk |
| Refused when | the bridge is offline | Studio has the project open, the bridge holds unflushed changes, or a second write runs |
| Correct for | anything the runtime must show after one save | scaffolding, renames, a whole subtree, NetLogic sources, repairing a project whose Studio session cannot be reused |
| Proof | `optix_read` reads the change back | validation, per-file hashes, and `optix_build action check` |

They are alternatives, not a pipeline: a bridge edit and a file edit of the same node is the race the
file channel refuses by name. When Studio is open, use the bridge. When Studio is not, or the job is a
rename that changes every pointer, use the files.

## `optix_status`

The first call of every session, and the one that answers "can this work here". It reports:

- whether Studio is running and whether anything listens on the bridge port;
- the bridge version and the project it answers for;
- which capabilities are on (the switches);
- the `preview_chain` — the row's `preview` switch, the browser mode and whether a browser is available,
  whether the emulator serves its URL and how many tabs match it, and whether the OCR executable and
  language data are installed — with `next` naming the one link to fix first;
- `needs_save`: how many authoring calls have been made since the last save;
- `build_state` when asked about a project: whether `bin/<Project>.dll` is newer than the newest `.cs`,
  and whether the references file resolves;
- `setup` when asked about a project: the ordered steps that make the project authorable, each with
  `owner: "tool"` or `owner: "human"`, so "open it in Studio and press StartBridge" is not hidden in
  prose.

Measured on the reference machine, `setup` answered `ready: false`, `human_open: 2` and
`unobservable: ["licence"]`: the two human steps are opening the project and StartBridge, and nothing on
the host can observe an Optix licence before the runtime starts.

`optix_status { saved: true }` clears the pending count — but only on evidence. The call trusts you;
`optix_emulator { action: "status" }` is what proves it from the files (`disk`, `saved_after_edit`).

When the bridge is down it answers with a ranked diagnosis rather than a shrug: `causes` in order, and
`next` quoting the one thing to fix. Work through them, never start Studio yourself, and never retry a
preview tool against a dead link.

## `optix_read`

| Action | Answers |
| --- | --- |
| `map` | the tree with names, types and node ids; `mode: "overview"` at low depth, `mode: "detail"` for one subtree; `match`, `depth`, `max`, `ids` refine it |
| `node` | one node with its variable members, references and the dynamic links it carries |
| `screens` | the screens, their size and what mounts them |
| `ui_types` | the project's own object types |
| `schema` | the bridge's op table: every operation, its fields and datatypes, and the op count |
| `type_schema` | one type: properties with datatypes, methods, events and allowed children |
| `type_info` | the type of a node path, with its supertype chain |
| `variable_members` | the members of a variable, resolved against its declared type |
| `clr_type` | the CLR type behind a name — what a NetLogic has to write |

`map` is the cheap first look; `detail` for one subtree; `node` for exactly one thing. A read is also
the only evidence an authoring call worked: a batch can report `applied` while the model does not hold
what you meant, and the read is what makes the difference visible.

## `optix_edit`: one typed batch, validated first

`optix_edit` is the single write path for the live model. Each call is a batch of typed operations; the
batch is validated strictly against the model first, then dispatched one operation at a time, stopping
at the first failure. `dry_run` defaults to `true`, so the first call of every new batch is free.

The tool states its own contract: no automatic retry, no batch rollback. A failed batch reports `partial`
when some operations landed and `indeterminate` when a call's outcome cannot be known; after an
`indeterminate` you re-read the model before retrying, because a blind retry duplicates whatever landed.

| Operation | Fields | What it does |
| --- | --- | --- |
| `set_property` | `path`, `name`, `value`, `locale?` | sets a property; the model materialises properties when written, not from the type |
| `bind` | `path`, `name`, `source_path` or `raw_path`, `mode` | a dynamic link from a property to a variable or a raw path |
| `create_widget` | `screen`, `name`, `widget_type` | one builtin widget on a screen |
| `set_link` | `path`, `source`, `mode` | a dynamic link written on the variable itself — the only route for a module-typed variable whose `Value` has no setter |
| `create_variable` | `parent`, `name`, `datatype`, `kind` (`value`/`analog`), `units`, `range`, `array`, `dims`, `display_name` | a variable on any object; `analog` adds the unit and range the operator reads |
| `create_folder` | `parent`, `name` | a folder node |
| `create_object` | `parent`, `name`, `object_type` | an instance of a project or builtin type |
| `create_type` | `parent`, `name`, `base_type` | an object type |
| `create_alias` | `parent_path`, `name`, `target_path`, `kind` | an alias, resolved per instance |
| `delete` | `path` | removes a node |
| `move` | `path`, `new_parent`, `new_name` | reparents and optionally renames |
| `reorder` | `path`, `position` (`front`/`back`), `index` | z-order among siblings |
| `wire_event` | `path`, `event_type`, `method_path`, `command`, `variable`, `value`, `args`, `object_raw`, `replace` | an event handler: a method, a command, a variable write |
| `attach_expression` | `path`, `prop_name`, `expression`, `sources` | an expression with `{0}`, `{1}` resolved against sources |
| `attach_formatter` | `path`, `prop_name`, `format`, `sources`, `mode` | a numeric `StringFormatter` |
| `attach_string_formatter` | `path`, `prop_name`, `format`, `sources`, `raw`, `mode` | a string formatter |
| `retype` | `path`, `datatype`, `dims` | changes a variable's datatype |
| `import_tags` | `station`, `mode` (`offline`/`online`), `file`, `tags`, `replace`, `timeout_s`, `dry_run` | imports a PLC tag set through the station's `TagImporter` |

Rules the validator enforces, each measured rather than assumed:

- **A colour is `#RRGGBB`.** `0xRRGGBBAA` is refused; an SVG colour that has to be driven by a Boolean
  becomes the ARGB expression form instead.
- **A `NodeId` needs a resolvable node path.** `bad_value: NodeId value must be a resolvable node path`
  is the answer to a path that does not exist — and for a style sheet, the project-relative spelling is
  the one that resolves.
- **A whole array is not an element.** Widget and property writes distinguish the two, and an array
  element is spelled `Name[3]`, never a bare array name.
- **`set_link` is unchecked, by design.** Bridge 1.0.9 does not preflight it; the batch runner reports it
  in `unchecked` rather than refusing it, and it lands as a `DynamicLink` child (`DataType: NodePath`,
  `Value: "../../../Model/Smt/ActiveFaults"`).
- **A created object carries its type's properties and none of its behaviour.** That is why an alarm made
  by `create_object` never acknowledges: `optix_invoke` answers `No behaviour or observer found that
  handles the method 'Acknowledge'`.
- **A name that shadows a builtin type is refused before a byte is sent.** Studio generates one
  global-namespace class per project Screen, Panel, Window, Dialog or Popup into
  `ProjectFiles/NetSolution/Private/UITypeDefinitions.cs`, so a screen named `Trend` shadows
  `FTOptix.UI.Trend` and breaks every NetLogic that names the type — measured: `CS0029` plus four
  `CS1061` errors, and `bin/<project>.dll` was deleted. Rename the screen; a screen cannot be renamed by
  `move` (`not_an_object: … is ObjectType`), so create the new one, repoint what mounts it, delete the
  old one.

`optix_action` is the single-action counterpart: create a NetLogic, ensure a web presentation engine, add
a translation, convert an instance to a type, or invoke an exported method. The netLogic and engine
creations need `allowWrites`; invocation needs `allowInvoke` and a session-safe bridge.

## Expressions and formatters

`optix_validate_expression` checks a formula against real node paths before it is attached: the
`sources` are comma-separated node paths in placeholder order, and the answer is the compiler's verdict,
not an opinion. `attach_expression` then installs it.

What the model accepts, measured:

- **A conditional expression works**: `if({0} >= 80, "HIGH", "LOW")`.
- **`+` is numeric only.** Text composition is refused (`bad_expression`) — wrap the value in a
  formatter instead of concatenating strings.
- **A formatter is three writes and an ordering.** The `StringFormatter`'s sources are child variables
  named `Source0`, `Source1`, … by placeholder index, each wired with
  `Refs.AddReference(FTOptix.CoreBase.ReferenceTypes.HasSource, src)`; `Format` is written through the
  `HasParameter` child, never the `.Format` setter (which has killed Studio from the bridge thread); and
  the label's `TextVariable` gets `SetConverter(formatter)` **while the formatter is still detached**.
  `SetConverter` is an extension on `IUAVariable`, not on `Label` (`CS1929`). The hand-assembled
  `DynamicLink` + `HasConverter` + `HasDynamicLink` structure reads back correctly and renders nothing.
- **The measured failure was three faults at once**: a source child named `Sourceoee` instead of
  `Source0`, the hand-assembled link, and a converter attached after the link. `attach_formatter`
  reported `applied: true` and the label stayed blank for three attempts; the runtime log named
  `Missing source variable 'Source0'`.

## `optix_schema`

The schema catalog is generated out of the documentation installed beside Studio and shipped with the
plugin, so it answers with no bridge and no Studio session: **565 object types, 102 variable types and
110 enums** for Studio 1.8.1.27.

| Action | Answers |
| --- | --- |
| `type` | the supertype chain, every property with its datatype and whether inherited, the methods with their arguments, the events, the allowed children, and `clrType` — the C# name a NetLogic writes |
| `enum` | the values with their numeric and display names |
| `find` | types, enums and properties matching, folding a property dozens of types share into one row with an owner count |
| `children` | what may be created inside a type |
| `refresh` | diffs the shipped catalog against the running bridge's own dump: `added`, `changed`, `datatype_drift` |

`refresh` is honest about what it cannot see. The runtime dump carries one property per type with its
CLR datatype, so `datatype_drift` is the help naming the UA datatype where the runtime reports the CLR
one (`Width` is `Size` in the reference and `Single` at runtime — expected, not a defect). Measured on
1.8.1.27: **2 added, 94 changed, 748 drifted**.

A refusal from `optix_edit` carries the closest matches; the schema is the cheaper answer, because it
does not need a round trip to be refused.

## The OPC UA model: `optix_model`

`optix_model` builds and judges the tree behind the screens with one convention:
`Model/Types/<Kind>` for object types, then `Model/<Plant>/<Area>/<Line>/<Equipment>/<Signal>` for
instances. There are three levels between `Model` and the line and they are configurable (`hierarchy`,
default `Plant / Area / Line`, any other count refused). Signal names are PascalCase letters, digits and
underscore, at most 40 characters.

| Action | What it does |
| --- | --- |
| `plan` | the ordered operations and the folder tree it would create, writing nothing; the plant, area and equipment names are the operator's to choose |
| `apply` | submits the plan through the same strictly validated batch `optix_edit` uses (needs `allowWrites`), skips paths that already exist, reports what it created |
| `check` | reads the live `Model` tree and reports `OPTIX-MDL-01..06` with a `structured` or `needs-work` verdict |

| Rule | Severity | What it reports |
| --- | --- | --- |
| `OPTIX-MDL-01` | critical | a signal outside the hierarchy |
| `OPTIX-MDL-02` | warning | an analog value with no `EngineeringUnits` |
| `OPTIX-MDL-03` | warning | a signal with no `Description` |
| `OPTIX-MDL-04` | warning | a name that breaks the convention |
| `OPTIX-MDL-05` | info | a folder holding more than twelve variables |
| `OPTIX-MDL-06` | info | equipment folders with no `ObjectType` behind them |

An existing flat model is reported by `check`, never rewritten.

A signal's metadata are **child variables**, and that is a measured limitation rather than a design
choice. Studio 1.8.1 writes only `DisplayName` as a node attribute, and `DeclaredPropertyGuard` refuses
`EngineeringUnits` and `EURange` as UA properties, so `create_variable kind: "analog"` writes
`EngineeringUnits` as a `LocalizedText`, `Description` as a `String`, and the range as an empty
`EURange` `Range` node with `EURangeLow` and `EURangeHigh` Floats beside it. A `Range` value cannot be
assigned through the bridge ("Conversion to Struct not supported"), and a variable of `AnalogItemType`
cannot be created at all: the route takes a datatype, and a VariableType name is refused.

A type's members are copied onto each instance too, because the bridge writes members with
`ModellingRule` None and a None member is not instantiated. The result reports `metadata` and
`inheritance: "copied"`; the fix belongs in the bridge (`SetModellingRuleRecursive()`), not in a
workaround.

### Variables on a component

Any object can carry a variable, and that is how a screen keeps state: a setpoint on a faceplate that
edits it, a lamp's current colour, a value two instances must not share. Studio offers four kinds —
Variable, Analog variable, Node pointer, Alias — and `optix_edit` writes them on the object that owns
the value: `create_variable` for a plain value or `kind: "analog"` with `units` and `range`, `array` or
`dims` for a shape, `display_name` for the operator's words (the BrowseName in the path never changes),
and `create_alias`/`create_object` for parameterising one screen type across many panels. The `UI` folder
itself cannot contain variables, so a value with no owner is a sign the composition is wrong.

### Module-typed children and the routes that are not batch ops

Some node kinds are module types rather than plain datatypes, and the batch has to name a route for
them:

| Route | Used for | Notes |
| --- | --- | --- |
| `POST /bridge/model/variable` | creating a module-typed variable (`VariableToLog`, `StoreColumn`, `EventFieldPath`, `EventFieldToLog`, `TrendPen`) | resolves the bare name against 18 builtins and then the module catalogs (first module wins); `FTOptix.DataLogger.VariableToLog` pins one; the answer reports `variable_type` |
| `POST /bridge/node/displayname` | the operator's name for a node | follow-up to a creation that took `display_name` |
| `POST /bridge/node/set-structured` | appending or replacing elements in a structured collection (`DataLogger.VariablesToLog`, `Trend.Pens`) | JSON array body, each item `{"Name": …}` plus fields; 200-item cap; unknown field, non-collection, read-only field, blank, non-array and duplicate are refused before writing; `replace` removes first; a failed batch rolls back |
| `POST /bridge/node/set-link` | the dynamic link on a module-typed variable's own `Value` | `bind` cannot: a `VariableToLog` "has no settable property 'Value'" |
| `/bridge/node/invoke` | calling a method on a live node | `optix_invoke`; a tool-created node is a plain object and answers `No behaviour or observer found` |

A logger's table is created on its first sample, so a `DataGrid` or `Trend` bound to it renders empty
until rows exist — an empty grid proves nothing until the logger has run once.

`import_tags` is a batch op and a route. A `TagImporter` is a design-time `UAManagedCore.TagImporterAPI`
object; offline mode needs an absolute `file` whose root element is `RSLogix5000Content` (L5X) or
`PlcProjectInfo` (TPY), else `invalid_import_file`; `tags` is a dot-boundary filter (`Line1` matches
`Line1.Motor`, and `Line1` satisfies a request for `Line1.Motor`); `replace: false` refuses up front
with `would_remove_tags` and `removed_would_be`; `dry_run` answers `would_add`/`would_remove`. Measured
against Studio 1.8.1.27: the route, the op, the validation and the error codes (`station_not_found`,
`not_a_tag_station`, `invalid_import_file`) work, and the importer is reached — but an end-to-end import
is **not proven**: the offline `Import()` timed out and added no tags, most likely because a station made
by `create_object` is a bare `Station` without the Add Station driver wiring. `ResourceUri` is not in
`UAManagedCore` in this build (`CS0234`), and that bare station has no `TagImporter` child
(`ArgumentException: Station node … does not contain a TagImporter object`).

## The file channel: `optix_project`

`optix_project` reads and edits the project **as files**. It is the only sanctioned writer of the project
tree, it refuses while Studio or the bridge is mid-flight, and it is the way to rename a project (which
rewrites every absolute pointer) or scaffold one whose Studio session is gone.

| Action | What it does |
| --- | --- |
| `check` | validates every chapter: YAML, node names, references, absolute pointers; reports the gates that would refuse a write |
| `census` | counts files, nodes, types, NetLogic and screens |
| `node` | reads one node by project path |
| `sources` | lists the chapters and the backups |
| `stage` | replays a batch in memory and writes only a manifest with per-file hashes |
| `apply` | writes a staged batch from per-file backups, all or nothing, with rollback |
| `diff` | compares a backup with disk after Studio opened the project |
| `restore` | puts a backup back |

The gates, by name, because the fix is chosen from the code:

| Code | Meaning |
| --- | --- |
| `project_open_in_studio` | Studio has this project open — close it, or use the live model |
| `bridge_state_unflushed` | the bridge holds authoring changes Studio has not saved |
| `write_in_progress` | another write holds `.dsh-write.lock`; a lock older than 10 minutes is reclaimed |
| `file_changed_on_disk` | a staged file changed after staging; `force` bypasses this one gate only |
| `invalid_project_yaml` | a chapter would not load |
| the 400-file cap | a plan touching more files than that is refused |

The writable set is explicit: `Nodes/**/*.yaml`, `ProjectFiles/NetSolution/*.{cs,csproj,sln,references}`,
`<Name>.optix`, `<Name>.optix.design`, and `ProjectFiles/{imgs,res}`. YAML is spliced in Studio's own
style rather than re-dumped by a serializer, so a diff against a Studio save stays readable.

Operations: `write_file`, `replace_text`, `insert_node`, `remove_node`, `set_node_value`,
`set_project_name`. `set_project_name` rewrites `Project.Name`, the root chapter file and its `Name`, the
design file, and every absolute `/Objects/<old>/` pointer — including `Authentication.DefaultUserFolder`,
which is why a hand rename silently breaks login. A registration resolves relative to the directory of
the chapter that names it, and the chapter's own root node is the node that registration becomes: never
nest a `- File:` entry under a node, because it is then neither a node nor a registration and Studio
silently never loads it.

### What `check` finds

| Finding | Severity | Meaning |
| --- | --- | --- |
| `file_missing` | critical | a registration names a file that is not there |
| `yaml_invalid` | critical | a chapter does not parse |
| `reference_without_target` | critical | a reference names no node |
| `unresolved_dynamic_link` | critical | a dynamic link names a node the project does not have |
| `unresolved_pointer` | critical | a pointer names a missing node |
| `duplicate_name` | warning | two nodes share a name where Studio will not allow it |
| `absolute_pointer_foreign_root` | warning | an absolute pointer names another project |
| `file_unregistered` | warning | a chapter exists but the project does not list it |
| `pointer_to_ui_object` | warning | a pointer aims at a UI instance rather than a type |
| `binding_unverified` | info | a binding could not be checked offline (capped at 25, with a summary) |
| `VIEW-LAYOUT-01` | warning | a screen placed by absolute rectangles only |
| `VIEW-SCALE-01` | warning | a screen with no `ScaleLayout` |
| `OPTIX-DATA-02` | info | a `*StoreTable` with `RecordLimit` absent or 0 — the runtime warns about unbounded growth until it is set |

Measured on the shipped starter `packages/optix/templates/arya-optix-app/project`: **128 judgeable links,
121 resolve, 7 info**. On a customer template (`KphungFROMM\OptixStandardTemplate`): **2 criticals**, both
dead links to `UI/Stylesheets/MyStylesheet`. A staged edit refuses while any critical stands, and
`introduced_criticals` tells you whether the dead link is the plan's own or one the project already
carried. Measured on the record-limit finding: `set_property … RecordLimit 5000` on the table came back
`{datatype: "UInt32", via: "materialized"}`, and the runtime warning stopped once the save landed —
`optix_project action check` reads the chapters on disk, so the finding clears only after `optix_save`.

## Saving: `optix_save`

Studio exposes no save API to a NetLogic bridge. `UAManagedCore` can read and write the design model,
compile NetLogic, open dialogs and query a store, but writing `Nodes/**` to disk is the IDE's own
business — there is no `Save`, `IsDirty` or `Persist` symbol in it. So the save is the vendor's own
keystroke, made reliable and observable:

1. find the Studio process that owns a visible main window;
2. snapshot the newest modification time under `Nodes/` and `ProjectFiles/NetSolution/bin`;
3. raise that window — a plain `SetForegroundWindow` is refused while another process owns the
   foreground, so the tool attaches to the foreground thread's input queue, restores and raises the
   window, then detaches;
4. confirm Studio really owns the foreground **before** sending exactly one Ctrl+S; a keystroke that
   would land in another window is never sent;
5. wait for the write, re-snapshot, and return as soon as a watched file is newer.

`ok: true` means a file under `Nodes/` or `ProjectFiles/NetSolution/bin` moved. Nothing else counts — not
a delivered keystroke, not a clean title bar.

| Field | Meaning |
| --- | --- |
| `method` | `keystroke:ctrl+s` |
| `saved_at` | the modification time of the newest file that moved |
| `attempts` | raise-and-keystroke rounds tried |
| `keystrokes_sent` | rounds where the foreground was confirmed and Ctrl+S went out |
| `foreground_confirmed` | rounds where Studio actually owned the foreground |
| `latency_s` | wall time from the first raise to the proof |

| Failure code | Cause | Fix |
| --- | --- | --- |
| `no_project` | no project folder given | pass `project` (the folder holding the `.optix`) |
| `unsupported_platform` | not Windows | save in Studio by hand |
| `studio_not_running` | no Studio window | open the project in Studio |
| `foreground_refused` | another window holds the foreground every attempt — a Windows Security prompt, a browser, this GUI; a `PickerHost.exe` credential prompt is the usual culprit | close or dismiss that window |
| `no_write` | Ctrl+S delivered, foreground was Studio, nothing under `Nodes/` changed | Studio is probably showing a modal dialog — dismiss it and retry |

It **saves; it does not rebuild**. Measured 2026-11-18: a save that moved 29 sources under
`ProjectFiles/NetSolution` left `bin/<Project>.dll` at its older timestamp. And a loaded NetLogic class
only picks up new code after Studio restarts; a newly added bridge route answers `404 unknown route`
until it does. `optix_save` needs `allowWrites` — it writes the project to disk, starts no process and
edits no file itself.

The order inside the persist step is fixed: stop the runtime if it is up, then save, then build, then
start again. A build taken while the emulator runs fails on `MSB3061` (the runtime holds
`bin/<project>.dll` open) and saves nothing.

## Building: `optix_build`

`optix_build` answers the two questions the bridge cannot — *will this compile* and *did the last build
carry my change*. It works on the NetSolution, in or out of place, and never writes `bin/` during a
check.

| Action | Answers |
| --- | --- |
| `status` | `never_built`, `stale` (the DLL is older than the newest `.cs`, so the runtime serves earlier code) or `built`; plus the newest source, the artefact's size and time, and how many references no longer resolve |
| `check` | copies the solution to `%TEMP%\dsh-optix-build-*` and builds there: `ok`, `exit_code`, `errors`, `warnings`, `tail`, `locked` (`MSB3026`/`MSB3027`) and `stale_object` (`CS2001`/`MSB3491`) |
| `references` | rewrites `<Project>.references` from the installed Studio — 41 module assemblies plus 2 binding assemblies on 1.8.1.27, the 43 a Studio-generated file carries |
| `init` | scaffolds a `net8.0` csproj, a sln and a references file for a project created outside Studio |
| `build` | builds in place, writing `bin/<Project>.dll`, and reports `build_state` so the answer says whether the artefact Studio will load carries the current sources |

A missing .NET SDK is `dotnet_sdk_missing`, not a false "compiles". A green `check` means the C# compiles
— not that Studio built it. The runtime loads what Studio's build wrote, so the sequence is `status`,
then `references` and `init` only when missing, then `check` after editing C#, then save, then build with
the emulator stopped, then `status` again. The detailed contract, including the four states a NetLogic
can be in, is in [NetLogic](./netlogic.md).

## The emulator: `optix_emulator`

The runtime is only ever started and stopped here — never by Studio's toolbar, never by launching the
executable. `optix_emulator` finds `FTOptixRuntime.exe` under the Studio install, loads the project's
`.optix` file, and reports `started` only once the preview address actually answers.

| Action | What it does |
| --- | --- |
| `status` | probes the leg and the preview address, which runtime the machine holds, which runtimes belong to other projects, and the persistence facts `disk` and `saved_after_edit` |
| `start` | launches the runtime against the project and waits for the preview; returns the runtime's own log when it does not answer |
| `restart` | stop then start, so the emulator picks up the newest saved build |
| `stop` | ends every runtime holding that project, including one started outside this plugin; `force` also takes the one holding the port |
| `logs` | the runtime log tail with its diagnosis |

The diagnosis is named, so the fix is chosen rather than guessed:

| Diagnosis | What it means |
| --- | --- |
| `port_in_use` | something else holds the preview port |
| `file_locked` | the runtime's own DLL is held — stop it, build, start again |
| `licensing` | no Optix entitlement; `demo_mode` is this path and is a notice, not a fault |
| `exception` | the runtime threw at boot; the log carries the stack |
| `missing_file` | the project or the runtime is not where the project says |

`demo_mode` is the one to expect on a machine without an entitlement: the log says *Standard entitlement
not found*, the runtime closes itself after 120 minutes, and the preview works normally until then. A
notice is not a defect — name it once, then keep working.

Starting and stopping need `allowInvoke`. Say that the runtime was started this way rather than implying
Studio was asked to run the project.

## Preview, screenshots and OCR

The preview chain is four links, and `optix_status` names the first one that is missing: the row's
`preview` switch, a browser (the plugin launches Chrome or Edge by default, or `browser: "attach"`
connects to one started with `--remote-debugging-port`), the project's **Web presentation engine**
serving `previewUrl` (default `http://127.0.0.1:8081/`), and — for text on the canvas — a host Tesseract
configured under `ocr` (an `executable`, a `language` and a `tessdataDirectory`).

- `optix_preview` reads the page's text, or clicks, types and presses keys in it. Canvas controls may
  have no DOM text, so coordinates are viewport CSS pixels taken from `optix_screenshot`. Input needs
  `allowPreviewInput` and can change runtime values — say so before using it.
- `optix_screenshot` captures the viewport through the browser's own debugging protocol and returns a
  durable image. It needs the preview enabled, an attachment provider, and exactly one open preview tab;
  it repeats `needs_save` in one line because the runtime serves the saved project.
- `optix_ocr` reads text that the page exposes no DOM for, through the host Tesseract. It is registered
  only when the row configures `ocr`; `optix_ocr_setup` reports whether Tesseract and its language data are
  present and, with `install: true`, installs it through `winget` (never a Python service or a daemon).
  Ask before running that install.

`optix_action` with `ensure_web_engine` adds the engine node a project lacks: the port, the protocol,
`MaxNumberOfConnections`, `StartingUser`, `AllowedLocalSources` and `StartWindow`.

A screenshot is evidence only when it shows the change you made: the caption you wrote, the value that
moved, the screen the button reached. Say what you looked at, what it showed, and what the picture cannot
settle — behaviour with no visible effect, an alarm that never fired, a runtime event with no on-screen
result.

## Logs: `optix_logs`

Two logs explain a screen that renders nothing, and they answer different questions.

| `which` | File | What it carries |
| --- | --- | --- |
| `runtime` (default) | `%LOCALAPPDATA%\AryaCode\OptixRuntime\<Project>-<hash>.log` | the project under test: NetLogic `Log.Info` lines, binder warnings (*Missing source variable 'Source0'*), store lines, method lookups |
| `bridge` | `%LOCALAPPDATA%\Rockwell Automation\FactoryTalk Optix\FTOptixStudio\Log\FTOptixStudio.0.log` | the bridge's own `Log.Info("StudioBridge", …)` lines and the vendor error text it turned into a JSON error |

Parameters: `which`, `project` (an absolute folder, so the right runtime log is chosen rather than the
newest), `lines` (1–2000, default 80) and `filter` (a case-insensitive substring). Both are read-only.

The worked example this repository keeps: a formatted label showed nothing while `attach_formatter`
answered `applied: true`. Filtering the runtime log to the NetLogic's own name named the failure
immediately, and the fix came from that line, not from the model.

## Limits

- **Two channels, no mixing.** A bridge edit is invisible to the runtime until a save; a file edit is
  refused while Studio holds the project, because Studio's next save would overwrite it.
- **No save API exists**, so the save is a keystroke that can be refused by the foreground. `no_write`
  and `foreground_refused` are facts about the desktop, not about the model.
- **A save is not a build**, and a build needs the emulator stopped.
- **The preview serves the saved project**, so nothing unsaved is in the picture.
- **`import_tags` is not proven end to end**, and a station made by `create_object` has no `TagImporter`
  child.
- **Units and range are emulated as child variables**; a real `AnalogItemType` cannot be created through
  the bridge, so an OPC UA client sees a bare number plus two strings.
- **`DataLogger` needs `set_structured` plus `set_link` per element**; `bind` cannot reach a
  `VariableToLog`'s `Value`, and a table that does not exist yet renders an empty grid.
- **`optix_invoke` cannot drive an alarm** made by `create_object`: it is a plain object with no
  behaviour. Its acknowledge comes from the shipped grid's own buttons or from a runtime NetLogic.
