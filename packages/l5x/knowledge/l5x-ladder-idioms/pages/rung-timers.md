A timer is a structure tag, not a single value. The instruction operates on the structure and the logic reads its members.

Delay on:

    XIC(RunTimer) TON(Timer1,1000) OTE(Delayed);

The rung must stay true for the preset (1000 ms here) before the timer's done bit is set.

Delay off:

    XIO(Stop) TOF(Timer2,500) OTE(OffDelay);

The timer starts when the condition goes false.

Retentive on: RTO keeps accumulating across false scans; it needs an explicit RES to clear.

The mistakes worth checking in a review:

- the timer tag is reset every scan, so it never times out;
- a TON is used where a one-shot pulse was intended, and downstream logic sees a held done bit;
- the preset is a literal with no unit in the comment: an offline reviewer cannot tell ms from 0.01 s without the instruction's time base;
- two instructions write the same timer structure (l5x_run_checks reports multiple writers).

Read l5x_list_instructions for the exact operand order, and put the time base in the rung comment.
