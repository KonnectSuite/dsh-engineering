The four things almost every rung uses.

XIC - examine if closed: true while the bit is true. Use it for a start button, a run feedback, a permissions bit.

XIO - examine if open: true while the bit is false. Use it for a stop button wired normally closed, a fault contact, an interlock.

OTE - output energise: drives its bit to the rung condition. Use it when the bit should follow the condition every scan.

One-shots, when a scan-exact edge matters:

- ONS: true for one scan after its input goes false to true.
- OSR: true for one scan on a rising edge, reset by a later rung.
- OSF: true for one scan on a falling edge.

    XIC(Run) ONS(EdgeTag) OTE(PulseBit);

Write the one-shot tag to the rung comment: a one-shot with no comment reads as a mystery bit to everyone who does not know which transition it captures.

Never use an always-true expression as a UI bit's condition and then expect a transition. If a faceplate button hands you a level, convert it to an edge with ONS before using it for a one-shot action.
