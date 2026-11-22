A counter is a structure tag with a preset, an accumulated value and status bits. The count instruction adds one on each false-to-true transition of its rung.

Count up and run something once at the preset:

    XIC(Pulse) CTU(Count1,10);

    XIC(Count1.DN) OTE(BatchDone);

Keep the reset visible:

    XIC(ResetBatch) RES(Count1);

Rules that keep counters reviewable:

- a counter is retained; if the reset rung is not reachable or not documented, the counter's meaning drifts across shifts;
- the preset is part of the instruction's operands in CTU/CTD; changing it in the draft changes behaviour on the next transition, not on the next scan;
- the done bit does not clear when the value falls below the preset; use RES or the explicit compare the process needs;
- do not let two rungs CTU the same counter: l5x_run_checks reports multiple writers, and which one wins depends on rung order.

For a one-shot action on the preset, prefer the counter's done bit plus a one-shot rather than an OTE that stays true while the count remains at the preset.
