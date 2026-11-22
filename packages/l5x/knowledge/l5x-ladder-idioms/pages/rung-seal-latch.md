A seal-in keeps a run state after the start button is released:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);

The branch is the seal: Run is true because Start was pressed, and stays true because Run itself is now closed.

The same pattern as a starter interlock with a fault latch:

    [XIC(Start),XIC(Run)]XIO(Stop)XIO(Fault)OTE(Run);
    XIC(Fault) OTL(FaultLatched);
    XIC(ResetFault) OTU(FaultLatched);

Choosing between seal and OTL/OTU:

- seal: the state follows the condition; a power cycle clears it unless the tag retains its value.
- latch: the state survives as long as the tag does; it needs an explicit unlatch.

Whichever is used, a review must find the clear path. l5x_run_checks reports a latch whose clear path has no writer, and a tag written by more than one instruction. That finding is the cheap way to catch a latch that nothing can release.

Named pattern: start_stop_latch in l5x_compose_rung produces the sealed form; fault_latch produces the fault latch with reset.
