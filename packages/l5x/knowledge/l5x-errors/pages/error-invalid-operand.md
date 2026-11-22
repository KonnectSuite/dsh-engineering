Meaning: one operand of an instruction does not match the slot the catalogue declares. The failure names the slot and the reason.

The catalogue models each instruction as ordered operand slots. A slot declares its kind (BOOL, NUMBER, ANY, TIMER, COUNTER, STRING, EXPRESSION, ROUTINE, LABEL or KEYWORD), whether it is optional, the allowed tag types, and its array restrictions. The written order matters: the composer and Studio agree on it, so a swapped operand is a real defect, not a formatting difference.

Common cases:

- a BOOL slot given a numeric tag (XIC on an INT),
- a destination slot given a tag marked readonly,
- an array element index missing where the slot forbids arrays,
- a timer or counter structure slot given an ordinary DINT tag,
- a ROUTINE slot given a quoted string instead of a routine name,
- a literal where the slot requires a tag.

Fix: read l5x_list_instructions for that mnemonic and match the slots in order. The list includes kinds, writable flags, array restrictions and types, which is everything needed to repair the operands without Studio.
