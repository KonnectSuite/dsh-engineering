Two related routine-structure refusals.

JSR_WITHOUT_RETURN (critical): the ladder calls a routine with JSR, but the called routine has no RET that can return. Studio rejects a JSR with no return operand with RxCMP_E_AUDIT_INVALIDNOOFOPS.

Two repairs:

- write JSR(Sub,0) to declare that the routine is called without parameters and returns normally, or
- add the RET the routine is missing.

The correct choice depends on whether the routine's last rung is reachable; a conditional RET that is never true is still a missing return path.

SBR_NOT_FIRST (warning): the called routine contains SBR, but SBR is not the first rung. Studio requires the subroutine header to open the routine.

Fix: move SBR, and any SBR parameters, to the first rung of the routine.

Offline, both findings are reported by l5x_run_checks against the export, and l5x_draft_validate reports them on a draft. They are structure errors, so fix them before applying a draft; they are not suppressible style findings.
