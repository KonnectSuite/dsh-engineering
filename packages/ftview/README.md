# dsh-engineering-ftview

FactoryTalk View ME export analysis for the `dsh-engineering` bundle.

Six read intents over one opened export folder:

- `ftview_open` — scan the folder once, return the application summary
- `ftview_list` — displays or HMI tags, filtered and paged
- `ftview_get` — one display's named objects, or one tag row
- `ftview_find` — search names and text across displays, objects and tags
- `ftview_check` — structural findings: CSV integrity, duplicate names, unparsed files
- `ftview_compare` — two exports by display name, tag name and file hash

The `factorytalk-view` skill ships as the separate `ftview-read-skill` entry.

This is a redesign, not a port of the old Python plugin: no `engine.py`, no
`lxml`, no `ftview_project_start`/`environment`/`stage_register` tools. Vendor
XSD validation, PLC binding, staged changes and Studio apply are explicitly not
part of this entry; the design record is [docs/port/ftview.md](../../docs/port/ftview.md).

## Develop

```sh
pnpm install
pnpm run build   # tsc to lib/
pnpm test        # vitest, 12 tests
```
