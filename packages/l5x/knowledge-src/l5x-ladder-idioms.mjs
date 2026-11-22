/**
 * Authored corpus: ladder and rung idioms useful when editing an L5X export
 * without Studio 5000.
 *
 * The examples are written in the NeutralText form the composer and the
 * previewer accept: instruction calls NAME(operand,...), parallel branches in
 * square brackets, and a semicolon after the last instruction of a rung.
 * Studio's own copy format writes the same rung space-separated without
 * parentheses; l5x_rung_preview converts between the two.
 */

export default {
  id: 'l5x-ladder-idioms',
  title: 'Ladder and rung idioms for offline edits',
  sections: ['Rung structure', 'Common idioms'],
  pages: [
    {
      id: 'rung-anatomy',
      title: 'Anatomy of a rung: condition on the left, output on the right',
      section: 'Rung structure',
      identifiers: ['RUNG'],
      body: `A ladder rung is one boolean condition evaluated left to right, followed by the output instructions that condition drives. The left rail is always true; the right rail must be driven by the rung's last instruction.

In NeutralText a rung is written as a sequence of instruction calls ended by a semicolon:

    XIC(Start) XIC(Run) XIO(Stop) OTE(Run);

Read it as: when Start is closed, Run is closed and Stop is open, energise Run.

The parts:

- Input instructions read the rung condition: XIC (normally open), XIO (normally closed), compare instructions, timers' done bits.
- Output instructions consume it: OTE, OTL, OTU, or an instruction whose destination write is the intended side effect.
- Branches split and rejoin the condition: [XIC(A),XIC(B)] is A or B.
- The rung comment documents intent. It is where an offline editor records why the rung exists, because a later reader has the file, not the conversation.

Two structural rules the tools enforce: a rung whose last instruction never drives the right rail is refused (RUNG_NO_OUTPUT), and a rung with an operands mismatch is refused before it is parsed into ladder.

Write the intent in the comment, then the condition, then the output. Reordering the condition changes the logic; reordering a comment does not.`,
    },
    {
      id: 'rung-contacts-coils',
      title: 'Contacts, coils and one-shots',
      section: 'Rung structure',
      identifiers: ['XIC', 'XIO', 'OTE', 'ONS'],
      body: `The four things almost every rung uses.

XIC - examine if closed: true while the bit is true. Use it for a start button, a run feedback, a permissions bit.

XIO - examine if open: true while the bit is false. Use it for a stop button wired normally closed, a fault contact, an interlock.

OTE - output energise: drives its bit to the rung condition. Use it when the bit should follow the condition every scan.

One-shots, when a scan-exact edge matters:

- ONS: true for one scan after its input goes false to true.
- OSR: true for one scan on a rising edge, reset by a later rung.
- OSF: true for one scan on a falling edge.

    XIC(Run) ONS(EdgeTag) OTE(PulseBit);

Write the one-shot tag to the rung comment: a one-shot with no comment reads as a mystery bit to everyone who does not know which transition it captures.

Never use an always-true expression as a UI bit's condition and then expect a transition. If a faceplate button hands you a level, convert it to an edge with ONS before using it for a one-shot action.`,
    },
    {
      id: 'rung-branches',
      title: 'Parallel branches in NeutralText',
      section: 'Rung structure',
      identifiers: ['BST', 'NXB', 'BND', 'BRANCH'],
      body: `A parallel branch is OR inside the condition. In the composer's NeutralText it is written with square brackets:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);

Read it as: (Start OR Run) AND NOT Stop drives Run.

In Studio's copied rung text the same branch appears with BST, NXB and BND markers:

    BST XIC(Start) NXB XIC(Run) BND XIO(Stop) OTE(Run);

Both forms are accepted by l5x_draft_rung. l5x_rung_preview returns the Studio form in paste_text.

Rules that bite offline editors:

- A branch is part of one rung: the condition after BND applies to the joined result.
- Nested branches are allowed but a deeply nested condition is hard to review; prefer a named seal or a helper rung.
- Every branch must rejoin; a branch that leaves the rung unclosed is refused as an invalid ladder specification.
- Branch order does not change the boolean result, but it changes scan cost and review readability: put the most restrictive condition first inside the branch.

For a self-sealing run pattern the branch is the seal:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);
`,
    },
    {
      id: 'rung-timers',
      title: 'Timers: delay, retained state and reset',
      section: 'Common idioms',
      identifiers: ['TON', 'TOF', 'RTO', 'RES'],
      body: `A timer is a structure tag, not a single value. The instruction operates on the structure and the logic reads its members.

Delay on:

    XIC(RunTimer) TON(Timer1,1000) OTE(Delayed);

The rung must stay true for the preset (1000 ms here) before the timer's done bit is set.

Delay off:

    XIO(Stop) TOF(Timer2,500) OTE(OffDelay);

The timer starts when the condition goes false.

Retentive on: RTO keeps accumulating across false scans; it needs an explicit RES to clear.

The mistakes worth checking in a review:

- the timer tag is reset every scan, so it never times out;
- a TON is used where a one-shot pulse was intended, and downstream logic sees a held done bit;
- the preset is a literal with no unit in the comment: an offline reviewer cannot tell ms from 0.01 s without the instruction's time base;
- two instructions write the same timer structure (l5x_run_checks reports multiple writers).

Read l5x_list_instructions for the exact operand order, and put the time base in the rung comment.`,
    },
    {
      id: 'rung-counters',
      title: 'Counters: up, down and the reset rung',
      section: 'Common idioms',
      identifiers: ['CTU', 'CTD', 'RES'],
      body: `A counter is a structure tag with a preset, an accumulated value and status bits. The count instruction adds one on each false-to-true transition of its rung.

Count up and run something once at the preset:

    XIC(Pulse) CTU(Count1,10);

    XIC(Count1.DN) OTE(BatchDone);

Keep the reset visible:

    XIC(ResetBatch) RES(Count1);

Rules that keep counters reviewable:

- a counter is retained; if the reset rung is not reachable or not documented, the counter's meaning drifts across shifts;
- the preset is part of the instruction's operands in CTU/CTD; changing it in the draft changes behaviour on the next transition, not on the next scan;
- the done bit does not clear when the value falls below the preset; use RES or the explicit compare the process needs;
- do not let two rungs CTU the same counter: l5x_run_checks reports multiple writers, and which one wins depends on rung order.

For a one-shot action on the preset, prefer the counter's done bit plus a one-shot rather than an OTE that stays true while the count remains at the preset.`,
    },
    {
      id: 'rung-seal-latch',
      title: 'Seal-in and latch patterns',
      section: 'Common idioms',
      identifiers: ['SEAL', 'LATCH', 'START_STOP_LATCH', 'FAULT_LATCH'],
      body: `A seal-in keeps a run state after the start button is released:

    [XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);

The branch is the seal: Run is true because Start was pressed, and stays true because Run itself is now closed.

The same pattern as a starter interlock with a fault latch:

    [XIC(Start),XIC(Run)]XIO(Stop)XIO(Fault)OTE(Run);
    XIC(Fault) OTL(FaultLatched);
    XIC(ResetFault) OTU(FaultLatched);

Choosing between seal and OTL/OTU:

- seal: the state follows the condition; a power cycle clears it unless the tag retains its value.
- latch: the state survives as long as the tag does; it needs an explicit unlatch.

Whichever is used, a review must find the clear path. l5x_run_checks reports a latch whose clear path has no writer, and a tag written by more than one instruction. That finding is the cheap way to catch a latch that nothing can release.

Named pattern: start_stop_latch in l5x_compose_rung produces the sealed form; fault_latch produces the fault latch with reset.`,
    },
    {
      id: 'rung-analog-scale',
      title: 'Scaling an analog input',
      section: 'Common idioms',
      identifiers: ['SCALE', 'ANALOG', 'ANALOG_SCALE'],
      body: `Raw analog input tags are integers or reals that need scaling before the process logic can use them. The safe shape is: convert, scale, clamp, then use.

A minimal scale of a 4-20 mA input needs the raw range, the engineering range and a clamp. A short invalid intermediate is worse than none: stage the whole scale as one compute expression, never as half-typed math.

The offline-friendly shape, which validates against the instruction catalogue:

    XIC(ChannelValid) CPT(ScaleOutput,(RawChannel - 6240) * (100.0 / 24960.0));
    XIC(ChannelValid) LIMIT(0.0,ScaleOutput,100.0,ScaleClamped);

Notes:

- clamp before the value reaches the process: an out-of-range raw value silently produces a plausible number otherwise;
- put the raw minimum, raw maximum and engineering range in the rung comment or the tag description; an offline reviewer cannot infer 6240 from 4 mA;
- check the source tag's type: a DINT raw input with a REAL destination needs the conversion the catalogue will check;
- named pattern analog_scale in l5x_compose_rung builds the scale-and-clamp form.

If the process uses an engineering unit structure or a process object, use the object's own scaling rather than reimplementing it; a second scale path is a maintenance defect.`,
    },
    {
      id: 'rung-interlocks',
      title: 'Interlocks that are visible and testable',
      section: 'Common idioms',
      identifiers: ['INTERLOCK'],
      body: `An interlock is a condition that prevents an action, and the best interlock is one a reviewer can find without opening the HMI.

Shape: put every prevent condition on the same rung as the output, and document each one.

    XIC(StartCmd) XIO(StopCmd) XIC(Permissive1) XIC(Permissive2) OTE(RunCmd);

Better for diagnosis, one rung per permissive feeding a single permission bit:

    XIC(Permissive1) XIC(Permissive2) OTE(CanRun);
    XIC(StartCmd) XIC(CanRun) XIC(RunCmd) ... OTE(RunCmd);

The second shape costs one rung and tells the next person which permissive is missing. That is worth it whenever the interlock can be tripped independently of the start command.

Rules:

- no hidden permissive inside a compare that also scales a value;
- no permissive inside a one-shot (it becomes untestable);
- bypasses and overrides are explicit tags with names containing BYPASS or OVERRIDE, never a literal forced true;
- a safety interlock is not bypassed in a standard task; l5x_run_checks reports safety writes and placement findings.

Named pattern: interlock composes the single-permission-bit form.`,
    },
    {
      id: 'rung-editing-safety',
      title: 'Editing a rung without changing behaviour by accident',
      section: 'Rung structure',
      identifiers: ['SAFE EDIT'],
      body: `Most offline-editing defects are not syntax errors; they are behaviour changes that parse cleanly. A short procedure that catches them:

1. One rung per operation. A draft that replaces one rung is easy to compare; a draft that touches several is easy to mis-review.
2. Keep the original rung text. l5x_draft_rung refuses an undriven rung, but only l5x_compare_projects shows what the rung used to be.
3. Read the tags before the rung: l5x_resolve_tag and l5x_find_references tell you whether the bit you are about to drive is already written elsewhere.
4. Prefer named patterns over hand composition for known idioms: the composer's patterns are the tested shapes.
5. Validate before apply, and keep the validation hash with the review note.
6. Record unverified items: a message path, a drive connection or a safety placement is not proven by a parse.
7. Re-open the generated file and run l5x_open_project plus l5x_run_checks on it; that closes the loop on the file actually written.

Common accident to avoid: replacing just the tag name in a copied rung changes the addressed bit but leaves the rung comment describing the old tag. Update the comment in the same operation.`,
    },
    {
      id: 'rung-style-conventions',
      title: 'Style conventions that survive review',
      section: 'Common idioms',
      identifiers: ['STYLE', 'CONVENTIONS'],
      body: `These are the conventions reviewers ask for repeatedly because they make an offline review cheap.

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

Style is not a substitute for the checks. Run them, then write the review note in the file's own words: what changed, what was verified, and what remains unverified.`,
    },
    {
      id: 'rung-idiom-index',
      title: 'Idiom index: which page answers which question',
      section: 'Common idioms',
      identifiers: ['IDIOM INDEX'],
      body: `A map from a question to the authored page that answers it.

- What is a rung, and why must it drive the right rail? See rung-anatomy.
- Which contact is start and which is stop? See rung-contacts-coils.
- How do I write a parallel branch in rung text? See rung-branches.
- Why does my timer never finish, or hold its done bit? See rung-timers.
- How do I count up and reset the counter? See rung-counters.
- How do I keep a run state after a button release? See rung-seal-latch.
- How do I scale a 4-20 mA input and clamp it? See rung-analog-scale.
- How do I make a permissive visible and testable? See rung-interlocks.
- What can change behaviour without a syntax error? See rung-editing-safety.
- What style do reviewers ask for? See rung-style-conventions.

Related authored collections: the instruction itself is in l5x-instruction-families (one page per common instruction), the revision spelling rules are in l5x-revision-deltas, and the tool workflow that stages these rungs is in l5x-offline-workflows.

For an exact mnemonic, call lookup {term: "TON"}; for a search, query the idiom in plain words such as "timer never times out".`,
    },
  ],
}
