# Address and tag translation

Legacy programs address physical data files. Logix programs address tags. The gap
between the two is where most migration defects are born, because an address can be
rewritten character by character and still point at nowhere.

## SLC 500 address forms

| Form | Example | Meaning |
| --- | --- | --- |
| Word | `N7:0` | Integer file 7, element 0. |
| Bit | `B3:0/2`, `N7:0/1` | Bit 2 of the word, or bit 1 of an integer word. |
| Timer/counter member | `T4:0.PRE`, `T4:0.ACC`, `T4:0.DN`, `C5:0.ACC` | Preset, accumulator, and status bits inside the structure. |
| Input/output image | `I:1.0/0`, `O:2.0/0` | Slot 1 or 2 in the local chassis, word 0, bit 0. |
| Status file | `S:1/15`, `S:24` | Processor status bits and the maths/indirect index register. |
| Indirect | `N7:[N10:0]` | The element number comes from another word. |

## PLC-5 address forms

| Form | Example | Meaning |
| --- | --- | --- |
| Rack/group/bit I/O | `I:010/00`, `O:013/01` | Rack 1, group 0, bit 0; the second digit is the I/O group. |
| Word | `N7:10` | Integer file 7, element 10. |
| Float | `F8:0` | IEEE float file 8, element 0. |
| Bit | `B3:0/0` | Bit file 3, word 0, bit 0. |
| Timer/counter/control | `T4:0.PRE`, `C5:0.ACC`, `R6:0.LEN` | Structure members of timer, counter, and control files. |
| Status | `S:2/0` | Processor status word 2, bit 0. |
| Indirect | `N7:[N10:0]` | Indexed element. |

## Logix tag forms

- Atomic tags: `BOOL`, `SINT`, `INT`, `DINT`, `REAL`, `STRING`.
- Arrays are declared with a range: `part_count[0..99]`, addressed with brackets.
- Structures: `TIMER`, `COUNTER`, `CONTROL`, `PID`, `MESSAGE`. Members are addressed
  with dots: `timer_1.PRE`, `counter_1.ACC`, `control_1.POS`.
- I/O is a produced tag from a module, not a slot image: `Local:1:I.Data[0]`, an alias
  tag for one bit, or a module-defined tag for a complex card.
- There is no status file. Processor state is read with tags and `GSV`/`SSV`; the
  wall clock is `GSV(WallClockTime)`; task state, fault data, and the controller
  revision are all GSV targets rather than status words.

## The mapping questions to answer per address

1. What did the legacy address mean physically? A `B3:0/0` may be a panel lamp, a
   permissive from another processor, or a scratch flag. The address does not say.
2. Is the Logix target a `BOOL` tag, an alias to module data, or a `DINT` member? A
   legacy integer word that held 16 independent bits should not become a `DINT` array
   that nobody can follow.
3. Is the width the same? Legacy integer operations are 16-bit; Logix `DINT` is
   32-bit. Masking and sign behaviour can change silently.
4. Does the address have an index (`S:24`, brackets)? Then it becomes an array plus an
   index tag, and the bounds check is part of the rewrite.
5. Does the address sit inside a block-transfer or message area? Those become module
   data or message tags, not numbered files.

## Address-only databases

RSLogix 500 and RSLogix 5 both allow a program to have no symbol names; the addresses
are the documentation. The migration wizard then invents tag names, often
`N7_0`, `B3_0_2`. That is legal and unreadable. The assessment reports this as
`ADDRESS_ONLY_DATABASE`, and the plan should reserve engineering time to rename the
tags that matter to the people who will maintain the machine. Renaming after import is
safer than renaming in the wizard output.

## Symbol length

SLC symbol names are limited to 15 characters in RSLogix 500. PLC-5 symbols have their
own stricter limit in the legacy database. Logix allows 40. A migration can therefore
keep the legacy names, but a name truncated by the legacy editor has already lost
characters; restore the intended name during the rewrite and record it in the plan
instead of silently accepting the truncation. The assessment reports long legacy
symbols as `SYMBOL_TOO_LONG`.

## What the tools can answer

`migration_assess` reports the file families present, indirect sites, long symbols, and
address-only databases. `migration_compare` reports addresses or tags it could not
match across the two sides. Neither tool can tell you what a bit physically controls;
that answer comes from the drawings, the panel, and the person who knows the machine.
