Meaning: the documentation page being read is an instruction page (instruction-<mnemonic>), and the committed revision map documents that mnemonic in revisions other than the one requested.

Example message: "Instruction TRUNC is documented for revision 37.05.00, but this call asked for "36.00.00"." (The real message names the recorded revision list.)

Why it is a hard refusal rather than a warning: the caller asked for a revision, and serving the wrong revision's documentation as if it were the requested one would be a silent correctness bug in the answer. The failure names the recorded revisions, so the repair is one argument away.

Fixes, in order of preference:

1. Read the page without a revision for the authored text: it is revision-neutral and usually answers the question.
2. Request one of the recorded revisions, named in the error.
3. If the page is returned by search rather than requested by read, search the matching installed-help collection with the correct revision.

Related codes: REVISION_REQUIRED (no revision given for a revision-specific collection) and REVISION_UNVERIFIED (the check could not run; the page is served anyway). The distinction matters: INSTRUCTION_NOT_IN_REVISION is a verified mismatch, REVISION_UNVERIFIED is an admitted gap.
