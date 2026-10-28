# MachineAlarms.mal record layout (research notes)

`M_Alarms/MachineAlarms.mal` is an OLE2 compound file. Two streams matter:

| Stream | Size (pilot) | Content |
| --- | --- | --- |
| `Alarms` | 7,830 B | trigger and message records, numeric fields |
| `ls00000409` | 5,790 B | the same records carrying localized labels and message text |

Everything below was read from the live applications and cross-checked against the
wizard's `Alarms.xml`; it is a research note, not a supported format.

## Framing

- `Alarms` starts with `u32 version = 16`, then `u16 triggerCount`.
- Each trigger record is a fixed-layout sequence (102 B in `Carpenter_EPS_Laminator001`):
  1. one string slot (`FF FE` = null) before the expression,
  2. the trigger expression as `FF <len>` + UTF-16LE,
  3. four little-endian `u32` fields (all zero for default bit triggers),
  4. seven `(null, empty)` string pairs - the optional tag/expression attributes,
  5. one `u32` that advances with the record (61, 63, 64, ... in the laminator app).
- After the trigger block: a `u32` message count, then message records.
- A message record is
  `[str slot][value: "1"][u32 triggerRef][u32 id][u32 back][u32 fore][u32 flags][u32 flags2]`
  where `back`/`fore` are `0x00BBGGRR` (`#800000` -> `0x00000080`) and the two flag words
  carry audio/display/print.
- Message text and trigger labels are not in `Alarms`; they live in `ls00000409`, which
  repeats the record skeleton with the localized strings filled in.

## Header block lives at the end of the stream

The wizard's `<alarm>` header attributes are not at the start - they are a trailer after the
message records. In `CC019_Main` the trailer begins with `f4 01 00 00` (500 = `history-size`)
followed by `01 00 00 00`, `fa 00 00 00` (250 = `hold-time`), `fa 00 00 00`, `e8 03 00 00`
twice (1000), then the string slots `{[PLC]RESET_TIME_ALLARMI}` (`remote-status-reset-exp`),
`{[PLC]CMD_RESET}` (`remote-ack-exp`), `[ALARM]` (`display-name`), then `3`, `5`, `0`, `0`,
`90` and `99` (`capacity-high-warning`, `capacity-high-high-warning`). Counts and every
header value are therefore present in the `.mal`; only the field order has to be mapped,
and that mapping can be confirmed against the four wizard exports already on this host.

## Why this is not yet a supported exporter

Names, ids, colours, flags and the header block are all present, so a decoder is feasible.
What is still missing is the mapping for the trigger type/ack fields and the ordering of
the localized strings in `ls00000409`, plus a writer that reproduces the wizard's exact
attribute order and indentation. Until the decoder reproduces all four available wizard
exports byte for byte, the plugin keeps using the Studio wizard
(`ftview_studio_export_prepare` / `ftview_studio_export_accept`) for alarms.
