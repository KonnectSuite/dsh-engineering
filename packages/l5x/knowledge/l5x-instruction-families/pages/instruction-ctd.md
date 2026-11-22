CTD decrements a counter structure once per false-to-true transition of the rung condition, down toward the preset.

Operands: counter structure and preset, in the order the help lists them. The counter structure exposes accumulated value, done, over/under flow and the count-enable bit.

Counters are retained: the accumulated value survives scans and mode changes unless the logic resets it. A RES instruction with the same counter tag is the normal reset, and l5x_run_checks reports the pattern where a counter is reset every scan because the reset rung is not edge-conditioned.
