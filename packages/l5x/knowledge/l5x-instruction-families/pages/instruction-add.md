ADD computes source A plus source B and stores the result in the destination.

Operands, in order: source A, source B, destination. All three are numeric tags or expressions. The catalogue accepts mixed numeric types, but the sum must fit the destination or Studio refuses the rung with an operand-type finding.

When editing offline, prefer one ADD per rung over chained adds. A chained expression is harder to test and a single mistaken destination silently corrupts the next scan. l5x_run_checks reports a tag written by more than one instruction as a finding, which catches the common copy-paste mistake.

The revision spelling is unchanged between 36 and 37.
