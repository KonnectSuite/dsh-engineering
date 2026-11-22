FLL fills a range of elements in an array with one source value.

Operands: source value, destination array, length in elements. The fill executes while the rung condition is true; it is not edge-triggered, so an always-true rung rewrites the range every scan.

That is usually harmless but it defeats logic that expects to see an intermediate value. If a later rung compares against a filled value, the fill must be edge-conditioned or ordered before the compare on the same scan.
