# tags-import

PLC tags come into a project through a station's design-time `TagImporter`, which lives in Studio — so the
bridge is the only place the import can run. `optix_edit` op `import_tags` (and the route
`POST /bridge/station/import-tags`) drives it.

## The call

```json
{"op":"import_tags","station":"CommDrivers/RAEtherNetIPDriver1/RAEtherNet_IPStation1",
 "mode":"offline","file":"C:/projects/Line.L5X","tags":"Line1","replace":false,"timeout_s":120,"dry_run":true}
```

| Field | Meaning |
| --- | --- |
| `station` | path to the station node that carries a `TagImporter` child |
| `mode` | `offline` (parse a file) or `online` (fetch from the controller) |
| `file` | absolute `.L5X` or `.TPY` path; required when offline |
| `tags` | optional filter, dot-boundary matched: the symbol, its children, its parents |
| `replace` | `false` merges; `true` drops station tags not present in the source |
| `timeout_s` | 1…3600, default 120 |
| `dry_run` | answers `would_add` / `would_remove` without invoking the importer |

Offline refuses a file whose root element is neither `RSLogix5000Content` (L5X) nor `PlcProjectInfo` (TPY)
with `invalid_import_file`. `replace=false` refuses up front with `would_remove_tags` plus
`removed_would_be` rather than silently dropping a tag.

## Prerequisites that bite

- The station must exist and carry a `TagImporter` child. A station created through `create_object` has
  **none**: `create_object object_type="TagImporter"` (bare browse name) adds one, but a station built that
  way still lacks the driver-side wiring Studio's own Add Station flow creates — and in this build the
  offline `Import()` against such a station did not complete inside the timeout. Prove the route and the
  refusals there; do the last mile against a station created in Studio.
- A station's subtree also holds `Route`, `StationStatusVariables`, `Types`, `TagImporter`; the tag census
  must count only the children of `Tags`, or a merge reports dozens of structural "removals".
- The importer's `FilePath` takes a `FTOptix.Core.ResourceUri` on 1.8.1.27 (not `UAManagedCore.ResourceUri`,
  which does not exist in this build).

## After the import

Read the station's `Tags` collection back through the bridge (`optix_read action="node"`), then bind a label
or a screen to a tag so the import is visible, then `optix_save` and restart. An import that returns `added`
and renders nothing has usually imported into a station the runtime is not using.
