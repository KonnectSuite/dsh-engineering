MSG sends or receives data over a communication path, typically to another controller or to a module.

Operands are not a simple value list: MSG operates on a message control structure whose members describe the path, the request type, the data table and the lengths. The catalogue models MSG as a control-structure instruction; read l5x_list_instructions for the current operand shape.

Offline, a MSG cannot be proven by parsing: the path may be unreachable, the target tag may not exist, and the connection may not exist. Any MSG change leaves a real-controller unverified item in the review evidence.
