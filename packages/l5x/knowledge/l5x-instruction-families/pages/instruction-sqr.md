SQR computes the square root of its source and writes the destination.

Revision rename: the instruction was spelled SQR before revision 36 and is SQRT from revision 36. Either spelling is accepted for reading at any revision; the composer emits the spelling the project's major revision prefers, and a project that mixes the two spellings is a review finding.

The v37.05 installed help files the page under its current title "Square Root (SQRT)"; the v36.00 help also uses the modern spelling in its title even though older programs contain SQR. That is why the authored revision map keeps both spellings and both revisions.

A negative source is a runtime fault, not a compile error. Offline, add an explicit compare before the SQR when the source can go negative.
