# Cross-referencing an HMI against the PLC

A FactoryTalk View export and a Studio 5000 L5X export describe two halves of the same machine. Most
mistakes live between them: an HMI tag whose device address names a PLC tag nobody declares, a PLC tag
whose alarm bit no screen shows, a button that writes a tag nothing reads. `ftview_cross_reference` joins
the two exports and reports the mismatches.

It reads; it writes nothing, and it does not need FactoryTalk View Studio or Studio 5000.

### Alarm expressions

Alarm triggers hold `{[device]Tag.bit}` expressions too. When a decoded `Alarms.xml` is supplied, each trigger's tag is counted per row (`alarms`), and `ALARM_TAG_NOT_IN_HMI` flags an expression naming a tag the HMI tag CSV never declares — usually a typo in Alarm Setup that no display would reveal. `counts.alarmUnresolved` lists those names in the same order.

## What it joins

| Side | Source | Used for |
|---|---|---|
| HMI tag | the tag CSV in the export (`tags.csv`, or the wizard snapshot) | `DevAddress` column, tag type |
| Display | every `Displays/*.xml` in the export | references to the HMI tag in expressions |
| PLC tag | `Controller/Tags` and `Program/*/Tags` in the L5X | the tag exists, and its scope |
| PLC logic | rung text of every `RLL` routine | the tag is read or written by logic |

The join key is the tag path after the device-address brackets: `::[PLC]LineSpeed` joins `LineSpeed`, and
`::[PLC]Motor.Speed` joins the root tag `Motor`. A shortcut is compared as written - the tool has no
controller to resolve shortcuts through, so a shortcut that names a different path is reported as
unlinked rather than guessed at.

## Statuses

Every HMI tag gets one status, and every row carries the number of displays that mention it and the number
of PLC rung lines that mention its PLC tag:

- `linked` - the device address names a PLC tag the L5X declares. Check the `displays` column: zero
  means nothing on any screen shows or writes that tag.
- `unlinked` - the PLC tag is missing from the L5X.
- `memory` - a memory tag: no device address, so there is nothing to join. Hidden unless asked.
- `unsupported` - the field is not `::[shortcut]Tag` (a data-table address such as `F260:0`, or free
  text), so nothing can be joined.

Findings, each with a code the caller can act on:

| Code | Severity | Meaning |
|---|---|---|
| `HMI_TAG_NOT_IN_PLC` | warning | the device address names a PLC tag the L5X does not declare |
| `PLC_TAG_NOT_IN_HMI` | info | a PLC tag that no HMI device address points at |
| `ADDRESS_UNSUPPORTED` | info | the device address is not a Logix tag name, so the link is unverified |

## What the tool cannot prove

The report carries `coverage.unverified` for these reasons, and a summary that says so:

- Read/write direction: rung text is counted, not typed, so a tag can appear as both.
- Members and array elements join to their root tag; no member-level typing is verified.
- Shortcuts are not resolved to a controller.
- AOI-internal tags are not expanded.
- HMI tag use is textual: a display that builds a tag name at runtime is invisible here.

## Using it

```json
{"l5x_path": "C:/Projects/Line/Line.L5X", "include_memory": "no", "limit": 50}
```

Start with the defaults and read `counts` first. Then walk the rows: `unlinked` rows are the wiring bugs,
`DISPLAY_UNUSED` rows are dead HMI tags, and `PLC_TAG_UNREFERENCED` rows are usually tags that lost their
logic or their screen in a revision. `include_memory: "yes"` adds the memory tags, which is what you want
when you are auditing a tag database rather than chasing a broken link.
