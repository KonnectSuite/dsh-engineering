TON accumulates time while its rung condition is true and sets its done bit when the accumulated value reaches the preset.

Operands: timer structure and preset. The timer structure exposes the accumulated value, the done, timing and enable bits, and the preset is a member of the structure.

Timers are retained state. A TON whose rung condition is always true times once and stays done; a TON rung that is false keeps its accumulated value unless the logic resets it. RES is the normal reset. Offline, confirm the structure tag is not also used by a different instruction - l5x_run_checks reports multiple writers.
