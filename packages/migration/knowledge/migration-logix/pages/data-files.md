# Data files, structures, and the symbol table

A legacy project is a program plus numbered data files. A Logix project is a program
plus named tags and named I/O modules. The conversion has to decide, file by file,
what each numbered area becomes.

## File-type mapping

| Legacy file type | Typical use | Logix shape | Notes |
| --- | --- | --- | --- |
| `O` / `I` | Output and input image | Module-defined I/O tags, or aliases to them | The slot image is gone; each module exports what it actually exchanges. |
| `S` | Processor status | Controller tags read with `GSV`, or declared tags for the bits the program used | There is no status file. Bits that only mirrored state can often be dropped; bits that logic depended on must be read. |
| `B` | Bit file | `BOOL` array or individual `BOOL` tags | A compact `B3:0/0` can become `bool_array[0]` or a named tag; naming wins for maintainability. |
| `N` | Integer file | `DINT` array | Width changes from 16 to 32 bits. Confirm signed behaviour and masks. |
| `F` | Float file | `REAL` array | Direct mapping; watch for legacy float math that was emulated with integers. |
| `T` | Timer file | `TIMER` array | `.PRE`, `.ACC`, `.EN`, `.TT`, `.DN` survive as members. Time base must be folded into `.PRE`. |
| `C` | Counter file | `COUNTER` array | `.PRE`, `.ACC`, `.CU`, `.CD`, `.DN`, `.OV`, `.UN` survive as members. |
| `R` | Control file | `CONTROL` array | Use for shifts and sequencers; `.LEN`, `.POS`, `.EN`, `.DN`, `.ER` are members. |
| `ST` | String file | `STRING` | Length and character-set assumptions must be checked. |
| `A` | ASCII file | `STRING` or `SINT` array | Decide whether the program compared characters or printed them. |
| `PD` | PID block | `PID` structure | Gains and update time differ; treat as a tuning decision. |
| `MG` | Message block | `MESSAGE` structure | Path, type, and length must be set explicitly. |
| `BT` | Block transfer file | Module data or a `MESSAGE` tag | No numbered equivalent; the hardware strategy decides. |

## Symbol tables

Legacy symbols are documentation attached to addresses. Logix tags are the program
itself. Two consequences follow:

- A symbol the program never used is not needed, and can be retired with a note.
- An address the program used without a symbol still needs a tag, and the tag name is
  an engineering choice. `ADDRESS_ONLY_DATABASE` is the assessment's way of saying the
  legacy project is undocumented and the names will be invented.

The symbol table is also a checklist for the comparison stage: every legacy symbol
that still exists in the running machine should have a Logix tag, an alias, or a
recorded retirement.

## Structures that do not survive one-for-one

- **Timers.** The legacy structure stores a time base beside the preset; Logix stores
  the preset in seconds. Fold the base into the preset and record the arithmetic in
  the exception list. Keep `.ACC` only when it was non-zero at conversion, because a
  copied accumulator is a copied transient, not logic.
- **Counters.** Presets map, but counts driven by external pulses may be replaced by a
  counter module; the runtime behaviour of the counter module is not the same as a
  software counter scanning at the program rate.
- **Control.** Shifts and sequencers keep their control structure, but the length
  operand must be re-checked: a legacy 16-bit file length is not a `DINT` array length
  automatically.
- **Messages.** The legacy message block holds no path the Logix controller can use.
  The path must be authored, and a wrong path can still report completion.

## File organisation after conversion

Logix prefers controller-scoped tags and program-scoped tags grouped by machine area,
not file numbers. The migration can keep a `data_file_*` naming scheme for auditing,
but the maintainable end state names tags for what they are. Plan the rename as work,
not as cleanup: renamed tags break the `.L5X` comparison, so rename after the
comparison gate has done its job, or update the compare evidence deliberately.

## What is reported

`migration_assess` counts data files by type and flags the ones it cannot classify.
`migration_compare` names a data file with no Logix target as `DATA_FILE_UNMAPPED`.
`migration_report` carries the per-file table into the report, so the engineer can
sign each row. A data file that is simply dropped should appear in the report as a
retirement with its reason.
