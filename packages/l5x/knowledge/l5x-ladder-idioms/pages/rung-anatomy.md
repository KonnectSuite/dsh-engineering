A ladder rung is one boolean condition evaluated left to right, followed by the output instructions that condition drives. The left rail is always true; the right rail must be driven by the rung's last instruction.

In NeutralText a rung is written as a sequence of instruction calls ended by a semicolon:

    XIC(Start) XIC(Run) XIO(Stop) OTE(Run);

Read it as: when Start is closed, Run is closed and Stop is open, energise Run.

The parts:

- Input instructions read the rung condition: XIC (normally open), XIO (normally closed), compare instructions, timers' done bits.
- Output instructions consume it: OTE, OTL, OTU, or an instruction whose destination write is the intended side effect.
- Branches split and rejoin the condition: [XIC(A),XIC(B)] is A or B.
- The rung comment documents intent. It is where an offline editor records why the rung exists, because a later reader has the file, not the conversation.

Two structural rules the tools enforce: a rung whose last instruction never drives the right rail is refused (RUNG_NO_OUTPUT), and a rung with an operands mismatch is refused before it is parsed into ladder.

Write the intent in the comment, then the condition, then the output. Reordering the condition changes the logic; reordering a comment does not.
