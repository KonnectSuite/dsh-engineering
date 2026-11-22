SUB computes source A minus source B and stores the result in the destination.

Operands: source A, source B, destination. The type of the destination determines the representable range; subtracting two large unsigned values into a smaller type is accepted by the catalogue and silently wraps, so l5x_run_checks flags a destination too narrow for the source range where it can infer it.

With mixed spellings, nothing has changed between revisions 36 and 37: SUB is not in the rename table.
