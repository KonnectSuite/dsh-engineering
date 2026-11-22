ABS computes the absolute value of one source and writes the destination.

Operands, in order: a source (any numeric tag or expression) and a destination (a writable numeric tag). Without Studio, keep the source and destination the same numeric type: an INT source with a DINT destination is accepted by the catalogue but changes the range the logic can represent, and the review complains when the value can overflow.

ABS is a compute instruction: the destination is written every scan in which the rung condition is true and keeps its previous value while the condition is false. If downstream logic must see zero while the rung is false, do not rely on ABS alone - add the clear explicitly.

Revision note: the instruction spelling has not changed between revisions 36 and 37, so the same authored page answers for both. The installed help indexes the page in the Compute/Math family, in both revisions.
