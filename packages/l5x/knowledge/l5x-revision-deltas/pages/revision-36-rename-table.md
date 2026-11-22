Logix Designer revision 36 aligned the ladder instruction mnemonics with IEC 61131-3. Programs written before revision 36 use the legacy spellings; a project's Controller MajorRev decides which spelling the composer emits.

The complete legacy-to-current table, from packages/l5x/src/engine/mnemonics.ts:

    legacy  current
    ACS     ACOS
    ASN     ASIN
    ATN     ATAN
    EQU     EQ
    FRD     BCD_TO
    GEQ     GE
    GRT     GT
    LEQ     LE
    LES     LT
    LIM     LIMIT
    MOV     MOVE
    NEQ     NE
    SQR     SQRT
    TOD     TO_BCD
    TRN     TRUNC
    XPY     EXPT

How the tools treat the two spellings:

- A lookup or search accepts either spelling at any revision, so MOV answers for MOVE.
- The instruction catalogue keeps one name per instruction: the name the ladder viewer labels a block with.
- A composed rung emits the spelling the project's revision prefers.
- The review reports a project that mixes legacy and current spellings: it is legal, but it is a maintenance hazard and not what Studio writes.

Because revision 36 help titles use the current spellings, an export opened from a pre-36 project will still show legacy rungs; that is expected, not a mixed-diagnostics defect.
