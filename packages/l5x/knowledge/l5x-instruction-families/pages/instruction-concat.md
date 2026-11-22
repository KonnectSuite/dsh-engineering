CONCAT appends the second string to the first and writes the result to a destination string.

Operands: source A (string), source B (string), destination (string). The destination receives A followed by B; the sources are unchanged.

When editing without Studio, check the declared string lengths: the destination must hold the combined length, and an over-long result is a runtime fault that the offline parser cannot see. l5x_draft_rung rejects an operand whose declared type is not STRING, but it cannot prove the length, so record that as unverified coverage in review.
