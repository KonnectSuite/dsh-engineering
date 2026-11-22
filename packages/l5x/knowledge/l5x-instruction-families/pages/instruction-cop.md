COP copies a number of elements from one array to another without any type conversion.

Operands: source array, destination array, length in elements. The instruction copies raw element patterns, so copying a DINT array into a REAL array copies the bit patterns and produces nonsense values; use a typed move for a conversion.

The length must fit both arrays. Offline, this is the instruction most likely to be drafted with a stale length after an array resize, so validate the draft against the open project and read the finding when the lengths disagree.
