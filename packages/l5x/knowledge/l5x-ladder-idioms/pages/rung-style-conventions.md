These are the conventions reviewers ask for repeatedly because they make an offline review cheap.

Naming:

- permissives end with PERM or PERMIT; faults end with FLT or FAULT; commands end with CMD; status bits end with the thing they observe (Run, Ready, Faulted).
- one-shot tags carry ONES or EDGE, so a reviewer does not have to read the rung to know it pulses.
- timers end with TIM or TMR and the preset describes the unit: 5000 is ambiguous, 5s is not.

Rung layout:

- condition left to right from the most restrictive to the least (it changes scan cost and human reading, not the boolean result);
- branches on one line where possible; the editor wraps them but the paste text should be readable;
- every non-obvious rung has a comment that says why, not what;
- outputs grouped at the right of the rung; no output in the middle of a condition.

Documentation:

- tag descriptions for every controller-scoped interface tag;
- an AOI's parameters described, not only named;
- the rung comment states the process intent and any safety or regulatory requirement it implements.

Style is not a substitute for the checks. Run them, then write the review note in the file's own words: what changed, what was verified, and what remains unverified.
