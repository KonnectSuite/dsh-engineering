Meaning: the rung ends in an instruction that reads the rung condition but never drives the right power rail. Studio refuses to build such a rung and the offline check reports it with severity warning and confidence high.

Typical shape: a rung whose last instruction is a compare, a MOV, a TON or a JSR that is not followed by an output coil; or a branch where only one path ends in an output.

Why Studio is strict: ladder rungs are evaluated for their side effect, and a rung with no output is almost always a drafting mistake - the instruction was meant to be conditional on the rung, not to be the rung's result.

Fix: end the rung with an output instruction (OTE, OTL, OTU, or an instruction that writes a destination such as MOV or ADD used as the intended side effect), or move the rung's work into a branch that does drive the rail.

The offline rule exists so a draft fails before it becomes a file. l5x_run_checks reports the same condition as a finding, so a legacy export with no drafts can be reviewed for it too.
