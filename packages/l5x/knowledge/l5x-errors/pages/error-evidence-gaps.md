Offline checks prove statements about the file. They do not prove statements about the plant. The review evidence carries this distinction as coverage.unverified.

What a passing l5x_run_checks does prove:

- the rungs parse and drive the right rail,
- the instructions exist in the catalogue and their operands have the right kinds and counts in the written order,
- the structural rules hold (SBR first, JSR returns, no serial port instruction on a controller without one),
- the instruction spelling matches the project revision,
- I/O differences against a supplied baseline are reported.

What it does not prove:

- that a MSG path, a drive connection, an I/O module connection or a produced/consumed tag actually exists on the network,
- that a motion path is physically reachable and safe,
- that safety logic placement satisfies a site's certification,
- that an HMI faceplate event is wired as intended,
- that the program does what the process intends.

Any answer that says "verified" must say verified how. The honest phrasing is: "the offline checks pass for these rules; the following items remain unverified" and then name them. Anything else overstates the evidence and is exactly the failure the review tools are meant to prevent.
