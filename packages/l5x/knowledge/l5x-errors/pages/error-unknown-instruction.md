Meaning: the rung named an instruction mnemonic that the offline instruction catalogue does not model.

The failure carries candidates: the nearest catalogue names by edit distance. Start from those before assuming the instruction is unsupported.

Three causes, in order of frequency:

1. A typo or a legacy/current spelling confusion: MOV versus MOVE, EQU versus EQ, SQR versus SQRT, LIM versus LIMIT, TRN versus TRUNC. The catalogue accepts both spellings for renamed instructions, so a spelling error here is usually a transposed letter, not a revision issue.
2. An add-on instruction from the project. AOIs live in the project, not in the base catalogue. With an open project, the composer looks them up from the export; without one, l5x_compose_rung cannot know them, and l5x_compose_logic validates against the base catalogue only.
3. An instruction from a newer revision or a different product family that this build does not model. l5x_list_instructions is the authoritative list of what the composer accepts.

Do not invent an operand list for an unknown mnemonic. Read the documentation page for that instruction and the installed help for the exact revision, then decide whether to compose it or to hand the change back to Studio.
