JSR calls a routine and returns when that routine executes RET.

Operands: the routine name, plus input parameters when the called routine declares them. A JSR with parameters that do not match the routine signature is refused with an operand finding; a JSR without a RET anywhere in the called routine is refused by the l5x_run_checks rule JSR_WITHOUT_RETURN, because the Studio compiler rejects it with RxCMP_E_AUDIT_INVALIDNOOFOPS.

The called routine must open with SBR as its first instruction. SBR anywhere else in the routine is a finding (SBR_NOT_FIRST), because Studio refuses to build it.

Offline, the reliable pattern is to compare the JSR operand list with the routine's parameter list from the same export before applying.
