l5x_run_checks runs the evidence-backed rules this build implements against an open export. Each finding carries the rule id, severity and the reason, and the answer names the coverage: what was checked, and what could not be checked offline.

The rules that catch most editing mistakes:

- a rung that never drives the right rail (RUNG_NO_OUTPUT),
- an instruction that reads the rung condition but is used as an output,
- a JSR whose routine has no return path and an SBR that does not open the first rung,
- a serial-port instruction on a controller without a serial port,
- a tag written by more than one instruction, and a latch with no writer of its clear path,
- a mixed instruction spelling against the project revision,
- FBD wiring and SFC chart structure,
- I/O changes against a baseline export when a baseline_id is passed.

How to read the result:

- severity critical: Studio itself would refuse to build this; fix before applying.
- severity warning: valid file, review hazard. Decide and record the decision.
- coverage.unverified lists what the tool could not prove; carry it into the answer.

Passing l5x_run_checks is not proof that the plant is safe. It is proof that the file's own rules hold.
