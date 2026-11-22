/**
 * Authored corpus: the Logix instruction families and the common instructions.
 *
 * Every page is written here, in our own words. Nothing on these pages is
 * copied from the Rockwell help: the page counts are numbers this package
 * measured from the installed help indexes (`knowledge/l5x-help-37-05` and
 * `knowledge/l5x-help-36-00`), and the behaviour notes are the behaviour the
 * L5X tools in this bundle implement and check.
 *
 * The generator writes `knowledge/l5x-instruction-families/pages/<id>.md` and
 * the collection index from this module. Do not hand-edit generated pages.
 */

const familyPages = []
const instructionPages = []

/**
 * Add one instruction-family page.
 *
 * The page states the measured structural facts (how many topic pages each
 * installed-help revision indexes for the family) and what to watch when
 * editing that family offline.
 */
function family(id, name, v37Pages, v36Entries, members, summary, editing) {
  familyPages.push({
    id: `family-${id}`,
    title: `${name} instructions`,
    section: 'Instruction families',
    body: `${name} instructions are one family of the Logix 5000 instruction set. ${summary}

The Studio 5000 Logix Designer v37.05 installed help indexes ${v37Pages} topic page${v37Pages === 1 ? '' : 's'} in this family. The v36.00 help indexes ${v36Entries} instruction entr${v36Entries === 1 ? 'y' : 'ies'} in the same family. Both indexes are structural: l5x_docs lists the title, the section and the relative help path, and reads page text from the local help installation at call time. Nothing from the vendor pages ships in this repository.

Representative mnemonics from the family: ${members}.

When editing without Studio, ${editing}

Call contents with collection "l5x-help-37-05" or "l5x-help-36-00" and pass the revision to list the family section in the installed help index, then search within it for the member you need.`,
  })
}

/**
 * Add one common-instruction page.
 *
 * @param mnemonic - The instruction mnemonic; the page id is instruction-<lowercase>.
 * @param title - Model-facing page title (normally the Studio 5000 page title).
 * @param identifiers - Exact identifiers lookup and search must resolve, first is canonical.
 * @param body - The authored explanation.
 * @param aliases - Alternate spellings (legacy names) that must also resolve.
 */
function instruction(mnemonic, title, identifiers, body, aliases = []) {
  instructionPages.push({
    id: `instruction-${mnemonic.toLowerCase()}`,
    title,
    section: 'Common instructions',
    identifiers,
    ...(aliases.length === 0 ? {} : { aliases }),
    body,
  })
}

family('alarm', 'Alarm', 4, 3, 'ALMA, ALMD, ASO', 'They read or write the alarm and event fields of a tag, or run an alarm instruction in a safety or standard task.', 'the alarm tag configuration lives outside the ladder: check the tag definition and the alarm message fields before assuming the rung is wrong.')
family('arrayfilemisc', 'Array file-misc', 17, 8, 'AVE, FAL, FLL, FSC, SRT, STD, SIZE', 'They operate on a whole array or file rather than a single element: fill, average, search, sort and statistical reductions.', 'length operands are counted in elements and are easy to get wrong; confirm the array dimension and that the length keeps the operation inside the array.')
family('arrayfileshift', 'Array (file) shift', 7, 6, 'BSL, BSR, FFL, FFU, LFL, LFU', 'They shift or queue array contents on each false-to-true transition of their rung condition.', 'the position and length operands of FFL/LFL style queues trip people up; read the operand list with l5x_list_instructions before drafting, and remember a shift executes only while the rung condition is true.')
family('ascii-conversion', 'ASCII conversion', 7, 6, 'STOD, STOR, DTOS, RTOS', 'They convert between numeric tags and their decimal string representation.', 'string lengths and null terminators are the usual failure; check the destination string type and its LEN before editing.')
family('ascii-string', 'ASCII string', 6, 5, 'CONCAT, DELETE, FIND, INSERT, MID, UPPER, LOWER', 'They read, search and change a STRING tag one substring at a time.', 'the start and length operands are one-based in the help tables; a zero length or a start past the string length is a common reason Studio refuses the rung.')
family('bit', 'Bit', 12, 10, 'XIC, XIO, OTE, OTL, OTU, ONS, OSR, OSF, OSFI, OSRI', 'They are the contacts, coils and one-shot instructions that every ladder routine is built from.', 'a rung that reads a bit but never drives an output will be refused: end the rung in OTE, OTL, OTU or a similar output instruction.')
family('cip-motion-exceptions', 'CIP Motion exceptions', 145, 0, '', 'They document the exception conditions a CIP motion axis can report rather than ladder instructions you place in a rung.', 'the text is axis-fault reference material; use it to interpret a reported fault, not to compose logic.')
family('shared-instruction-topics', 'Shared instruction topics', 109, 0, '', 'They are the shared reference topics - tag attributes, operand rules, flow charts - that the instruction pages link to instead of repeating.', 'these pages explain operand semantics; read them when a rung is refused for an operand reason.')
family('compare', 'Compare', 15, 9, 'CMP, EQ, GE, GT, LE, LT, NE, MEQ', 'They test two values and produce a rung condition; they never write a tag.', 'the comparison is evaluated fresh each scan, so a compare rung used as a latch condition needs a seal or a one-shot if the result must persist.')
family('compute', 'Compute/Math', 13, 9, 'ABS, ADD, SUB, MUL, DIV, NEG, SQR, XPY, LN, LOG', 'They compute a destination from one or more sources and overwrite the destination on every true evaluation.', 'the destination is written only while the rung condition is true; if downstream logic expects the old value while the rung is false, add the required interlock explicitly.')
family('debug', 'Debug', 3, 2, 'BRK, NOP, TND', 'They mark breakpoints and no-operation placeholders for debugging a routine.', 'they do not change program behaviour; a TND stops the program at that rung in Studio but not in the controller.')
family('forbreak', 'For/Break', 3, 2, 'FOR, BRK', 'They repeat the rungs between FOR and BRK a counted number of times.', 'the FOR and BRK pair must stay in the same routine; a branch or JMP across the pair is refused.')
family('license', 'License', 2, 1, 'LIC', 'The license instruction reports whether a licensed feature is available to the controller.', 'it is a rare instruction; confirm the destination type and that the controller actually carries the licence before editing.')
family('sequencer', 'Sequencer', 4, 3, 'SQO, SQI, SQL', 'They step a position pointer through a file, either outputting the current word or comparing an input against it.', 'the position tag is state and must be retained across scans; do not reset it in a rung that is evaluated every scan.')
family('special', 'Special', 15, 4, 'FSC, FAL, SRT, STD, AVE', 'They are the larger array and file algorithms that also appear under their own families; the special group collects the ones without a better home.', 'these are the instructions most sensitive to length and destination-size errors; validate the draft and let l5x_run_checks review it.')
family('trigonometric', 'Trigonometric', 8, 7, 'SIN, COS, TAN, ASIN, ACOS, ATAN', 'They compute trigonometric functions in radians.', 'the angle input is radians, not degrees; a degree/radian mistake is silent and produces plausible-looking but wrong values.')
family('drive-safety', 'Drive safety', 9, 7, 'SFX, SFR, SFP, SFD', 'They read and control the safety functions of a PowerFlex drive over a safety connection.', 'safety logic is certified and placement-sensitive; l5x_run_checks treats safety placement and safety writes as findings, so fix those before applying a draft.')
family('embedded-instruction-topics', 'Embedded instruction topics', 3, 0, '', 'They are embedded reference topics shared by controller families rather than instructions of their own.', 'use them as reference for operand rules; there is nothing to place in a rung.')
family('equipment-phase', 'Equipment phase', 11, 10, 'PSC, PSE, PSR, PSD', 'They command the state of an equipment phase from ladder logic.', 'phase state changes interact with the phase manager; changing a phase program from ladder needs the phase state checked first.')
family('equipment-sequence', 'Equipment sequence diagram', 22, 6, 'SFC steps and transitions', 'They document the equipment sequence diagram elements and the instructions that interact with a running sequence.', 'sequence logic is edited in its own editor; from ladder you change the sequence tag or command rather than the diagram.')
family('advanced-math', 'Advanced math', 4, 3, 'CPT, LN, LOG, XPY', 'They evaluate a computed expression that would otherwise need several instruction blocks.', 'expressions can mix tag types; read the expression result type and keep the destination type aligned.')
family('hmi', 'HMI', 2, 1, 'HMIBC', 'The HMI button control instruction lets ladder logic hand a button event to an HMI faceplate.', 'the interaction is event-driven; document which tag fires the event so a later edit does not silently break the faceplate.')
family('input-output', 'Input/output', 71, 3, 'MSG, GSV, SSV, CIP', 'They move data between the controller and I/O modules, produced/consumed tags and other controllers.', 'connection state matters: check the module or producer status before assuming the data move is the bug.')
family('math-conversion', 'Math conversion', 6, 5, 'DEG, RAD, TOD, FRD, TRN', 'They convert between units or number formats, including binary-coded decimal and degrees/radians.', 'conversion instructions are where revision rename surprises show up - TRN became TRUNC in revision 36; confirm the spelling the project revision prefers.')
family('metal-form', 'Metal form', 15, 9, 'MDF, MDM, MDR', 'They are the metal forming instructions used by forming and press-control logic.', 'these instructions are application-specific; the operand list is long and order-sensitive, so read l5x_list_instructions before drafting.')
family('immediate', 'Immediate', 4, 0, 'IOT, IIM, IOM', 'They read or write I/O immediately instead of at the normal I/O update of the task.', 'immediate I/O is timing-sensitive; a change here needs a real-controller verification, not only an offline check.')
family('motion-move', 'Motion move', 21, 12, 'MAM, MAJ, MAS, MSO, MSF, MDO, MDR', 'They command one motion move or axis action and report completion through status bits.', 'the move instruction must be scanned while its enable bit is true; confirm the axis state machine before inserting a move.')
family('motion-configuration', 'Motion configuration', 11, 4, 'MAS, MCS, MSG', 'They configure axis attributes and motion connections.', 'configuration changes affect every program that uses the axis; verify with a connection check.')
family('motion-event', 'Motion event', 17, 6, 'MAPC, MAOC, MATC', 'They register an action for a position, velocity or time event on an axis.', 'event instructions are armed; an edit must preserve the arm/execute sequence or the event never fires.')
family('motion-group', 'Motion group', 9, 4, 'MGS, MGR', 'They change motion group state and attributes.', 'a group stop affects every axis in the group; treat it as a plant-affecting change.')
family('multiaxis-coordinated-motion', 'Multi-axis coordinated motion', 22, 12, 'MCLM, MCCM, MCSD', 'They command a coordinated path across several axes as one motion context.', 'the coordinate system and the motion group must already exist; the offline check cannot prove the path, so record an unverified coverage item.')
family('motion-state', 'Motion state', 16, 8, 'MSO, MSF, MSF, MDO, MDI', 'They drive an axis or axis group between states without commanding a move distance.', 'state commands are edge-triggered; keep the transition sequence documented so a re-edit does not repeat a command.')
family('move-logical', 'Move/logical', 17, 15, 'MOV, COP, FLL, CLR, AND, OR, XOR, NOT, SWPB', 'They copy or combine whole values: bitwise logical operations, moves, fills and byte swaps.', 'MOV changed spelling to MOVE at revision 36; either spelling answers in the catalogue, but a mixed project is a review finding.')
family('plantpax', 'PlantPAx', 34, 28, 'PIDE, P_AIn, P_DOut, P_Valve', 'They are the PlantPAx process instructions built on add-on instructions.', 'the PlantPAx instructions are AOIs; their operand order is owned by the AOI definition, not by the base catalogue.')
family('structured-text', 'Structured text', 34, 0, 'ST expressions, IF, CASE, FOR, WHILE', 'They are the structured text components and statements referenced from ladder instruction pages rather than ladder instructions themselves.', 'structured text bodies are edited as text; l5x_draft_st writes a body and l5x_draft_validate checks it before apply.')
family('drives', 'Drives', 16, 7, 'DRV, drive message instructions', 'They command PowerFlex-family drives and read their status.', 'drive instructions require a configured drive connection; the offline check cannot prove the connection, so record what remains unverified.')
family('process-control', 'Process control', 45, 15, 'PIDE, P_Alarm, P_AOut', 'They are the process control instructions used with PlantPAx process objects.', 'process instructions are AOI-shaped; read the AOI definition or l5x_list_instructions before changing operands.')
family('statistical', 'Statistical', 10, 4, 'AVE, STD, SRT', 'They compute averages, standard deviations and other statistics over an array segment.', 'the array length and the number of elements used must agree; a short array is a runtime fault, not a compile error.')
family('filter', 'Filter', 17, 5, 'FLL, FAL', 'They smooth or select values over an array, such as a moving average or a fill.', 'the filter state tags are retained across scans; resetting them changes the next several scans of output.')
family('logical-and-move', 'Logical and move', 10, 4, 'MOV, AND, OR, XOR, NOT, CLR', 'They are the logical and move instructions used as building blocks by the larger process instructions.', 'the destination is overwritten every true evaluation; check whether downstream logic needs the prior value.')
family('fault-and-error-topics', 'Fault and error topics', 3, 0, '', 'They document module fault icons and the error surfaces the editor shows.', 'use them when interpreting a reported fault; they do not change logic.')
family('program-control', 'Program control', 16, 13, 'JSR, SBR, RET, JMP, LBL, MCR, AFI, NOP, TND', 'They change which routine or rung is evaluated next.', 'JSR needs the called routine to exist and its SBR to open the first rung; SBR outside first rung and JSR without a return operand are both refused.')
family('safety', 'Safety', 40, 19, 'Safety input/output, safety tags and safety instructions', 'They are the instructions permitted in a safety task, where the tag set and placement rules are tighter.', 'safety placement and safety writes are checked by l5x_run_checks; a finding must be resolved before any draft is applied to a safety-program export.')
family('select-limit', 'Select/limit', 16, 7, 'LIM, SEL, MUX, BAND, BNOT', 'They select one value from several candidates or clamp a value inside a band.', 'selection instructions compute all inputs; a division or array access inside an unselected branch still executes and can fault.')
family('sfc', 'SFC', 13, 0, 'Steps, transitions, actions', 'They document the sequential function chart elements - steps, transitions, actions - that a chart routine is built from.', 'charts are edited in the SFC editor; from the L5X tools, l5x_draft_sfc writes a chart and l5x_draft_validate checks it.')
family('timer-counter', 'Timer and counter', 11, 10, 'TON, TOF, RTO, RES, CTU, CTD', 'They accumulate time or counts in a structure tag and expose done, timing and accumulated members.', 'timer and counter structures are retained; a rung that resets them on every scan will never time out.')

instruction('ABS', 'Absolute value (ABS)', ['ABS'], `ABS computes the absolute value of one source and writes the destination.

Operands, in order: a source (any numeric tag or expression) and a destination (a writable numeric tag). Without Studio, keep the source and destination the same numeric type: an INT source with a DINT destination is accepted by the catalogue but changes the range the logic can represent, and the review complains when the value can overflow.

ABS is a compute instruction: the destination is written every scan in which the rung condition is true and keeps its previous value while the condition is false. If downstream logic must see zero while the rung is false, do not rely on ABS alone - add the clear explicitly.

Revision note: the instruction spelling has not changed between revisions 36 and 37, so the same authored page answers for both. The installed help indexes the page in the Compute/Math family, in both revisions.`, ['absolute'])
instruction('ADD', 'Add (ADD)', ['ADD'], `ADD computes source A plus source B and stores the result in the destination.

Operands, in order: source A, source B, destination. All three are numeric tags or expressions. The catalogue accepts mixed numeric types, but the sum must fit the destination or Studio refuses the rung with an operand-type finding.

When editing offline, prefer one ADD per rung over chained adds. A chained expression is harder to test and a single mistaken destination silently corrupts the next scan. l5x_run_checks reports a tag written by more than one instruction as a finding, which catches the common copy-paste mistake.

The revision spelling is unchanged between 36 and 37.`, ['addition'])
instruction('BSL', 'Bit shift left (BSL)', ['BSL'], `BSL shifts an array one bit left on each false-to-true transition of the rung condition.

Operands: array tag (the bit-array source and destination), a length in elements, a source bit, and a control structure. The control structure supplies the enable and done bits and the position pointer.

Two offline-editing cautions. The instruction executes only on the rising edge of its rung condition, so a continuously true rung shifts once, not every scan. And the shift moves bits through every element of the array up to the declared length: if the length is larger than the array, Studio refuses the rung; if it is smaller, the high elements are simply never updated and that omission is easy to miss.

Read l5x_list_instructions before drafting to confirm the exact operand order for the project's revision.`, ['bit shift left'])
instruction('BSR', 'Bit shift right (BSR)', ['BSR'], `BSR shifts an array one bit right on each false-to-true transition of the rung condition.

Operands: array tag, length in elements, source bit, control structure. The control structure holds enable, done and position.

The common editing mistake is direction: BSL and BSR have identical operand shapes, so a copied BSL rung that should have been BSR validates cleanly and produces wrong logic. Compare the source rung and the replacement operand by operand before applying a draft, and let l5x_compare_projects show the engineering difference rather than the text difference.`, ['bit shift right'])
instruction('CONCAT', 'Concatenate (CONCAT)', ['CONCAT'], `CONCAT appends the second string to the first and writes the result to a destination string.

Operands: source A (string), source B (string), destination (string). The destination receives A followed by B; the sources are unchanged.

When editing without Studio, check the declared string lengths: the destination must hold the combined length, and an over-long result is a runtime fault that the offline parser cannot see. l5x_draft_rung rejects an operand whose declared type is not STRING, but it cannot prove the length, so record that as unverified coverage in review.`, ['concatenate'])
instruction('COP', 'Copy (COP)', ['COP'], `COP copies a number of elements from one array to another without any type conversion.

Operands: source array, destination array, length in elements. The instruction copies raw element patterns, so copying a DINT array into a REAL array copies the bit patterns and produces nonsense values; use a typed move for a conversion.

The length must fit both arrays. Offline, this is the instruction most likely to be drafted with a stale length after an array resize, so validate the draft against the open project and read the finding when the lengths disagree.`, ['copy file'])
instruction('CTD', 'Count down (CTD)', ['CTD'], `CTD decrements a counter structure once per false-to-true transition of the rung condition, down toward the preset.

Operands: counter structure and preset, in the order the help lists them. The counter structure exposes accumulated value, done, over/under flow and the count-enable bit.

Counters are retained: the accumulated value survives scans and mode changes unless the logic resets it. A RES instruction with the same counter tag is the normal reset, and l5x_run_checks reports the pattern where a counter is reset every scan because the reset rung is not edge-conditioned.`, ['count down'])
instruction('CTU', 'Count up (CTU)', ['CTU'], `CTU increments a counter structure once per false-to-true transition of its rung condition.

Operands: counter structure, preset. The done bit sets when the accumulated value reaches the preset; the counter keeps counting past the preset into overflow, so logic that must stop at a number needs a separate compare or reset.

The rung condition does not have to stay true; only the transition counts. That means an edit that changes the condition to an always-true expression turns the counter into a one-count instruction, a silent behavioural change that l5x_compare_projects will show but only if you compare the old and new exports.`, ['count up'])
instruction('EQ', 'Equal to (EQ)', ['EQ', 'EQU'], `EQ compares two sources for equality and controls the rung condition; it writes no tag.

Operands: source A, source B. Before revision 36 the instruction was spelled EQU; from revision 36 the IEC-61131 spelling EQ is preferred and the old spelling is accepted for reading. A project that mixes the two spellings is a review finding, not a parse error - the composer emits the spelling the project's major revision prefers.

For offline editing, read the project's Controller MajorRev first (an export reports it). If the export has no major revision, treat it as pre-36 and expect the legacy spelling in existing rungs.`, ['equal'])
instruction('FAL', 'File arithmetic and logic (FAL)', ['FAL'], `FAL applies an expression or a math operation to arrays, one element at a time, according to a mode and a length.

Operands are the expression or operation, the array operands, a length and a position, plus a control structure. Different modes use different operand sets, which is why the catalogue shape depends on the mode.

Offline, treat a FAL edit as a logic change, not a text change: the mode determines which operands are read, and an edit that swaps two tags validates while changing the algorithm. Document the mode in the rung comment before applying.`, ['file arithmetic and logic'])
instruction('FLL', 'File fill (FLL)', ['FLL'], `FLL fills a range of elements in an array with one source value.

Operands: source value, destination array, length in elements. The fill executes while the rung condition is true; it is not edge-triggered, so an always-true rung rewrites the range every scan.

That is usually harmless but it defeats logic that expects to see an intermediate value. If a later rung compares against a filled value, the fill must be edge-conditioned or ordered before the compare on the same scan.`, ['file fill'])
instruction('FSC', 'File search and compare (FSC)', ['FSC'], `FSC searches an array for elements matching a condition and reports the position of the first match.

The instruction needs the array, the length, the position tag and a control structure. Search state is held in the control structure: the search is incremental, not atomic, so it can take several scans and the position meaning changes between the search and the match result.

Editing offline, keep the control structure tag stable across edits; replacing it resets a search in progress.`, ['file search'])
instruction('JSR', 'Jump to subroutine (JSR)', ['JSR'], `JSR calls a routine and returns when that routine executes RET.

Operands: the routine name, plus input parameters when the called routine declares them. A JSR with parameters that do not match the routine signature is refused with an operand finding; a JSR without a RET anywhere in the called routine is refused by the l5x_run_checks rule JSR_WITHOUT_RETURN, because the Studio compiler rejects it with RxCMP_E_AUDIT_INVALIDNOOFOPS.

The called routine must open with SBR as its first instruction. SBR anywhere else in the routine is a finding (SBR_NOT_FIRST), because Studio refuses to build it.

Offline, the reliable pattern is to compare the JSR operand list with the routine's parameter list from the same export before applying.`, ['jump to subroutine'])
instruction('LFL', 'Load FIFO with load (LFL)', ['LFL'], `LFL pushes the source value into a FIFO queue when its rung condition goes false to true.

Operands: source, FIFO array, length, position, control structure. The queue is full when the position reaches the length; loading a full queue sets the overflow bit and the new value is discarded.

The position tag and the control structure are the state. Editing a queue's length or replacing its control structure while the queue is partly full corrupts the queue's meaning. Document the queue's declared depth next to the rung.`, ['load fifo'])
instruction('LIMIT', 'Limit (LIMIT)', ['LIMIT', 'LIM'], `LIMIT clamps a test value between a low limit and a high limit.

Operands: low limit, test value, high limit, destination. Before revision 36 the instruction was spelled LIM; the IEC spelling LIMIT is preferred from revision 36.

The destination is written every true scan and holds while the rung is false. Offline, confirm that the clamp is what the process actually wants - clamp, not alarm - because a LIMIT that silently pulls a value into range hides the out-of-range condition from every downstream check.`, ['limit'])
instruction('MOVE', 'Move (MOVE)', ['MOVE', 'MOV'], `MOVE copies one value or a block of elements into a destination, with the destination type converted from the source type.

Operands: source, destination. Before revision 36 the instruction was spelled MOV; from revision 36 the preferred spelling is MOVE and the legacy spelling is accepted for reading. The composer emits the preferred spelling of the project's major revision, and a project that mixes both is reported by the review.

If you are editing an export from an old project, the rungs probably say MOV. Either spelling validates in the catalogue; the L5X output is what differs. Read Engine/mnemonics.ts's rename table for the full legacy-to-modern mapping used by the bundle.`, ['move'])
instruction('MSG', 'Message (MSG)', ['MSG'], `MSG sends or receives data over a communication path, typically to another controller or to a module.

Operands are not a simple value list: MSG operates on a message control structure whose members describe the path, the request type, the data table and the lengths. The catalogue models MSG as a control-structure instruction; read l5x_list_instructions for the current operand shape.

Offline, a MSG cannot be proven by parsing: the path may be unreachable, the target tag may not exist, and the connection may not exist. Any MSG change leaves a real-controller unverified item in the review evidence.`, ['message'])
instruction('OTE', 'Output energize (OTE)', ['OTE'], `OTE drives its bit true while the rung condition is true and false while it is false.

OTE is the ordinary output coil: it must terminate a rung branch, and a rung that ends in an instruction that only reads the rung condition is refused with the RUNG_NO_OUTPUT finding, because Studio will not build a rung that never drives the right rail.

The bit OTE writes is shared with the rest of the program. l5x_run_checks reports a tag written by more than one instruction as a finding; when two rungs both OTE the same bit, the last rung evaluated wins and the first is dead logic.`, ['output energize', 'output coil'])
instruction('OTL', 'Output latch (OTL)', ['OTL'], `OTL sets its bit true when the rung condition is true and leaves it true when the condition goes false.

A latched bit needs an explicit OTU (or a RES on a structure) to clear. Offline, check that the latch and the unlatch are both present and that the unlatch is reachable; a latch with no unlatch is a maintenance trap, and the review evidence should carry an unverified item for the intended reset path.

OTL and OTU are the standard way to hold a state across a power cycle when the tag is a controller-scoped tag in a non-safety task.`, ['output latch'])
instruction('OTU', 'Output unlatch (OTU)', ['OTU'], `OTU clears its bit when the rung condition is true.

Pair every OTL with a reachable OTU. Offline, search the walk of rungs for the unlatch: if the only OTU depends on the same condition as the OTL, the latch is never cleared by anything and the pair is effectively a seal with no release.`, ['output unlatch'])
instruction('SQR', 'Square root (SQR/SQRT)', ['SQR', 'SQRT'], `SQR computes the square root of its source and writes the destination.

Revision rename: the instruction was spelled SQR before revision 36 and is SQRT from revision 36. Either spelling is accepted for reading at any revision; the composer emits the spelling the project's major revision prefers, and a project that mixes the two spellings is a review finding.

The v37.05 installed help files the page under its current title "Square Root (SQRT)"; the v36.00 help also uses the modern spelling in its title even though older programs contain SQR. That is why the authored revision map keeps both spellings and both revisions.

A negative source is a runtime fault, not a compile error. Offline, add an explicit compare before the SQR when the source can go negative.`, ['square root'])
instruction('SUB', 'Subtract (SUB)', ['SUB'], `SUB computes source A minus source B and stores the result in the destination.

Operands: source A, source B, destination. The type of the destination determines the representable range; subtracting two large unsigned values into a smaller type is accepted by the catalogue and silently wraps, so l5x_run_checks flags a destination too narrow for the source range where it can infer it.

With mixed spellings, nothing has changed between revisions 36 and 37: SUB is not in the rename table.`, ['subtraction'])
instruction('TON', 'Timer on delay (TON)', ['TON'], `TON accumulates time while its rung condition is true and sets its done bit when the accumulated value reaches the preset.

Operands: timer structure and preset. The timer structure exposes the accumulated value, the done, timing and enable bits, and the preset is a member of the structure.

Timers are retained state. A TON whose rung condition is always true times once and stays done; a TON rung that is false keeps its accumulated value unless the logic resets it. RES is the normal reset. Offline, confirm the structure tag is not also used by a different instruction - l5x_run_checks reports multiple writers.`, ['timer on delay'])
instruction('TOF', 'Timer off delay (TOF)', ['TOF'], `TOF starts timing when its rung condition goes false and sets its done bit after the preset.

The done bit is set while the rung condition is true and stays set until the off-delay expires. A rung that removes the instruction's input tag also removes the timing, so failures in this pattern usually come from the input tag changing value, not from the timer.

Revision spelling is unchanged between 36 and 37.`, ['timer off delay'])
instruction('XIC', 'Examine if closed (XIC)', ['XIC'], `XIC is the normally-open contact: it passes the rung condition when its bit is true.

Operands: one BOOL tag, or a member of a structure. The tag can be an array element, in which case the operand names the element index. Offline, the common error is addressing an element outside the array - the parser accepts it when the tag resolves, but the reference tools can show whether the index is in range.

XIC never writes a tag. A rung built only from XIC and XIO will be refused with RUNG_NO_OUTPUT.`, ['examine if closed'])
instruction('XIO', 'Examine if open (XIO)', ['XIO'], `XIO is the normally-closed contact: it passes the rung condition while its bit is false.

Operands: one BOOL tag or structure member. XIO is used for stop buttons, fault conditions and interlocks. Offline, document the physical meaning in the rung comment: reading XIC where the installer meant XIO is the most common ladder editing error and produces inverted logic that validates cleanly.`, ['examine if open'])
instruction('XPY', 'X to power Y (XPY/EXPT)', ['XPY', 'EXPT'], `XPY raises a source to a power: source X, source Y and a destination.

Revision rename: XPY is the pre-36 spelling and EXPT is the preferred spelling from revision 36. Both answer any read; the composer uses the project's preferred spelling. A mixed project is a review finding.

Offline, the operation is real-valued in general, but integer destinations truncate. Use a REAL destination and explicitly convert when the result feeds a compare with a REAL tolerance.`, ['x to power y', 'exponent'])

export default {
  id: 'l5x-instruction-families',
  title: 'L5X instruction families',
  sections: ['Instruction families', 'Common instructions'],
  pages: [
    {
      id: 'instruction-set-overview',
      title: 'The Logix instruction set and the two installed help indexes',
      section: 'Instruction families',
      identifiers: ['INSTRUCTION SET'],
      body: `The Studio 5000 Logix Designer instruction set is documented in the installed help as a set of families. This knowledge collection mirrors that structure with authored pages: one page per family and one page per instruction that ladder edits reach for most often.

Measured structure of the two help installations this package indexes:

- v37.05 help: 5,493 topic pages, of which 902 are instruction pages under help/clinset, spread over 46 family directories.
- v36.00 help: 6,581 topic pages, of which 618 are instruction entries under the Instruction Set root, covering 299 distinct mnemonics in 39 family labels.

The counts are not comparable one-to-one: v37 files instruction pages under clinset with a directory per family, while v36 has flat topic pages with a table-of-contents ancestry. Each help index commits identifiers, titles, sections and relative help paths only. Page text is read from the local installation when a revision is requested.

When to use this collection rather than the installed-help index:

- You are offline with no Studio 5000 installation on this host: use the authored family and instruction pages here.
- You want to know which revision documents an instruction: read instruction-versions.json through the revision-check behaviour, or search the installed-help collection for that revision.
- You are editing and need the family's editing caution: the authored family page names the operand and state traps that matter for that family.

Action recipes:

- contents {collection: "l5x-instruction-families"} lists the sections and every page.
- search {query: "timer preset retained", collection: "l5x-instruction-families"} finds the timer page.
- lookup {term: "MOV"} resolves the exact identifier to the MOVE page.
- read {id: "instruction-abs"} returns the ABS page.`,
    },
    ...familyPages,
    ...instructionPages,
  ],
}
