# Indirect addressing: census and rewrite

Indirect addressing is the most common reason a migrated program behaves differently
from the legacy one, and the least visible in a line-by-line comparison. The rule is
simple: Logix arrays are indexed with a tag, and the legacy index has to become a
declared tag with a known range.

## Legacy forms

| Legacy form | Meaning | Where it appears |
| --- | --- | --- |
| `N7:[N10:0]` | The element number comes from the value in `N10:0`. | SLC 500 and PLC-5 rungs. |
| `T4:[N10:0].PRE` | The timer structure itself is indexed. | Less common, same idea. |
| `S:24` | The status-file word that supplied the index for some instructions (notably `FOR`/`NXT`). | SLC 500 and PLC-5. |
| Bit-level expression | An operand formed from an address expression, e.g. `N7:0/[N10:0]`. | Legacy rungs. |

## Why the wizard cannot finish it

Logix has no numbered files and no status-file index register. The translated text
either leaves a placeholder or writes an array access with no index tag. Both are
incomplete. The typed answer requires knowing:

1. **Which array** the legacy file became. `N7` may be one `DINT` array, or several
   named tags grouped by function.
2. **Which tag** holds the index now. `S:24` does not exist; the index must be a
   declared `DINT`, usually a program-scoped tag.
3. **What the bounds are.** An implicit 16-bit wrap in the legacy platform becomes an
   explicit bounds decision in Logix. A faulted array access stops the controller; the
   legacy code may have wrapped silently.
4. **Whether the index is data or control.** A recipe-step index and a pointer scanned
   by a `FAL` are different engineering objects even when the rung is identical.

## The census

`migration_resolve` reports each indirect site with its routine, rung, and text. The
linter reports the same condition from the Logix side as `INDIRECT_ADDRESS`; a residual
address on the Logix side is reported by the comparison as `INDIRECT_LEFT`. Three
signals, one work item: every site needs a resolution.

The site list is also the review list for the for-loop case. A `FOR`/`NXT` loop indexes
through `S:24`; the Logix conversion needs a declared `DINT`, and the linter row for
`FOR`/`NXT` is `review` precisely because the wizard cannot declare the tag for you.

## The rewrite pattern

For each site:

1. Declare the index tag with the type and scope the logic needs (`DINT`, usually
   program-scoped).
2. Assign the tag from the source the legacy code used: a counter accumulator, an
   operator input, or a computed value.
3. Replace the bracketed legacy address with the array access.
4. Add a bounds check or clamp where the legacy wrap was relied on.
5. Prove it: build, then drive the index through its range in a test, including the
   first and last element and one out-of-range value.

The bounds step is the one engineers skip. A legacy program that indexed `N7:[N10:0]`
with an operator-entered number could write outside the file; Logix will fault instead
of corrupting memory. That is better behaviour, but it is different behaviour, and the
acceptance evidence must say which one the machine expects.

## What the report should say

The report lists every indirect site with its resolution and its proof. A site resolved
as "converted to an array access, bounds clamped in rung 12, sequence test passed" is
evidence. A site resolved as "wizard converted it" is not. The rule of thumb: if the
text no longer contains brackets but no index tag was declared, the work is not done.
