# FactoryTalk View ME port

## What the old plugin is

`dsh-tool-factorytalk-view` 0.3.0 is a Python plugin: a 46 KB `engine.py` (lxml)
behind a 14 KB JS wrapper, eleven tools, a 6.9 KB skill, a 35 KB display-preview
client bundle, and 13 KB of bundled references. It parses documented text
exports (display XML, semicolon-separated HMI tag CSV), validates against
locally installed vendor XSDs, and drives staged Studio changes. Native MER/MED
databases are hashed, never decoded.

## Why this is not a port

The engine is Python and the tools describe internals (`ftview_project_start`,
`ftview_environment`, `ftview_stage_register`) rather than intents. Copying that
surface would bring back eleven schemas, a second language runtime inside a
TypeScript package, and bookkeeping tools the model should never call.

## Redesigned read surface

One package, `dsh-engineering-ftview`, with two separately switchable entries:

| Entry | Contents | Default |
|---|---|---|
| `ftview-read` | `ftview_open`, `ftview_list`, `ftview_get`, `ftview_find`, `ftview_check`, `ftview_compare` — 6 tools, 3,557 schema characters | off until the old plugin is retired |
| `ftview-read-skill` | `factorytalk-view` guidance, ~2.5 KB decision tree | off until the old plugin is retired |

Both are inserted `disabled: true` for now, because the old FTView plugin is
still mounted and registers the same skill name. Enabling them is the retirement
switch for this product.

### Decisions

- **Six intents, not eleven tools.** Environment discovery, project start and
  capability reporting fold into `ftview_open`'s summary and diagnostics. The
  engineering guide tool becomes skill content.
- **No Python.** Display XML is parsed with `fast-xml-parser`; the tag CSV has a
  small semicolon parser that honours quotes and reports structural problems.
  The package stays TypeScript and keeps the bundle's dependency footprint flat.
- **Structural checks only, for now.** `ftview_check` reports tag CSV integrity,
  duplicate display/object/tag names, and files that did not parse. Vendor XSD
  validation and PLC binding are listed as unverified rather than claimed.
- **Staged changes are deferred.** They become a `draft_*` family in an editing
  entry, mirroring the L5X drafts, not a `stage_register` bookkeeping tool.
- **Studio apply is deferred.** It needs Windows, licensed View Studio and the
  same per-call approval seam as the L5X controller tools.

## Status

| Item | State |
|---|---|
| Package | `packages/ftview`, `dsh-engineering-ftview` 0.1.0 |
| Tools | 6 read intents, every parameter described, summary/data/coverage envelopes, repairable errors |
| Skill | `factorytalk-view`, registered from `SKILL.md` |
| Tests | 20 passing: 12 read/skill plus 8 editing tests (registration, display attribute apply, tag upsert, display copy, draft clearing, unknown display, duplicate name, existing output) |
| Mounted in dev | rows inserted but disabled until the old plugin retires |
| Display preview | `packages/ftview-viewer` (`dsh-engineering-ftview-viewer`), the old 36 KB closure bundle re-registered under the bundle name; row `ftview-viewer`, disabled until retirement |
| Editing | `ftview-edit`: `ftview_draft_display_set`, `ftview_draft_display_add`, `ftview_draft_tag_upsert`, `ftview_validate`, `ftview_apply` — 3,101 schema characters, row disabled until retirement |
| Not ported | Studio apply/verify |

## Next

1. Editing entry: graphics attribute edits, new template displays, tag upserts,
   validated as drafts and written to new export copies.
2. Studio entry: preflight and apply behind the approval seam.
3. Display-preview client package, folded in like the ladder viewer.
4. Retire `dsh-tool-factorytalk-view` and enable these rows.
