# Cross-referencing the HMI against the PLC

A FactoryTalk View ME export and a Studio 5000 `.L5X` export describe two halves of the same machine, and
most mistakes live between them: an HMI tag whose device address names a PLC tag nobody declares, a PLC
tag whose alarm bit no screen shows, a button that writes a tag nothing reads.
`ftview_cross_reference` joins the two exports and reports the mismatches.

It reads; it writes nothing, and it needs neither FactoryTalk View Studio nor Studio 5000.

## What it is

| Fact | Value |
| --- | --- |
| Tool | `ftview_cross_reference` |
| Component | `ftview` — *FactoryTalk View ME* (beta, since `v0.4.4`) |
| Inputs | one opened View export (`ftview_open`) and the path to the `.L5X` the HMI talks to |
| Outputs | one row per HMI tag with its PLC tag, display count, logic count and status; findings; counts; `coverage.unverified` |
| Needs | nothing installed: both sides are text exports |
| Writes | nothing |

This is the one `ftview_*` tool that reads a Logix export as well as an HMI export. It does not open the
`.L5X` as a project, so the L5X tools do not see it and the HMI handle is not affected.

## What you need

| Requirement | Needed for | Optional |
| --- | --- | --- |
| An opened FactoryTalk View ME export | the HMI side: `Displays/*.xml`, and the tag CSV if the export carries one | no |
| The `.L5X` export of the controller the HMI talks to | the PLC side: declared tags and their scopes, and rung text for logic use | no |
| A tag CSV | every status except `memory`/`unsupported`; without one, every device address is unverifiable | yes, but the answer is much weaker without it |
| A decoded `Alarms.xml` | counting alarm-trigger tags and flagging an alarm expression that names a tag the HMI database lacks | yes |

The tag CSV is the part that is easy to miss. A FactoryTalk View export carries a tag CSV only when one was
exported with it, and the vendor export does not produce it. `ftview_tag_snapshot` reads the application's
own tag database and writes it without the wizard; `ftview_studio_export_prepare` plans the wizard
fallback. Without either, `ftview_cross_reference` still runs, but it has no `DevAddress` to join and says
so in its coverage rather than guessing.

The alarm expressions are a second, separate join: an alarm trigger holds `{[device]Tag.bit}` too. Supply
the decoded `Alarms.xml` — `ftview_alarm_snapshot` writes one without Studio — and each trigger's tag is
counted per row, and `ALARM_TAG_NOT_IN_HMI` flags an expression that names a tag the HMI tag CSV never
declares, usually a typo in Alarm Setup that no display would reveal. `counts.alarmUnresolved` lists those
names in the same order.

## First session

Open the View export first, then call the join with the `.L5X` path.

```json
{ "l5x_path": "C:/Projects/Line/Line.L5X", "include_memory": "no", "limit": 50 }
```

| Step | What you do | What you see |
| --- | --- | --- |
| 1 | `ftview_open {root}` on the ME export | the application summary and the `view_id` the join uses |
| 2 | `ftview_cross_reference` with the shape above | `counts` first — HMI tags, rows, linked, unlinked, memory, unsupported, displays and PLC tags on one side only — then the rows and findings |
| 3 | Read the counts, then walk the rows | `unlinked` rows are wiring bugs; rows flagged `DISPLAY_UNUSED` are dead HMI tags; rows flagged `PLC_TAG_UNREFERENCED` are usually tags that lost their logic or their screen in a revision |
| 4 | Widen the audit | `include_memory: "yes"` adds the memory tags, which is what you want when auditing a tag database rather than chasing a broken link; `limit` raises the page size up to 200 |

Start with `limit: 50` and the default `include_memory: "no"`. The counts are complete even when the row
list is truncated, so the shape of the problem is visible before the whole list is.

## What it does

| Join | Source | Used for |
| --- | --- | --- |
| HMI tag | the tag CSV in the export (`tags.csv`, or the wizard snapshot) | the `DevAddress` column and the tag type |
| Display | every `Displays/*.xml` in the export | references to the HMI tag in expressions |
| PLC tag | `Controller/Tags` and `Program/*/Tags` in the L5X | whether the tag exists, and its scope |
| PLC logic | rung text of every `RLL` routine | whether logic reads or writes the tag |

The join key is the tag path after the device-address brackets: `::[PLC]LineSpeed` joins `LineSpeed`, and
`::[PLC]Motor.Speed` joins the root tag `Motor`. A shortcut is compared as written — the tool has no
controller to resolve shortcuts through, so a shortcut that names a different path is reported as unlinked
rather than guessed at.

Every HMI tag gets one status, and every row carries the number of displays that mention it and the number
of PLC rung lines that mention its PLC tag:

| Status | Meaning |
| --- | --- |
| `linked` | the device address names a PLC tag the L5X declares. Check the `displays` column: zero means nothing on any screen shows or writes that tag |
| `unlinked` | the PLC tag is missing from the L5X |
| `memory` | a memory tag: no device address, so there is nothing to join. Hidden unless `include_memory` is `"yes"` |
| `unsupported` | the field is not `::[shortcut]Tag` — a data-table address such as `F260:0`, or free text — so nothing can be joined |

Findings, each with a code the caller can act on:

| Code | Severity | Meaning |
| --- | --- | --- |
| `HMI_TAG_NOT_IN_PLC` | warning | the device address names a PLC tag the L5X does not declare |
| `PLC_TAG_NOT_IN_HMI` | info | a PLC tag that no HMI device address points at |
| `ADDRESS_UNSUPPORTED` | info | the device address is not a Logix tag name, so the link is unverified |
| `ALARM_TAG_NOT_IN_HMI` | warning | an alarm expression names a tag the HMI tag CSV never declares; only with a decoded `Alarms.xml` |

The two directions mean different work. `HMI_TAG_NOT_IN_PLC` is the HMI asking for something the controller
does not have — a typo, a renamed tag, or a tag that only ever existed in the HMI. `PLC_TAG_NOT_IN_HMI` is
the controller having something no screen touches, which is sometimes correct (a spare, a commissioning
tag) and sometimes the sign that a screen was deleted and its logic was not.

## Limits

The report carries `coverage.unverified` for these reasons, and a summary that says so:

- Read/write direction: rung text is counted, not typed, so a tag can appear as both.
- Members and array elements join to their root tag; no member-level typing is verified.
- Shortcuts are not resolved to a controller.
- AOI-internal tags are not expanded.
- HMI tag use is textual: a display that builds a tag name at runtime is invisible here.
- The join is export against export. It says nothing about what the controller is executing or what the
  PanelView Plus terminal is displaying.
- A workaround or indirect addressing in the PLC logic is counted as text, not decoded.

## Where to go next

- [FactoryTalk View ME](README.md) — the rest of the row: reading, checks, drafting and the Studio handoff.
- [HMI design](../../reference/hmi-design.md) — the shared screen grammar and the rule-to-tool map.
- [Studio 5000 L5X](../l5x.md) — opening and reviewing the export side of this join.
- [Tool reference](../../reference/tools.md) — `ftview_cross_reference` and its parameters.
