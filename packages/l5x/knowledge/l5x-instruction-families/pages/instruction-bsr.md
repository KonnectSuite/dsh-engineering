BSR shifts an array one bit right on each false-to-true transition of the rung condition.

Operands: array tag, length in elements, source bit, control structure. The control structure holds enable, done and position.

The common editing mistake is direction: BSL and BSR have identical operand shapes, so a copied BSL rung that should have been BSR validates cleanly and produces wrong logic. Compare the source rung and the replacement operand by operand before applying a draft, and let l5x_compare_projects show the engineering difference rather than the text difference.
