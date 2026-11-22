BSL shifts an array one bit left on each false-to-true transition of the rung condition.

Operands: array tag (the bit-array source and destination), a length in elements, a source bit, and a control structure. The control structure supplies the enable and done bits and the position pointer.

Two offline-editing cautions. The instruction executes only on the rising edge of its rung condition, so a continuously true rung shifts once, not every scan. And the shift moves bits through every element of the array up to the declared length: if the length is larger than the array, Studio refuses the rung; if it is smaller, the high elements are simply never updated and that omission is easy to miss.

Read l5x_list_instructions before drafting to confirm the exact operand order for the project's revision.
