A parallel branch is OR inside the condition. In the composer's NeutralText it is written with square brackets:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);

Read it as: (Start OR Run) AND NOT Stop drives Run.

In Studio's copied rung text the same branch appears with BST, NXB and BND markers:

    BST XIC(Start) NXB XIC(Run) BND XIO(Stop) OTE(Run);

Both forms are accepted by l5x_draft_rung. l5x_rung_preview returns the Studio form in paste_text.

Rules that bite offline editors:

- A branch is part of one rung: the condition after BND applies to the joined result.
- Nested branches are allowed but a deeply nested condition is hard to review; prefer a named seal or a helper rung.
- Every branch must rejoin; a branch that leaves the rung unclosed is refused as an invalid ladder specification.
- Branch order does not change the boolean result, but it changes scan cost and review readability: put the most restrictive condition first inside the branch.

For a self-sealing run pattern the branch is the seal:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);
