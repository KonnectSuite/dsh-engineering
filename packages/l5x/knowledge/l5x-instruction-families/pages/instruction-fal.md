FAL applies an expression or a math operation to arrays, one element at a time, according to a mode and a length.

Operands are the expression or operation, the array operands, a length and a position, plus a control structure. Different modes use different operand sets, which is why the catalogue shape depends on the mode.

Offline, treat a FAL edit as a logic change, not a text change: the mode determines which operands are read, and an edit that swaps two tags validates while changing the algorithm. Document the mode in the rung comment before applying.
