# dsh-engineering-ftview

FactoryTalk View ME tools for the `dsh-engineering` bundle. Three loader entries share one package:

| Entry | Tools | Purpose |
|---|---|---|
| `dsh-engineering-ftview` | 6 read tools | Open an export folder, list and read displays and HMI tags, search, check, compare |
| `dsh-engineering-ftview/edit` | 5 tools | Stage display and tag changes, validate, apply to a new folder |
| `dsh-engineering-ftview/studio` | 3 tools | Discover Studio, preflight changed files, plan the manual import |

The `factorytalk-view` guidance ships as the separate `dsh-engineering-ftview/skill` entry.

## Read surface

`ftview_open` scans one export folder and returns a `view_id`. `ftview_list` pages displays or tags,
`ftview_get` reads one display (named objects) or one tag row, `ftview_find` searches names and text,
`ftview_check` reports tag CSV integrity, duplicate names and unparsed files, and `ftview_compare`
diffs two exports by display name, tag name and file hash.

This is a TypeScript redesign, not a port of the old Python plugin: no `engine.py`, no `lxml`, no
`ftview_project_start`/`environment`/`stage_register` tools.

## Editing

`ftview_draft_display_set`, `ftview_draft_display_add` and `ftview_draft_tag_upsert` stage one change
per call; `ftview_validate` applies the staged edits to a re-parsed copy and reports changed files;
`ftview_apply` writes a new export folder, leaving the source untouched.

## Studio

`ftview_studio_status` discovers installed FactoryTalk View ME tooling and schemas.
`ftview_studio_preflight` checks changed files for import problems, including Studio name
restrictions. `ftview_studio_handoff` returns the ordered manual import plan. No vendor utility runs.

## Configuration

| Entry | Option | Default |
|---|---|---|
| read | `maxFiles` | 2000 |
| edit | `maxDraftOperations` | 100 |
| studio | `searchRoots` | the two Rockwell Programs folders |

## Boundary

The surface parses documented text exports (display XML and the HMI tag CSV). It does not decode MER
or MED, contact a terminal, validate against vendor XSD, bind tags to a PLC, or drive Studio.
FactoryTalk View SE and FactoryTalk Optix are different products and are not analyzed here.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
