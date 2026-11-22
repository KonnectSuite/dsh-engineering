LIMIT clamps a test value between a low limit and a high limit.

Operands: low limit, test value, high limit, destination. Before revision 36 the instruction was spelled LIM; the IEC spelling LIMIT is preferred from revision 36.

The destination is written every true scan and holds while the rung is false. Offline, confirm that the clamp is what the process actually wants - clamp, not alarm - because a LIMIT that silently pulls a value into range hides the out-of-range condition from every downstream check.
