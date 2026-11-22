# PLC-5 instruction set: families and text forms

A PLC-5 program is ladder logic built from instructions with data-file operands. In a
neutral text export an instruction appears as a mnemonic followed by a parenthesized
operand list: `XIC(I:010/00)`, `TON(T4:0)`, `MOV(N7:0,N7:1)`. The mnemonic is
uppercase; numbers and addresses are literals; branches are expressed with tokens (see
the rung grammar page).

## Families

| Family | Instructions | Notes |
| --- | --- | --- |
| Relay (contacts and coils) | `XIC`, `XIO`, `OTE`, `OTL`, `OTU` | Bit-addressed. `OTL`/`OTU` latch and unlatch. |
| Timers and counters | `TON`, `TOF`, `RTO`, `CTU`, `CTD`, `RES` | Operands are timer/counter file elements; presets are stored in the structure. |
| Comparison | `EQU`, `NEQ`, `LES`, `LEQ`, `GRT`, `GEQ`, `LIM`, `MEQ` | `LIM` has a low and a high limit; `MEQ` carries a mask. |
| Compute | `ADD`, `SUB`, `MUL`, `DIV`, `SQR`, `NEG`, `CPT` | Legacy integer maths is 16-bit; float files hold IEEE values. |
| Logical and move | `AND`, `OR`, `XOR`, `NOT`, `MOV`, `MVM`, `COP`, `FLL`, `CLR` | Moves take a destination and a source; the text export preserves the operand order. |
| Program control | `JMP`, `LBL`, `JSR`, `SBR`, `RET`, `FOR`, `NXT`, `AFI`, `TND` | `TND` ends a program scan early; `AFI` parks a rung. |
| Interrupts and service | `UID`, `UIE`, `SVC`, `IIM`, `IOM` | Interrupt disable/enable, service, and immediate I/O update. |
| Shift and sequence | `BSL`, `BSR`, `SQO`, `SQC`, `SQI` | Control-file driven. |
| Process | `PID` | A `PID` control block with gains, setpoint, and PV. |
| Messaging and block transfer | `MSG`, `BTW`, `BTR` | PLC-5 message and block-transfer instructions; a continuous enable bit decides retrigger. |
| Convert and time | `DTR`, `TOD` | Data-transition and time-of-day instructions. |
| Counting hardware | `HSC` | High-speed counter rung, often paired with a module. |

The precise set a processor supports depends on its model and firmware. A text export
can contain a mnemonic the reader's catalogue does not know; the inventory reports it
as an unknown mnemonic instead of guessing its operands.

## Reading an instruction row

`XIC(I:010/00) OTE(O:010/00)` is one rung with two instructions: examine-if-closed on
an input bit, then output-energize on an output bit. The instruction order is the
left-to-right order of the rung. Operands keep the meaning the instruction defines, not
the position in a file.

`BST(...) NXB(...) BND(...)` is a branch construct, not three instructions: the tokens
open a branch, start the next branch leg, and close the branch. The instructions inside
the parentheses are the legs. See the rung grammar page for the token rules.

## What the instructions are used for in a migration

The PLC-5 row is a reader, not a converter. Instruction knowledge matters when:

- an inventory must show which instruction families a program leans on, because that
  drives the conversion effort (block transfers and processes are review work; contacts
  and coils are mechanical);
- a diff must explain why two exports differ: a changed `TON` preset is a behaviour
  change, a changed comment is not;
- a census must find the operands that are not plain addresses: indirect brackets,
  leading-`#` file operands, and `?` placeholders.

The conversion mapping itself lives in the migration row's knowledge collection, not
here. This collection describes what a PLC-5 program is; that one describes what it
becomes.
