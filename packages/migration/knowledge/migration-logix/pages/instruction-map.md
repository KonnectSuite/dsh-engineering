# Instruction mapping, SLC 500 and PLC-5 to Logix

The table below is the migration row's instruction catalogue in prose. "Mechanical"
means the wizard usually translates the instruction and the operands shape-shift in a
predictable way. "Review" means a person must choose the Logix semantics: the
instruction exists, but its timing, width, or operand meaning is not the same.

Logix operand order differs in places: for moves and maths the destination is the
last operand in the legacy front ends and the first operand in Logix. Read every
converted row as "legacy operands on the left, Logix form on the right".

## Contacts, coils, timers, counters

| Legacy | Logix | Work | Notes |
| --- | --- | --- | --- |
| `XIC`, `XIO`, `OTE`, `OTL`, `OTU` | same | mechanical | Bit operands become tag or member references. |
| `TON`, `TOF`, `RTO` | `TON`, `TOF`, `RTO` | mechanical | The timer becomes a `TIMER` structure. Fold the legacy time base (0.01 s or 1 s) into `.PRE` as seconds. Keep `.ACC` only when the legacy accumulator was non-zero at conversion. |
| `CTU`, `CTD`, `RES` | `CTU`, `CTD`, `RES` | mechanical | The counter becomes a `COUNTER` structure; the legacy preset maps to `.PRE`. `RES` takes the structure, not a file address. |
| `ONS` | `ONS` | mechanical | The one-shot storage bit is a tag member. |
| `OSR`, `OSF` | `OSR`, `OSF` | review | Keep only the second legacy operand as the storage bit. The legacy first operand is a file address that does not exist in Logix. |

## Moves, maths, comparison, logic

| Legacy | Logix | Work | Notes |
| --- | --- | --- | --- |
| `MOV` | `MOV` | mechanical | Operand order flips: destination first in Logix. |
| `MVM` | `MVM` | mechanical | Same flip; the mask stays a numeric constant. |
| `COP`, `FLL` | `COP`, `FLL` | mechanical | Arrays replace file ranges. Watch the element count when the legacy range crossed files. |
| `CLR` | `CLR` | mechanical | Destination first. |
| `ADD`, `SUB`, `MUL`, `DIV` | same | mechanical | Legacy integer maths truncates; decide whether the Logix expression should stay integer or move to `REAL`. |
| `SQR`, `NEG` | same | mechanical | — |
| `SCL` | `SCL` | review | SLC only. In Logix the rate and offset are explicit operands; confirm the scaling the legacy rung intended. |
| `EQU`, `NEQ`, `LES`, `LEQ`, `GRT`, `GEQ`, `LIM`, `MEQ` | same | mechanical | `LIM` low/high order is the same; `MEQ` needs the mask carried explicitly. |
| `AND`, `OR`, `XOR`, `NOT` | same | mechanical | Legacy word logic works on 16-bit integers; Logix `DINT` is 32-bit, so mask before and after if upper bits matter. |

## Program control, shifts, sequencers

| Legacy | Logix | Work | Notes |
| --- | --- | --- | --- |
| `JMP`, `LBL` | `JMP`, `LBL` | mechanical | Label names change; a jump across routines is not legal in Logix. |
| `JSR`, `SBR`, `RET` | `JSR`, `SBR`, `RET` | review | The legacy "file number" call becomes a routine name with In/Out parameters. Decide which legacy bits are parameters and which stay global tags. |
| `FOR`, `NXT` | `FOR`, `NXT` | review | The legacy index was the status-file word `S:24`. Logix needs a declared `DINT` index tag. The wizard cannot answer this from rung text; a person must declare the tag and name the loop variable. |
| `AFI` | `AFI` | mechanical | The always-false instruction survives; it is how a rung is parked without deleting it. |
| `BSL`, `BSR` | `BSL`, `BSR` | review | Width decision: a legacy 16-bit file shifted once is not the same as a 32-bit `DINT` shifted once. Set the length and decide whether a single shift must move 16 or 32 bits. |
| `SQO`, `SQC`, `SQI` | same | review | Sequencer files become arrays with a `CONTROL` structure. Check mask, length, and position addressing. |

## Process, messaging, I/O

| Legacy | Logix | Work | Notes |
| --- | --- | --- | --- |
| `PID` | `PID` | review | Gains, update time, and the PV/SP scaling convention differ. Treat conversion as a tuning decision, not a text rewrite. |
| `FAL`, `CPT` | `FAL`, `CPT` | review | Expression syntax differs; rewrite the expression and prove it with known inputs. |
| `MSG` | `MSG` | review | The Logix message needs an explicit path and a message type. A wrong path can report success while moving nothing; verify the target. |
| `BTW`, `BTR` | `MSG` (PLC-5 typed write/read) | review | PLC-5 block transfers do not have a one-to-one Logix instruction. Choose the message type, then decide the retrigger: the legacy continuous bit decides whether the transfer repeats each scan. |
| `IIM`, `IOM` | none | review | Immediate I/O update has no Logix instruction. Module RPI decides when I/O is exchanged; if the legacy rung needed a mid-scan update, that intent must be redesigned. |
| `SVC` | none | review | The service instruction has no direct Logix equivalent. A `MSG` or `GSV`/`SSV` pair does the job only when the engineering intent is known. |
| `DTR` | none | review | There is no single equivalent. A `MVM`/`CPS` plus comparison, or a structured-text loop, is a rewrite to be tested. |
| `TOD` | `GSV` WallClockTime | review | The legacy instruction wrote time into a control block; Logix reads the controller clock into a tag instead. |
| `HSC` | module-based | review | High-speed counting moves into the counter module's configuration and its produced/consumed tags. The rung becomes a read of those tags. |

## The rule behind the table

An instruction that exists in both worlds is still not automatically mechanical. The
mechanical rows are the ones where the wizard's text change is the whole change. The
review rows are the ones where a person must answer a question the text cannot: the
time base, the width, the path, the target semantics, or which behaviour is now
impossible.

When a row is review, the migration plan should carry an exception for each site, and
the acceptance evidence should name how that exception was proved. The instruction
catalogue in `packages/migration/src/knowledge/instructions.ts` is the machine-readable
copy; this page is how a person reads it.
