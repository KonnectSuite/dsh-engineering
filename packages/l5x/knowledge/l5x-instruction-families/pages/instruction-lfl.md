LFL pushes the source value into a FIFO queue when its rung condition goes false to true.

Operands: source, FIFO array, length, position, control structure. The queue is full when the position reaches the length; loading a full queue sets the overflow bit and the new value is discarded.

The position tag and the control structure are the state. Editing a queue's length or replacing its control structure while the queue is partly full corrupts the queue's meaning. Document the queue's declared depth next to the rung.
