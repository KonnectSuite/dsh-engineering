EQ compares two sources for equality and controls the rung condition; it writes no tag.

Operands: source A, source B. Before revision 36 the instruction was spelled EQU; from revision 36 the IEC-61131 spelling EQ is preferred and the old spelling is accepted for reading. A project that mixes the two spellings is a review finding, not a parse error - the composer emits the spelling the project's major revision prefers.

For offline editing, read the project's Controller MajorRev first (an export reports it). If the export has no major revision, treat it as pre-36 and expect the legacy spelling in existing rungs.
