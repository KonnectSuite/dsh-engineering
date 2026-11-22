OTE drives its bit true while the rung condition is true and false while it is false.

OTE is the ordinary output coil: it must terminate a rung branch, and a rung that ends in an instruction that only reads the rung condition is refused with the RUNG_NO_OUTPUT finding, because Studio will not build a rung that never drives the right rail.

The bit OTE writes is shared with the rest of the program. l5x_run_checks reports a tag written by more than one instruction as a finding; when two rungs both OTE the same bit, the last rung evaluated wins and the first is dead logic.
