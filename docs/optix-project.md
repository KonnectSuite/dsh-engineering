# Optix project files: the second authoring channel

An Optix project is plain text on disk. `<Project>.optix` names the project and the chapter file
to load, `Nodes/**/*.yaml` holds the model, `ProjectFiles/NetSolution/` holds the C# classes and
their solution. Studio reads that tree, writes it on Ctrl+S, and never keeps a file handle open —
so a tool can read and edit it while Studio is running, which is exactly why the gates below exist.

`optix_project` is the file channel. The Studio bridge is still the live-model channel: it reads
back the model Studio has in memory and can author properties and bindings without a save. The two
are alternatives, not a pipeline. Use the bridge for what the runtime must show now; use the file
channel for what Studio's own editors do badly or not at all — project scaffolding, renaming a
project, adding a whole subtree of nodes, editing NetLogic sources, and repairing a project whose
Studio session cannot be reused.

## The rule both channels share

| Question | Bridge (`optix_edit`) | Files (`optix_project`) |
|---|---|---|
| Who can see the change | the live model, after Studio reads it | Studio, after it reloads the project |
| Does it need a save | yes — the bridge writes memory only | no surface has to be pressed for the file to pass validation |
| When is it refused | bridge offline, project not loaded | Studio has the project open, bridge changes unflushed, another write running |
| What proves it | `optix_read` reads the value back | validation, a byte diff, and `optix_build action check` |

`optix_project` itself neither saves nor builds — it writes files while Studio holds the project closed — and
the bridge channel writes memory only, which is what `optix_save` exists to flush. The build is the engineer's
own step (Studio 1.8.1.27 documents no build keystroke; `optix_build action build` runs it outside Studio), and
the runtime loads what the last build wrote.

## Gates

Every gate is a refusal with a stable code, and every gate is tested both ways in
`test/optix-project.spec.mjs` and `test/optix-build.spec.mjs`.

| Gate | Code | Blocks when | How to clear it |
|---|---|---|---|
| Studio closed | `project_open_in_studio` | a `FTOptixStudio.exe` command line names this project's `.optix` or its folder | close the project in Studio, or use the bridge instead |
| Bridge drained | `bridge_state_unflushed` | the bridge has accepted authoring calls since the plugin started | save in Studio first, so the file the channel is about to edit is the one that produced that state |
| One writer | `write_in_progress` | `.dsh-write.lock` is held by a live write; a lock older than 10 minutes is treated as crashed and reclaimed | wait, or delete a lock left by a crash |
| No drift | `file_changed_on_disk` | a staged file's sha256 no longer matches the disk | stage again, or pass `force` to overwrite the file |
| Inside the tree | (error names the path) | an operation names a file outside `Nodes/**/*.yaml`, `ProjectFiles/NetSolution/*.{cs,csproj,sln,references}`, `<Name>.optix`, `<Name>.optix.design` or `ProjectFiles/{imgs,res}` | name a writable file |
| Bounded | (error names the count) | a plan touches more than 400 files | split the plan |
| Valid result | `invalid_project_yaml` | the re-validation of the planned tree reports a critical finding | fix the plan; nothing was written |

`force` bypasses the drift gate only. It never bypasses Studio being open, unflushed bridge
changes, or a running write — those are not opinions about the plan, they are the reason two
writers on one project lose work.

## Staging, applying, restoring

A write is three steps, and only the middle one touches the project.

1. `stage` — the operation list is replayed in memory, every result is validated, and a manifest
   with the planned text of each file is written under `ProjectFiles/.dsh-backups/stages/`. The
   project on disk is unchanged. The stage reports the per-file `before_sha256` and
   `after_sha256`, and whether the gates would let an apply through.
2. `apply` — the gates run again, each file must still hash to `before_sha256`, the previous bytes
   are copied to `ProjectFiles/.dsh-backups/<backupId>/`, and the new bytes are written through a
   temp file and a rename. If any file fails, every file already written is restored from that
   backup: an apply is all or nothing.
3. `diff` / `restore` — `diff` compares each applied file with the backup (`unchanged`,
   `changed_outside_tool`, `missing`, or `dropped` for a file the apply deleted). `restore` puts
   the backup back, refusing when a file changed after the apply unless `force` is passed.

The scratch directory `ProjectFiles/.dsh-backups` sits inside the project so a backup travels with
the folder an engineer copies. It is ignored by Studio: only files named by a registration in
`Nodes/` are loaded.

## Operations

`node_path` is relative to the file the operation names, and the empty string means the children of
that file's root node.

| `op` | Fields | What it does |
|---|---|---|
| `write_file` | `path`, `text` | replaces a whole file |
| `replace_text` | `path`, `find`, `replace`, `all` | literal replacement, refusing an ambiguous single match |
| `insert_node` | `path`, `node_path`, `node` | inserts a node object at the end of a parent's `Children:` |
| `remove_node` | `path`, `node_path` | removes a node and its subtree |
| `set_node_value` | `path`, `node_path`, `key`, `value` | sets one scalar key on a node |
| `set_project_name` | `name` | renames the project everywhere: `Project.Name`, the root chapter file and its `Name`, the design file, and every absolute `/Objects/<old>/` pointer |

YAML is spliced in Studio's own style — `- Name:` items, `Children:` at the parent's indent, the
`Class: Reference` nodes as written — rather than dumped by a YAML serializer, because a dump
reformats every line of the file and turns a one-node edit into an unreviewable diff.

## What validation catches

`check` walks the tree the registrations describe and reports:

- `file_missing` (critical) — a `- File:` registration whose chapter is gone. A registration is
  resolved relative to the directory of the chapter that names it.
- `yaml_invalid` (critical) — a chapter that does not parse.
- `reference_without_target` (critical) — a `Class: Reference` node with no `Target`.
- `duplicate_name` (warning) — two siblings with one name. Studio saves such a file, so it is not
  an error, but an edit should not add a third.
- `absolute_pointer_foreign_root` (warning) — a `/Objects/<name>/` pointer naming another project
  root. Library roots (`/Objects/Users/Anonymous`) are normal and are reported for review, not as a
  fault.
- `file_unregistered` (warning) — a chapter under `Nodes/` that no registration loads, which Studio
  therefore never shows.
- `unknown_type` (info) — a type the Studio Help catalog does not document. OPC UA base types and
  every template-library type land here, so it is a note, not a finding.
- `unresolved_dynamic_link` (critical) — a `DynamicLink` whose value names a node this project's
  chapter tree does not have. `..` is walked from the property that carries the link, a trailing
  `@Property` is a property of the target (never a child to find), `[n]` is an index, and a leading
  `{Alias}` is proven through the alias's own pointer. This is the finding a hand-written UI chapter
  fails: the file parses, the property exists, and the value never resolves at runtime.
- `unresolved_pointer` (critical) — the same resolution for a `NodePointer` / `DataType: NodeId` value.
- `pointer_to_ui_object` (warning) — a pointer or link owned by `NetLogic/` whose target lives under
  `UI/`. UI objects exist per session, so a design-time path to one is dead at runtime; the live twin
  is `OPTIX-PROD-01`.
- `binding_unverified` (info) — a value spelled in a form files cannot prove: a template parameter
  such as `{Item}@Value`, a library-type member, an alias with no binding in any chapter, an
  expression, or an `ns=3;…` chain. Listed so silence is never mistaken for success; capped at 25
  values plus one summary line.
- `VIEW-LAYOUT-01` (warning) — a screen whose children are placed only by absolute
  `LeftMargin`/`TopMargin` and which holds no layout container, so it cannot reorganise.
- `VIEW-SCALE-01` (warning) — a screen with no `ScaleLayout` among its direct children, so it cannot
  scale to a panel of another size.

A clean `check` proves the tree is loadable, self-consistent **and that its bindings resolve against
nodes the project actually declares**. It still does not prove Studio will render it, and a
`binding_unverified` value is exactly the case where only the runtime can answer. Measured on the
shipped starter (`packages/optix/templates/arya-optix-app/project`): 128 judgeable links, 121
resolve, 7 are info. Measured on a customer template (`KphungFROMM\OptixStandardTemplate`): 2
criticals, both genuine dead links to a `UI/Stylesheets/MyStylesheet` that the project does not have.

Staging is gated on the same rule: a plan that leaves a critical finding unwritten refuses, because
an edit staged on top of a dead reference hides it. The refusal says whether the dead link is the
plan's own (`introduced_criticals`) or one the project already carried (`inherited_criticals`), so
the reader looks in the right file.
