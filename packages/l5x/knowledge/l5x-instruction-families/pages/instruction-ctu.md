CTU increments a counter structure once per false-to-true transition of its rung condition.

Operands: counter structure, preset. The done bit sets when the accumulated value reaches the preset; the counter keeps counting past the preset into overflow, so logic that must stop at a number needs a separate compare or reset.

The rung condition does not have to stay true; only the transition counts. That means an edit that changes the condition to an always-true expression turns the counter into a one-count instruction, a silent behavioural change that l5x_compare_projects will show but only if you compare the old and new exports.
