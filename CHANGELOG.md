## [Unreleased]

- **Eight instructions the composer used to refuse now compose, and Studio proved they build.** `FFL`, `FFU`, `LFL`,
  `LFU`, `DTR`, `ATAN2`, `SQI` and `EVENT` were among the ~100 instructions the catalogue did not carry; their operand
  lists come from the installed Logix 5000 instruction help (`Help\ENU\rs5000`), which states each slot by name,
  including the pseudo-operands `Length` and `Position` that are real operands in the rung text. The catalogue goes from
  128 to **136**. Verification is not a unit test alone: the composer built
  `XIC(a1)FFL(arr1[0],arr2,ctl1,10,0)`, `XIC(a1)DTR(arr1[0],d2,arr2[0])OTE(a2)`,
  `XIC(a1)SQI(arr2,d2,arr1[0],ctl1,10,0)OTE(a2)` and the other five, our writer wrote the export, and the real Logix
  Designer SDK imported and built it — **0 import warnings, 0 errors, ACD written, 36 s**. Eight regression tests keep
  the exact accepted text, so a later operand edit cannot silently change what Studio approved.
- **Function block diagrams can now be composed, and Studio proved the sheet builds.** `draft_fbd` stages an FBD sheet —
  blocks, references and wires — and `draft_apply` writes it. The rule that took the longest to find: **a block is an
  instance**, so its `Operand` must name a tag whose data type is the block's structure (`FBD_MATH` for `ADD`), and wires
  name the pin on the block side (`ToParam` into an input, `FromParam` out of an output). The tool validates that the
  backing tag exists in scope and carries that structure, that every reference resolves, and that each wire names a node
  and a pin the block shows. Verification: `draft_fbd` → `draft_apply` → `verify_offline_l5x` imported and built the sheet
  with **0 warnings, 0 errors and an ACD written**. Six tests cover the accepted XML plus the refusals (wrong routine
  language, undeclared backing tag, wrong structure type, unknown node id, unknown pin). This closes the capability gap
  that mattered most: the competition composes four languages; two are no longer enough.
- **An FBD routine can now be created, and blocks chain directly.** `draft_routine` accepts `language: "FBD"` and writes
  an empty `FBDContent` (a body is refused, because a diagram is not code); `draft_fbd` then sees a routine staged earlier
  in the same draft, so the two calls work in either order. Two corrections came out of Studio builds: a **block-to-block
  wire is legal** (`FromParam` on the driving block, `ToParam` on the reading block) and is how blocks are chained — my
  first version refused it — while a sheet that **both writes and reads one tag** makes Studio abort the import, so the
  engine now refuses it with the fix spelled out (*"wire the blocks to each other directly, or move the read to another
  sheet"*). Verification by build: created routine only, one-block sheet, and a two-block chain through a direct wire all
  passed with **0 warnings and 0 errors**; the same-tag sheet fails as Studio does. Four new tests, 344 total.
- **An SFC chart creates the tags it needs and Studio builds it — with actions and numeric conditions.** `draft_sfc`
  declares every step as an `SFC_STEP` structure tag, every transition as a BOOL tag and every action as an `SFC_ACTION`
  structure tag when the project does not already have it, using the member set Studio writes (initial step `Status`
  `16#a020_0201`, others `16#0020_0201`; action `Status` `16#0020_0000`, `PauseTimer` 1, `PRE` 100). A missing `<Tags>`
  region is created before `Routines`, where the schema requires it. Verified on a project with no SFC tags at all:
  `draft_routine` + `draft_sfc` + `draft_apply` produced a chart with a step carrying a `NonStored` action and a
  transition conditioned on `c1 > 5`, and Logix Designer imported and built it with **0 warnings, 0 errors and an ACD
  written**. Two compiler rules were needed to get there: a transition condition must reference a tag or member — the
  literal `TRUE` is read as an undefined tag (`RxSTX_E_TAG_NOT_FOUND`) — and an empty `Structure` is rejected with
  `XMLSrv_E_SYNTAX_ERROR_EXPECT_DATAMEM`. Ten tests cover creation, generated tags, actions, conditions, the XML and the
  refusals.

- **Two float comparisons the composer refused now compose, and a repeated import aborts for a reason worth knowing.** `ISINF`
  and `ISNAN` take one `Source` slot; the catalogue is now **138** instructions. Verification went through our own tools
  rather than a hand-written rung: `compose_rung` built the spec tree, `draft_apply` wrote the export, and Logix Designer
  reported **0 warnings, 0 errors and an ACD written**. A second finding came out of the failures on the way: an import of
  an L5X whose **controller name is already registered** with the Studio SDK fails with
  `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`, and the *same bytes* import cleanly under a new controller name — renaming the
  controller proved it, after the file had been blamed. The bridge now releases the L5X-derived project before it opens
  the ACD that carries the same name, which is the correct lifetime regardless; the stale registration that survives a
  crashed or killed run still needs a fresh name or a service restart, and that is stated here rather than left to be
  rediscovered. `REF` was tried in the same batch and refused with `RxCMP_E_AUDIT_INVALIDOPTYPE` for both DINT and REAL
  operands, so it stays uncatalogued until a real export shows its operand type.

- **Six serial ASCII instructions compose, and the table that had their operand counts wrong is corrected.** `ABL`,
  `ACB`, `ARD`, `ARL`, `AWA` and `AWT` are now described with the operand types the installed help publishes — `Channel`
  DINT, `Serial Port Control` a `SERIAL_PORT_CONTROL` structure, `Serial Port Control Length` and the character counts
  DINT, `Destination`/`Source` STRING — so the catalogue counts **139** instructions. Five of them already existed in the
  compact `instruction-set.ts` table with the wrong arity (`ABL=AL` is two slots; Studio takes three), which is how the
  duplicate-mnemonic test found them; that table is now reduced to the four entries still generic. Verification is a
  Studio build through our own composer: `compose_rung` produced `XIC(a1)ABL(chan,ctl,cnt)OTE(a2)`,
  `ARD(chan,text,ctl,len,cnt)OTE(a2)` and `AWT(chan,text,ctl,len,cnt)OTE(a2)`, `draft_apply` wrote the export, and Logix
  Designer built it with **0 warnings, 0 errors and an ACD written**. The family is **controller-gated**: on a 5069 and on
  a 1756-L83E every operand combination returns `RxCMP_E_AUDIT_INVALIDOPTYPE`, while the same rungs build on a 1756-L73,
  and the help states these instructions are unavailable on controllers without serial ports.

- **A serial-port instruction on a processor that has none is now reported instead of left for the build.** `run_checks`
  gains `SERIAL_PORT_INSTRUCTION_UNSUPPORTED`: when a ladder routine uses `ABL`, `ACB`, `ACL`, `AHL`, `ARD`, `ARL`, `AWA`
  or `AWT` and the export's `ProcessorType` is a CompactLogix 5380 (`5069-…`) or a ControlLogix 5580 (`1756-L8…`), the
  finding says which rung, which mnemonic and why — Studio's compiler answers
  `RxCMP_E_AUDIT_INVALIDOPTYPE` for every operand combination, because the family has no serial port — and names a
  controller where the same rung does build (`1756-L73`). That rule exists because the previous round spent five failed
  builds changing operand types for an instruction the platform never supported. Severity is `critical`, one finding per
  rung however many such instructions it holds, and a 1756-L73 reports nothing. Six tests cover the rule directly and
  through `run_checks`.

- **The serial ASCII family is complete in the catalogue: `ACL` and `AHL` join it, both built.** Their slots come from
  the installed help pages, not from guessing: `ACL` is `Channel`, `Clear Serial Port Read` and `Clear Serial Port Write`
  (both BOOL), and `AHL` is `Channel`, `ANDMask`, `ORMask`, `Serial Port Control` and `Channel Status`. The catalogue is
  now **140** instructions. `AHL` had also been sitting in the compact `instruction-set.ts` table as `AHL=AL` — two
  slots where Studio takes five — so it is removed from that table, the second time this round-trip has caught a wrong
  arity there. Verification is a Studio build on a 1756-L73 through our own composer: `compose_rung` produced
  `XIC(a1)ACL(chan,clrR,clrW)OTE(a2)` and `XIC(a1)AHL(chan,andMask,orMask,ctl,chStatus)OTE(a2)`, `draft_apply` wrote the
  export, and Logix Designer built it with **0 warnings, 0 errors and an ACD written**. The test that pins the ASCII text
  now covers all eight instructions, so a later operand edit cannot silently change what Studio approved.

- **The compact table is audited against the help, and three more arities were wrong.** Comparing every entry in
  `instruction-set.ts` with the operand lists extracted from the installed help found 22 disagreements; the ladder-shaped
  ones were judged by build. `SRT` takes **five** slots (`Array`, `Dimension to Vary`, `Control`, `Length`, `Position`),
  not three; `SWPB` takes **three** (`Source`, `Order Mode`, `Dest`), not two; `STOR` takes **two** (`Source`,
  `Destination`), not three. All three are now declared explicitly in `instructions.ts` and gone from the compact table,
  which keeps 41 → 38 rows. A rule worth writing down came out of the same build: `SWPB`'s order mode is a **number**
  (0 or 1) — the help says to enter `HIGHLOW`, but Studio reads that as a tag and fails with
  `RxCMP_E_OPERAND_TAGNOTFOUND`, while `SWPB(d1,0,d2)` builds. Verification is a Studio build of the composed rungs
  `XIC(a1)SRT(arr,0,ctl,10,0)OTE(a2)`, `XIC(a1)SWPB(d1,0,d2)OTE(a2)` and `XIC(a1)STOR(text,r1)OTE(a2)`: **0 warnings,
  0 errors and an ACD written**. Two tests pin the audited slot counts and the accepted text so the compact table cannot
  quietly drift back.

- **The compact table's second audit batch: three arities fixed, five entries that should never have been there removed.**
  `STD` takes **six** slots (`Array`, `Dimension to Vary`, `Destination`, `Control`, `Length`, `Position`), `SIZE` takes
  **three** (`Source`, `Dimension to Vary`, `Size`), and `JXR` takes **two** (`External routine name`,
  `External routine control`, with optional parameters and a return tag after them) — the first two confirmed by a build,
  the third by a build that parsed both operands and failed only on the undeclared routine
  (`RxCMP_E_AUDIT_ROUTINENOTFOUND`). Five entries are gone: `ACN`, `ASR` and `AEX` have **no page in the installed help
  and no meaning in Studio** — a deliberately bogus `ZZZZ(d1)` fails a build with exactly the same
  `RxCMP_E_AUDIT_INVALIDOPTYPE` those mnemonics produced — and `SCL` and `PIDE` are **Function Block and Structured Text
  only**, so a ladder catalogue must not offer them. The catalogue is **135** instructions, and it is smaller because it
  is now more nearly true. Verification of the fixed ones is a Studio build of
  `XIC(a1)STD(realArr,0,dest,ctl,10,0)OTE(a2)` and `XIC(a1)SIZE(arr,0,size)OTE(a2)` through our own composer: **0
  warnings, 0 errors and an ACD written**. Two tests pin the counts and assert the five removed mnemonics stay absent.

- **Both alarm instructions take five operands, not one, and the count was settled by build.** `ALMD` is
  `ALMD(tag, ProgAck, ProgReset, ProgDisable, ProgEnable)` and `ALMA` is
  `ALMA(tag, In, ProgAckAll, ProgDisable, ProgEnable)` — the compact table had each at a single slot. Getting there
  took a bisection worth recording: the help's ladder table lists **six** operands for `ALMD`, and six fails with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS`; counts 1 through 4 and 6 all fail the same way, and **5** builds. The sixth
  (`MinDurationPRE`) is a structure member the page presents in the operand table, not a rung operand. `ALM` itself is
  Function Block and Structured Text only, so it stays out of a ladder catalogue, which is why `ALMD` and `ALMA` are the
  alarm instructions here. Verification is a Studio build through our own composer:
  `XIC(a1)ALMD(almD,progAck,progReset,progDisable,progEnable)OTE(a2)` and
  `XIC(a1)ALMA(almA,inVal,ackAll,progDisable,progEnable)OTE(a2)`, **0 warnings, 0 errors and an ACD written**. Two
  tests pin the counts and the accepted text.

- **An alarm can now be created from nothing: `draft_tag` declares the structures Studio defaults itself.** `CONTROL`,
  `SERIAL_PORT_CONTROL`, `ALARM_ANALOG` and `ALARM_DIGITAL` are accepted as data types, and the tag is written exactly
  as Studio writes it for those types — no `Data` block, because Studio fills the members in. That closes the last
  generation gap in the ladder surface: until now a composed `ALMD` or `ALMA` needed a project that already had an alarm
  structure, and a composed `SRT` or ASCII rung had the same problem with `CONTROL`. Verification is end to end through
  our own tools: `draft_tag` created `almD` as `ALARM_DIGITAL` and `almA` as `ALARM_ANALOG` in a project that had
  neither, `compose_rung` built the two alarm rungs, `draft_apply` wrote the export, and Logix Designer built it with
  **0 warnings, 0 errors and an ACD written**. Two tests cover the accepted types and keep an unknown type refused, with
  the type check asserted where it actually fires — when the draft is applied, not when it is staged.

- **Fixing code is now a proven flow, not a claim: refuse, name, replace, re-check, build.** An export whose rung reads
  `XIC(Missing)OTE(Run)` **fails a real build** with `RxCMP_E_OPERAND_TAGNOTFOUND`; `run_checks` names it exactly —
  *"Symbol Main::Missing could not be resolved in this export"*; `compose_rung` with `mode: "replace"` stages
  `XIC(Start)OTE(Run)`; `draft_apply` writes it; the re-check on the written file reports **0** unresolved references; and
  that file **builds with 0 warnings and 0 errors**. Both sides of the before/after are Studio verdicts, which is what
  makes the claim worth anything. The flow is pinned in `packages/l5x/test/repair.spec.ts` so it cannot quietly stop
  working: it asserts the finding before, the composed text, that the written export no longer contains the bad symbol,
  and that the re-opened export has no unresolved reference left. That is the capability the brief asks for — compose,
  and fix — shown as one run rather than as separate tools that happen to exist.

- **`PID` takes seven operands, not one, and two rounds of wrong guesses about it were mine to own.** The ladder form is
  `PID(pid, PV, Tieback, CV, master loop, inhold bit, inhold value)`; `PID(tag)` and even `PID(tag, PV, Tieback, CV)` fail
  with `RxCMP_E_AUDIT_INVALIDNOOFOPS`, and the seven-operand form **builds with 0 warnings and 0 errors**. The same round
  cleared a misunderstanding behind three earlier failures: `EXPT`, `ASIN`, `ACOS` and `ATAN` are the **v36+ spellings**
  of the legacy `XPY`, `ASN`, `ACS`, `ATN` this catalogue has always carried — my raw-XML probes wrote the legacy names
  into a 37 project and Studio answered `INVALIDOPTYPE`, which reads like a bad operand but was a bad *spelling*. With the
  modern names, `EXPT(r1,r2,r3)`, `ASIN(r1,r2)`, `ACOS(r1,r2)` and `ATAN(r1,r2)` all build, so those catalogue entries
  were right all along and are unchanged. `SQC` stays open: `SQC(arr,…)` needs array **elements** (`MUSTBEDISCRETE`), and
  the element form still fails on type, so nothing is changed there until a shape builds. Two tests pin PID's seven slots
  and the accepted rung.

- **`SQC` is gone: it is an SLC instruction, and Logix does not have it.** The catalogue listed `SQC=KLP` with three
  slots; no operand count could make it build, and the help settled why. There is **no `SQC` page** among the sequencer
  instructions (only `SQI`, `SQO` and `SQL`), and the SLC-to-Logix translation reference says it outright: *"145 SQC
  instruction not supported. Each time a SQC instruction is found."* That page lists **23** instructions Logix does not
  support, and sweeping the whole catalogue against it found **exactly one** clash - `SQC` - so removing it closes the
  class of phantom entries the audit began with `ACN`, `ASR` and `AEX`. The catalogue is now **134** instructions, and
  the test that keeps those mnemonics absent covers `SQC` too, so it cannot return by accident.

- **The skill now teaches what this cycle proved, and it got 2.4 KB smaller doing it.** `packages/l5x/SKILL.md` was at
  **7975 of its 8000-character budget** - 25 characters of room - so it could not gain a line without losing one. A
  rewrite keeps every rule and adds the ones a model could not have known: that FBD and SFC take no body and are created
  then filled; that a block **is an instance** whose first operand names a tag of the block's structure, that
  block-to-block wires are legal, and that a sheet which both writes and reads one tag aborts the import; that a chart
  has one initial step and that a transition condition **must reference a tag or member**, since `TRUE` fails as an
  undefined tag while `Step_1.DN` builds, and that `draft_sfc` creates its own `SFC_STEP`, `SFC_ACTION` and BOOL tags;
  that `draft_tag` accepts `CONTROL`, `SERIAL_PORT_CONTROL`, `ALARM_ANALOG` and `ALARM_DIGITAL`; that the serial ASCII
  family needs a **serial port** and is refused on a 5069 or 1756-L8x whatever the operands, with `run_checks` reporting
  it first; that `XPY`, `ASN`, `ACS` and `ATN` are `EXPT`, `ASIN`, `ACOS`, `ATAN` in a v36+ project and only the composer
  knows the spelling; the repair loop itself; and the gotcha that cost a cycle - an aborted import on an export that
  imported before usually means the **controller name is still registered**. The body is now **5545 characters**, so the
  next proven rule fits without a fight.

- **`CPT` had its operands in the wrong order, and a build proved it.** The catalogue listed `CPT(expression, destination)`;
  Studio answers `RxCMP_E_AUDIT_INVALIDOPKIND` for that text and builds `CPT(destination, expression)` - the help's ladder
  table puts `Dest` first too. The catalogue is corrected, and so are the four places that pinned the old order: three
  spec trees and one operand-kind assertion. This is the first defect the audit found in an instruction that had been
  catalogued since early in the cycle, and it is a reminder that "catalogued" was never the same as "verified": the
  expression slot made the rung look plausible either way, so no build had exercised it. The corrected rung
  `XIC(StartPB)CPT(FaultCount,LineSpeed + 5.0)` is what the test now pins.

- **The composer gained a fifth pattern, and it is a build-verified one: `analog_scale`.** It expands to
  `CPT(scaled,(raw - 0.0) / (100.0 - 0.0) * (50.0 - 0.0) + 0.0)` from named endpoints, and Logix Designer builds that
  text with **0 warnings and 0 errors**. Two details make it correct rather than merely plausible: the destination comes
  first because the previous round proved `CPT`'s order by build, and every endpoint is emitted as a **float literal** -
  `0.0`, not `0` - because integer literals would make the expression divide as integers at run time, which is the kind
  of bug that passes a compiler and fails a machine. `compose_rung` and `compose_batch` both accept it by name, and the
  tool reference regenerated because the pattern enumeration is part of the schema. The rung is pinned in
  `ladder.spec.ts` so a later edit cannot quietly drop the decimal point.

- **Operand order, swept where a build can actually catch a swap: `SQO` and `SQL` are confirmed, and the method has a
  stated limit.** The last round's `CPT` defect raised the question of how many other entries have their slots in the
  wrong order, so this round took the class where a mistake is *detectable*: instructions whose slots differ in kind. Two
  builds settle the sequencer family's order - `XIC(a1)SQO(arr[0],mask,dest[0],ctl,10,0)OTE(a2)` and
  `XIC(a1)SQL(arr[0],src[0],ctl,10,0)OTE(a2)` both **passed with 0 warnings and 0 errors** - and both rungs are now
  pinned in `operand-kinds.spec.ts`. `GSV` reached the compiler's attribute check (`RxCMP_E_AUDIT_BADATTR` on a
  controller/attribute pair I chose badly), which shows the class/instance/attribute/destination order is parsed but is
  **not** a build verification, and it is recorded as such. The limit matters more than the results: where two adjacent
  slots share a kind - `MOV(Source, Destination)`, `COP(Source, Destination, Length)`, `FLL` - a swapped order compiles
  either way, so **no build can ever prove it** and the help is the only authority. Order verification is therefore
  complete only for the mixed-kind set, not for the catalogue.

- **The composer's sixth pattern, `totalizer`, builds: `XIC(run)ADD(total,rate,total)`.** It accumulates a rate into a
  total while an enable is true, and the interesting part is that the source and destination **share a tag** - Studio
  allows an in-place accumulate for a math instruction, which is what makes a one-rung totalizer possible at all. Verified
  through our own composer on a 5069: `compose_rung` expanded the pattern, `draft_apply` wrote the export, and Logix
  Designer built it with **0 warnings, 0 errors and an ACD written**. The rung is pinned in `ladder.spec.ts`, the pattern
  enumeration is part of the schema so the tool reference regenerated, and `compose_batch` takes it by name too. A note
  from the previous round applies: `ADD`'s slot order cannot be proved by a build (the sources share a kind, and addition
  is commutative), so this verifies the **rung shape** and the in-place accumulate, not the operand order.

- **The timer and counter instructions were missing an operand, and `run_hour_meter` is the seventh pattern.** `TON(meter,3600000)`
  fails with `RxCMP_E_AUDIT_INVALIDNOOFOPS`; **`TON(meter,3600000,0)` builds** — the third slot is the accumulator, written
  as an immediate. `CTU(counter,10,0)` builds for the same reason. The catalogue had `TON`, `TOF`, `RTO`, `CTU` and `CTD`
  with two slots, so every timer or counter rung the composer produced was one operand short, and the `ton_delay` pattern
  had never been build-verified. All five are corrected, and `ton_delay` now emits the accumulator too. The new
  **`run_hour_meter`** pattern is the proof: it emits `XIO(meter.DN)XIC(run)TON(meter,3600000,0)` and
  `XIC(meter.DN)ADD(hours,1,hours)`, the timer's own `.DN` bit breaks its rung so it resets in the same scan it counts,
  and Logix Designer **built both rungs with 0 warnings and 0 errors**. This is the second time the audit has found a
  defect in an instruction used by the fixtures since early in the cycle — the first was `CPT`'s operand order — and both
  were invisible until a build of *that* instruction, not of a neighbour.

- **The composer was writing legacy instruction names into modern projects, and one build caught it.** A family sweep
  through `compose_rung` against a fresh v37 project emitted `MOV`, `EQU`, `SQR` and `LIM` - and Studio **refused the
  export** (`AUDIT_OUTPUTS`, then `INVALIDOPTYPE`) because those revisions renamed all four (`MOVE`, `EQ`, `SQRT`,
  `LIMIT`). The fallback in `spellingForProject` only followed the spellings a project already *used*, so a project with
  no rung using either spelling got the catalogue's legacy name. It now follows `MajorRev` when neither spelling appears:
  v36+ gets the modern name, older revisions the legacy one. With that fixed, the same sweep **built with 0 warnings and
  0 errors** in one project - eighteen instructions across five families: `MOVE`, `CLR`, `COP`, `CPS`, `FLL`, `MVM`,
  `EQ`, `LIMIT`, `ADD`, `SUB`, `MUL`, `DIV`, `SQRT`, `TON`, `TOF`, `RTO`, `CTU` and `CTD`. That is the "build per family"
  the last round asked for, and it found a defect on the way that no fixture rung had exercised.

- **The string family is verified, and `STOD`/`DTOS` were typed as numeric on both sides.** Seven string instructions
  build through our composer: `MID(s1,5,1,s2)`, `INSERT(s1,s2,1,s3)`, `DELETE(s1,5,1,s2)`, `FIND(s1,s2,1,d1)`,
  `STOD(s1,d1)`, `DTOS(d1,s2)` and `RTOS(r1,s3)`. Two findings came out of the sweep. **String `Start` is 1-based**: with
  `0` the compiler answers `RxCMP_E_AUDIT_OUTOFRANGE`, and all four positioning instructions failed until the probe used
  `1` - a trap worth knowing, because `0` is the natural first guess. And `STOD`/`DTOS` were declared in the compact table
  with both slots numeric (`SD`), so the composer refused `STOD(s1,d1)` outright; they are now declared explicitly as
  `STOD(Source: STRING, Dest: NUMBER)` and `DTOS(Source: NUMBER, Dest: STRING)`. Separately, `BTD` was **already** five
  slots (`Source`, `Source bit`, `Dest`, `Dest bit`, `Length`) and a build of `BTD(d1,0,d2,0,8)` passes - my earlier
  four-operand probe was what was wrong, not the catalogue.

- **The bit family builds, and the skill now carries the two rules that cost probes to learn.** `AND`, `OR`, `XOR`, `NOT`,
  `BTD` and `MEQ` all build through our composer once the rung **ends in an output** -
  `XIC(a1)AND(d1,d2,d3)OTE(a2)` and its siblings passed in one project with **0 warnings and 0 errors**. They are
  input-type instructions, and ending a rung on one answers `AUDIT_OUTPUTS`. That, and the previous round's 1-based string
  `Start` (`MID(s,5,1,d)` builds, `0` fails with `OUTOFRANGE`), are now in `SKILL.md`, whose body grew from 5545 to 5863
  characters and still has 2137 of headroom. One finding stays **open** rather than becoming a rule: a subroutine whose
  first rung is a bare `SBR();` made a build fail with `AUDIT_OUTPUTS`, and removing that rung made the identical project
  pass - yet our own composer emits `SBR();` and a test pins it. One data point is not a rule, so it is recorded as a
  question to settle with a dedicated probe rather than encoded on a guess.

- **A rung whose only instruction is `SBR()` is now refused, because a build proves Studio will not take it.** The previous
  round left that observation open with one data point; this round settled it with five subroutine shapes. `SBR();` alone
  does not merely fail to compile - the SDK itself reports `LgxSrv_E_FATAL_ERROR` - and `SBR();` followed by `RET();`
  answers `AUDIT_OUTPUTS`, because **SBR does not drive the right power rail**. `RET();` alone builds, so the header is
  the problem, not the return. The composer emitted `SBR();` and a test pinned it, so a caller following our own catalogue
  would have produced a routine Studio cannot import; `compose_rung` now refuses it with the failure modes named and two
  ways forward (write the body without a header rung, or declare parameters). `SKILL.md` carries the rule too, and the
  test that pinned the old behavior now asserts the refusal. This is the tenth defect found by building rather than
  reasoning, and the first in program control.

- **`JSR` takes a return-parameter slot, and the ground truth came from a production export.** Our catalogue allowed
  `JSR(Routine)` alone, and Studio refuses it with `RxCMP_E_AUDIT_INVALIDNOOFOPS` even against a clean subroutine that
  contains only `RET();`. A production project answers the question in one line - it writes `JSR(A01_Inputs,0)` - so the
  instruction is `JSR(Routine Name, Return Par)`, the second operand being `0` when the routine returns nothing.
  Corrected in the catalogue, and **verified by build**: `XIC(a1)JSR(Sub,0)` composed through our tools and built with
  **0 warnings and 0 errors**. Input parameters are not modelled (they sit before the return parameter and would need the
  subroutine's own `SBR` declaration, which a build shows Studio will not accept as a bare rung), so the composer refuses
  a third operand rather than guessing. `SKILL.md` carries the rule; the variadic test that assumed free-form parameters
  is replaced by the two behaviours a build proves.

- **`MSG`, `COP` and `FLL` are build-verified, and the retry rule is now written down.** One project, three rungs, taken
  from the shapes a production export actually uses: `XIC(a1)ONS(ons)MSG(msg)` where `msg` is a `MESSAGE` tag - the real
  project gates its messages exactly that way - plus `COP(arr[0],arr2[0],5)` and `FLL(0,arr2[0],5)`. All three passed with
  **0 warnings and 0 errors**. A second finding came out of the first attempt: it died with `Server execution failed`
  before import, and the identical script **passed on retry**, which means that message is transient and a single retry is
  the right response rather than a diagnosis. Both facts are in `SKILL.md` now (body 6574 of 8000). `FAL` and `FSC` stay
  **unverified**: their six-slot shape parses but the compiler answers `RxCMP_E_AUDIT_OUTOFRANGE` at mode 0, and dropping
  the destination slot answers `INVALIDOPKIND`, so the next probe needs mode 1-3 and a `ctl.POS` position rather than my
  guesses.

- **`FAL` and `FSC` now carry the operand order the vendor help publishes, but they are help-verified, not build-verified,
  and the round says so.** The help's ladder tables list `Control, Length, Position, Mode, Expression, Destination` for
  `FAL` and the same without `Destination` for `FSC`; our catalogue had `Destination` **before** `Expression`, which is a
  swap no passing build had ever caught. `Mode` is also a **number from 1** - `0` produces
  `RxCMP_E_AUDIT_OUTOFRANGE`, and the `ALL`/`INC` in the help are dialog choices, not rung text, which a probe confirmed
  when the composer emitted `ALL` and Studio rejected the kind. Four build attempts at the corrected shapes still end in
  `RxCMP_E_AUDIT_INVALIDOPKIND`, so something else in my rung is wrong: the next probes are a **bare tag** destination
  instead of an element, an expression that references `ctl.POS`, and `Length`/`Position` written as `ctl.LEN`/`ctl.POS`
  given the help calls them pseudo-operands. Shipping an order change that agrees with the vendor documentation while the
  build is still red is a deliberate, stated risk - the alternative is keeping an order the documentation contradicts.

- **`FAL` and `FSC` are now refused instead of guessed.** Eight shapes were tried against a real build - destination as an
  element and as a bare tag, `ctl.POS` in the expression, `ctl.LEN`/`ctl.POS` for length and position, and mode `0`, `1`
  and `ALL` - and every one answered `RxCMP_E_AUDIT_INVALIDOPKIND` or crashed the compiler outright
  (`LgxSrv_E_UNHANDLED_EXCEPTION`). A catalogue entry that emits rungs Studio rejects is worse than one that admits it
  does not know, so both are marked **not modelled**: `list_instructions` still names them, and `compose_rung` answers
  `INSTRUCTION_NOT_MODELLED` with the history in the message instead of a plausible-looking rung. That also reverts the
  order change from the previous round, which was help-verified but never build-verified - right to try, wrong to keep
  once eight probes failed. The test that composed a `FAL` rung now asserts the refusal, and `SKILL.md` says to write
  these two by hand until a real export shows the accepted form.

- **`run_checks` now catches the `JSR` a build proved wrong.** Round 40 established that `JSR(Sub)` is refused with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS` and `JSR(Sub,0)` builds, and the composer enforces it - but an export that **already
  contains** the broken call had no finding. The new rule `JSR_WITHOUT_RETURN` reports it as **critical**, names the rung,
  and puts the fix in the message (`Write JSR(Sub,0) when the subroutine returns nothing`), so a reader does not have to
  know the rule name to act. Two tests pin it: `JSR(Sub)` is reported, `JSR(Sub,0)` is silent. The `run_checks`
  description names the rule, so the tool reference regenerated. This is the difference between a composer that refuses to
  write a defect and a checker that finds one already in the file - the second is what an engineer needs when they open
  somebody else's project.

- **A `JSR` that names a routine the program does not declare is now a critical finding.** The composer already refuses to
  compose one, but a project that lost a routine - renamed, deleted, copied between programs - still carried the call, and
  nothing reported it. The new rule `JSR_ROUTINE_MISSING` walks each program's routines, resolves every `JSR(name, ...)`
  against the routines that program declares, and names the rung: ``P::R rung 1 calls JSR(Nope) and P declares no routine
  of that name``. It is **case-insensitive**, because Studio's routine lookups are, and it stays quiet for a call to a
  sibling routine - the test proves both in one project by calling a declared routine and an undeclared one from adjacent
  rungs. `run_checks` names the rule in its description, so the tool reference regenerated.

- **A real 10 MB production project is the best false-positive test we have, and it caught a usability defect.** Running
  `run_checks` against a live plant export - 23 programs, 2651 tags, 257 routines - produced **zero findings** from
  `JSR_ROUTINE_MISSING`, `JSR_WITHOUT_RETURN`, `RUNG_NO_OUTPUT` and `SBR_NOT_FIRST`, which is the validation those rules
  needed. It also produced **701 findings**, and the unfiltered page returned **100 `UNUSED_TAG` rows before anything
  critical**: page order was generation order, so the findings that stop a build sat behind hundreds that do not.
  Findings are now ordered **critical, warning, info** before pagination, with generation order kept inside each rank so a
  re-run is stable. A test pins it on a project carrying both an undeclared `JSR` and an unused tag: the first row is the
  critical one. Summary counts were already by severity, so nothing else moved.

- **The production export's 701 findings break down as 0 critical, 14 warning, 687 info - and the summary now says so.** With
  the real distribution measured (23 programs, 2651 tags, 257 routines) the numbers are honest but the headline was not:
  `run_checks` said "701 findings" and left a caller to discover the split by paging. The message now reads
  `701 findings in Seco_Homogenizer (0 critical, 14 warning, 687 info), ordered by severity.` That is the difference between
  a number and a verdict - a project with zero criticals can ship, and a caller can see that without opening anything.
  Two catalogue observations came out of the same run: the only uncatalogued mnemonics on this real project are `DCM`
  (62 rungs), `CROUT` (7), `DCS` (4), `CABLE` (2) and `AOI56MCM` (1), and **none of them is an AOI defined in the export**,
  so `DCM`/`DCS`/`CROUT` are a genuine motion-catalogue gap to close next; the 8 `UNRESOLVED_REFERENCE` rows sit in a
  program that really is named `RECIPE`, so they are likely legitimate rather than resolver noise.

- **The biggest catalogue gap on real code is closed: `DCM`, `DCS` and `CROUT` are now catalogued.** Round 49's production run
  named them as the only uncatalogued mnemonics with real usage - `DCM` on **62 rungs**, `CROUT` on 7, `DCS` on 4 - and they
  were not AOIs, so they were a true gap rather than a false alarm. The vendor help supplies names (Dual Channel Input
  Monitor, Dual Channel Input Stop, Configurable Redundant Output) and the production rungs supply the **operand counts**:
  eight, ten and nine. They are marked **not modelled**, because their safety-function and input-type operands are
  drop-down names rather than tags and the composer would otherwise emit something Studio rejects - the same judgement as
  `FAL`/`FSC`. Re-running the checks on that export now reports **two** uncatalogued instructions, `CABLE` (2 rungs) and
  `AOI56MCM` (1), with neither defined in the export, so they stay honestly unlabelled. Two tests had used `CROUT` as their
  "instruction the catalogue does not carry" example; they now use a fictional `FROB`, so the behaviour they pin is real
  rather than accidental.

- **The eight unresolved references on the production export were string literals, not tags - a parser bug, now fixed.** The
  evidence made it plain: `MOVE('C',Edit_Practice_String)` inside a recipe selector, once per letter. The token scanner ran
  over the raw operand text, so every character inside a single-quoted literal became a candidate symbol, and the resolver
  dutifully reported `RECIPE::C`, `RECIPE::E` and six more as undeclared. `tokens()` now **masks string literals** before
  matching (replacing each with spaces so indices stay aligned), handles the doubled-quote escape a literal can contain
  (`'O''Brien'`), and the same production export now reports **zero** unresolved references instead of eight. A regression
  test pins it with a rung that moves three literals, one of them escaped. This is the same class as the radix-literal bug
  the file already documents - a literal wearing a tag's shape - and it is the reason the rule's confidence was `low` on
  real code: the scanner was guessing at letters.

- **Two false `MULTIPLE_OUTPUT_WRITES` findings were the AOI pattern, not a defect.** On the production export the rule named
  output parameters written from `Logic`, `EnableInFalse` and `Prescan` - which is exactly how an Add-On Instruction forces
  its outputs when the instruction is disabled or scanned. Writing an AOI output in those preset routines is documented
  practice, so the rule now **exempts them** and counts only the ordinary routines: `MULTIPLE_OUTPUT_WRITES` fell from 6 to
  4 on that project and total warnings from 14 to 12. The remaining four are real multiple writers, all inside `Logic`.
  Two tests pin both directions - a routine set of `Logic`/`EnableInFalse`/`Prescan` produces nothing, while `Logic`/`Other`
  produces the finding with the tag named - so the exemption cannot swallow a genuine defect.

- **Protected AOIs were being reported as uncatalogued instructions, and fixing it took two production projects to zero.** A vendor
  Add-On Instruction ships as `<EncodedData EncodedType="AddOnInstructionDefinition" Name="...">`, not as a plain
  `<AddOnInstructionDefinition>` element, and the loader only collected the plain form. The consequence was a false positive
  on exactly the libraries real plants buy: on the Carpenter project **all seven** uncatalogued mnemonics (`MAM_YASKAWA`,
  `MCFG_YASKAWA`, `MAFR_YASKAWA` and siblings) were protected AOIs, and on the Seco project `AOI56MCM` - a ProSoft AOI with a
  full encoded definition - was one too. `aoiElements` now collects both forms, and the two projects report **zero** and
  **one** (`CABLE`, still undefined) respectively. This also corrects round 50's claim that `AOI56MCM` was not defined in
  the export: it was, as encoded data, and my grep pattern was the thing that was wrong.

- **The last known false-positive class is gone: writes inside an AOI body are not call-site writers.** An Add-On Instruction's
  own `Logic` writes its output parameters as often as its algorithm needs, and the rule counted those as multiple drivers.
  It now keys the exclusion on `document.aois[].routines` rather than on a routine name, so an AOI called `Level` is exempt
  while a program routine called `Level` is not. The effect on the two production projects is decisive: `Seco` went from
  701 to **687** findings with warnings **12 → 8**, and `Carpenter` from 271 to **262** with warnings **9 → 1**;
  `MULTIPLE_OUTPUT_WRITES` is **zero on both**. What remains is seven `DUPLICATE_OUTPUT` rows on Seco and one on Carpenter -
  an output driven from two rungs in one routine, which is legal but worth a reader's attention - plus one
  `LATCH_WITHOUT_RESET`. A test pins the AOI case with three branches writing one output parameter.

- **A one-shot's storage bit is read/write, and the reference tools now say so.** On the production export,
  `find_references System_ONS` returned ten references with **every one classified `unknown`**, because `ONS`, `OSF` and
  `OSR` were missing from `READ_WRITE_OPS` even though the instruction writes the storage bit it reads. After the fix the
  same query returns **0 read, 10 write, 0 unknown** across four routines. Two smaller things came out of the probe: the
  matcher now also resolves a base tag against its **subscript and member** forms (`Flags` finds `Flags[2].3`), which the
  dot-only pattern missed, and two of my own readings were wrong rather than the tools - `find_references` reports `total`,
  not `matches`, and `usage_map` had already been naming the other scope since round 19. Both corrections are in the record
  because a defect claim that turns out to be a field-name mistake is the same class of error as a wrong operand order.

- **The built artifact is now tested, not just the source.** Every test in this package imports TypeScript through `tsx`, which proves
  the code we write - not the code the app ships. A new `dist-smoke.spec.mjs` imports the compiled `lib/` directly and checks
  three things a user would notice if the build dropped them: `DCM`/`DCS`/`CROUT` are catalogued with **8/10/9** operands,
  `spellingForProject('MOV', new Set(), '37')` returns **`MOVE`** while a v19 project still gets `MOV`, and `rungFindings`
  still raises **`JSR_WITHOUT_RETURN`** for `JSR(Sub)`. It skips cleanly when `lib/` is absent, so a fresh clone stays green,
  and all three pass against the build produced this cycle. This closes the gap between "the source is right" and "the artifact
  is right" - the live app still bundles an older copy (round 57), but what we can build is now proven to carry every fix.

- **Correcting my own commit: the dist smoke test must not be named `.spec.mjs`.** The previous commit landed with `vitest` red,
  because `**/*.spec.mjs` is inside the vitest include pattern and the file uses `node:test` - the suite failed to load while
  the 388 real tests still passed, which is exactly the shape of failure that a careless `git commit` hides. It is renamed to
  `dist-smoke.mjs`, which vitest ignores and the explicit bundle command still runs. `vitest` is green again and the three dist
  checks pass. Recording it in the changelog rather than amending, because the rule that produced it - never commit with a red
  gate - is worth more than a tidy history.

- **One project, three languages, all composed by our tools and built by Studio: RLL, FBD and SFC.** The attempt found two defects
  before it succeeded. `draft_tag` could not create an **`FBD_MATH`** instance at all - the built-in structure list carried
  only `CONTROL`, `SERIAL_PORT_CONTROL` and the two alarm structures - so nobody could compose a function block in a project
  that did not already have one. And once that was fixed, `draft_fbd` still refused the block, because `withStagedTags`
  publishes staged declarations on `project.stagedTags` while the block lookup read `document.tags` only; `ladder.ts` had
  been consulting both for rounds, and this path had not. Both fixed, and the project now composes `draft_tag FBD_MATH` ->
  `draft_routine` FBD -> `draft_fbd` (ADD wired to three tags) -> `draft_routine` SFC -> `draft_sfc` (two steps, two
  transitions) alongside an RLL rung, then builds with **0 warnings, 0 errors and an ACD written**.

- **My bundle gate has been running the wrong directory, and the repo already had the right command.** The 70-test suite lives at
  the **repo root** `test/`, not under `packages/l5x/test`; when rounds 58 and 59 ran the hand-written file list with the working
  directory set to the package, `node --test` found only the three-test dist file and exited 0. So two commits were gated by a
  suite that never ran, and I would not have noticed without a "file not found" from an unrelated probe. The fix is not a better
  memory: `pnpm test` at the root already named the suite, and it also covers `packages/ftview-viewer` which my hand-written list
  omitted entirely. `packages/l5x/test/dist-smoke.mjs` is now wired into that script, and a root run reports **90 tests, 90 pass,
  0 fail**. The lesson is the same one as the fixtures: a gate you invoke by hand from the wrong place is not a gate.

- **`compare_projects` now names the fields that differ, and the safety/non-safety diff shows why it matters.** On the two real
  Carpenter exports the change record used to say only `module Local changed`, which sends a reader into the XML by hand. It now
  carries `changed_fields`, and the same diff reads: **`catalogNumber 5069-L320ERMS2 to 5069-L320ER`**, `minor 13 to 11`,
  `ports ...`, `parentPortId 3 to 2` on three modules. That is the whole difference between a safety and a standard build in one
  line per component, and it comes from the same `changedFields` helper that `run_checks` has used since the I/O-change rule was
  written - the compare path simply never called it. A test pins it on two exports whose only difference is a tag description.
  The pair also gave a clean third production project: **0 critical, 1 warning, 262 info**, no uncatalogued instructions.

- **Three more production exports exposed a false claim and two overconfident rules.** The corpus is now six real projects, and
  the new three each failed a different way. `Seco_Cooler` lists **11 programs and zero routine bodies** - a partial export -
  and we reported `MAIN_ROUTINE_MISSING` for every one of them, blaming the project for what the export never carried; the
  rule now stays silent when the export has no routines at all. `GrosfillexLine1` produced **64 `LATCH_WITHOUT_RESET`
  warnings** on a 118-tag project including `always_on`, and `GrosfillexLine3` produced **65 `MULTIPLE_OUTPUT_WRITES`** on
  module output words driven from two rungs - both legal patterns whose reset or intent can live in an HMI write or another
  controller that no export shows. Both rules are now **`info`**, with the limit stated in the message ("an HMI write, a
  produced tag or another controller can still clear it"; "two rungs may drive one word by design, so read the rungs before
  changing either"). After the change those three projects report **0 critical and 0 warnings**, and the whole corpus reports
  no build-fatal finding at all - which is what a set of compiling projects should look like.

- **`Seco_Cooler` was not a partial export at all - it is source-protected, and we were calling that "0 routines".** The file carries
  **144 `<EncodedData EncodedType="Routine">`** elements: the logic exists and is encrypted, so the project is complete and the
  bodies are simply unreadable. `open_project` now says so exactly:
  `Seco_Cooler: 11 programs, 1266 tags, 0 routines (144 source-protected, bodies not readable)`, and the payload carries
  `protected_routines` so a caller can branch on it instead of parsing prose. That distinction matters: round 61's "partial
  export" reading was wrong about the cause, and an engineer told "0 routines" would think their export had failed rather than
  that a vendor protected the code. A test pins it with two encrypted routines.

- **`trace_dependencies` now adopts a unique declaring scope instead of making the caller retry.** On the production export,
  `trace_dependencies System_ONS` refused with `UNRESOLVED_SYMBOL` - "it is declared in SYSTEM" - while `find_references`
  happily searched every scope and returned 10 uses. The message was right and the behaviour was inconsistent: a tag that
  exactly one program declares is unambiguous, so the trace now resolves it and says
  `1 symbol and 0 edges upstream of System_ONS (declared in SYSTEM; scope adopted)`. An explicitly wrong scope still
  refuses and still names where the declaration lives, so the escape hatch did not get looser - it just stopped taxing the
  common case. The test that pinned the old refusal now asserts adoption plus a second case that an explicit bad scope is
  still an error.

- **`usage_map` now adopts a unique declaring scope, the same way `trace_dependencies` does.** Called as `usage_map {tag: "Std_Alarms"}`
  it used to answer `COMPONENT_NOT_FOUND` because the tag belongs to program `SYSTEM` - correct, and useless to a caller who never
  named a scope. It now resolves the declaration when exactly one program declares the name and says so:
  `Std_Alarms: 6 indexed elements used (declared in SYSTEM; scope adopted)`. An **explicit** scope that does not declare the tag
  still refuses with the scope named, so the escape hatch is unchanged; only the omitted-scope case got smarter. Two tests pin
  both sides. `resolve_tag` is the remaining tool with the same shape - it still answers "not in scope controller; declared in
  SYSTEM" when called without a scope - and it is next.

- **`resolve_tag` adopts a unique declaring scope, finishing the consistency pass across four read tools.** Called without a scope,
  `resolve_tag Std_Alarms` used to answer `resolved: false` with "declared in SYSTEM"; it now returns
  `Std_Alarms resolves to SYSTEM::Std_Alarms (INT) (declared in SYSTEM; scope adopted)`, and the same for a bit address
  (`SYSTEM::Std_Alarms[2].8 (BOOL)`). The payload carries `adopted_from`, so a caller that cares which scope answered can see it
  rather than infer it from prose. A name declared by **two** programs stays unresolved - ambiguity is still an error - and an
  explicit scope is still taken at its word. That completes the rule across `find_references` (which always searched every
  scope), `trace_dependencies`, `usage_map` and `resolve_tag`: the `scope` argument is an override, not a prerequisite.

- **Two FBD sheets in one routine build, closing a gap left open since the first FBD round.** `draft_fbd` was verified with one sheet
  only, and "multiple sheets per FBD routine" sat on the open list for forty rounds. Two sheets, one `ADD` block each, composed in
  one draft and built: **0 warnings, 0 errors, an ACD written**, and the applied export carries exactly two `<Sheet>` elements
  with both block tags. The block tag on the second sheet is a second `FBD_MATH` instance, so the path also proves that
  `draft_tag` can create more than one function-block instance in the same draft. A test pins the composed export, so the
  multi-sheet shape cannot regress silently the way the single-sheet shape once could.

- **`draft_sfc` now refuses a `Reset` action that nothing stores, and the round found a larger SFC regression it did not finish.**
  Studio answers `RxSFC_E_RESET_WITHOUT_STORED` for a Reset with no Stored action on the same operand; the composer now refuses
  it first and names the fix ("Add a Stored action on the same tag, or use NonStored instead"). Two things surfaced while
  bisecting qualifiers. First, `NonStored` and `Stored` charts that build in earlier rounds now fail with
  **`RxSFC_E_SPECIFIER_INVALID_TYPE`**, so something regressed after that evidence was captured. Second, the prime suspect is
  visible in the code: `sfcTagXml` emits **`SFC_ACTION` for transition tags** (`kind === 'step' ? 'SFC_STEP' : 'SFC_ACTION'`),
  while a transition is a boolean tag - the same file's own operation help says "a BOOL transition tag". My patch to change that
  did not land (anchor mismatch, then the build budget ran out), so it is **recorded, not claimed**: next round patches
  `sfcTagXml`, rebuilds the qualifier bisect, and either confirms the cause or reports the real one.

- **The SFC failure was a silent wrong-type reuse in my own fixtures, and the composer now refuses it.** `draft_sfc` guarded a chart
  element with `has(name)`, a case-insensitive name test, so an action called `A1` matched the fixture's existing **`a1` BOOL tag**,
  created nothing, and produced a chart whose operand had the wrong type - `RxSFC_E_SPECIFIER_INVALID_TYPE` from Studio, and three
  rounds of my blaming the SFC writer. The guard now checks the **type**: a step needs `SFC_STEP`, a transition `BOOL`, an action
  `SFC_ACTION`, and a mismatch raises `TYPE_MISMATCH` naming the tag, its declared type and the needed one. With a fresh name the
  same chart **builds: 0 warnings, 0 errors, an ACD written**, and the `SFC_ACTION` tag is created. Two tests pin both sides:
  the wrong-type name is refused with SFC_ACTION named, and a valid chart still composes. This is the sixth self-correction of
  the cycle, and the most expensive: the defect was in the probe, not the product.

- **Documentation now says when routine bodies are encrypted, in the bundle and in the summary.** `document_project` on the
  source-protected export reported "16 file(s) for 11 program(s), **0 routine(s), 0 rung(s)**" - a handover bundle that tells a
  maintenance engineer their project has no logic. It now reads `0 routine(s) plus 144 source-protected`, and `overview.md`
  carries a line of its own: "Source-protected routines: 144. Their bodies are encrypted in this export and were not
  documented." That is the third surface to get the same honesty after `open_project` and `run_checks` (rounds 61-62) - and
  the one where it matters most, because a documentation bundle is what a new engineer reads first.

- **`CABLE` was never an instruction: it was the word inside a safety-function name, and the mnemonic scan now skips operand lists.**
  The rung is `DCS(N_PULL_ROPE_DCS,CABLE (ROPE) PULL SWITCH,EQUIVALENT - ACTIVE HIGH,500,...)` - the DCS **Safety Function** operand
  legitimately contains parentheses and spaces, and the scanner matched `CABLE (` as a call. Three rounds carried it as "a gap we
  cannot close"; it was noise. `mnemonicsIn` now walks the text and **skips each instruction's argument list**, leaving the closing
  parenthesis in place so adjacent instructions like `XIC(A)OTE(B)` are still both found. The Seco export now reports **zero
  uncatalogued instructions**, and two tests pin both halves: adjacent instructions are found, and a safety-function name with
  parentheses yields only `DCS`. That also means the earlier `DCM`/`DCS`/`CROUT` count from round 50 included this false name, so
  the real production total was even smaller than reported.

- **A real edit in a 10 MB project produced exactly one change, and the diff named the rung and both texts.** Taking the production
  Seco export, replacing rung 2 of `TRAVEL/C07_Laser_Cooling` through `compose_rung`, applying it, and comparing the two files gave
  **1 change**: `rung: TRAVEL::C07_Laser_Cooling::2 changed`, with `changed_fields` holding the old branch rung and the new
  three-instruction rung side by side. That is the fidelity an engineer needs from a diff - not "the routine changed". Also
  verified on that project this round: `resolve_tag` on a deep member chain (`TC_FURN_GLOBAL.Scanner.NW.PV`), a bit address and
  an array element all resolve; `get_component kind "aoi"` returns an AOI with its routine and parameters; `trace_dependencies`
  and `find_references` both accept an `AOI::Member` symbol; and `document_project` filters to one program correctly (23 routines,
  1210 rungs). A test pins the one-rung diff so the fidelity cannot regress.

- **The safety inconsistency from round 73 is resolved: the guard is real, and it fires at validation.** On the actual Seco export,
  `draft_rung` against `MOTION_SAFETY/A04_Pull_Rope` **staged**, and `draft_validate` refused with
  `PROTECTED_TARGET: Safety programs cannot be changed`. That is the correct contract - staging is a draft, validation is the
  gate - and the earlier unit-test result was a mismatch between the two steps, not a missing guard. A test now pins the
  contract without caring which step refuses: `refusal = staged.error ?? validate.error` must be `PROTECTED_TARGET` naming
  safety, so the edit can never reach `draft_apply`. What remains is a UX nicety, not a safety gap: the refusal could come at
  staging time so a draft never holds an operation that cannot apply, which needs the guard's logic factored out of
  `change-set.ts` rather than duplicated.

- **A safety edit is now refused when it is staged, not when it is validated.** Round 74 established that the guard is real but fires
  late: `draft_rung` accepted a change to a safety program and `draft_validate` refused it, so a draft could hold an operation that
  could never apply. The model now records **`safety`** on programs (`Class="Safety"`) and on tasks, a helper resolves the set
  from all three signals the vendor uses (program class, a program literally named `safety`, a safety task that schedules it), and
  `draft_rung` and the composer path refuse at staging with
  `PROTECTED_TARGET: Program MOTION_SAFETY runs in a safety task, and safety logic cannot be changed.` Verified against the real
  Seco export, where the same call previously staged; the test now asserts the staging refusal and that no draft id is returned.

- **Every staging tool now refuses safety logic, and refuses before it complains about anything else.** Round 75 guarded `draft_rung`;
  this round funnels all nine program and scope selectors in the draft surface through one `safetyGuard`, so `draft_st`,
  `draft_tag`, `draft_routine`, `draft_sfc`, `draft_fbd` and the tag tools all answer
  `PROTECTED_TARGET: Program Safe runs in a safety task, and safety logic cannot be changed.` at staging. One ordering bug came
  out of the test: `draft_routine` validated its body first, so a safety program with no body answered `INVALID_ARGUMENT` and hid
  the reason; the guard now runs before body validation, because a caller editing safety logic should hear that rather than an
  argument complaint about a routine that cannot exist. The test covers three different tools in one safety project, so a future
  tool that bypasses the helper will show up as a failure rather than as a silent gap.

- **The composer was the one staging tool that still accepted safety logic, and an audit found it.** Round 76 said "every staging tool"
  guards safety; a deliberate audit of the tools that write through the draft store showed `compose_rung` **staged** a change to a
  safety program while `compose_batch`, `draft_rung_comment` and the others refused. The guard now runs in `compose_rung` after its
  argument checks, all three audit cases answer
  `PROTECTED_TARGET: Program Safe runs in a safety task, and safety logic cannot be changed.`, and the safety test covers
  `draft_rung`, `draft_st`, `draft_tag`, `draft_routine`, `compose_rung` and `compose_batch` in one project. The lesson is the
  round-76 claim itself: "every tool" is a claim about evidence, so it has to be tested by walking the tool list rather than
  inferred from the shared helper.

- **Vendor-owned data types are now refused at staging, the same way safety logic is.** The ACD-edit guard already treated any type whose
  `Family` is not `NoFamily` as vendor-owned, but that knowledge lived only in the raw XML, so `draft_udt_member` staged an edit to
  `STRING_1` and the caller learned at validation. The document now carries **`vendorTypes`** - the names only, so `udts` still lists
  the 166 user types and no count moves - and both `draft_udt_member` and `draft_udt_description` refuse at staging:
  `PROTECTED_TARGET: Data type STRING_1 is vendor-owned, and vendor types cannot be changed.` Verified against the real Seco
  export, where the same call previously staged; two tests pin the refusal and one confirms a user type still stages. This is
  round 77's audit lesson applied to the second protected class, and the reason it was cheap: the guard already existed, only
  its evidence was missing from the model.

- **A source-protected routine can no longer be edited, and the tool says why.** On `Seco_Cooler` - whose 144 routine bodies are
  encrypted - `draft_rung` **staged** a replacement for `BLOWERS/MainRoutine`, a routine the export carries only as an encrypted
  body; the change could never apply, and the old failure path would have described it as a missing routine. The document now
  carries **`protectedRoutines`** (program and name for every `EncodedData EncodedType="Routine"`), and staging refuses with
  `PROTECTED_TARGET: Routine MainRoutine in BLOWERS is source-protected in this export; its body cannot be read or changed.`
  Verified on that real export. One test pins the refusal. Still to fix, recorded rather than claimed: `get_component` on the same
  routine says "No routine named MainRoutine in this export", which is the misleading sentence this round removed from staging but
  not yet from the reader.

- **The reader now agrees with the editor about source-protected routines.** `get_component kind:"routine"` on the encrypted
  `BLOWERS/MainRoutine` in `Seco_Cooler` used to answer `COMPONENT_NOT_FOUND: No routine named "MainRoutine" in this export` -
  the same misleading sentence round 79 removed from staging. It now answers
  `PROTECTED_TARGET: Routine MainRoutine in BLOWERS is source-protected in this export; its body cannot be read.`, with the
  program named in the candidates so a caller can offer the choice. Verified on that real export, and the test that pins the
  staging refusal now asserts the reader's answer too, so the two surfaces cannot drift apart again.

- **`list_components` no longer reports a protected program as empty.** On `Seco_Cooler`, `list_components kind:"routine" scope:"BLOWERS"`
  answered **"0 routines"** for a program whose main routine exists as an encrypted body - the third surface to lie about the same
  object. It now lists the row with `type: "PROTECTED"` and a description saying the body is encrypted, and the summary counts them:
  **"22 routines, 22 source-protected"** for that program, and **"144 routines, 144 source-protected"** across the project, which
  matches the 144 `EncodedData` bodies exactly. A test pins the row and the count alongside the editor's refusal and the reader's
  message, so all three surfaces are checked in one place.

- **Vendor-owned types now get a consistent story from all three surfaces.** Round 78 stopped the editor from changing them; the reader
  still answered `COMPONENT_NOT_FOUND` for `STRING_1`, and the listing simply omitted the family. `get_component kind:"udt"` now
  answers `PROTECTED_TARGET: Data type STRING_1 is vendor-owned; this tool models user-defined types, not the built-in families.`,
  and `list_components kind:"udt"` reports **"166 udts, plus 7 vendor-owned not listed"** - the seven matching the seven
  `StringFamily` entries in the export. One test checks declaration, refusal, reader and listing together, so the four answers
  cannot drift. Vendor types are the second protected class to be made consistent; safety programs are legitimately readable, so
  their read surfaces needed no change.

- **The search tools now say what they could not search.** On the encrypted `Seco_Cooler` export, `search_logic` answered
  "**0 matches** for OTE in routine logic" and `find_references` answered "**0 references**" - clean-looking zeros over 144
  routine bodies that were never read. Both now append
  `144 source-protected routine(s) were not searched`, and the test that already covered the protected routine's editor,
  reader and listing asserts the two search answers as well. That is the last of the "silent absence" surfaces for a protected
  export: a zero now distinguishes *nothing matched* from *nothing could be read*.

- **The handover bundle now names the protected routines, not just counts them.** Round 70 made `document_project` say "plus 144
  source-protected"; an engineer still could not tell *which* code was vendor-owned. `PROJECT.md` now carries a
  **`## Source-protected routines`** table listing program and routine for every encrypted body (bounded at 200 rows with a
  remainder line), verified on `Seco_Cooler`, whose overview lists `BLOWERS/MainRoutine` and its 143 siblings. The test that
  pinned the count now asserts the table and a program/routine row, so the bundle's claim and its detail cannot drift. This is
  the difference between a warning and a work order: "144 bodies are encrypted" tells an engineer something is missing;
  a table tells them what to ask the vendor for.

- **`project_overview` - the first call anyone makes - now states the export's limits.** On `Seco_Cooler` it used to report controller,
  revision and counts, leaving a caller to discover later that 144 routine bodies are encrypted and the project has a safety task:
  `... Limits: 144 source-protected routine(s): bodies are encrypted and cannot be read; safety task(s) SafetyTask: safety logic
  cannot be edited.` The payload carries a `limits` array the same way. A caller who does not know an export is partly unreadable
  reads every later empty result as bad news about their own project; the fix is to say it once, first. The test asserts the
  summary and the payload field on an encrypted-routine project, alongside the editor, reader, listing and search answers.

- **The skill now lists every composer pattern with its exact argument names.** It named four of seven - `analog_scale`, `totalizer`
  and `run_hour_meter` were missing - and no arguments at all. Round 86 proved the cost: a `ton_delay` call was wrong three ways
  (`tag`/`seconds` instead of `timer`/`preset_ms`, and `enable` omitted) and came back `INVALID_ARGUMENT` after a round trip. The
  skill now carries `start_stop_latch` start/stop/run, `fault_latch` fault/reset/latched (two rungs), `ton_delay`
  enable/timer/preset_ms, `interlock` conditions+output, `analog_scale` source/destination/in_min/in_max/out_min/out_max,
  `totalizer` enable/rate/total and `run_hour_meter` run/timer/hours plus the optional preset_ms. Body 7126 of its 8000-character
  budget, 406 tests pass. Documentation a model reads before composing is a **product surface**; a missing argument name is a
  failed edit, not a cosmetic omission.

- **Fix-forward for `78ed8b5`, which I committed with a red bundle gate.** The package suite was green (406) and I read the bundle summary
  as green too; it was **89 of 90**. The failure was this repository's own documentation check: the skill may only cite names that are
  tools or that `components.json` allows, and `analog_scale` and `run_hour_meter` - now correctly named in the pattern list - were
  not in that allowlist. The allowlist now carries both, `pnpm test` is **90/90**, and `components.json` still parses. The rule I
  broke is mine and was written for exactly this: never commit with the bundle red. Reading a summary line is not reading the
  verdict; the gate must be checked exit-code first.

- **A pattern call that misses arguments now learns all of them in one refusal.** `requirePatternArgs` checks the full set before any value is
  read, for string arguments and numeric ones alike, so `ton_delay` with nothing answers
  `ton_delay needs enable, timer, preset_ms; missing: enable, timer, preset_ms.` and `analog_scale` missing only `out_max` names all six of
  its arguments and says which one is absent. That is the round-86 lesson made structural: a `ton_delay` call was wrong three ways and
  each attempt cost a round trip. Two tests pin the complete list for a string pair and a numeric set. 407 package tests.

- **A spec with three undefined tags now names all three in one refusal.** `compose_rung` stopped at the first unresolved operand, so a caller
  fixing typos learned them one round trip at a time: `No tag named "NoSuchOne"`. The scan that walks the spec uses the catalogue's own slot
  kinds, so only tag slots are checked and numbers, keywords, labels and expressions are left alone; the message is now
  `No tags named "NoSuchOne", "NoSuchTwo", "MissingOut" resolve in this export.` My first attempt ran that scan **before** composition and
  changed error precedence - four existing tests caught it, which is the tests doing their job - so the shipped version only **enriches a
  genuine `TAG_NOT_FOUND`** and every other refusal keeps its own code and message. 408 package tests.

- **SFC charts were invisible: they decoded to zero nodes, and the diff reported "0 changes" for a rewritten transition.** A real SFC export
  writes its steps, transitions and links **directly under `SFCContent`**, with no `<Sheet>` wrapper, but `decodeDiagram` only walked
  `<Sheet>` children - so every SFC routine read back empty and a chart edit could not be seen. It now treats unwrapped content as
  one sheet: the same fixture decodes 4 nodes (`Step`, `Transition`, `Line`, `DirectedLink`) and a changed condition produces
  `diagram P::R changed`. Two tests pin the decode and the diff. Found by asking the question round 93 left open - "SFC diff is
  fixture-tested only" was wrong: it was **not tested at all**, and the fixture lacked the wrapper real exports omit. Follow-up
  recorded: `changed_fields` prints diagram nodes as `[object Object]`, so the diff finds the change but not yet describes it.

- **An SFC or FBD change is now described by the element that changed, not `[object Object]`.** Round 94 made the diff see charts; the detail
  line still printed `nodes [object Object],[object Object]… to [object Object]…`. A diagram's node list is now compared as a set and only
  the difference is shown: the round-94 fixture reports `nodes +["Line A2"] -["Line A1"]` - the transition condition that appeared and the one
  that vanished, each rendered as `kind#id operand text`. Ordinary fields render compactly too, so a nested value no longer degenerates to
  `[object Object]`. The test that pinned the SFC diff now asserts both conditions by name. 410 package tests.

- **Produced and consumed tags now say so, and a consumed tag names the controller it comes from.** The tag model carried name, type, scope,
  radix, constant and external access - nothing about the network. The production exports are full of it: `Seco_Homogenizer` has 5
  produced and 83 consumed tags, `GrosfillexLine3` 1 and 1. `get_component` and `list_components` now report `tagType` (Base, Alias,
  Produced, Consumed), and for a consumed tag `consumerOf` and `remoteTag` from `ConsumeInfo`: the real `CCI_Nutro_dints` answers
  `"tagType":"Consumed","consumerOf":"CCI_Ethernet_Port_Controller"`. That is the fact an engineer needs before changing a tag that
  another controller is reading - previously the tool would have said nothing at all. Test covers a produced tag, a consumed tag and
  the listing row. 411 package tests.

- **An alias tag now names its target, and a produced tag its consumer count.** Round 96 added the network role; the record was still partial in two
  ways an engineer checks first. `L5xTag.aliasFor` carries `AliasFor` (so an alias row no longer looks like a tag of its own), and
  `produceCount` / `produceUnicast` carry `ProduceInfo`. Verified on the real `Seco_Homogenizer` produced tag: `tagType: "Produced",
  produceCount: 1, produceUnicast: true`, exposed by both `get_component` and the tag listing. The test covers an alias pointing at a
  base tag, a produced tag with two consumers and unicast permitted, and the listing row. 412 package tests. Follow-up: AOI
  `<Parameter TagType="Alias" AliasFor=...>` uses the same attribute, and the AOI model does not read it yet.

- **An AOI input parameter now names the tag array element it aliases.** The tag model learned `aliasFor` in round 97; the AOI parameter model
  did not, so the Carpenter safety permissive AOI looked self-contained. `L5xAoiParameter` now carries `tagType` and `aliasFor`, and the real
  export answers: **`AOI_PermCheck` has 32 aliased parameters**, `INP_Perm0` -> `Alias` -> `WRK_PermArray.0`, description "Permissive input 0
  (TRUE = OK)". That is the wiring an engineer must see before changing a permissive: the value comes from a tag array element, not from the
  instruction's own interface. Test covers the parameter record. 413 package tests.

- **A module recorded as faulted now says so; and the safety-signature question was answered by not inventing it.** `L5xModule.majorFault`
  carries `MajorFault="true"` - a static attribute in the export, exposed by `get_component` and the module listing. Verified on
  `Seco_Homogenizer`, where 1 of 20 modules records `majorFault: true`. The other candidate from round 98, **safety signature
  presence, turned out not to exist in the export**: the only `SafetySignature` text is inside rung logic
  (`GSV(Safety,,SafetySignatureExists,...)`), which is runtime state, so nothing was modelled and no false field ships. The test
  covers a faulted, inhibited module in both the reader and the listing. 414 package tests.

- **Unused-tag analysis is skipped when the logic is encrypted, and says why.** On `Seco_Cooler` - 1266 tags, 144 encrypted routine bodies, zero
  readable routines - `run_checks` reported 1277 findings, and the ones I sampled were all `UNUSED_TAG`: a tag used only inside an encrypted
  body has no readable reference, so "unused" was a guess dressed as a finding. The pass now runs only when at least one body is readable;
  otherwise the result carries **`skipped_readings`** with the rule and the reason, and the summary appends "1 reading(s) skipped". Verified on
  that export: the findings page now contains no `UNUSED_TAG` at all, only `UNDOCUMENTED_PROGRAM`. Two tests pin both sides - skipped on an
  encrypted routine, still reported on readable logic - so the guard cannot quietly suppress a real finding. 416 package tests.

- **A routine diagram's second page no longer overwrites the first, and the default path now actually writes an image.** `l5x_routine_diagram`
  on the real `TRAVEL/B01_Alarms` said *"No PNG diagram: the workspace path `.l5x-preview/TRAVEL-B01_Alarms.svg` is not absolute, so no image
  was written"* - and even when a rasteriser ran, page 2 reused page 1's filename, so stepping through a 60-rung routine kept one file.
  The resolved path is now absolutised and a paginated page carries its rung range: the same call produces
  `TRAVEL-B01_Alarms-r0-4.png` and `TRAVEL-B01_Alarms-r5-9.png`, with `start_rung` continuing correctly. A single-page draw keeps its old
  name. A test draws two pages of a six-rung routine and asserts the distinct absolute paths. 417 package tests. Found by testing the two
  paths round 93 listed as untested: `rungs_per_file` was fine; the diagram was not.

- **A paged project diagram no longer overwrites the previous page.** Round 103 made `l5x_diagram` write an absolute file, but every page still used
  `l5x-diagram.png`, so paging a 60-rung routine kept one image. A page beyond the first now carries its range: verified against the source,
  page 1 writes `l5x-diagram-r1-4.png` and page 2 `l5x-diagram-r5-8.png`, with `next_start` continuing. A whole-diagram draw keeps the plain
  name, and a test draws two pages and asserts distinct paths. One thing this round proved again: the **live MCP session runs an older build**,
  so my first two real calls returned the old single filename - the fix is verified through the plugin source, not through the running app.
  418 package tests.

- **The task listing says which task is a safety task.** The model learned `safety` from `Class="Safety"` in round 75 and `project_overview`
  warns about safety tasks, but `list_components kind:"task"` showed only type, rate and programs - so a reader scanning the tasks could not
  see that `SafetyTask` is safety without inferring it from the name. Rows now carry `safety: true|false`; verified on `Seco_Homogenizer`,
  where `SafetyTask` reports true and the three standard tasks false, and a test pins reader and listing together. 419 package tests.

- **The program listing says which program is a safety program.** Round 106 fixed the task row; the program row had the same omission - `get_component` returned
  the declared `safety` flag, but `list_components kind:"program"` showed only name, main routine and description, so the two guard programs looked ordinary
  in the list an engineer scans first. Rows now carry `safety: true|false`; verified on `Seco_Homogenizer`, where the list names
  **`COMBUSTION_SAFETY` and `MOTION_SAFETY`** - exactly the programs `SafetyTask` schedules - and the other 21 report false. A test pins the reader and the
  listing for one declared safety program and one standard program. 420 package tests.

- **Safety I/O modules and safety AOIs are now visible.** The export declares `SafetyEnabled="true"` with a `SafetyNetwork` on the one and `Class="Safety"`
  on the other; neither was modelled, so a GuardLogix guard module looked like ordinary I/O and a certified safety instruction looked like any
  AOI. `L5xModule` now carries `safetyEnabled` and `safetyNetwork`, `L5xAoiInfo` carries `safety`, and both listings show them. Verified on
  `Seco_Homogenizer`: **10 safety modules** (starting `SA_DIG_IN_1`) and **2 safety AOIs** (`FC_SFTY_BURNER_DIRECT`, `FC_SFTY_SSOV`), with
  standard modules and AOIs reporting false. A test covers the safety and standard case for each. 421 package tests.

- **The controller record now carries the saved route and project serial number.** `CommPath` and `ProjectSN` were in every production export and read by nothing, so
  `project_overview` could describe a controller without saying how the project reaches it - the first thing a live operation needs and the last thing an
  engineer wants to discover from a failure. `L5xControllerSummary` now exposes `commPath` and `projectSerialNumber`; verified on `Seco_Homogenizer`, which
  reports `CIM_Prep\10.211.100.100\Backplane\0` and `16#0163_1759`, and a test pins both through `project_overview`. 422 package tests.

- **The handover document states the project serial and the saved route.** Round 109 put `projectSerialNumber` and `commPath` on the controller record;
  `PROJECT.md` still listed only processor, revision and export kind. It now carries
  `- Project serial: ...; saved path: ...`, with `not declared` when the export omits them, so a new engineer holding the bundle knows which
  project it is and how the machine is reached without opening the L5X. My attempt to pin this with a new fixture produced a transform error twice
  and I restored `documentation.spec.ts` from HEAD rather than leave a broken spec; the line is exercised by the existing bundle tests but **not
  asserted for these two fields**, which is recorded as the gap.

- **The missing assertion from round 110 now exists.** Last round shipped the `PROJECT.md` line reading `Project serial: ...; saved path: ...` without a test that
  asserts it - I had broken the spec twice with scripted insertions and restored it from HEAD. This round added the assertion with the `edit` tool on a
  controller declaring `CommPath` and `ProjectSN`, and it passes: the bundle contains `Project serial: 16#0163_1759` and
  `saved path: CIM_Prep/10.211.100.100/Backplane/0`. 423 package tests. The lesson is mechanical: **edit test files with an editor, not with a template
  literal in a patch script** - three attempts across two rounds, and only the editor worked first time.

- **`find_references` now answers "who writes this?" for a networked tag.** The reference summary said `14 read, 0 write` for a consumed tag - true of the
  export and misleading about the machine: the writer is the producer controller, which the model has known since round 96. The summary now appends
  `Consumed tag: written by CCI_Ethernet_Port_Controller as CCI_Nutro_dints`, or `Produced tag: N consumer(s) declared`. Verified on
  `GrosfillexLine3`, where the consumed tag reads 14 references with zero local writes. A test covers both directions on a fixture with one consumed
  and one produced tag. 424 package tests - and the test was added with the `edit` tool, per round 111's rule.

- **`trace_dependencies` says when a value comes from the network.** Tracing a consumed tag upstream answered `1 symbol and 0 edges` - which reads as "nothing
  feeds this" when the feed is a producer controller that the export names. The summary now appends
  `Value arrives from CCI_Ethernet_Port_Controller as CCI_Nutro_dints; no upstream logic in this export.`, and a produced tag traced downstream says
  `Value leaves to 2 consumer(s); no downstream logic in this export.` Verified on `GrosfillexLine3`; the test that covered `find_references` for these tags
  now asserts both trace directions too. 424 package tests.

- **`compare_projects` now reports a controller-level change.** Two exports with **different processor types and different saved routes** compared as
  **"0 changes"**: the diff walked programs, tasks, tags, UDTs, AOIs, modules, alarms, routines, rungs, ST and diagrams, but never the controller
  record itself, so a firmware change or a new CommPath was invisible. It now emits a `controller` change, and `changed_fields` names the fields:
  `processorType 1756-L81ES to 1756-L82ES`, `commPath CIM_Prep/10.211.100.100/Backplane/0 to .../101/...`. That is the first thing a release
  review should see, and it was the one thing the comparison could not. A test pins it. 424 package tests.

- **The diff's deep coverage is now pinned: module revision, AOI parameter type and tag radix.** Probing showed `compare_projects` reports a module `minor 11 to 12`,
  an AOI parameter `parameters [...] BOOL ... to DINT`, and a tag `radix Float to Decimal` plus `constant undefined to true` - coverage that existed and was held by
  nothing. One test now changes all three in one fixture and asserts each line. My first version of the test asserted a string the test itself never built
  (`aoi AOI_X changed`), so it failed for my reason, not the product's - found by printing the map rather than guessing. 425 package tests.

- **The handover bundle now has a Safety section.** A new engineer receiving `PROJECT.md` could not tell which task, programs, I/O or instructions were safety - the
  bundle named the protected routines and the processor, and stopped there. It now carries a table built from the declared facts:
  `Safety task | SafetyTask`, `Safety program | COMBUSTION_SAFETY, MOTION_SAFETY`, `Safety I/O module | 10: SA_DIG_IN_1, …`,
  `Safety AOI | FC_SFTY_BURNER_DIRECT, FC_SFTY_SSOV` - verified on `Seco_Homogenizer`, and a test pins every row. 426 package tests.

- **New rule: a safety instruction called from standard logic.** `run_checks` now reports `SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM` when an AOI declared
  `Class="Safety"` is called from a program that is not safety-scheduled - the certified instruction sits where no safety task scans it. It is a
  warning, with evidence naming program, routine, rung and instruction. The rule was written only after scanning the corpus: **Seco_Homogenizer has 2
  safety AOIs and 0 calls outside its safety programs**, so it produces no noise on real projects, and the test covers both a violating standard program
  and a compliant safety program (1 finding, never 2). 428 package tests.

- **Two more safety rules, both corpus-silent.** `SAFETY_PROGRAM_NOT_IN_SAFETY_TASK` reports a program declared `Class="Safety"` that no task schedules, or
  that a standard task schedules - at run time it is not a safety program. `SAFETY_MODULE_WITHOUT_SAFETY_NETWORK` reports a module with
  `SafetyEnabled="true"` and no `SafetyNetwork`, whose connection cannot be verified. Scanning first showed the corpus needs neither:
  `Seco_Homogenizer` has 2 safety programs both scheduled by `SafetyTask` and 10 safety modules all with a network, `Seco_Cooler` 1 and 6 - and both rules
  return **0 findings** there after implementation. The test covers one violating and one compliant case for each. 429 package tests.

- **Safety findings now say what to do, not only what is wrong.** Each of the three rules ends with the action: *call it from a routine scheduled by a safety
  task, or remove it* / *move it to a safety task or clear its safety class* / *set its SafetyNetwork in Studio before download*. The test that covered the
  violations now asserts the action text too, so a finding cannot silently lose its remedy. The first patch script missed an anchor and applied nothing -
  caught because the script writes only at the end - so the corrected anchors were taken from the file rather than reconstructed. 429 package tests.

- **An AOI's own routines are now listable and readable by name.** Every AOI carries routines - `FC_SFTY_SSOV` has **`EnableInFalse`, `Logic` and `Prescan`** - but
  `list_components kind:"routine"` returned zero for an AOI scope and `get_component` answered `COMPONENT_NOT_FOUND`, so the only way to reach them was to read
  the whole AOI and pick from its array. Both tools now resolve a scope that names an AOI: the real call returns `3 routines` and reads `Logic`. A test covers
  an AOI with a Logic and a Prescan routine. 430 package tests.

- **The handover bundle lists the add-on instructions.** `PROJECT.md` described programs and routines and said nothing about the 25 AOIs in `Seco_Homogenizer` -
  the definitions where much of the project's behaviour lives. It now carries an Add-On Instructions table: name, revision, safety flag, parameter count,
  routine count, description - verified on the real export (`FC_Adj_Ratio_SP` 11 parameters 1 routine, and so on), with a test asserting the section and a row.
  The AOI routine count is the fact round 120 made reachable; this round puts it in the handover. 430 package tests.

- **A user-type member change is reported with its member description.** Probing `compare_projects` on two exports differing only in one UDT member's description showed it is
  already detected: `udt changed ["members [... "first description"] to [... "second description"]]`. That last row of the diff-coverage ledger is now pinned by a test, so
  the whole table - controller, module revision, AOI parameter, tag radix/constant, UDT member, rung, ST, FBD and SFC diagrams - is held by tests. Alarms were also
  probed: every production export parses zero alarm declarations, so alarm comparison cannot be exercised from the corpus and remains fixture-covered. 431 package tests.

- **An AOI's logic now appears in the handover bundle.** The bundle documented program rungs and, since round 121, listed AOIs with their routine counts - but never
  rendered the routines themselves, so `FC_SFTY_SSOV`'s `EnableInFalse` (whose rungs comment "SAFETY SHUT OFF VALVE / CONTROL / On Enable False Scan")
  was invisible. A rung request now also writes one file per AOI with RLL routines: `rungs/AOI-FC_SFTY_SSOV.md` documents the routines, comments, NeutralText,
  instructions and tags, verified on the real export. The test pins the section, rung and comment. 431 package tests.

- **The bundle's counts now include the AOI routines it writes.** Round 125 documented AOI logic, but the summary still said "257 routine(s)" for a project that also
  carries 29 AOI routines - `document_project` wrote files the count did not mention. `counts.aoiRoutines` now reports them and the summary reads
  **"257 routine(s) and 29 AOI routine(s)"** on the real export, with the PROJECT.md counts line naming them too. A test asserts the count and the summary
  sentence for an AOI with one routine. 432 package tests.

- **The skill now names the behaviours the last rounds added.** It told a reader to open the project and read, but not that `project_overview` states the
  export's limits first; it listed the check families but not the three safety rules; it described `compare_projects` without saying a controller-level
  change is reported; and it described the bundle without the Safety and Add-On Instruction tables or the `rungs/AOI-<name>.md` files. All four are now
  in the skill, body 7648 of 8000 characters. A skill that omits a capability is a capability the assistant will not use. 432 package tests.

- **Three tool descriptions now name behaviour they had grown.** `compare_projects` said it compared programs, tasks, tags and so on - the controller it now compares was
  absent from the sentence a model reads; `project_overview` did not mention the limits list; `document_project` did not mention the Safety and Add-On Instruction
  tables, the per-AOI routine files, or that counts separate program and AOI routines. All three updated and `docs/reference/tools.md` regenerated, so the public
  reference matches the product. My first patch dropped the trailing comma and broke the file; `tsc` caught it before any test ran. 432 package tests.

- **AOI internal logic is confirmed to be in the reference scan.** Asking whether `run_checks` ever looks inside an add-on instruction, a fixture whose AOI `Logic` routine reads an
  undeclared tag answered yes: one `UNRESOLVED_REFERENCE` naming `NoSuchTag` with evidence `scope: AOI_Bad, routine: Logic, rung: 0`, and `find_references` returns the same
  occurrence. That coverage existed and was held by no test; it is now pinned, including the scope and rung evidence. 433 package tests.

## [0.74.0] - 2026-11-01

### Added

- **A composed rung matches the instruction spelling its project already reads.** Logix Designer 36 renamed
  sixteen ladder instructions — `EQU` became `EQ`, `SQR` became `SQRT`, `MOV` became `MOVE`, `TRN` became
  `TRUNC`, and twelve more — so one project can legitimately carry either spelling. The new
  `packages/l5x/src/engine/mnemonics.ts` holds that table once, resolves either spelling on lookup, and lets
  `compose_rung` write the spelling the export's own rungs use (`spellingForProject`), falling back to the
  catalog name when the project uses neither. `run_checks` gains `MNEMONIC_VERSION_MISMATCH`, a warning that
  names the spelling the project's `MajorRev` publishes instead of leaving the mismatch to the Studio build.
- **A name Studio will refuse is refused at draft time.** `packages/l5x/src/engine/names.ts` states the identifier
  rules an export never records — first character a letter or underscore, the rest letters, digits and underscore,
  at most 40 characters — and `add_tag`, `add_routine` and `add_udt_member` now run them before staging. Each
  failure carries the repair and a legal suggestion (`1Pump` → `_1Pump`, `Start PB` → `Start_PB`), so the author
  fixes it in one turn instead of at build time.
- **A function block diagram is checked as a graph, not just drawn.** An FBD routine is a wire graph the export
  never describes, so a sheet Studio refuses is indistinguishable from one it accepts. The new
  `packages/l5x/src/engine/fbd.ts` reads the nodes the reference walker already decoded and reports
  `FBD_DANGLING_WIRE` (a wire naming an element that is not on the sheet), `IREF_TAG_NOT_PROVIDED` /
  `OREF_TAG_NOT_PROVIDED`, `OREF_DUPLICATE_DESTINATION` (one tag written from two output references, matched
  case-insensitively), the connector rules `ICON_NAME_NOT_PROVIDED`, `OCON_NAME_NOT_PROVIDED`,
  `ICON_NO_MATCHING_OCON`, `OCON_DUPLICATE_NAME`, `ICON_NO_OUTBOUND_WIRE`, `OCON_NO_INBOUND_WIRE`, and
  `FBD_FEEDBACK_CYCLE` for a wire loop that cannot be scheduled. `run_checks` runs it over every FBD routine; an
  SFC routine is never judged by these rules, because its `DirectedLink` elements are a different language.
  Covered by `packages/l5x/test/fbd.spec.ts`, which drives the mutation through `run_checks` on the committed
  synthetic export and the loop and connector rules through the checker directly.
- **A rung that drives nothing is reported, not left for the build.** `packages/l5x/src/engine/rung-rules.ts`
  judges the rungs an export already contains, reusing the same parser `compose_rung` trusts: `RUNG_NO_OUTPUT`
  when a rung's last instruction reads the condition and never drives the right power rail (`XIC`, `EQU`, `ONS`
  and the rest of that set, including a trailing branch whose every path reads), and `SBR_NOT_FIRST` when a
  routine declares `SBR` but its first rung does not open with it. A rung the parser could not read is left to the
  parse finding rather than reported twice, and any instruction whose rail behaviour needs a pin model is left
  alone rather than guessed at. Covered by `packages/l5x/test/rung-rules.spec.ts`, which also asserts both rules
  stay silent on the committed fixture.
- **The instruction catalogue names both published spellings.** Every `list_instructions` row for one of the
  sixteen instructions Logix Designer 36 renamed now carries `also_published_as` (`SQR` → `SQRT`, `EQU` → `EQ`,
  `MOV` → `MOVE`), so a caller composing a rung sees that both forms are catalogued and does not have to know
  which one the project happens to read. `compose_rung` accepts either and writes the spelling the export already
  uses. `packages/l5x/test/instructions.spec.ts` asserts the field appears for a renamed instruction and is absent
  for one that was never renamed.

- **Ten more instructions a rung can actually use.** The string family (`CONCAT`, `MID`, `FIND`, `INSERT`, `DELETE`,
  `LOWER`, `UPPER`, `RTOS`), file fill (`FLL`) and the subroutine label (`SBR`) are now catalogued, taking the catalogue
  from 118 to 128 instructions. Operand order is not guessed: each one was read out of the vendor instruction metadata
  the composer's own generate templates use, so `MID(Source,Qty,Start,Dest)` and `FLL(Source,Dest,Length)` are the order
  Studio writes. `SBR` carries no operands — its parameters are the arguments the calling `JSR` passes — which also
  makes `SBR_NOT_FIRST` judge a mnemonic the catalogue previously did not know.

- **A string slot is typed, so a BOOL tag cannot sit where a string belongs.** The string family added in this release
  declared its source and destination slots as `ANY`, which validated nothing: `CONCAT(Start,TextB,TextOut)` composed
  happily with `Start` a BOOL, and Studio rejected it later. Those slots are now `STRING` — `CONCAT`, `MID`, `FIND`,
  `INSERT`, `DELETE`, `LOWER`, `UPPER`, `RTOS` — while the count and start slots stay numeric, so `MID(TextA,Count,Count,TextOut)`
  still composes. A wrong tag and a numeric literal each fail with the type the slot needs. `packages/l5x/test/instructions.spec.ts`
  composes into an export that carries STRING tags, so the check is exercised against a parsed project rather than a stub.

- **A rung can carry an expression, a routine name and a label.** Every operand was forced through tag
  resolution, so five common instructions could not be composed at all: `CPT(LineSpeed + 5.0,Total)` and
  `CMP(LineSpeed > 5.0)` failed with "is not a tag or a number", and `JSR(MainRoutine)`, `JMP(Label)` and
  `LBL(Label)` failed with `TAG_NOT_FOUND` because a routine name and a label are not tags. Three slot kinds now
  say what an operand really is: `EXPRESSION` is text with operators, checked only for the shapes that would
  corrupt the rung (an unbalanced bracket, an unterminated string, an embedded terminator); `ROUTINE` resolves
  against the export's routines and its refusals are `ROUTINE_NOT_FOUND` with the routine names as candidates;
  `LABEL` must be an identifier. The composer also emits the **resolved** operand text now, so a JSR keeps the
  case the export uses rather than the caller's (`mainroutine` → `MainRoutine`).

- **Nine instructions had the wrong operand count, and Studio would have rejected every rung using them.** The
  compact table declared `MVM` with 2 operands (it takes Source, Mask, Destination), `GSV` and `SSV` with 3 (they take
  Class, Instance, Attribute, then a destination or source), `SQO` with 3 (it takes six), `SQL` with 3 (five), `FAL`
  with 3 (six), `FSC` with 3 (five), and `BSL`/`BSR` with 3 (four, because the source bit sits before the length).
  The counts now come from the vendor operand fields in written order, including the Length and Position fields a
  control structure carries — exactly the fields a pins-only reading of the metadata misses. `SQO`, `SQL`, `FAL`, `FSC`,
  `MVM`, `GSV` and `SSV` moved out of the compact table into explicit entries, so each has one home.
- **A system class, instance and attribute is a keyword, not a tag.** `GSV(Program,MainProgram,LastScanTime,Dest)` and
  `SSV(...)` name controller classes, not tag references, so the new `KEYWORD` slot kind validates them as identifiers
  instead of resolving them against the tag table — which refused every GSV and SSV even once the operand count was
  right.

- **An audit of every shared instruction caught five more wrong operand counts.** Comparing all 100 instructions
  both catalogues know against the vendor operand fields found 38 differences; most were their block-pin lists
  (a timer's `.PRE`/`.ACC` are structure fields, not operands, so our two-operand `TON` is right). Five were real:
  `BTD` takes five operands, not three (source bit and destination bit sit inside it), `MEQ` takes three, not two
  (a mask), `AVE` takes six, not two, and `OSR`/`OSF` take a storage bit **and** an output bit, not one operand.
  The audit is repeatable: it reports 33 remaining differences, which is the motion family and the block-pin
  instructions, both of which need their own pass rather than a mechanical fix.

- **The motion family is catalogued from its instruction-box fields, 92 operands across 13 instructions.** Our whole
  motion row was a placeholder — `MAJ`, `MAM`, `MAPC`, `MAS`, `MATC`, `MAH`, `MDF`, `MDW`, `MGS`, `MGSP`, `MRP`, `MSF`
  and `MSO` each carried one or two operands, so every real motion call was refused by the arity check that was
  supposed to protect it. Each now carries the fields its instruction box shows, in written order — `MAJ` has 17,
  `MAM` 20, `MAPC` 14, `MSO` 2 — which took the arity audit from 33 differences to 20. Operand kinds stay `ANY` on
  purpose: this catalogue cannot verify `AXIS`, `MOTION_GROUP` or the unit enumerations, so it validates presence and
  order and never claims a type it cannot check.

- **The write path was probed end to end and found sound, so its contract is now tested.** Driving
  `draft_rung` → `draft_validate` → `draft_apply` → reopen showed renumbering closes correctly (0…7 after an
  insert at the top), the rung comment survives, an array tag carries `Dimensions="4 2"`, and a two-line
  Structured Text body becomes exactly two `<Line>` elements with **no newline inside any CDATA** — the shape
  Studio refuses. None of that was covered by a test (`drafts.spec.ts` covers renumbering, not declaration
  dimensions or ST line splitting), so `packages/l5x/test/write-contract.spec.ts` now holds all four: the
  array attribute, its absence on a scalar, the one-line-per-`<Line>` rule, and that the written file reopens
  with the new routine listed.

- **`FOR` now runs a routine, and a `JSR` may pass as many parameters as it needs.** The compact table gave `FOR`
  a routine name, a source and an expression — neither the right count nor the right meaning. It takes the routine
  it loops over plus Index, Initial value, Terminal value and Step size, confirmed against two independent sources
  (the vendor operand metadata and the published description "each time the FOR instruction executes the routine,
  it adds the Step size to the Index"). Separately, `JSR` could carry only a routine and **one** parameter, so a
  subroutine taking three arguments was refused; a slot can now be marked as repeating, and `list_instructions`
  reports `rest: true` so a reader can see the parameter list is open-ended.

- **A tag that exists in another scope is no longer reported as absent.** `resolve_tag { address: "MainTimer" }`
  at controller scope answered *"Declaration is absent from the export"* — while the tag is declared in
  `MainProgram`. That is the kind of refusal that sends a reader hunting a typo that is not there. The resolution
  now says which scope does declare it and returns the scopes in a `scopes` field, so a caller can retry with
  `scope: "MainProgram"` instead of concluding the tag does not exist. A name no scope declares still answers
  *"absent from the export"*.

- **Alarms, every component kind and both diagram languages are now tested.** The word "alarm" appeared nowhere in
  the suite, so a project's `TagBasedAlarm` list was advertised and unverified — a kind that silently returns nothing
  looks exactly like a project with no alarms. `packages/l5x/test/surface-contract.spec.ts` holds the positive case:
  the alarm is listed by name, kind and description, it opens, and the overview counts it. The same file walks all
  eight component kinds (list, then open the first row), asserts an absent name is a repairable `COMPONENT_NOT_FOUND`
  rather than a crash, and checks that `search_logic` reaches a Sequential Function Chart step operand and an FBD
  reference operand while finding nothing for a topology element that carries no label.

- **A malformed composition spec no longer reports itself as a plugin defect.** `compose_rung` with `{}` answered
  `INTERNAL: Cannot read properties of undefined (reading 'toUpperCase')`, and a numeric mnemonic answered
  `INTERNAL: name.toUpperCase is not a function`. By this codebase's own contract `INTERNAL` means the tool is broken,
  so both told the reader the wrong thing about whose mistake it was. The spec arrives as caller-supplied JSON and is
  now shape-checked: a node must be an object, an instruction node must carry a non-empty mnemonic, and every operand
  must be a string — each refused as `INVALID_LADDER_SPEC` with the shape to use instead.
- **A target that is not there is no longer called ambiguous.** `XML_REGIONS`/`acd-edit` threw
  `AMBIGUOUS_TARGET: Expected one Routine named NoSuchRoutine; found 0` — a code that sends a reader looking for
  duplicates that were never there. Zero matches now answers `COMPONENT_NOT_FOUND` with the declared names as the next
  call; only more than one match stays `AMBIGUOUS_TARGET`.
- **The failure surface is now tested.** `packages/l5x/test/failures.spec.ts` throws an empty export, a non-L5X XML
  document, a truncated export, an unclosed export, a missing path and five malformed specs at the tools and asserts
  every answer is a repairable code and **never** `INTERNAL`.

- **Documentation covers the whole program, not just its ladder.** `document_project` skipped every routine whose body was
  not `RLL`, so a bundle reporting "3 routines" documented one of them — and the committed fixture alone has a Structured
  Text `FaultHandler` that appeared nowhere. A function block diagram is now written as a per-sheet element table (element,
  reference, from-id, to-id), a sequential function chart the same, Structured Text as its quoted source, and a language
  the reader does not decompose is named with its note. The tool description says what it produces, and
  `packages/l5x/test/documentation.spec.ts` asserts all three: the ST routine's source, an FBD sheet with its `IRef` and
  `Wire` rows, and an SFC sheet.

- **`compare_projects` is tested on the languages that are not ladder.** It is the tool a reviewer uses to judge an
  edit, and a comparison that answers "no changes" while a Structured Text body or a diagram changed would be worse
  than one that fails. Probing confirmed it does see them — component `structured_text` for an ST body, `diagram` for a
  function block operand and for a chart step — and nothing held it, so
  `packages/l5x/test/compare-languages.spec.ts` now covers an ST body change, an FBD operand change, an SFC step
  change, a rung change and a whitespace-only edit that must report nothing.

- **`l5x_diagram` no longer refuses a call over a folder it defaulted itself.** On a host that cannot make the
  workspace path absolute, the tool threw `INVALID_ARGUMENT: The workspace path .l5x-diagram/l5x-diagram.svg is not
  absolute` — blaming an `output` argument the caller never passed, and discarding a page that had already rendered.
  Its sibling `l5x_routine_diagram` already coped: it returns the rung list and says why no image was written. The
  whole-project diagram now does the same — the answer carries the rung count, the page window and an `image_error`,
  and only the image is missing.

- **An I/O change against a baseline says which field changed.** `run_checks { baseline_id }` reported *"I/O module
  Local changed"* and left the reader to diff the export by hand — while the change record it already holds carries
  both sides. The finding now names the fields: *"I/O module Local changed: catalogNumber 1769-L33ER to
  1769-L33ER-X"*, listing up to four fields and counting the rest. `packages/l5x/test/checks.spec.ts` covers it, and
  the matching case that two identical exports report no I/O change at all.

- **Four more findings name the places they found instead of only the count.** `MULTIPLE_SCHEDULES` said a program was
  "scheduled more than once" without naming the tasks; it now says `scheduled in 2 tasks: Fast, Slow`.
  `MULTIPLE_OUTPUT_WRITES` said "Multiple indexed writes to output-like symbol X"; it now names the sites
  (`Main::R rung 0, Main::R rung 1`). `DUPLICATE_OUTPUT` and `LATCH_WITHOUT_RESET` now list the rung numbers they
  already held, and the latch finding keeps the tag's own casing (`latches Latch`, not `latches latch`). Each one is
  data the record already carried; only the sentence was withholding it.

- **An instruction the catalogue cannot model no longer claims to take no operands.** `EOT`, `SFR` and `SFP` came from
  the compact table's empty slot lists, so `compose_rung` answered `SFP takes 0 operand(s); 2 were supplied` and then
  told the reader to call `list_instructions` — which would repeat the same wrong answer. That is worse than absence: a
  confident false arity with no way forward. Those three now carry `notModelled`, `compose_rung` refuses them with
  `INSTRUCTION_NOT_MODELLED`, and `list_instructions` reports `operands_modelled: false` with a note rather than an
  empty slot list.
- **Every "unknown instruction" refusal now names the path that does not need the catalogue.** About a hundred of the
  vendor's instructions are not modelled here, so a valid name was previously a dead end. The refusal now says to write
  the rung text with `draft_rung` and run `draft_validate` — verified to accept an uncatalogued mnemonic, since the text
  path validates syntax and tags while Studio remains the arity gate.

- **`run_checks` now says which logic it could not check.** A rung naming an instruction the catalogue does not carry went
  unexamined and unreported, so "no findings" read as "everything was verified". The new
  `UNCATALOGUED_INSTRUCTION` finding is `info` and aggregated: *"1 instruction(s) in this export are not in the catalogue,
  so their operands were not checked: CROUT (1 rung)"*, with the catalogue size and the note that an uncatalogued name
  may still be valid and Studio remains the arity gate. An AOI the export declares is excluded — the committed fixture
  calls `Motor_Control` and stays silent.

- **The skill no longer tells a reader to avoid the text path.** `packages/l5x/SKILL.md` said *"Write ladder through the
  composer, not by inventing NeutralText"* — advice that the unmodelled-operand change made wrong, because for an
  instruction the catalogue does not model the text path is the only way. It now reads *"Compose through `compose_rung`;
  for an instruction it does not model, use `draft_rung` text."* The body still fits its 8000-character budget (7975
  after the edit, rebalanced by shortening the `list_instructions` bullet).
- **The coverage finding reaches the draft path.** A staged rung naming an uncatalogued instruction reports
  `UNCATALOGUED_INSTRUCTION` in `draft_validate`'s `new_findings`, so the reader learns which part of their own edit
  went unexamined before it is written.

- **Two control-transfer failures are reported: a `JSR` to a routine its own program does not declare, and a `JMP`
  with no `LBL` of that name in its routine.** Neither could build, and neither was reported — a project that jumps
  nowhere read clean. The targets are written in the rung, so no vendor table is needed: `UNRESOLVED_ROUTINE` names the
  routine and where a same-named routine does live (*"P1::R jumps to Ghost … a routine of that name exists in P2, and a
  JSR can only call a routine in its own program"*), and `LABEL_NOT_FOUND` names the label and rung. A `JSR` to a routine
  in its own program and a `JMP` with a matching `LBL` stay silent, which the tests assert.

- **Three named bindings that point at nothing are now reported.** A program that names a main routine it does not
  declare (`MAIN_ROUTINE_MISSING`), a task that schedules a program the export does not declare
  (`SCHEDULED_PROGRAM_MISSING`) and two routines in one program whose names differ only in case
  (`DUPLICATE_ROUTINE_NAME`, reported under the spelling declared first) all previously passed `run_checks` clean,
  though none of them builds. Each name is written in the export, so these need no vendor table.

- **The SDK verify path checks the file before the SDK, and a missing export is no longer a plugin defect.**
  `verify_offline_l5x` probed the Studio installation first and then read the export from disk, so a file that was moved,
  deleted or (in a harness) never written surfaced as `INTERNAL: ENOENT: no such file or directory`. The local
  preconditions now run first — the export must still be on disk and still match the hash taken at `open_project` — and
  a missing file answers `FILE_NOT_FOUND` with the reopen it needs. That also makes the refusal deterministic: it no
  longer depends on a Studio installation being present.
- **`verify_offline_l5x` documents the gate that fires first.** Its description said only "Build needs project revision
  37+", while the SDK actually refuses when the export's revision has no matching installed Logix Designer — observed
  here as `STUDIO_VERSION_UNAVAILABLE: Studio 5000 v33 is not installed; … Installed versions: 36, 37`. The description
  now states that gate, then the 37+ build requirement, then `probe=true`.

- **A failed offline build that reports nothing no longer gives advice that cannot be followed.** The real Studio engine was
  driven end to end for the first time here (183 seconds, bridge built, project opened) and it stopped at `open_source`
  with `sdk_error: null`, `diagnostics: []` and a single log line — while `next_step` still said *"Read diagnostics,
  correct the L5X"*. The next step is now the pure `verifyNextStep`, and a silent failure says so, names the two gates
  (a Logix Designer release installed for the export revision, and project revision 37 or later for a build) and points
  at `log` as the evidence instead of an empty list.

- **A run stopped at its time budget is reported as a timeout, not as a project that failed to open.** Driving the real
  Studio engine end to end showed the shape of the bug: the bridge was killed by its own 180-second timeout (observed
  elapsed 183,546 ms), a killed child closes with `code: null` and no message, and the stage fell through to
  `open_source` with `sdk_error: null` and no diagnostics — so a hang looked like an export Studio refused to open. The
  child is now remembered as having been killed, the stage is `timeout`, the result carries `timeout_ms`, and the advice
  says the run was stopped, that nothing was learned about the export, and to retry once the engine is warm or build it
  in Studio 5000. The verify budget is 300 seconds because a cold first open starts the engine and took 183 seconds
  here; re-running against the real engine at 300 seconds confirmed the diagnosis (elapsed 301,936 ms, staged
  `timeout`), which also shows that a structurally minimal L5X does not open — the import waits indefinitely.

- **A timed-out verification says how far it got.** The result now carries `reached` (the last line the bridge printed),
  `export_revision` and `probe_build`, and the timeout advice quotes it: *"The run was stopped at its time budget… It
  stopped after: Open project started."* That came from driving the real engine twice: a v36 export, opened under
  `probe`, printed one progress line and then blocked past both a 180-second and a 300-second budget, so a reader can
  now see that the engine never left the open step rather than guessing which part of their logic is wrong.

- **A real 60-routine v37 GuardLogix project cut `run_checks` from 537 findings to 271, and two of those classes were our
  bugs.** Module-defined tags are now resolved from the module that declares them, so `BottomKnife_MP2600iec:I.Data[0].3`
  no longer reads as an unknown symbol (236 findings to 0). Radix literals no longer yield symbols, so `MOVE(16#F000,
  Wrk_Mask)` stops inventing a tag named `F000` (the last 15). `DUPLICATE_OUTPUT` keys on the whole address rather than
  the text before the first dot, so two bits of one I/O word are no longer one output driven twice (31 findings to 1,
  and the survivor is a genuine double write). Safety-locked is now read by value: a standard GuardLogix export carries
  `<SafetyInfo SafetyLocked="false">`, which presence-testing would have refused as a locked controller.
- **The safety refusal is confirmed against real hardware.** The supplied project declares `SafetyProgram1` with
  `Class="Safety"`, a safety Task and safety network ports, so `verify_offline_l5x` refuses it by design — the offline
  import aborts on safety controllers. Its 7 uncatalogued "instructions" (`MAM_YASKAWA`, `MCFG_YASKAWA`, …) are Yaskawa
  add-on-profile instructions rather than AOIs, so reporting them as unmodelled is correct.

- **The analysis tools now name the scope that declares a symbol.** On the supplied project, `trace_dependencies` resolved a
  tag that `usage_map` then called "not declared in scope"; and a program-scoped symbol read in controller scope was
  reported as *"Declaration is absent from the export"* — a statement about the export that was false. Both refusals now
  say where the declaration lives and which `scope` to pass (*"Tag "Prg_CutSpeedUp_Cmd" is not declared in scope
  "MainTask_10ms"; it is declared in controller."*), backed by a new `declaringScopes` helper that answers controller,
  program and AOI scopes.

### Fixed

- **Every renamed instruction resolves in both spellings.** The alias table covered 8 of the 16 pairs, so a
  composed rung naming `SQRT`, `EXPT`, `MOVE`, `LIMIT`, `ACOS`, `ASIN`, `ATAN`, `TO_BCD`, `BCD_TO` or `TRN` was
  refused as an unknown instruction even though the catalog declares its pair.
- **The right-rail guard sees the modern comparison spellings.** A rung ending in `EQ(`, `NE(`, `GT(`, `GE(`,
  `LT(` or `LE(` leaves the right power rail undriven exactly as `EQU(` does, and is now refused the same way.
- **The catalogue no longer declares three instructions twice.** `SQR`, `BSL` and `BSR` appeared in both
  `instructions.ts` and `instruction-set.ts`, so the catalogue was 121 entries for 118 names. One home per
  mnemonic: 118 entries, 118 names.

326 package tests and 70 bundle tests pass.

## [0.73.0] - 2026-10-31

### Added

- **A tag row drills into what is under it.** The tag organizer now expands an array into its elements, a
  user-defined type into its members, and an add-on instruction instance into its own parameters — typed,
  indented, searchable, and each child carrying the value the export recorded for it. The add-on instruction
  node in the controller organizer opens onto its parameter list the same way, so a block's pins can be traced
  back to the definition they come from. Covered by `e2e:actions`, which expands a `DINT[5]` and an
  `AOI_Alarm` instance in the real browser and reads the rows that appear.
- **The whole instruction set renders, not just the ones an export happens to use.** The catalogue the composer
  validates against (`packages/l5x/src/engine/instructions.ts`) grew from 42 instructions to **121 entries / 118
  distinct names** — math, file and array, sequencer, ASCII, string, process, alarm, motion, program control and the
  migrated PLC-5/SLC set — and the ladder now derives its pin labels from that one catalogue, so an instruction that
  exists cannot be drawn without a label. `npm run e2e:instructions` builds an export with **one rung per catalogued
  instruction** and renders it in the real browser: `121/121 instructions rendered, 132 blocks, clipped 0, generic
  labels 0`. `test/instruction-coverage.spec.mjs` holds the same invariant in the fast suite, where the failure mode
  (a block silently reading `Operand 1`) is one missing map entry away.
- **Contacts look like contacts, and every block names its pins.** XIC is drawn as two short bars on the wire and XIO
  adds the slash; a coil is two facing arcs with the latch letter between them — the shapes Studio 5000 draws, not
  boxes. Blocks label their operands from a catalogue of the instructions a Logix export carries
  (`packages/viewer/src/client/instructions.ts`), and an **add-on instruction call labels its pins from its own
  definition** in the export, so `AOI_EncoderLinear` reads `RawCounts`, `PPR`, `RollerDiameterIn`, `GearRatio` rather
  than `Operand 1`..`Operand 7`. Measured over the 57 exports in `_e2e/out`: **68 distinct mnemonics, 68 labelled**
  (was 42), and 200 AOI calls now label themselves; `e2e:ladder` grew a `Frequency_Calc` case that fails if every
  block falls back to `Operand N`.
- **The ladder face has an end-to-end suite.** `npm run e2e:ladder` mounts the built
  `packages/viewer/lib/client.js` in a real headless Chrome, opens a routine the way a reader clicks it in the
  organizer, and asserts on the rendered DOM: no clipped text anywhere in the pane, one tag label per instruction, no
  label escaping its cell, no two labels overlapping, and every value the export records actually on screen. Ten cases
  cover three exports and two controller families (`_e2e/out/CT9-Source.L5X`, `CT10-Source.L5X`, `Century-fixed.L5X`)
  at 1680x1200 and 1280x900, including a 95-instruction rung list. `test/render/e2e.mjs` renders one routine,
  `diag.mjs` dumps the measurement and `probe.mjs` one instruction's computed style.
- **Every routine of an export is judged, not just the sampled ones.** `npm run e2e:routines` opens every routine the
  organizer lists — 256 routines across the CT9, CT10, CT8, Slitter and PLC-5-migrated fixtures plus the Century SLC
  migration — in one browser and applies the same assertions to each, so a ladder shape that only occurs in an
  unscheduled program or a migrated routine cannot slip through.
- **A rung answers for itself.** Right-clicking a rung opens its own menu - ask Arya about that rung, watch every
  tag it touches in one action, show or hide its NeutralText, copy its source, or ask Arya for a new rung comment -
  instead of the operand menu with the rung text pasted into it. The prompt names the program, routine and rung, so
  the answer is about the rung a reader pointed at.
- **A routine row answers for itself too.** Right-clicking a routine in the organizer names the routine in the menu
  and in its prompt, and can open it, instead of asking Arya about the two words "Program/Routine". A program row and
  a module row do the same for their program and their I/O module, so every row of the organizer has its own menu.
- **The pane is driven, not only read.** `npm run e2e:actions` clicks and types with a real browser: a click focuses an
  instruction, arrow keys walk the rung, a rung number selects its rung, the source view shows the exported
  NeutralText, the organizer filter narrows the tree, the tag table opens and sends a tag to the offline watch pane, the
  bottom panes switch, and the console stays silent throughout.
- **An instruction comment cannot overprint its neighbour.** The comment column and the instruction cell now agree on
  one width (`COMMENT_WIDTH`), and the rendered comments are measured for overlap as part of the gate.

### Changed

- **The ladder pane draws like Studio 5000.** Each rung reserves the band its longest instruction comment needs, so
  every glyph in a rung sits on one wire; contact and coil glyphs are green boxes with the tag name beneath; function
  blocks carry a header band and Studio's `label | operand | value` rows with a `◀` value marker; the parallel output
  branch sits on the right rail; values are right-aligned; the wire, rung comment and rung number follow Studio's
  layout. Nothing is ellipsized: long tags wrap instead of truncating, which is what made the old pane show
  `BottomKnife_MP…` and a number that read as part of the tag name.
- **Timer pins are named and filled from the export.** `TON`/`TOF`/`RTO` render `Timer`, `Preset` and `Accum` (with
  `EN`/`TT`/`DN` badges) and read the recorded `PRE`/`ACC`, so the `TON(…,?,?)` an export stores no longer reaches the
  screen as two rows labelled `2` and `3`. Migrated instructions gained the same treatment: `FLL`/`FIL`, `OSR`/`OSF`,
  `CTU`/`CTD`, `CLR` and `MSG` name their pins in English and Chinese.
- **Both client faces build from this repository.** `scripts/build-viewer-face.mjs` and
  `scripts/build-ftview-face.mjs` run before `scripts/build-client.mjs`, so the committed
  `packages/*/lib/client.js` artifacts are output of `npm run build:client` (and `prepack`) rather than
  files nothing here could reproduce. The CSS-module and workspace-path transforms the AryaCode workspace
  used to supply are now in the face build, with the workspace address helpers vendored at
  `packages/viewer/src/client/vendor/workspace-path.ts`.

### Fixed

- **The organizer no longer keys sibling modules by name alone,** which emitted a duplicate-key warning twelve times
  on an export that lists the same module under `A1`/`A2` Ethernet; the key now includes the module's seat in the tree.
- **Three dead rules left the ladder stylesheet,** and a new spec (`test/viewer-face-css.spec.mjs`) keeps the
  stylesheet and the renderer in step: a class the renderer never reads fails the build's tests, and so does a
  `css.<name>` the stylesheet does not define — both used to be invisible, one as dead intent and the other as an
  unstyled element with no error anywhere.

## [0.72.1] - 2026-10-31

### Changed

- **A build error gets three probes, not a session.** The `legacy-to-logix-migration` skill and the row's reference
  now say it plainly: one hypothesis per offline build, and when the third does not move the error, the finding is
  written down — what the error survived, the routine and rung the bisect narrowed it to, the operands still suspect —
  and handed on. A narrowed finding beats a fourth guess, and Studio 5000's own Errors tab names the rung the SDK
  message withholds. The rule came out of CENTURY CABINETS, where the arity error survived an OSR repair, ASCII
  stubbing, a dropped `JSR` operand and two operand swaps before the bisect left one rung.

## [0.72.0] - 2026-10-31

### Added

- **The migration row carries its own answers.** `packages/migration/src/knowledge/instructions.ts` maps 58 legacy
  mnemonics to their Logix candidate, operand shape, work class and a citation (1747-RM001, 1785-6.1, 1756-RM003, or
  `observed` plus the export that showed it). `migration_assess` names the replacement beside each
  `LEGACY_INSTRUCTION` it reports and `migration_resolve` appends the row to every review site's advice, so a marker
  arrives with its answer rather than a research task. Seven new corpus pages in a `migration` domain
  (`packages/resources/corpus/migration/`) cover the arrival points, the PCE codes, the wizard and its revision
  ceiling, placeholder tags, unknown operands, indirect addressing and the instruction map; the corpus is 41 pages.
  `docs/reference/migration.md` documents the layer under "What it knows without research".
- **One manifest describes every component.** `components.json` is now the single statement of what a component is:
  its kind (`product`, `support`, `surface`), its capability class (`offline-file`, `live-ide`, `gateway-api`), its patch
  row, bundle entry, package, tool product, skill and body budget, capability probe, evidence gate and owning documents.
  `test/components.spec.mjs` fails when the manifest and `cordis.patch.yml` disagree, when a tool count or README number
  is stale, when a skill cites a tool that no longer exists, or when a component loses one of its files.
- **`docs/reference/components.md` states the contract** — what a component is, what each capability class means for
  verification, the manifest fields, the ten-step checklist for adding one, and what the checks enforce.
- **The README tool counts are corrected** to the registered surfaces (133 tools: 51 L5X, 47 FactoryTalk View, 24
  MotionWorks IEC, 9 Optix, 2 engineering resources), with a known-gap line for the 9 vendored Optix tools that the
  generated reference cannot build from source here.

- **A migration support row.** `migration_assess` reads an RSLogix 500 `.SLC` export or the `.L5K` the migration
  wizard writes and states the controller, tags, routines, rungs and what a migration still has to change;
  `l5k_lint` reports every import blocker with its line number (`TRAILING_COMMA`, `DUPLICATE_TAG`,
  `ROUTINE_UNBALANCED`, `INDIRECT_ADDRESS`, `PLACEHOLDER_TAG`, and a revision gate note). The row also carries
  the `legacy-to-logix-migration` skill: interview the engineer for target, I/O strategy, HMI scope and validation
  window, never edit the source `.RSS`, and never call a file migrated while a finding is open. Read-only in every
  path: no controller, and the one vendor start (`slc_read`) opens hidden and never saves.
- **`slc_read` reads an RSLogix 500 project headlessly.** It starts the 32-bit Windows PowerShell, opens the
  `.RSS`/`.ACH` hidden through `RSLogix500.Application`, walks `ProgramFiles` and asks each ladder file for its
  rung text, then quits without saving: no window appears and no click is needed. On the Slitter 8 project it
  returns 76 program files (69 ladder), 1,495 rungs and rung text in about four seconds. It needs RSLogix 500 on
  the host and refuses a path that is not a file; without the vendor product, Save As `.SLC` and read that export.
- **`slc_read` reads a PLC-5 `.RSP` too.** RSLogix 5 exposes the same automation surface, so the reader picks
  `RSLogix5.Application` for an `.RSP` and leaves the rest of the walk unchanged: on the staged EN-032 program it
  returns 53 program files (38 ladder), 358 rungs, 2,206 symbol records and 141 data files, hidden and unsaved.
- **`migration_compare` scores the converted project against the legacy one.** It matches ladder file names to
  routines, counts rungs with the terminal `END` left out, maps symbol records and data files to tags, and
  classifies each difference as expected, real or cosmetic. On Slitter 8 it reports 64 matched files, 1,398 of
  1,426 legacy rungs, two real differences and 259 indirect expressions still to engineer, which is the
  exception list the plan records.
- **`migration_plan` keeps the migration resumable.** `create`, `read`, `answer`, `stage` and `exception` act on
  `.migration/plan.json` (schema 1): five interview decisions, eight stages with evidence, and exceptions marked
  `open`, `accepted` or `fixed`. A plan blocks until every decision is answered and `next_action` names what to do.
- **`migration_resolve` answers the conversion's own markers.** The wizard writes `PCE(code,label)` where it could
  not translate an instruction and `?` where it could not type an operand; this tool pairs each site with the
  legacy rung it came from and returns a worklist entry instead of a count. A marker on a rung that already carries
  the legacy instructions in order is a delete; a timer or counter `?` whose preset and accumulator the legacy
  operand list still names is filled from that list, and a rung whose every unknown is answerable carries the whole
  replacement text. `MSG` parameters, a status-word loop index, a status word alone on a rung and expressions the
  wizard flattened stay review, each with the reason. On EN049 it classified 214 sites, 201 of them answerable from
  the rung texts alone; applying those took 177 markers to 22 and 54 rungs with `?` to 9, and the file imported
  into Studio 5000 with no warnings and no errors.
- **`migration_report` writes the document a customer signs.** It pairs the legacy project, the wizard's `.L5X` and
  the corrected `.L5X`, then writes one file: the two programs side by side, the marker census by code with the
  legacy instruction behind each site, the corrections rung by rung with only the text around each change, the
  comparison in full, and the open items that are decisions rather than defects (a placeholder tag standing in for a
  module with no Logix equivalent, a legacy I/O image left as a plain tag array, an array indexed by a tag, sites
  still unanswered, a revision below 37). Name the output `.docx` for a formatted Word document and the row writes
  the OOXML package itself — A4, navy headings, banded tables with a repeating header row, page numbers in the
  footer, no dependency and no vendor application — or `.md` for the same content as plain text. On the Slitter 10
  program it reads 15 markers before and 0 after, 55 rungs corrected and 3 open items, and it writes only the
  report.

### Changed

- **Skill budgets live in the manifest.** The 8000-character assertion moved from the three package skill tests to
  `test/components.spec.mjs`, which reads each budget from `components.json`; the package tests keep registration,
  identity and frontmatter checks only. One fact, one home — changing a budget is now a manifest edit, not three.
- **The migration reference states what the wizard actually asks.** `docs/reference/migration.md` now names the two
  wizard questions (target controller and firmware; keep-existing-I/O versus update-all-I/O, with the placeholder
  tags the second path avoids), the revision 30–32 ceiling that leaves wizard output import-verified until someone
  retargets it in Studio 5000 revision 37 or later, and the typeless-data-file rule that keeps an unlabelled PLC-5
  data file out of the unmapped list. The compare evidence for the EN049 PLC-5 program is recorded there: 34 matched
  files, 306 of 320 legacy rungs, 90 data files accounted for, 1 real difference (131 indirect expressions) and
  2 expected ones.
- **`migration_compare` says RSLogix 5 where it always meant it.** The tool read `.RSP` already, but its description
  and its unsupported-format refusal named `.RSS`/`.ACH` only; both now name RSLogix 5 and `.RSP`, and the generated
  tool reference is regenerated.
- **A placeholder tag is the right answer, not a failure.** The migration reference now says so: a module with no Logix
  equivalent (a 1747-SDN DeviceNet scanner is the worked example) becomes a placeholder tag by design, the lint rule
  reports it as `PLACEHOLDER_TAG`, and choosing the replacement belongs to the engineer. The same pass states the
  revision ceiling as what it is — the installed wizard cannot emit 37 or newer, so retargeting the imported project
  in Studio 5000 is the first step before any build verdict is quoted, not an alternative workflow.
- **The migration reference records the SLC 500 side.** The resolution section gained the RSLogix 500 evidence, because
  a SLC 500 conversion numbers its markers differently (105, 109, 110, 114, 134, 135, 160 on
  `SLITTER10_PLC1S0_08JUL2026_0953.RSS`) and yet every one of its 65 sites was answerable from the legacy rungs:
  11 rung rewrites and 44 operand repairs, no markers and no unknown operands left, and a file that imports with
  0 warnings and 0 errors.

## [0.71.0] - 2026-10-30

### Added

- **`ftview_document`** writes a handover bundle for an opened export — `overview.md`, `displays.csv`,
  `tags.csv` and `bindings.csv` — stating object counts per display, which tags each display reads, and
  which bindings name a tag the export does not declare, so a panel builder can review without Studio.
- **`ftview_document` lists screen jumps and admits an absent tag table.** `overview.md` gains a
  navigation table (screen, object, target) built from the export, and an export without a tag CSV now says
  so instead of reporting "0 HMI tag(s)" as if the application had none.
- **`ftview_document` explains every binding status.** `overview.md` documents what
  `hmi tag`, `missing`, `unverified` and `literal` mean in `bindings.csv`, so a reviewer can tell "the export
  had no tag table" from "the export names a tag that does not exist".

### Changed

- **`ftview_check` reports one duplicate-name finding per display and object name, with the count.** A display
  with sixteen objects called `Value` produced sixteen nearly identical warnings, so the number of duplicated
  names could not be read from the result. Each collision is now one `DUPLICATE_OBJECT_NAME` warning naming the
  count and carrying `count` in its evidence. On the CarpenterPilot export the 77 duplicate rows become 9
  findings.
- **`l5x_rung_preview` leads with the paste-ready text, not the picture.** The tool exists to hand back logic
  that goes into a ladder routine, but it drew a diagram by default and reported the image first, so the answer
  looked like a screenshot instead of something to paste. It now returns `paste_text` — the validated rungs, one
  per line — and draws a diagram only when `diagram: "yes"` is passed. The preview L5X document is still written
  for the sidebar viewer.
- **An inserted rung takes the number it names.** `draft_rung` with `mode: "insert"` refused any rung number the
  routine already used, so a rung could only be appended, never put above an existing one. An insert now places
  the new rung at the position it is given — 0 through the current rung count — and renumbers the rungs below it;
  a delete closes the gap the same way, so the routine stays numbered 0..n-1. `before_rung` is accepted only when
  it equals `rung`. Proven on the CarpenterThickness ACD: a rung inserted at position 0 built through the Studio
  SDK with the existing rung renumbered to 1.

### Fixed

- **An export creates the folder it writes into.** `export_acd_to_l5x`, `verify_offline_l5x`, `build_acd_from_draft` and the snapshot tools refused an output path whose folder did not exist (`Output directory does not exist`, with the unhelpful advice to call `project_overview`). The caller has already named the file it wants, so the folder is now created instead of refused; the error remains only when it cannot be created.
- **A module-defined tag is not called unused.** `run_checks` reported module I/O tags such as `Local:1:C` and `TopCutter_MP2600iec:I` as `UNUSED_TAG`, but the module wires them and indexed logic never names them: on the CarpenterThickness export that was 40 of 104 unused-tag rows. Tags whose name ends in a module member suffix (`:I`, `:O`, `:C`, `:S`, `:R`) are now left out, and the finding count there falls from 271 to 230.
- **A vendor COM failure is reported as a sentence, not as CLIXML.** When the ME export server refused
  `LoadMEApp` the tool returned the raw PowerShell serialisation (`#< CLIXML ... 0x80040301 ...`), which buries
  the one line a caller needs. `ftview_apps`, `ftview_export` and `ftview_backup` now decode the error strings
  and pass them on as one capped line, release their COM object before the process ends, and retry one export
  once when the engine reports `0x80040301` — the failure a previous export call leaves behind.
- **Controller system flags are not called unresolved.** `S:` and `R:` addresses are defined by the controller and
  absent from an export, so the review's unresolved-reference pass still reported them: a valid rung using
  `S:FS` produced `UNRESOLVED_REFERENCE` and `draft_validate` warned `Symbol MainProgram::S:FS could not be
  resolved in this export`. The pass now leaves the system flags alone and still reports a genuinely undeclared
  tag.
- **A rung whose right power rail is not driven is refused before it is staged.** Studio rejects a rung that
  ends in a read-only instruction with `RxCMP_E_AUDIT_OUTPUTS`, and that only surfaced at build time: a rung
  such as `XIC(hmi_AutoManual_Cmd)AFI();` passed `draft_rung`, `draft_validate` and `draft_apply`, then failed
  the Studio build. `draft_rung`, the change-set path and `compose_rung` now check the parsed rung's last node —
  and every path of a closing branch — and refuse `XIC`, `XIO`, `ONS`, `AFI` and the compare instructions at the
  rail with the fix that names an output instruction.
- **The ME alarm setup file is no longer reported as an unparsed display.** `Alarms/Alarms.xml` has an
  `<alarms>` root, so `ftview_open` listed `Root element alarms is not an ME display.` as a structural diagnostic
  even though `ftview_check` reads the same file for its alarm findings. The scan records it as an alarm setup file
  instead: `ftview_open` returns it in `alarm_files` and says how many there are, and `UNPARSED_FILE` names only
  files that really failed to parse. The alarm findings are unchanged — the CarpenterPilot export still reports
  its 145 alarm findings, and `ftview_check` there now returns 154 findings instead of 223.
- **A Studio import manifest is no longer reported as an unparsed display.** `ftview_apply` writes
  `Displays/BatchImport_<application>.xml` so Studio's Graphics Import Export Wizard can import the displays it
  changed; reopening that folder reported `Root element gfxImport is not an ME display.` The scan now records the
  file as an import manifest: `ftview_open` and `ftview_reload` return it in `manifest_files`, the display count
  is unaffected, and `UNPARSED_FILE` names only files that really failed to parse.
- **`ftview_check` says which checks could not run.** `coverage` carried only `schema` and `plc_binding`, so an
  export with no HMI tag CSV returned no `TAG_NOT_BOUND` and no alarm tag findings, with nothing to distinguish
  that from bindings that all resolve. It now carries `tag_binding` (`not run: this export has no HMI tag CSV`,
  or the number of tag rows checked) and `alarms` (the setup file it reviewed, or that the export has none), and
  the summary states that display bindings and alarm tags were not checked. The description also claimed the
  alarm setup is read only when `alarms` is supplied, while it has long been read from the export automatically.
- **A tool answer never carries an empty member, so the host can carry it.** Every answer crosses the host as
  lossless JSON, which refuses a document holding `undefined`; one empty optional field failed the whole call.
  `compose_rung` with an explicit `spec_json` tree returned `pattern: undefined` and was rejected as
  `value is not lossless JSON`, so the structure path failed while pattern composition worked. `ftview_list`
  failed the same way whenever the caller omitted `view_id`, because its suggested `ftview_get` call carried an
  empty handle. The success envelope now drops empty members (and turns array holes into `null`) once, for both
  packages; `ftview_list`, `ftview_cross_reference` and `ftview_live_map` also name the view they actually used
  in the calls they suggest.
- **A rung comment is no longer covered by a stacked branch.** The diagram centred the row on the
  comment's band, so a branch's first stacked path was drawn over the comment text. The row now
  descends by the branch's height before drawing, which keeps the comment in its own band and grows
  the canvas to match. Rungs without a branch are unchanged.

## [0.70.0] - 2026-10-29

- **A data file with no type letter is not called unmapped.** The comparator only claims files whose prefix could exist; PLC-5 I/O-structure files carry no letter and used to appear as ?0.
### Changed

- **`ftview_validate` now says when apply will refuse the draft.** A vendor-schema error used to appear only as
  a count in the summary, and the suggested next step was still `ftview_apply`, which then failed with
  `SCHEMA_INVALID`. The result now carries `schema_errors` and `apply_blocked`, the summary reads
  "schema FAILED with N error(s), so ftview_apply will refuse this draft", and the next step points back at
  validation instead of at apply. A clean draft still says "schema ran with no error".
- **Integration coverage for the scaffold and popup paths.** `test/workflow.spec.ts` now also scaffolds an
  existing display and stages (then applies) a popup, so the three authoring entry points that write vendor XML
  — screen, scaffold, popup — are each proven against the installed `Gfx-ME17.xsd`, not only against layout unit
  tests. Both pass unchanged; the only failure was the test fixture, which used a `<caption>` child on `<text>`
  where the vendor schema requires the attribute.
- **Fixed: authored screens and popups were rejected by schema validation.** `ftview_draft_screen` wrote
  `borderStyle="solid"` on panels and navigation buttons (not in `borderStyleEnums`),
  `horizontalAlignment`/`verticalAlignment` on numeric displays (not declared), and `foreColor` on a
  `gotoButton` (caption colour lives on its `<caption>` child). `ftview_apply` correctly refused all of it, so
  every screen from that tool failed at apply. Panels and navigation now use `line`, the numeric display keeps
  the attributes the vendor declares, and navigation buttons carry a light face so the default text stays
  readable.
- **New: `test/workflow.spec.ts` runs the steps a model actually takes** — create a display, author a screen,
  validate, apply, reopen what was written, run `ftview_check` — in one test. It found the three schema defects
  above, which the layout unit tests could not see because they never validate against the vendor XSD.
- **Test harness: files a tool writes are readable again** (`textOf`, separator normalisation, directory
  listing over both maps), so a test can reopen its own output the way the real filesystem allows.
- **A full-screen display whose canvas differs from the rest is named.** `ftview_design_check` adds
  `VIEW-LAYOUT-02` (info) for a `replace` display whose pixel size is not the common one, with the common
  size and how many displays share it; popups (`onTop`) are excluded because they are sized on purpose.
  Measured on the Carpenter pilot export: 14 displays, 0 findings — all full screens are 640x480 — where the
  first cut of the rule had reported the three popups as mismatches.
- **A draft says when a connection names an unknown tag.** Every authoring tool (object add and set, screen,
  popup, restyle) now compares the connection roots it stages against the export tag database and reports
  `unresolved_tags` in the result, with a sentence naming them. A member such as `Motor.Speed` resolves
  against its root, so only genuinely undeclared tags are named. The draft still stages — the point is to
  learn it now rather than after `ftview_apply` and `ftview_check`.
- **`ftview_check` reads the alarm setup without being asked.** An `Alarms.xml` shipped inside the export
  (`Alarms/Alarms.xml`, the layout the wizard writes) is now read automatically, so one call covers the
  display checks and the alarm review: silent triggers, placeholder labels, duplicate expressions, orphaned
  messages, blank text, and alarm tags the export tag CSV does not declare. Passing `alarms` still overrides
  the search; an explicit path is used exactly as given.
- **`ftview_alarm_report` resolves trigger tags against the HMI database.** Pass `tags` (the application
  tag CSV) and every trigger is checked: a trigger watching a tag the database does not define is reported as
  `ALARM_TAG_NOT_IN_HMI` with the tag name. On the commissioning export it found two such tags
  (`Alarm_Word`, `Alarm_Word2`) that the file alone could not reveal.
- **`l5x_routine_diagram` pages like `l5x_diagram` does.** It accepted no offset, so a long routine
  truncated at `max_rungs` with no way to see the rest. It now takes `start_rung` and `max_rungs`, returns
  `start_rung` and `next_start`, and its summary names the rung range drawn and the offset for the next page.
- **The review sheet states what it is.** A sheet titled its drawings but carried no totals, so someone
  looking only at the PNG could not tell how many displays it covered, how many problems were marked, or
  whether it came from the export or a staged draft. `composeSheet` takes a footer line and
  `ftview_render` fills it with those three facts.
- **A render marks the objects it complains about.** `problems` named overflowing objects in the result,
  but the image itself showed nothing, so a reviewer had to cross-reference names by hand. Each problem
  object now carries a dashed red outline in both a single render and the review sheet, and the render
  coverage says the outline marks the declared box rather than proving runtime appearance.
- **The renderer contract no longer claims images are placeholders.** Artwork has been inlined since
  0.27.0 when `Images/<file>` is present, and tests cover it, but the module header, the reference text
  and the `ftview_render` description still said images were drawn as placeholders. A model reading the
  description could reasonably skip rendering a screen on the assumption its artwork would not appear.
### Added
- **Verification never guesses.** When the vendor export cannot run, `ftview_verify_import`
  fails with `NO_IMPORT_PROOF` and asks for a folder exported after the import, instead of
  reporting a comparison it did not make; a successful run names what it compared against.


- **`ftview_alarm_report` reviews an alarm configuration.** `ftview_alarm_snapshot` produced the wizard
  XML but nothing read it, so a configuration with 17 triggers that raise no message looked exactly like a
  finished one. The report joins every message to its trigger and returns findings: a trigger with no
  message, a wizard placeholder label ("Label7"), two triggers on one expression, an orphaned message,
  blank message text. On the commissioning export it reads 64 triggers, 47 messages and 17 silent triggers.
- **`ftview_render` can put a set of screens on one review sheet.** `sheet: "yes"` stacks up to eight
  drawings on a single image with a title per display, so a reviewer (or the model) judges a set in one
  look instead of opening a dozen PNGs. The sheet is a plain SVG that embeds each drawing and is
  rasterised by the same headless browser, so it needs no extra tooling.
- **`ftview_verify_import` accepts an export you made by hand.** Verification used to depend on the
  vendor export engine, so when that export failed (closed Studio, safety project, COM trouble) the
  proof that an import landed was simply unavailable. `export_root` points the same object-level
  comparison and drift report at a folder exported from Studio by hand after the import; the vendor
  path stays the default and its failure message now says which argument avoids it.
- **`ftview_check` names artwork the export does not ship.** A display that names
  `Images/<file>` rendered an empty box with no warning anywhere in the workflow. The scan now records
  the file names under `Images/` (without reading their bytes) and reports `IMAGE_MISSING` per display
  and object, so a received export can be judged complete before anyone imports it.
- **`ftview_apply` copies artwork byte for byte.** The applied folder used to state that native
  binary files were not copied, so a display naming `Images/<name>.png` produced a folder whose
  artwork was missing (or text-mangled). The copy loop now writes binary export files through
  `writeBytes` at the same relative path, so a handed-over folder and a later import package both
  carry the images the displays name.
- **`ftview_compare` diffs tag rows, not just their names.** `tags.changed` lists each field that
  moved — device address, description, data source, native type, read-only — with both values, so a
  re-addressed tag between two application versions is visible instead of hiding behind a changed
  CSV hash.
- **`VIEW-NAV-02` catches a display an operator cannot leave.** `ftview_design_check` reports a
  display that something navigates to while it holds no `gotoButton` or `closeButton`; a popup like
  that strands the operator at the machine, and reachability alone never showed it.
- **`ftview_check` verifies the alarm display exists.** Given a decoded `Alarms.xml`, an alarm setup
  whose `display-name` is not a display in the export raises `ALARM_DISPLAY_MISSING`; the terminal
  otherwise opens nothing when an alarm is annunciated and the configuration looks correct from the
  screen side.
- **Alarm triggers that name a missing HMI tag are reported.** `ftview_cross_reference` scans decoded
  `Alarms.xml` expressions per trigger, adds `counts.alarmUnresolved`, and raises
  `ALARM_TAG_NOT_IN_HMI` with the trigger ids so a typo in Alarm Setup is found before a terminal
  annunciates nothing.
- **`ftview_export` opens what it exported.** The result carries `view_id`, so authoring starts
  immediately instead of a separate `ftview_open` round trip; when opening fails the result falls
  back to naming the folder and the export still succeeds.
- **A package can leave out the displays the application already matches.** `ftview_studio_import_prepare`
  takes `skip_unchanged: "yes"` with `current_export`, drops displays whose objects are already
  identical, names them in `skipped`, and refuses with `NO_CHANGES` when nothing is left to import.
  A full package over a mostly-unchanged application no longer asks a human to re-import screens
  that would not change.
- **Cross-reference counts alarm usage.** `ftview_cross_reference` reads the export alarm
  configuration and reports, per HMI tag, how many alarm triggers watch it (`rows[].alarms`), the
  trigger count, and `counts.alarmOnly` — the tags an alarm watches that no display shows. A tag
  used only by alarms used to look unused.
- **An import package reports the displays the application already matches.** `ftview_studio_import_prepare`
  compares each packaged display's objects with the `current_export` of the application and returns
  `comparison.unchanged`, `changed` and `added`. An import rewrites whatever it lists, so the
  identical screens are worth knowing before asking a human to run a batch that changes nothing.

## [0.69.0] - 2026-10-29

### Fixed

- **The import manifest types each display, not the whole batch.** `ftview_studio_import_prepare`
  takes `current_export` (an export of the application as it stands) and writes `create` for a
  display the application does not have yet and `update` for one it does, reporting the counts. The
  wizard fails the entire batch when one entry's type is wrong, which is how a package of new and
  changed screens failed in the field.
## [0.68.0] - 2026-10-29

### Added

- **`ftview_apply` takes `package: "delta" | "full"`.** A delta (default) lists only the displays
  the draft changed, which is what an application that already holds the screens needs. A full
  package lists every display in the export and copies the artwork those untouched displays name,
  so a fresh application can be built from one import instead of a delta that leaves screens and
  their pictures behind.
## [0.67.0] - 2026-10-29

### Fixed

- **`ftview_apply` copies the artwork a display names.** A display that sets `imageName` was
  broken after import because the wizard copies only the XML, so the folder it produced had no
  `Images/` files. Apply now finds each named image in the export (`png`, `jpg`, `jpeg`, `gif`,
  `bmp`), writes it beside the displays, and returns `images` and `missing_images` — a name the
  export does not carry is reported instead of failing silently. Filesystem providers gained an
  optional `writeBytes`, so binary files are copied byte-for-byte.
## [0.66.0] - 2026-10-29

### Added

- **`ftview_verify_import` compares staged objects, not just display files.** The round-trip check
  now also reports, per display, staged objects the import dropped and fields whose landed value
  differs from the value the draft set (geometry, face colours, caption). That is the difference
  between "the file was accepted" and "the change is on the screen".
## [0.65.0] - 2026-10-29

### Added

- **`ftview_draft_screen` accepts a palette.** `theme_json` overrides the scaffold slots used for
  that screen (backdrop, header, surface, footer, title and footer text), so a customer palette does
  not need a restyle pass afterwards; the result echoes the palette and reports the contrast of the
  two text-on-band pairs, flagging a title that would not be readable.

## [0.64.0] - 2026-10-29

### Added

- **`ftview_studio_preflight` carries an engineering gate.** Alongside parse state and name
  restrictions it now reports critical check findings and house-theme conformance for the edited
  export, and `gate: "fail"` refuses the change set instead of letting an off-theme or broken screen
  reach the manual import step. Findings and per-display theme rows ride along in the result.

### Fixed

- The bundle no longer lists the retired `@aryacode/dsh-engineering-ftview` package as a dependency.

## [0.63.0] - 2026-10-29

### Added

- **`ftview_theme_audit` measures house-theme conformance.** Every display is checked for the
  theme backdrop, a header band, a footer band and the share of its colours already in the palette,
  and each non-conforming display becomes one `VIEW-THEME-01` finding. Deciding which screens still
  need `ftview_draft_restyle` was a manual pass over dozens of displays.

## [0.62.0] - 2026-10-29

### Fixed

- **`ftview_validate` reports an edit aimed at an object that is not in the display.** `DRAFT_TARGET_MISSING`
  names the file, display and object, and the operation that cannot land, instead of failing the whole
  prepare step with `COMPONENT_NOT_FOUND`. The rest of the draft still validates, so one wrong name no
  longer hides the findings for the other operations. A set or delete on an object the same draft added
  is accepted, and an `object_add` can still be followed by edits to the object it placed.
## [0.61.0] - 2026-10-29

### Added

- **`ftview_draft_restyle` repaints an existing display in the house palette.** It walks a display the
  way a person would on a restyle job: backdrop and panel surfaces become the deep theme, text the
  bright colour, and field and button shells the accent, while geometry, objects and captions stay put.
  Reference objects are skipped because the global object owns their look, and indicators or drawings
  are skipped because their colours carry meaning. `theme_json` overrides any colour; the display
  backdrop is staged as a display setting, so `ftview_draft_display_set` remains the audit trail.
## [0.60.0] - 2026-10-29

### Added

- **`ftview_check` reports navigation into a display this export does not have.** A `gotoButton`
  (or any object with a `Display` connection) that names a missing display is `GOTO_TARGET_MISSING`,
  with the display, object and target. A typo there is invisible until an operator touches the button
  on the terminal.
## [0.59.0] - 2026-10-29

### Fixed

- **`TAG_NOT_BOUND` reads the expression the way Machine Edition writes it.** Braces are stripped and
  alias bindings (`{[PLC]Tag}`) are left alone, so a real export reports no false positives instead of
  one finding per `{` character.
## [0.58.0] - 2026-10-29

### Added

- **`ftview_check` reports a binding the tag CSV cannot satisfy.** Every connection on a named object
  is resolved to its root tag; when the CSV is present and does not declare that root, the finding is
  `TAG_NOT_BOUND` with the display, object, connection and expression. A misspelled tag used to look
  identical to a working one in a render and only fail on the PanelView.
## [0.57.0] - 2026-10-29

### Added

- **`ftview_draft_popup` builds a modal popup in one call.** Title, a message that survives a vendor
  import (line breaks are written as `&#xA;`), and one to three buttons that close the popup or open a
  display. A new popup is created as an `onTop` display with no title bar, the way Machine Edition
  confirmations behave, and an existing display of that name is reused.

### Fixed

- **Line breaks in captions are kept.** `escapeAttribute` writes `&#xA;` for a newline, so a multi-line
  message reaches Studio as two lines instead of being flattened onto one.
## [0.56.0] - 2026-10-29

### Fixed

- **`ftview_draft_display_set` edits display settings where Studio keeps them.** `width`, `height`,
  `backColor`, `displayType`, `positionX`, `positionY` and the other window attributes now go to
  the display's `<displaySettings>` element instead of the display root, which the schema rejects.
  A display that lost its settings element gets one inserted. Resizing a display or turning it into an
  `onTop` popup is now something a draft can do.

## [0.55.0] - 2026-10-29

### Added

- **`ftview_draft_screen` stages the screen's tags in the same draft.** The new `tags_json` argument
  takes the HMI tags the screen reads; they land beside the objects, so one apply writes the screen and
  its tag rows together instead of a separate `ftview_draft_tags` call.

### Changed

- **`l5x_diagram` gives wrapped rows their own height.** An operand that wrapped onto two lines used to
  keep the single-line row pitch, so the next row sat tight against it; the row now grows by the height
  of its tallest device.

## [0.54.0] - 2026-10-29

### Changed

- **Ladder diagrams wrap long operands instead of shortening them.** A label that does not fit on one
  line is broken at a separator near the middle and drawn on two lines, so
  `MOVE(BottomKnife_MP200Iec:O.Data[3],BottomKnife_MP200Iec:O.DegreePosition)` stays readable on the
  page. Applies to `l5x_diagram` and `l5x_rung_preview`.
- **`l5x_diagram` captions the page with the range it covers** — `5-16 of 799 rung(s)` — and names the
  `start_rung` that continues it, so a page image carries its own navigation instead of relying on the
  caller to remember the offset.

## [0.53.0] - 2026-10-29

### Added

- **`ftview_bulk_set` applies one change to every matching object.** Match on type, a name glob or
  existing attribute values, over every display or a named list; `dry_run` reports the selection
  without staging. The field sessions patched display XML by script for exactly this, so the change
  now goes through the validated draft path and one import.

### Fixed

- **`ftview_draft_object_set` no longer moves an object it was asked to relabel.** A caption-only
  change staged default geometry (`left/top 10`, `100x30`), silently repositioning the object; the
  defaults now apply only when the object is created.

## [0.52.0] - 2026-10-29

### Added

- **`l5x_diagram` pages a large project.** `routine` restricts the page to one routine and
  `start_rung` continues from where the last page stopped; the result carries `start_rung` and
  `next_start`, and the summary says which offset to page from next. A 799-rung commissioning project
  used to be truncated after `max_rungs` with no way to see the rest.

## [0.51.0] - 2026-10-29

### Added

- **`ftview_draft_ops` and `ftview_draft_drop`.** A staged change can now be listed with its index,
  kind and target, and dropped on its own. Before this, one wrong object move meant discarding every
  staged edit or hand-editing the display XML — the field session wrote 28 one-off PowerShell scripts
  that patched XML directly, partly because a draft could not be inspected or trimmed.

### Changed

- `ftview_draft_drop` refuses an index the draft does not hold and names the operation count, so a
  wrong index cannot silently remove the wrong step.

## [0.50.0] - 2026-10-29

### Added

- **`ftview_studio_import_prepare` says whether anyone looked at the screens.** Every display this
  chat drew is remembered, and the package reports the displays that were never rendered — with a
  `ftview_render` step for them — instead of letting a human import a layout nobody has seen. In the
  field session 10 packages were built, 0 renders were taken, and the agent's own log says it was
  "`revising layouts`" from text alone.

### Changed

- The FactoryTalk View skill now makes looking a step in the loop: draw every display, read the
  PNGs, then ask for the import. The L5X skill says to start a review with `l5x_diagram` rather
  than reading rungs one at a time.

## [0.49.0] - 2026-10-29

### Fixed

- **A safety controller is refused before an offline build, not after it aborts.** Detection looked
  only for `<SafetyTask>`/`<SafetyProgram>` elements; the real commissioning export marks safety
  with `Class="Safety"` on its task and program, a `SafetyNetwork` port number and a
  `SafetyLocked` controller, so the import ran and the SDK answered
  `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` — which reads like an empty draft, not a refusal. The field
  session retried it four times and then edited the ACD by script instead.

### Changed

- `verify_offline_l5x` now answers `SAFETY_PROJECT_OFFLINE_VERIFY` and names the evidence it found,
  and the generic abort advice carries that evidence when it exists.


## [0.48.0] - 2026-10-29

### Added

- `l5x_diagram` draws every ladder rung of the open project on one page (routine headings, rung numbers,
  comments and instruction chains), with `program` and `max_rungs` to bound the page. Reviewing an
  unfamiliar controller no longer takes one `l5x_routine_diagram` call per routine — the field session
  never used the single-routine diagram at all, and this is the call it would have made.
- Every routine heading names `program/routine`, so repeated rung numbers are explainable, and long
  operands are clipped inside their box instead of running off the page.

## [0.47.0] - 2026-10-29

### Added

- `ftview_render` takes `displays_json` and draws up to eight displays in one call, returning a `screens`
  entry per display (file, size, problems) and one merged `problems` list. Checking a twelve-screen set is
  now one or two calls instead of twelve, which is where review time went in the field.

## [0.46.0] - 2026-10-29

### Added

- `ftview_render` now reports layout problems alongside the drawing: every object whose box leaves the
  canvas or whose caption or text cannot fit its box is returned in `problems` with the object name, the
  kind (`outside` or `overflows`) and a measured detail, so a screen can be corrected before anyone
  imports it.

### Fixed

- The renderer read the object type from the element name only, so an export that wraps the type in an
  `<object type="...">` element drew every text, button, indicator and trend as an unlabelled rectangle.
  It now prefers the declared `type` attribute.

## [0.45.0] - 2026-10-29

### Added

- `l5x_routine_diagram` draws the rungs of a routine that already exists in the open project. Pass `program` and `routine`; it numbers the rungs, lists the instructions it found, and writes a PNG beside the SVG when Chrome or Edge is installed. A missing routine is refused with the program's routines as candidates, and a Structured Text routine is refused because there is no ladder to draw.

## [0.44.0] - 2026-10-29

### Fixed

- The import manifest `ftview_apply` writes was not usable by the Graphics Import Export Wizard: entries had
  no `importType` and no `display`, so every run failed with "The display ... does not exist" or silently
  ignored the files. Each entry now carries `importType="create"` for a display the draft introduced and
  `importType="update"` for one that already existed, plus its `display` name.
- `IMPORT.md` now lists the wizard's exact four steps and counts creates against updates, so a run cannot
  fail because the manifest disagreed with the application.

## [0.43.0] - 2026-10-29

### Added

- `ftview_compare` reports what changed **inside** each display, not only which files differ: per display,
  the objects added, removed, and changed with the fields that moved (`left`, `caption`, `connections`, ...).
  After a Studio import this is the proof that a specific object landed, where a file hash only says the
  file is different.

## [0.42.0] - 2026-10-29

### Fixed

- `ftview_studio_import_prepare` wrote `importType="create"` even when the caller asked for
  `mode: "update"`, so an update package asked Studio to create displays that already existed and the
  wizard ignored every file. The manifest now carries the requested mode and the steps say which one it is.

### Added

- The package refuses a display that does not parse as XML, instead of letting the wizard answer only
  "Unable to load the XML file".

## [0.41.0] - 2026-10-29

### Added

- `DisplayObject.connections` carries the expressions an object is wired to (`Value`, `Indicator`,
  `Display`), read from both the flat and the `<connections>`-wrapped ME shapes.
- Renders print that tag inside the frame, so a picture shows what a display reads instead of only its
  caption and object name.

### Notes

- Long expressions are shortened to the room the frame has; the full text stays in `data.connections`.

## [0.40.0] - 2026-10-29

### Added

- Frames read their caption from the face a screen shows at rest (`stateId="0"`), so a button drawn in a
  render says START or YES instead of its object name.
- Character references in captions (`&#xA;`, `&amp;`) are decoded, and a multi-line caption is drawn as one
  `tspan` per line instead of a flattened single line.

## [0.39.0] - 2026-10-29

### Added

- `ftview_draft_display_attrs` stages many attribute changes on a display or one of its objects in a
  single call, instead of one `ftview_draft_display_set` per attribute.

## [0.38.0] - 2026-10-29

### Added

- `ftview_render` draws vendor polylines, trend grids and bar-graph tracks, so separators and charts read
  as the screen does rather than as labelled boxes.

### Fixed

- A `line` object is drawn from its own `line` polyline with its line width and dash style; it used to be
  a diagonal across the object's bounding box.

## [0.37.0] - 2026-10-29

### Added

- `ftview_apply` ends with a `ftview_render` step for the first changed display, so the screen can be
  looked at before anyone imports it.

### Fixed

- `ftview_apply` writes the Studio batch-import manifest for displays a draft created, which arrive as
  `X.xml` rather than `Displays/X.xml`.

## [0.36.0] - 2026-10-29

### Changed

- **`verify_offline_l5x` explains a no-changes import abort.** `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` now carries the reason (safety controller, or an L5X whose safety signature must be recomputed) and the alternative (build in Studio 5000, or prove the change with `run_checks` and a targeted read). The field session retried this four times.
- Safety detection also reads `SafetySignature`, `Type="SAFETY"` and `SafetyNetworkNumber`, not only `SafetyTask`/`SafetyProgram`.
## [0.35.0] - 2026-10-29

### Added

- **`ftview_draft_tags` stages a batch of HMI tags in one call.** Each entry changes a row description, a type, or appends a new row; up to 500 per call. The field session made thirteen single-tag calls to describe one screen's tags.

### Changed

- The batch is atomic: an entry with neither description nor type refuses the whole set and stages nothing, naming the tag at fault.
## [0.34.0] - 2026-10-29

### Added

- **`compose_batch` writes many validated rungs in one call.** Up to 200 rung descriptions — composition trees or named patterns — are checked against the export and against the tags the same draft stages, then staged at consecutive rung numbers. The field session wrote 29 one-off scripts to add rungs one at a time; a batch that composes 20 rungs is now one call.

### Changed

- The batch is atomic: if any rung in it is invalid, nothing is staged and the refusal names the entry. A rung number that already exists is refused with the start rung to use instead, not a generic collision.
## [0.33.0] - 2026-10-29

### Added

- **`ftview_draft_screen` lays out a whole screen from one description.** Cards of label/value and label/lamp rows plus a navigation row are positioned on the scaffold slots, wired to tags, and staged in a single call. The field session hand-placed every object through PowerShell scripts and XML edits; a screen of nine rows and three buttons is now one description, and every rectangle comes back so the next placement is never guessed.

### Changed

- Row kinds are validated before anything is staged: `value` becomes a numeric display bound on `Value`, `lamp` a multistate indicator bound on `Indicator` with two states. More than four cards or four navigation buttons is refused with the reason, not silently truncated.
## [0.32.0] - 2026-10-29

### Added

- **`compose_rung` sees the tags the same draft stages.** A rung written against a tag that `draft_tag` just added used to fail with `TAG_NOT_FOUND`, so the workflow either declared tags in a separate draft or fell back to hand-written NeutralText. Composition now resolves staged declarations, and the type check still runs: a `REAL` tag used where a `BOOL` contact belongs is refused exactly as before.

### Changed

- Staged declarations are visible to composition only. `run_checks`, `draft_validate` and the export on disk still describe the project as it is, so nothing claims a tag exists before it is written.## [0.31.0] - 2026-10-29

### Added

- **`draft_list` and `draft_remove_op`.** A staged operation can now be inspected by index and dropped on its own. Before this, one wrong rung meant discarding every staged edit or hand-editing the L5X outside the plugin — the field session chose the hand edit, with 29 one-off PowerShell scripts as the price.

### Changed

- `draft_remove_op` takes a positional index that `draft_list` reports, not a rung number, so a removal cannot land on real logic by guesswork. An out-of-range index is refused with the current operation count and a pointer back to `draft_list`.
## [0.30.0] - 2026-10-29

### Added

- **A re-apply no longer needs a new folder name.** `ftview_apply` accepts `overwrite: "yes"` for a folder this chat already wrote, so fixing one attribute and re-writing the export stops littering `Final 2`, `Final 3` folders. An unknown folder is still refused with `OUTPUT_NOT_TRACKED` — applying there would merge into somebody else's files — and the `OUTPUT_EXISTS` message now names the option that works.

### Changed

- Overwrite replaces the file set with the current draft; it does not merge with what an earlier apply wrote. Re-run the draft you want as the final state.
## [0.29.0] - 2026-10-29

### Added

- **A stale view can be refreshed.** `ftview_reload` re-reads one opened export folder in place and keeps its `view_id`, so a re-export, a script or a Studio import is visible without opening a second view and re-deriving every path. It reports the display count and which displays appeared or disappeared.
- **A draft can be abandoned.** `ftview_draft_discard` throws away the staged operations, so edits that went the wrong way no longer force the model to finish them or to work around the plugin with scripts. The export on disk is untouched; `draft_discard` does the same for L5X drafts.

### Fixed

- **Offline verification refuses safety projects instead of failing inside the SDK.** A GuardLogix or Compact GuardLogix export always aborts with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` in the offline importer, even when the L5X is unchanged; `verify_offline_l5x` now detects `SafetyTask` / `SafetyProgram` and returns `SAFETY_PROJECT_OFFLINE_VERIFY` with the honest alternative (import and build in Studio 5000).
- Rasterising tests carry a 30 s timeout, so a loaded host no longer fails them on the default 5 s.
## [0.28.0] - 2026-10-29

### Added

- **Ladder answers now carry a diagram.** `l5x_rung_preview` draws the validated rungs as an SVG and, when Chrome or Edge is installed, rasterises it to a PNG beside the preview document, so a chat answer shows ladder logic instead of NeutralText. Instruction boxes carry their operands, branches stack inside a bracket, and every rung is numbered. `diagram: "no"` skips the image work; a host without a browser still gets the SVG, and the result says why no PNG appeared.
- The diagram is explicitly a schematic: it is drawn from the parsed rungs, not rendered by Studio, and the coverage list says so.
## [0.27.0] - 2026-10-29

### Added

- **A render inlines the display's real artwork.** `ftview_render` reads the rasters a display references from the export's `Images` folder and embeds them in the SVG, so a screen shows its actual images instead of a labelled placeholder. An image the export mentions but does not ship is still drawn as a placeholder, and the result now says so, because many ME exports ship an empty `Images` folder.

## [0.26.0] - 2026-10-29

### Added

- **`ftview_render` can draw the staged draft, not just the export.** Pass `source: "draft"` and the render reflects everything staged but not yet applied, so a screen can be looked at before `ftview_apply` and before anyone imports it. A draft that does not touch the display is refused with `NOT_FOUND` instead of silently drawing the committed file.

## [0.25.1] - 2026-10-29

### Fixed

- ftview_render resolves the SVG path before handing it to the browser, so a relative `output` folder now produces the PNG as well.


## [0.25.0] - 2026-10-29

### Added

- **ftview_render shows the screen before anyone imports it.** The tool draws one display of the open export as an SVG file and, when Chrome or Edge is installed, rasterises it to PNG with a headless screenshot, so the image can be attached to the answer. Panels, text, buttons, indicators and lines are drawn from the geometry the export declares; animations, images, global objects and vendor widgets appear as labelled placeholders. The result says which browser produced the PNG, or that only the SVG exists because none was found.
## [0.24.0] - 2026-10-29

### Added

- **`ftview_cross_reference` joins an HMI export to a Studio 5000 project.** Pass the FTView view and one L5X; the tool resolves every HMI tag through the tag CSV data source to a PLC tag, then reports which displays use it, which rungs read or write it, and the tags that exist on only one side. Rows carry `linked`, `memory` (HMI internal), `unlinked` or `unsupported` (indirect address such as `[Tag]` or a data-table address), and findings use `HMI_TAG_NOT_IN_PLC` / `PLC_TAG_NOT_IN_HMI`, so one call answers whether the HMI tags the PLC actually reads.
- **`ftview_draft_display_scaffold` starts a display from known slots.** One call stages a backdrop, header, title, optional subtitle, content surface, footer bar and footer text at the display's own size, and returns the free rectangle inside the body plus the header, footer, title and subtitle rectangles. The model places objects into a slot instead of inventing coordinates.
- **`l5x_rung_preview` renders proposed rungs as ladder.** It validates every rung with the parser `draft_rung` uses, writes a minimal viewer-shaped L5X into the workspace and points the answer at it, so a proposed rung is read as a diagram rather than NeutralText. Rungs can be passed inline or as `rungs_file`; blank lines and `//` or `#` comment lines are skipped.
- **Two PLC standards rules in `run_checks`.** `LATCH_WITHOUT_RESET` (warning) names a tag latched by `OTL` with no `OTU` anywhere in the export; `DUPLICATE_OUTPUT` (warning) names a tag driven from more than one rung in the same routine. Both carry `basis: CRAFT-FAULT-02` so the finding cites the corpus.
- **A standards reference** at [docs/reference/standards-checks.md](docs/reference/standards-checks.md) lists every PLC and HMI rule, its severity, the corpus rule behind it, and what a clean result does not prove.

### Changed

- **`run_checks` says what it now covers** in its description: the documentation rules, the two standards rules and the optional baseline I/O comparison.
# Changelog

## [0.23.0] - 2026-10-29

### Added

- **`ftview_validate` reports an object this draft places partly over a neighbour.** The new `DRAFT_OVERLAP` warning names both objects, the display and the overlap area. It stays quiet for whole-display backdrops and for panels that contain their controls, because those are layering rather than mistakes, so the finding is only about collisions the draft itself introduced. The author sees the collision before apply instead of after import.

### Fixed

- **An object added to a display with no trailing newline landed after the root element.** The insertion point fell back to the end of the file, so the new element sat outside `<gfx>` and the re-parse behaved as if the object did not exist. The insertion now falls back to the parent's closing tag.

## [0.22.2] - 2026-10-28

### Fixed

- **Alarm databases with a non-US localised stream now decode.** The decoder looked only for `ls00000409`; a `ls00004009` (and other locale) table is the same layout, so any `ls<8 hex digits>` stream is accepted, preferring the US one. Across the 66 applications installed here, alarm decoding went from 3 to 34 success; the remaining 26 fall back with a stated reason (stream versions 13/14, or a variant record layout this decoder does not read).

- **A failed decode now says why in the export result.** When the alarm or tag database cannot be read, `ftview_export` keeps the wizard snapshot and adds a warning naming the decoder error instead of silently treating the snapshot as fresh.

### Changed

- **Coverage is documented per component.** Tag decoding succeeds on 64 of the 66 installed applications (two were locked by a running Studio); alarm decoding on 34. Both paths keep the Studio wizard as the fallback, and every fallback is reported rather than hidden.
## [0.22.1] - 2026-10-28

### Changed

- **`ftview_export` refreshes stale or missing tags headlessly.** When the store has `TAG/<application>.MDF` and the snapshot is absent or older than the application database, the export decodes the tag CSV itself and reports `tags: "fresh"` with no warning, instead of copying the old snapshot and telling the reader to run Studio. Falls back to the snapshot copy (with the existing warning) when local SQL tools are unavailable. Verified on `AryaFTV_CarpenterPilot_20261007`: decoded 9,986 bytes, byte-identical to the wizard CSV.
## [0.22.0] - 2026-10-28

### Added

- **`ftview_alarm_snapshot`: alarm XML without Studio.** The tool reads `M_Alarms/MachineAlarms.mal` straight from the application store. The stream is an OLE2 compound file: header counts and next ids come from the trailer, then one 102-byte trigger record and one 30-byte message record each, with `FF <len>`-prefixed UTF-16 strings (`FF FE`/`FF 00` for absent or empty). `LS<length><locale>` outranks the base stream because it carries the localized `triggerLabel` and `messageText`. Output is byte-identical to the vendor wizard's `Alarms.xml` on `AryaFTV_CarpenterPilot_20261007` (33 triggers), `Carpenter_EPS_Laminator001` (23) and `CC019_Main` (64); ids above the encoded limit are reported as notes rather than invented.
- **`ftview_export` fills alarms from the application database.** When `M_Alarms/MachineAlarms.mal` is present the export decodes it into `Alarms/Alarms.xml` and reports `alarms: "fresh"` instead of copying an absent or stale snapshot.

### Changed

- **Alarms are no longer "requires Studio".** `ftview_capabilities` reports `alarms: "available"` when the machine alarm database exists, with the Studio wizard kept as the fallback for applications that carry no `M_Alarms` folder. Skill and `docs/reference/ftview-any-app.md` now describe the decoder and its limits.
## [0.21.0] - 2026-10-28

### Added

- **`ftview_tag_snapshot`: the tag CSV without Studio or the wizard.** The tool copies `TAG/<application>.MDF` to a temp folder, attaches the copy to the local SQL Server Express instance (`MSSQLSERVER`, `SQLEXPRESS`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦), reads `dbo.AllTagsView` and renders the rows with the vendor wizard's exact quoting, ordering, CRLF endings and UTF-8 BOM. The application database is only read; the attach is dropped and the copy removed. Verified byte-identical against the wizard snapshots for `AryaFTV_CarpenterPilot_20261007` (101 tags), `CC019_Main` (121 tags) and `Carpenter_EPS_Laminator001` (378 tags).
- **A SQL-aware capability status.** `ftview_capabilities` reports `tags: "available"` when local SQL tools exist even without `DatabaseConverter.exe`, and its notes say which path is in use.

### Changed

- **Tag snapshots no longer need a human at the wizard.** Skill, `docs/reference/ftview-any-app.md` and the capability notes now prefer `ftview_tag_snapshot`, with `ftview_studio_export_prepare` (DatabaseConverter) as the fallback when no local SQL Server is reachable. Alarm XML and display import still run inside Studio.

## [0.20.2] - 2026-10-28

### Added

- **Smart artifact detection in the file preview.** Opening an alarm export, tag CSV or batch import file no longer shows "not a FactoryTalk View display": `detectArtifact` recognises `<alarms>`, the tag CSV header, `<gfxImport>` and displays, and the preview renders a summary card with the counts (alarm definitions, tag rows, import entries) while displays still render. Unknown XML reports the root element.

### Changed

- **The export workflow no longer implies Studio.** Skill and `docs/examples.md` state that export, authoring, validation, apply and verification need no Studio; only the alarm snapshot and the display import do. The fresh-asset example now passes `export_root` and validates the snapshot in place.
## [0.20.1] - 2026-10-28

### Changed

- **`ftview_studio_export_prepare` can target the export folder directly.** Pass `export_root` and the step list names `<export>/Tags/<application>.csv` (tags) or `<export>/Alarms/Alarms.xml` (alarms) instead of the project store, so the vendor wizard writes the snapshot where the export needs it. Without `export_root` the old store destination is unchanged.
- **`ftview_studio_export_accept` validates in place.** When source and destination resolve to the same file it checks the file and reports it, without a needless self-copy.

### Verified

- On `AryaFTV_CarpenterPilot_20261007` with Studio open, the Alarm Import Export Wizard wrote `Alarms.xml` (29,089 B) straight into `Exports\AlarmDirectTest`; the project store's `Alarms.xml` kept its previous timestamp, proving nothing was written to the store first.
## [0.20.0] - 2026-10-28

### Added

- **`ftview_capabilities`** reports what the host can actually do: Studio and tag-wizard paths, installed `Gfx-ME*` schema versions, application count, and status for tags (`available`), alarms and import (`requires-studio`), backup and live (`unverified`), with one line per fact an agent must not guess.
- **Objects can be added to a display created in the same draft.** `ftview_draft_object_add`, `_set`, `_delete` and `_order` resolve a display that the draft's `display_create` or `display_add` just made, instead of failing with ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œNo display is named ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â. Display settings on a draft-added display are accepted too.

### Documented

- `docs/reference/ftview-any-app.md` now records what the installed product exposes and does not: standalone tag wizard; display-only export server; `GfxImport`/`GraphicsXmlWizard` COM that needs Studio's graphics server and project context; `METriggerEditor` alarm implementation with no CLI; `ApplicationManagerServer` backup that fails on this host.
## [0.19.2] - 2026-10-28

### Fixed

- **The alarm-export steps named the wrong menu.** `ftview_studio_export_prepare { kind: "alarms" }` said `Tools > Alarm Import Export Wizard`. The wizard opens from **right-click `Alarms > Alarm Setup` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ `Import and ExportÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`**, and it runs inside `VStudio.exe`, so Studio must be open with the application loaded. The steps now say that, including the case where Studio is closed.

### Verified on CC019_Main

- Tag export through `DatabaseConverter.exe`: `CC019_Main-Tags.CSV`, 104 tags, 110 lines.
- Alarm export through `Alarm Setup ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Import and Export`: `Alarms.xml`, 71,865 bytes, root `<alarms version="1.0">`.
## [0.19.1] - 2026-10-28

### Fixed

- **`ftview_export` creates the destination's parent folder first.** Exporting an application into a new tree failed with `Value does not fall within the expected range` at `ExportAll` when the parent folder did not exist; the Laminator export only worked because `Laminator/HMI` was already there. `ApplicationManager`-style parents are now created before the vendor call.

### Verified

- Second application exported and drafted against: `CC019_Main` (70 displays, 1280ÃƒÆ’Ã¢â‚¬â€800, schema `Gfx-ME17.xsd`, **no** tag or alarm snapshot). A 12-object `ARYA_DIAG` display passed schema validation and applied cleanly, proving the catalog/draft/validate/apply path is not Laminator-specific.
## [0.19.0] - 2026-10-28

### Fixed

- **`ftview_draft_object_set` now writes captions in the shape each element accepts.** Buttons and indicators update their `<states><state><caption>` faces; `gotoButton` and the simple buttons update the `<caption>` child; other objects keep the `caption` attribute. Editing a button caption previously produced schema-invalid XML.
- **`ftview_validate` bounds its findings.** It returns the first `limit` findings (default 50) and still reports `findings_total`, `findings_truncated` and complete `by_rule` counts, so a legacy export with hundreds of duplicate-name warnings no longer floods the result.

### Added

- **`docs/reference/ftview-any-app.md`** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â what is generic across applications (catalog, reading, drafting, packaging, snapshots, live mapping), what varies (schema version, tag CSV, alarms, display names and size, image stems, global objects, connection names), and the export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ draft ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ import ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify loop.
## [0.18.4] - 2026-10-28

### Added

- **`ftview_studio_import_prepare` takes `mode: "create" | "update"`.** A display that already exists must be updated, not created: a create-mode entry ignores every existing object and reports "element already exists ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ will be ignored". Update mode is what completes a partially imported display. Default stays `create`.
## [0.18.3] - 2026-10-28

### Fixed

- **`multistateIndicator` binds through `Indicator`, not `Value`.** Studio's importer rejected `name="Value"` on the element with `The connection with the name 'Value' is not valid on a 'multistateIndicator' element.` The object writer now maps a caller's `Value` connection to `Indicator` for indicators, so the mode lamp imports. The same fix was applied to the pending `Arya Control.xml` package.
- Restored the non-stateful branch of `addObject` after the connection mapping edit, so visibility animations on panels keep being written (regression caught by the animation test).
## [0.18.2] - 2026-10-28

### Fixed

- **Import packages now force display creation.** The generated `gfxImport` entries were bare `importFile` references, so Studio imported in update mode and refused with `The display 'Arya Overview' does not exist.` Each entry now carries `importType="create"` and the explicit `display` name, which is what the batch file documents. The package under `Laminator/HMI/Arya Import` was rewritten for the retry.
## [0.18.1] - 2026-10-28

### Fixed

- **`ftview_studio_import_prepare` produced a package Studio could not import.** The display XML files went into `Displays/` while `BatchImport.xml` referenced them beside itself, so the Graphics Import Export Wizard failed with `Unable to load the XML file 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦\Arya Overview.xml'. Cause: The system cannot locate the object specified.` The XML files now sit beside the batch file, which is where Studio resolves `importFile`. The existing package under `Laminator/HMI/Arya Import` was corrected by hand for the retry.
## [0.18.0] - 2026-10-28

### Added

- **`ftview_draft_object_add` writes button and indicator faces.** A new `states_json` argument produces `<states><state stateId="0"><caption ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/></state>ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</states>`, so `momentaryButton`, `maintainButton`, `latchedButton`, `multistateButton`, `rampButton` and `multistateIndicator` get real captions, colours and per-value states instead of a `caption` attribute the vendor schema rejects. Buttons accept states 0, 1 and Error; an indicator accepts numbered states with `value`.
- **`animations_json` writes visibility animation.** `{"visibility":{"expression":"{AutoRunning} = 0","expressionTrueState":"visible"}}` produces `<animations><animateVisibility ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/></animations>`.
- **`gotoButton` captions are now a `<caption>` child**, which is the shape its schema expects; a `states` face would be invalid.

### Verified

- `Displays/Arya Control.xml` was generated through these writers and validated against Studio's own **`Gfx-ME17.xsd`: 0 errors** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â two stateful push buttons, a value-triggered mode lamp, two navigation buttons and two visibility-animated objects.
- Rendered to `artifacts/ftview-arya/Arya Control.png`.
- Not yet imported into a live Studio application: Studio started in Demo Mode and the application did not finish loading during this run, so the schema is the acceptance evidence here.
## [0.17.2] - 2026-10-28

### Changed

- The FTView skill now says how applied displays reach Studio (`ftview_studio_import_prepare`, then the Graphics Import Export Wizard) and corrects the object-contract count to the 34 drawable types.
## [0.17.1] - 2026-10-28

### Fixed

- **`ftview_apply` now composes write paths from the resolved target's `displayPath`.** The host may return an `FsTarget` object from `fs.resolve`; interpolating it produced `[object Object]` in child paths instead of the folder the caller named. `targetPath()` normalizes both shapes, and the apply existence check still runs against the resolved target.
## [0.17.0] - 2026-10-28

### Added

- **`ftview_studio_import_prepare`** packages displays from an applied export for Studio's Graphics Import Export Wizard: it copies the selected `<gfx>` display XML files, writes the `gfxImport` batch file, and returns the wizard steps. Non-`<gfx>` files are refused.
- **Verified end to end on this host**: the wizard (right-click Displays > Import and Export) imported `Arya Proof.xml`; Studio created `GFX\Arya Proof.gfx` (104,960 bytes), listed **Arya Proof** in the Displays tree, and opened it in the editor. A pre-import backup of the application is kept under `backups/ftview/Carpenter_EPS_Laminator001/pre-proof-import-20261028T050943Z`.
## [0.16.1] - 2026-10-28

### Fixed

- **Copying a real Studio ME display produced schema-invalid XML.** `ftview_draft_display_add` renamed the copy by writing a `name` attribute onto the root, but a ME display is named by its file and its root is `<gfx>`, which `Gfx-ME17.xsd` rejects ("The 'name' attribute is not declared"). The rename now rewrites the name only on the legacy `<display name="ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦">` shape and leaves `<gfx>` untouched; the file name is the display name.
## [0.16.0] - 2026-10-28

### Changed

- **`ftview_export` now reports asset freshness instead of only warning.** Its result carries `assets: { tags, alarms }` as `fresh`, `stale` or `missing`, and when either is not fresh the `next` list names `ftview_studio_export_prepare` (with the right `kind`) so the model refreshes the snapshot through the wizard and accepts it, rather than binding against an old file.
## [0.15.0] - 2026-10-28

### Added

- **Alarm export is now a prepared path.** The Alarm Import Export Wizard is hosted by Studio (it runs inside `VStudio.exe`); `ftview_studio_export_prepare { kind: "alarms" }` returns the exact Studio steps, the store folder and the `Alarms.xml` it must produce. `ftview_studio_export_accept { kind: "alarms" }` validates the `<alarms>` XML and copies it.
- Verified on this host: export alarm configuration -> Next -> Finish wrote `Carpenter_EPS_Laminator001\Alarms.xml`, 34,559 bytes, root `<alarms version="1.0">`.
## [0.14.1] - 2026-10-28

### Fixed

- The 0.14.0 skill exceeded its 8000-byte budget (the new export section pushed it over; `pnpm test` caught it after
  publish). The skill is trimmed back under budget with the prepare/accept workflow kept.
## [0.14.0] - 2026-10-28

### Added

- **`ftview_studio_export_prepare`** resolves an application's `.med`, verifies Rockwell's Tag Import and Export Wizard is installed, and returns the exact steps and destination file. It does not click anything.
- **`ftview_studio_export_accept`** validates what the wizard produced ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tag CSV header and row count, or an `<alarms>` XML ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â and copies it into an export folder. Empty or wrong-shaped files are refused, so a failed run cannot become a silent stale asset.
- The FTView skill documents the prepare ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ wizard (computer use) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ accept workflow for fresh tags and alarms.

### Notes

- Rockwell's wizards are desktop dialogs. UIA, Win32 messages, browse-dialog automation and coordinate input were tried against them and are not reliable enough to ship; the harness's computer use is the actuator, and the two tools above make its result verifiable. Application Manager backup was also attempted and fails on this host ("Class not registered").
## [0.13.1] - 2026-10-28

### Fixed

- **`ftview_export` no longer claims to export alarms and tags.** An ME application folder does not contain
  `Alarms.xml` or a tag CSV; those exist only when someone exports them from Studio's Alarm Setup / Tag Database
  into the store. The tool now says it exports displays and global objects, copies an existing snapshot **only if
  present**, reports its age, and the warnings state that the files are not part of a normal application. Skill and
  tool descriptions corrected to match.
## [0.13.0] - 2026-10-28

### Added

- **The object contract is now teachable.** `TYPE_GUIDE` documents all 34 drawable types with required attributes,
  allowed children and a construction note; `ftview_object_types all="true"` returns it alongside what the export uses.
- `multistateIndicator` and `polyline` are part of both the drafting contract and the renderer. The missing
  `multistateIndicator` was why the yellow **MANUAL** bar never drew ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it was dropped before rendering, and no
  attribute change could fix it.
- The FTView skill now documents the contract workflow (read `all`, read the used type, draft, validate, apply), the
  image-name and reference-object rules, and the preview's fidelity limits.

### Fixed

- Reference objects take **all** local attributes over the base, so a reference multistate keeps its own
  `currentStateId` instead of the base's state.

### Verified

`Load Conveyor Screen` now draws the MANUAL bar and the header/footer exactly where Studio puts them; `Main Screen`
draws the logo, triangles and round lamps. 66 FTView tests, 12 renderer tests, 69 bundle tests.
## [0.12.1] - 2026-10-27

### Fixed

- **The generated tool reference was stale.** `ftview_object_types` gained the `all` parameter in 0.12.0, but
  `docs/reference/tools.md` was generated before that edit and `pnpm test` caught it only after the release was
  published. The reference is regenerated; no tool behaviour changed.
## [0.12.0] - 2026-10-27

### Added

- **Every drawable element type is a drafting target.** `ELEMENT_TYPES` is the 33-type contract behind
  `ftview_draft_object_add`; an unknown type is refused with the candidate list, and geometry defaults (`left`, `top`,
  `width`, `height`) are filled when omitted. `ftview_object_types all="true"` lists the contract, what the export uses
  and what it does not.
- **Global Objects and images in the app preview.** `/engineering/ftview/globals` resolves `isReferenceObject` bases;
  `/engineering/ftview/image` serves `Images/` with case-insensitive, extension-optional lookup (Studio names
  `Equilateral triangle` while the file is `Equilateral triangle.bmp`).
- **Shape fidelity**: `circle` and `ellipse` draw ellipses, rounded shapes get a radius; reference objects keep the
  base object's children and only take local bindings, so header/footer content is no longer dropped.

### Verified

Real screens rendered with Studio as the oracle: `Main Screen` now shows the CARPENTER logo, the green/red triangles and
circular loader lamps; `Load Conveyor Screen` matches the Studio layout apart from the alarm banner placeholder and the
`MANUAL` multistate bar (see Known gaps). 68 bundle tests, 65 FTView tests, 11 renderer tests.

### Known gaps

- The alarm banner/list draws a labelled placeholder instead of the runtime message.
- A reference multistate whose base state is value-triggered can render the design-time state instead of the runtime
  one (`MANUAL` bar on Load Conveyor).
## [0.11.1] - 2026-10-27

### Fixed

- **Image objects resolve by name, with or without an extension, case-insensitively.** A display refers to
  `imageName="Equilateral triangle"` while the store holds `Equilateral triangle.bmp`; the route required an extension,
  so every image 404'd and drew a placeholder. Names are trimmed and matched against `.bmp`, `.png`, `.jpg`, `.jpeg`
  and `.gif`.
- The preview harness can inline `Images/` as data URLs, which is how the logo and the triangle indicators were
  verified: with the real Images present, `Main Screen` now draws the CARPENTER logo and the green/red triangles.
## [0.11.0] - 2026-10-27

### Added

- **Global Objects load in the preview.** The face fetches `/engineering/ftview/globals` and resolves every
  `isReferenceObject` against its base, so the header, footer and navigation highlight appear in the app instead of
  empty placements. This was the largest visual regression against Studio.
- **Images render in the preview.** A new `/engineering/ftview/image` route serves `Images/<name>` with a file-name
  whitelist, and the face resolves every image through it.
- **Shape fidelity.** Buttons and indicators honour StudioÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s `shape` attribute: `ellipse` draws a circle (status lamps
  were rectangles), rounded shapes get a corner radius.
- **Drafting accepts every drawable element type.** `ftview_draft_object_add` validates the type against the 34-type
  contract (`panel`, `group`, shapes, all button kinds, numeric/string fields, bar graph, gauge, trend, list selector,
  alarm objects, recipe, ActiveX, symbol, reference/global object) and rejects an unknown type with the candidate list.

### Verified against Studio

The reference screenshot of `Load Conveyor Screen` in Studio is committed at
`artifacts/ftview/studio-load-conveyor.png`; comparing it with the preview identified the three gaps above
(header/logo via globals and images, and circular indicators).
## [0.10.9] - 2026-10-27

### Fixed

- **Fit did not fit.** The rendered SVG carries the display's pixel size (`width="1280" height="1024"`), which is right for
  the PNG export and wrong inside a narrow preview pane: the drawing kept its intrinsic size and the pane showed a crop of
  it, so Fit and 100% looked identical. Fit now renders through `responsiveSvg`, which overrides the size, keeps the
  `viewBox` and preserves the aspect ratio; 100% still shows the full-size drawing with scrolling. Found by driving the
  running app with computer use, not by a unit test.
## [0.10.8] - 2026-10-27

### Added

- **Compare view.** The previewÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s **Compare** action loads the same display from a second export folder through the
  display route and shows both renders side by side with their labels, so an edit can be judged before it is applied.
  The second folder is asked for by name, nothing is written, and the button toggles the pane off.

### Changed

- Phase 4 of the preview plan is complete: inspect, navigate, back, PNG export and compare.
## [0.10.7] - 2026-10-27

### Added

- **Interactive preview.** Every rendered object now carries its type and name, so a click opens an inspector with the
  objectÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s attributes, its connections, its state count and, for a `gotoButton`, an **Open display** action.
- **Navigation.** Double-clicking a `gotoButton` (or using the inspector) loads its target display through the new
  `GET /engineering/ftview/display?root=&name=` route, with a **ÃƒÂ¢Ã¢â‚¬Â Ã‚Â Back** history. The route accepts display file names
  only and refuses traversal.
- **PNG export** of the current view from the toolbar.

### Known gaps

- Side-by-side compare of two versions of a display is not in this release; the rest of phase 4 is.
## [0.10.6] - 2026-10-27

### Added

- **`ftview_object_types`.** Catalogs the object types the open export actually uses: how many of each, every attribute
  seen with its usage count and up to three example values, and example names. Ask for one `type` to get its attribute
  table ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the answer an agent needs before authoring, instead of guessing attribute names until the XSD refuses.
- **`ftview_design_check`.** Rule-based findings from the `view` corpus: touch targets under 44 px (`VIEW-HPM-02`),
  controls with no base caption (`VIEW-HPM-01`), text contrast below 4.5:1 (`VIEW-COLOR-01`) and displays no
  `gotoButton` reaches (`VIEW-NAV-01`). Every finding names its rule and its evidence.

### Changed

- FactoryTalk View read surface: 7 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 9 tools; bundle total 100 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 102.
## [0.10.5] - 2026-10-27

### Added

- **Live values in the preview.** `GET /engineering/ftview/live?root=<export>&ip=<controller>&slot=<n>&tags=A,B` maps each
  requested HMI tag through the export's own `Address` column and reads the controller tags over EtherNet/IP with the
  driver the L5X live row uses. It is read-only, needs an explicit IPv4 address and slot, honours an optional allowlist,
  and reports a memory tag as `not_live` rather than inventing a value.
- The preview's toolbar has a **Live** toggle: it asks for the controller address once, stores it locally, polls the
  route every 500 ms, feeds the values into the renderer (so animations, bars and numeric fields move) and shows
  `N live, M failed, K not live`.

### Known gaps

- The route is served only when the host provides a web server; a CLI host keeps the tool surface without live values.
- Live reads have not been exercised against a controller in this round; the transport is the same driver the L5X live
  row already uses, and the route is unit-tested with an injected reader.
## [0.10.4] - 2026-10-27

### Added

- **Animations evaluate.** `animateVisibility` expressions (`{Current_Screen} = 6`) are evaluated against known tag values;
  an unknown tag leaves the object in its base state instead of hiding it. The expression reader covers tag references,
  numbers, strings, the six comparisons and `AND`/`OR`.
- **Reference objects resolve against Global Objects.** Objects with `isReferenceObject="true"` and
  `linkBaseObject="Header_Footer.Group3"` inherit the base object's states, caption and children while keeping their own
  placement. On the Laminator `Main Screen` this restores the navigation highlight: selecting `Current_Screen=1` lights
  the Main Screen button, which is exactly how the runtime behaves.
- `scripts/ftview-preview.mjs` loads `Global Objects/*.xml` beside the display automatically and accepts
  `--tags '{"Current_Screen":1}'`, so a screen can be checked in isolation.

### Known gaps

- Values are still supplied by the caller; the controller route is the remaining phase-3 work.
## [0.10.3] - 2026-10-27

### Added

- **Graphs and selectors draw their data.** `barGraph` fills in proportion to its `Value` connection between `minValue`
  and `maxValue`, honours `fillDirection` (all four directions) and draws each threshold as a red mark. The Laminator
  `Main Screen` conveyor strips now show real proportions instead of empty boxes.
- `gauge` draws its scale arc and a needle; `trend` draws its grid; `listSelector` shows its caption. These types do
  not occur in the Laminator export, so they are covered by unit tests rather than a real screen.
- Numeric fields read the `Value` connection when they have no `expression` attribute, which is how most of the
  project's numeric displays are wired.

### Known gaps

- Values are supplied by the caller (tests and the preview harness); live controller values arrive with the route.
- Reference objects (`isReferenceObject="true"` with `linkBaseObject`) still render their local state only; resolving
  the base object in Global Objects is not implemented.
## [0.10.2] - 2026-10-27

### Changed

- **The display preview now runs the new renderer.** The client face is bundled from `packages/ftview-viewer/face/face.ts`
  against `src/render.ts`; the old closure bundle is kept as `lib/client-legacy.js`. The panel draws the SVG the
  renderer produces, shows the display size and object count, offers Fit/100%, and reports an invalid file instead
  of an empty tab.
- Preview id aligned with the bundle's contract (`dsh-engineering-ftview-viewer/display`), locale namespace
  `factorytalkView`.
- Tests: face registration, body rendering through the renderer, invalid-file handling, and bundle shape
  (70 bundle tests in total with the renderer suite).

### Known gaps

- `barGraph`, `gauge`, `trend` and `listSelector` still draw as plain faces; live values and navigation are not wired yet.
## [0.10.1] - 2026-10-27

### Added

- **A sourced renderer for the display preview.** The FTView face had no source, only a committed closure bundle. `packages/ftview-viewer/src` now owns an XML reader and an SVG renderer with tests, and `scripts/ftview-preview.mjs` renders any display export to SVG/HTML (plus a headless PNG) outside the app. On the real Laminator `Main Screen` it draws the object set the artifact dropped ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â **button captions from `<states><state><caption>`**, per-state colours, groups, and numeric fields ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â which is why the old preview showed blank navigation buttons.
- The renderer is not wired into the client face yet; the artifact still serves the panel. Known gap, stated rather than implied.
## [0.10.0] - 2026-10-27

### Added

- **`ftview_live_map`.** Maps every HMI tag in the export to the controller tag named in the CSV `Address`
  column (`::[topic]tag`), and reports coverage. It answers the question a live viewer depends on without
  contacting a controller and without inventing a value: on the Carpenter Laminator application **293 of 295
  tags are controller-backed** (topic `Laminator`), the other two are HMI memory.
- **Image assets are exported.** The vendor export engine does not copy bitmaps, so image objects could never
  render. `ftview_export` now copies the store's `Images/` tree into the export, and warns only when a display
  actually references an image and the store has none.

### Changed

- FactoryTalk View read surface: 6 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 7 tools; bundle total 99 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 100.

### Known gaps

- The live *values* route and the new viewer are not in this release. The mapping and assets they depend on are.
## [0.9.3] - 2026-10-27

### Fixed

- **`ftview_export` reported `0 display(s)` for a successful export.** The display count used a pattern that
  required a leading slash, but export paths are relative (`Displays/Main Screen.xml`), so every export said
  zero displays even when it wrote thirteen. The count now matches the paths the tool actually returns.
- **The tags and alarms warning now says what it means.** The copied `Alarms/Alarms.xml` and
  `Tags/<application>.csv` are snapshots Studio last wrote when those components were exported from their
  editors ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not fresh data. The warning states that, and that the application export in Studio is what
  refreshes them. There is no supported headless export for either component; this is the honest boundary.
## [0.9.2] - 2026-10-27

### Fixed

- **The `engineering-standards` skill was missing from the catalog.** 0.9.1 mounted it by calling the skills
  service from inside the resources row's `apply()`, which only works if that service already exists at that
  row's turn ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it mounts before the Optix row, so the skill was silently skipped (the tools still loaded).
  The skill is now its own plugin with `inject: ['skills']`, the same pattern the product skills use, so the
  host activates it when the service is up regardless of row order. A test asserts the injection list and
  registration.
## [0.9.1] - 2026-10-27

### Fixed

- **0.9.0 could stop AryaCode from booting.** The new row was inserted with `id: resources`, and `resources`
  is the name of a harness service other entries wait for; inserting a row under that id displaced the
  provider, so the boot reported `44 entries did not activate` and the application had to start with plugins
  disabled. The row is now `engineering-resources` (namespaced like every other non-product row), and a test
  rejects any future row id that matches a harness service name.
- **The resources row can no longer break a boot even if it fails.** Its `apply()` wraps registration and
  skill mounting in a guard that reports and continues; a reference surface must never be load-bearing.
- **The corpus is now actually shipped.** The assembler copied only `lib/` and `SKILL.md`, so the vendored
  package had no `corpus/`, `index.json` or `SOURCE.json` and `engineering_reference` would have failed at
  the first call. `scripts/assemble.mjs` now copies those files, and the packed artifact is checked for them.
## [0.9.0] - 2026-10-27

### Added

- **Model-agnostic engineering resources: a local standards corpus.** 34 authored pages across six domains
  (IEC 61131-3, Rockwell, Yaskawa, FactoryTalk View/HMI, Optix, craft) with front-matter provenance and 100+
  rule IDs (`CRAFT-NAME-01`, `VIEW-HPM-02`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦). `engineering_reference` lists the contents, ranks pages for a
  query and returns one page with its rules; search is deterministic and needs no network, embedding model or
  tokenizer. `scripts/gen-resources.mjs` validates every page (fields, domains, id/file agreement, rule
  uniqueness, size and word budgets) and generates `index.json`/`SOURCE.json`; `pnpm resources:check` fails on
  a stale index.
- **House-style profiles.** `engineering_profile` reads the conventions of the open project ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â L5X tag prefixes
  and case, seal-in and latch forms, comment density; FactoryTalk View palette, fonts, button geometry,
  navigation and popups ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â with counts, evidence and a `low`/`medium`/`high` confidence. A profile is evidence,
  not authority, and the tool says which project and SHA-256 it came from.
- **Generation follows the profile.** `ftview_draft_display_create` applies the profile's background colour and
  `ftview_draft_object_add` its button geometry and font when the caller omits them, reporting
  `profile_applied`.
- **New `resources` row and the `engineering-standards` skill.** The row mounts the two tools and the skill
  that tells a model to read the relevant page and the project profile before authoring. Tools 97 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 99, rows
  5 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 6.
- `docs/resources.md` documents the corpus, its provenance, the index commands and the profile schema.

### Known limits

- `engineering_review` (rule-based draft review) and MWI/Optix profile extraction are planned for 0.9.1; the
  corpus already applies to those products and the product validation still judges the result.
## [0.8.4] - 2026-10-27

### Added

- **`ftview_export` now brings the alarm setup and the tag database.** The vendor export server covers
  displays, global objects and project settings; alarms and tags live beside the application in the
  Studio project store and were missing from a "full" export, so tag bindings had nothing to check
  against. The export now copies `Alarms/Alarms.xml` and `Tags/<application>.csv` into the export in the
  same layout Studio uses, and reports a warning for each when the stored snapshot is older than the
  application database (on the commissioning application both were dated 2026-09-29 against a database
  modified 2026-10-27).

### Documentation

- FTView skill, getting-started and the handbook now describe the alarms/tags copy and its staleness
  warning instead of "the vendor export carries no tag CSV".
## [0.8.3] - 2026-10-27

### Documentation

- **A workflow handbook, generated from one source.** `docs/handbook/Engineering-Handbook.pdf` (7 pages),
  an editable `.docx` and a printable `.html` cover the four products: what each row needs, the shared
  read ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ act ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ hand-off loop, what the agent does, what stays human, and a "what proves what"
  table.
- **Six workflow diagrams** in `docs/diagrams/` (SVG masters and PNG): the shared loop and one per
  product, with agent steps, human steps and proof steps visually distinguished. They are embedded in
  `docs/getting-started.md` and in the handbook.
- The diagrams and handbook are **generated**, not hand-drawn: `scripts/gen-diagrams.py` owns the layout
  and `scripts/gen-handbook.py` the prose, so a changed workflow is one edit and one regeneration.
- README: the handbook in the documentation table and the generators in the Development commands.
## [0.8.2] - 2026-10-27

### Documentation

- **A getting-started guide for a new install.** `docs/getting-started.md` answers the first questions a
  fresh AryaCode user has: what each of the four rows needs installed, how to install from the market,
  the loop every product follows (read ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ act in a copy ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ hand off), a paste-ready first prompt
  per product, and the boundaries the bundle will not pretend away (Studio import/runtime, the missing
  tag CSV in a vendor export, MWI's IDE, Optix's bridge).
- README: a "New here?" pointer, a market-first Install section, corrected Status and Requirements
  (FTView authoring/export/schema, eleven L5X drafts) and the Getting started entry in the documentation
  table.
- Examples: section 7 now walks the real 0.8.x FactoryTalk View flow (vendor export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ author ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
  schema-validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply with the `BatchImport` manifest ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify the import), and a new section 9
  covers reading and authoring a FactoryTalk Optix project.
## [0.8.1] - 2026-10-27

### Added

- **FactoryTalk View ME authoring.** The surface no longer only edits an export someone handed over:
  - `ftview_apps` lists the ME applications installed on the host through the vendor export server
    (74 applications were listed on the commissioning host).
  - `ftview_export` exports one application to a NEW folder through `MEExportSvr` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no Studio window,
    no project change. Proven end to end: 19 files and 13 displays for `Carpenter_EPS_Laminator001`.
  - `ftview_draft_display_create`, `ftview_draft_object_add`, `ftview_draft_object_set`,
    `ftview_draft_object_delete` and `ftview_draft_object_order` author displays and objects against a
    source-positioned tree that keeps nesting (groups), connections and states.
  - **Vendor-schema validation.** Every changed display is validated against the installed
    `Gfx-ME*.xsd` through .NET before it can be applied; `ftview_apply` refuses a document the schema
    rejects (`SCHEMA_INVALID`). All 13 real displays in the Laminator export validate with zero errors.
  - `ftview_apply` now writes `Displays/BatchImport_<app>.xml` and `IMPORT.md`, the vendor's own
    one-step import list for Studio's Batch Import.
  - `ftview_verify_import` re-exports the application through the vendor engine and compares it object
    by object with the draft, listing differing attributes and missing/extra objects.

### Documentation

- `packages/ftview/SKILL.md`: an Authoring section (apps ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ author ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate) and an Import
  and verify section that states plainly which steps remain Studio and ME Transfer Utility.
- README: 97 tools, FactoryTalk View ME 22, and the 0.8.0 milestone.
## [0.7.0] - 2026-10-27

### Added

- **Ladder generation that cannot emit invalid NeutralText.** Three pieces:
  - `list_instructions` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the instruction catalog the composer validates: mnemonic, category, summary
    and operand slots with their kinds (BOOL, NUMBER, TIMER, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦), filterable. 41 instructions, covering
    every mnemonic the Laminator project uses (45 distinct across 860 rungs).
  - `compose_rung` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â builds one rung from a structure tree (`spec_json`) or a named pattern
    (`start_stop_latch`, `fault_latch`, `ton_delay`, `interlock`), resolves every operand against the
    export (including unqualified program tags and aliases), type-checks each slot, emits the export's
    own bracket style, and re-parses its output with the same parser `draft_rung` uses. Unknown
    instructions name the nearest catalog entries; a wrong operand count, a non-BOOL contact, a
    non-numeric value slot, an undeclared tag or an undeclared AOI is refused before anything is staged.
    Passing `program`, `routine`, `mode` and `rung` stages the rung in the draft; `fault_latch` stages
    its two rungs consecutively.
- **Rung comments are read and written.** The model read the `Comment` **attribute** only, so a real
  Studio export's 572 child `<Comment>` elements were invisible. `decodeRung` now supports both shapes,
  `draft_rung` accepts a `comment`, and `draft_rung_comment` sets or clears one on an existing rung.
  CDATA terminators in a comment round-trip through the existing escaping.
- **Documentation dimension.** `document_project` writes a handover bundle into a NEW folder and never
  touches the export: `PROJECT.md` (controller, revision, tasks, programs, counts), `io.md`/`io.csv`,
  `tags.csv` and `tags-studio.csv` (the `Tag Name,Description` shape Studio's Tags and Comments import
  expects), and `rungs/<program>.md` with each rung's number, comment, NeutralText, instructions and
  resolved tags. Filters: `include`, `programs`, `routines`, `rungs_per_file`.

### Documentation

- `packages/l5x/SKILL.md`: a Generate section (catalog ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ compose ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply) and a
  Documentation section (bundle contents, the comment round trip, what the bundle cannot prove).
- README: 89 tools, L5X 44, and the 0.7.0 milestone.

## [0.6.0] - 2026-10-27

### Added

- **FactoryTalk Optix NetLogic reference.** The bundle vendors a pinned snapshot of Rockwell's
  [NetLogic cheat sheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet) (51 pages, commit
  `5e652541`) and exposes it as one tool instead of dumping C# into the prompt:
  `optix_netlogic` with no arguments returns the contents, a `query` ranks pages by title, topic and
  symbol before body text, and a `slug` returns that page verbatim. Every page result carries its
  `risk` (`normal`, `advanced` or `unsupported`, with the repository's own Advanced section marked
  unsupported), the upstream commit, a source URL and the upstream disclaimer that the snippets may use
  non-public APIs and must not be used in production as-is.
- **A FactoryTalk Optix skill.** The row previously had tools and no guidance; `factorytalk-optix` now
  names the surface, the NetLogic reader and its risk rule, and the report-before-claiming boundary.
- The `optix` row gains a `netlogic` switch (on by default). Off removes one tool and the guidance
  without touching the prebuilt engine.
- `scripts/sync-netlogic.mjs` is the only writer of the snapshot: it pins a commit, copies
  `pages/*.md`, and generates `index.json` plus `SOURCE.json` (commit, page count, risk counts).
  `pnpm netlogic:sync` refreshes it; `test/netlogic.spec.mjs` fails when the index and the pages drift.

## [0.5.0] - 2026-10-27

Commissioned against the Laminator fixtures: a real Studio 5000 ACD exported to a 5.4 MB L5X, a
real FactoryTalk View ME export, and two MotionWorks projects.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FactoryTalk View could not read a real Studio export

`ftview_open` reported **0 displays and 0 tags** for a genuine ME export. Five independent causes:

- **The tag CSV delimiter was hard-coded to `;`** while Studio exports are comma-separated and use a
  leading `;` only as a comment prefix, so every data row parsed as one cell. The separator is now
  detected per line with quote awareness.
- **The header was assumed to follow the `###002` line.** A real export writes the header first, then
  `###002`, then `;Folders Section` / `;Tag Section` comments, and the parser took the first comment
  for the header. It now finds a `Tag Name` header on either side of the version line.
- **Short rows were rejected.** Studio omits trailing empty columns, so 29-column headers come with
  23-column rows. Only over-long rows are errors now.
- **`<gfx>` displays were refused.** ME display XML is `<gfx>` (Gfx-ME17.xsd), not `<display>`.
- **UTF-16 files were decoded as UTF-8**, producing a root element of `\0g\0f\0x`; BOM sniffing now
  selects UTF-16LE.

Also normalised the host contract: `scanApplication` accepts the `FsTarget` that `fs.resolve`
returns instead of calling string methods on it.

Verified on `Laminator/HMI/Main`: **18 displays, 361 tags, 0 parse errors** (was 0 and 0). Reading a
`<gfx>` export is supported; the staged edit tools were built for the `<display>` shape and are not
verified to rewrite `<gfx>` objects.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Studio 5000 checks drowned real findings in false positives

`run_checks` on the Laminator export produced 562 findings, 315 of them "unresolved reference", on a
project that compiles. Every one was an alias to module I/O (`In_FF_ModulePresent` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
`FanFold_StraightCut_AENTR:2:I.7`): aliases carry no `DataType`, their targets are not declared
`<Tag>`s, and the fast resolver stopped instead of falling back to the canonical one.

- `resolveSymbol` now falls back to `resolveTag`, and an empty type with a trailing numeric part
  resolves as a bit.
- A member of a module-defined or opaque type (`Drive_MCFG.CommFLT`, `Axis_MAH.PC`) and `S:`/`R:`
  system flags are reported as coverage limits, not unresolved references.

**562 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 264 findings; unresolved 315 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 16**, with the unused-tag and multiple-write findings intact.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Studio 5000 edits

- **`add_tag` required a value for a scalar tag.** Studio defaults scalars to zero, so declaring a
  plain REAL was impossible without inventing a value; `value` is now optional and still validated
  when supplied.
- **Live reads refused aliases.** `read_live_tags` and `poll_live_tags` ran the write rule, so
  ordinary module-point BOOLs were rejected as "not a writable declared scalar". Reads and polls now
  take an alias's type from the canonical resolver; writes still refuse an alias and name the tag to
  write instead.
- **`export_acd_to_l5x` failed when Studio had the ACD open.** The SDK opens the file itself, so the
  normal case ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the project the user is working on ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â failed with "being used by another process". The
  export now copies the ACD and opens the copy, with the source hash re-checked before and after.

Verified end to end on the Laminator export: `draft_tag` (REAL, no value) plus a rung replacement
validated and applied to a 5,391,840-byte L5X.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MotionWorks IEC

- **`mw_get kind="block"` crashed with `KeyError: 'native_libraries'`.** The block interface is decoded
  against the installed libraries as well as the saved project; the read service now supplies the live
  inventory and falls back to the project's own registry when no IDE answers.
- **`mw_edit_variables` refused with "Live declarations disagree with saved baseline"** and nothing
  else. The refusal now names the missing, unexpected and changed declarations with their live and
  saved values.

Verified on both Laminator projects through the shipped engine: attach into
`backups/motionworks/<project>/<stamp>/`, then `workflow_check`, `pous`, `read_text`, `validate`,
`tasks`, `types`, `globals` and `library` all succeed (8 POUs, 5 tasks, ~170 globals, 297 types,
23 blocks each).

### Documentation

- `docs/optix-netlogic.md`: how the FactoryTalk Optix NetLogic cheat sheet should be carried ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a
  pinned snapshot, a generated index, and one `optix_netlogic` retrieval tool, with the risk flags and
  disclaimers the repository itself requires.

## [0.4.22] - 2026-10-27

### Fixed

- **No Python bytecode in the tarball, again.** 0.4.21 shipped three `__pycache__/*.pyc` files
  because a `py_compile` guard check ran in the checkout before packing, and `assemble.mjs` copied
  `code/` wholesale. They were inert ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the interpreter ignores a `.pyc` whose source no longer matches
  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but a stale `staging.cpython-312.pyc` beside a changed guard is exactly the ambiguity this
  release line must not carry. `assemble.mjs` now excludes `__pycache__` and `*.pyc` at copy time, so
  the outcome no longer depends on someone remembering to delete them.

## [0.4.21] - 2026-10-27

### Changed

- **One backup tree for every engineering product.** Backups land in
  `<workspace>/backups/<product>/<subject>/<UTC stamp>/` with a `backup-manifest.json` naming every
  copied file and its SHA-256: `motionworks` for the `.mwt` and its expanded folder, `l5x` for the ACD
  or L5X, `ftview` for an export folder, `optix` for a Studio project export. Studio 5000 and
  FactoryTalk View take one on request (their writes already produce a new file or folder); Optix has
  the location but no automated action here, because its tree is the prebuilt component. Every skill
  states the same tree and a test fails when one drifts. `<workspace>/_backups` and the pre-0.4.21
  `<workspace>/backups/<project>/<stamp>/` layout are read-only history and are never written.
- **MotionWorks moves its copies into that tree.** `mw_project_open` writes
  `backups/motionworks/<project>/<stamp>/`, and both the bridge (`Get-DirectIdentity`) and the engine
  (`assert_direct_attached`) accept a record that points at the old `.motionworks/attached/backups`
  root, so an existing workspace keeps its verified backup with no migration and no second copy.

### Fixed

- **`pnpm pack` can no longer ship a stale component.** `scripts/assemble.mjs` refuses a component
  whose `lib/` is older than its `src/`, and the release procedure builds the components before
  packing. That is how the 0.4.20 market tarball came to carry the 0.4.16 MotionWorks build under a
  0.4.20 version.

## [0.4.20] - 2026-10-27

### Fixed

- **The bundle no longer ships Python bytecode.** `__pycache__` and `*.pyc` from the MotionWorks
  engine are ignored and excluded, so the tarball contains only the sources the plugin runs.

## [0.4.19] - 2026-10-27

### Fixed

- **Reads without a project name find the attached project.** `mw_get`, `mw_help` and `mw_search`
  resolve the single project with a verified pre-edit backup when no `project` is passed, so the
  direct workflow no longer fails with `NO_PROJECT`. A leftover `.motionworks/stage` copy no longer
  shadows that project, and two attached projects are reported as `AMBIGUOUS_PROJECT` with both names.

## [0.4.18] - 2026-10-27

### Fixed

- **MotionWorks edits no longer demand a body hash the caller had to guess.** `mw_edit_code` with
  `changes` hashes the body it is about to patch when `expected_body_sha256` is omitted; the backup
  and exact find/replace still guard the write, and a supplied hash is still honored.
- **A stale stage no longer makes the direct workflow ambiguous.** When a project has a verified
  pre-edit backup, `singleStage()` now prefers that project over old `.motionworks/stage` copies.

## [0.4.17] - 2026-10-27

### Fixed

- **A direct MotionWorks open was refused as "outside the staging root".** 0.4.13 promised a
  backup-first direct open, but the copy was written to `<workspace>/backups/<project>/<timestamp>`
  while the shipped bridge (`Get-DirectIdentity`) and the read-only engine (`assert_direct_attached`)
  only accept an identity record at `<workspace>/.motionworks/attached/records/<id>.json` naming a
  backup under `.motionworks/attached/backups`. The two never met: `mw_project_open` refused every
  project the retired solo plugin had not already attached, which is why MotionWorks work still looked
  like it required staging. The backup module now writes exactly that layout, verifies the copy before
  writing the identity, and refuses to replace an identity that no longer verifies.
- **A project already open in the IDE could not be edited.** Edits, compile and verify required a
  proven backup and failed with `NOT_ATTACHED` for a workspace project the IDE already had open.
  `mw_project_open` now attaches that project ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â writes the verified backup and reports
  `already_open` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â instead of calling `OpenProject`, because a reload over unsaved editor changes is
  data loss the backup cannot undo. An edit, compile or verify that finds an unattached workspace
  project takes the backup before it refuses.
- **`mw_edit_code` could not be given the hash it demands.** Its precondition is the SHA-256 of the
  saved body, and the tool tells the caller to read `text_body_sha256` from `mw_get`; `mw_get`
  returned the body but no hash, so the hash had to be found elsewhere or guessed and the edit failed
  with "Saved code differs from expected_body/hash". `mw_get` now returns the `text_body_sha256` of
  exactly the body it returns.
- **A read before the open still pointed at staging.** The engine guard's refusal text belongs to the
  retired staging flow and told the caller to stage a copy, which is what sent an agent back into
  staging after it had been removed from the workflow. The engine boundary now translates that
  refusal into `NOT_ATTACHED` with the fix "call `mw_project_open` first"; every other refusal keeps
  its own text.

### Documentation

- `packages/mwi/SKILL.md`: the backup lives under `<workspace>/.motionworks/attached/`, an
  already-open project is attached and not reloaded, and the edit section names the hash `mw_get`
  returns.
- `packages/mwi/README.md`: rows, backup layout, the attach-without-reload path and the guarded read,
  including what the identity check does and does not recompute.
- README: the MotionWorks row, the composition diagram, the tool groups and the safety section
  describe a direct edit. The row-default table and diagram now match the shipped defaults (every
  surface on), which the 0.4.15 release changed but the diagram still showed as off.

## [0.4.16] - 2026-10-27

### Added

- **FactoryTalk Optix OCR is configurable from Plugins.** The `optix` row now
  carries `ocrExecutable`, `ocrLanguage` and `ocrTessdataDirectory`. A configured
  executable registers `optix_ocr`; an empty path keeps OCR off. An empty tessdata
  folder derives `tessdata` beside the executable. OCR still requires the preview
  browser and one matching tab, because it reads the rendered canvas.

### Fixed

- **An empty preview URL no longer breaks `optix_preview` and `optix_screenshot`.**
  A saved blank `previewUrl` or `cdpUrl` now falls back to the loopback defaults
  instead of failing with `Invalid URL`.

## [0.4.15] - 2026-10-27

### Changed

- **Every tool surface ships on.** A fresh install no longer hides the expensive
  halves: L5X gets `editing`, `studio`, `live` and `allowWrites`; MotionWorks IEC
  gets `edit`; FactoryTalk Optix gets live authoring, destructive operations,
  exported-method invocation, the emulator preview and preview input. The defaults
  live in each row's `Config` schema, so the Configure page shows them on and a
  read-only profile can still switch them off.
- Docs, row descriptions and the generated tool reference now describe the
  on-by-default behaviour. `docs/architecture.md`, `README.md`, `cordis.patch.yml`
  and the settings page copy were updated with the schemas.

## [0.4.14] - 2026-10-27

### Added

- **FactoryTalk Optix has a Configure page.** The `optix` row now mounts through
  `entries/optix.js`, which owns a volatile config schema and hands the prebuilt
  `@aryacode/dsh-tool-ft-optix` plugin plain options. Configure can set the Studio
  bridge origins and token, live authoring, destructive operations, exported-method
  invocation, the emulator preview and preview input. Live authoring is on by default from 0.4.15; the Configure page can
  switch it off. Reads work as soon as a project with the Studio bridge is open.
## [0.4.13] - 2026-10-27

### Changed

- **MotionWorks edits the real project again.** `mw_project_open` and `mw_ide_start` now take a
  workspace `.mwt` and work on its files directly. Before the first write they copy the wrapper and
  the expanded project into `<workspace>/backups/<project>/<timestamp>/`, hash every copied file in
  `backup-manifest.json`, verify the copy, and reuse that backup on later attaches. `mw_apply` saves
  in place; there is no sync-back step.
- **Staging is optional.** `mw_project_stage` remains for a sandbox copy, but the skill and tool
  descriptions lead with the direct path.

## [0.4.12] - 2026-10-27

### Fixed

- **The MotionWorks workspace setting was ignored.** `workspace` is volatile, so it arrives as a
  live reference; passing the reference to `configureWorkspace` did nothing. The row now unwraps it
  with `text()`, so the value saved in Configure is the folder the tools search.

## [0.4.11] - 2026-10-27

### Fixed

- **MotionWorks editing tools never mounted even when the switch was on.** A `.volatile()` config
  field reaches `apply()` as a live accessor, so `config.edit === true` was always false and the
  seven edit tools were never registered. Every row now resolves switches through
  `entries/config.js` (`flag`/`list`).
- **Flipping a switch did not take effect until the row was disabled and re-enabled.** The loader
  commits volatile-only changes without re-running `apply()`, then emits `loader/volatile-update`.
  The L5X and MotionWorks rows now mount and unmount their optional surfaces from that event.
- **MotionWorks looked for projects in the profile directory.** The host does not always pass the
  session cwd, so `workspaceOf()` fell back to `process.cwd()`. The row now carries a `workspace`
  setting (shown in Configure) and falls back to the `mwi.workspace` marker in the profile, then the
  process directory. Project discovery follows directory junctions without looping.

## [0.4.10] - 2026-10-26

### Fixed

- **The row settings page sat on "Loading configurationÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦".** The Plugins page snapshots a row's
  configuration form once when it opens and does not subscribe to it, so a form that was still
  loading at that moment never produced the switches. The page now reads the live form from the
  client `configForms` service, whose `get` starts the one describe fetch, and subscribes to it;
  the switches appear when the settings settle, and a row with no configuration says so instead of
  loading forever.
- **The row switches were not served to Settings at all.** The config fields were plain
  `z.boolean()` values, and the settings domain only publishes fields marked `.volatile()`; the
  rows therefore had no settings namespace for the page to bind to. `editing`, `studio`, `live`,
  `allowWrites`, `allowedAddresses`, `ftview.edit`/`studio` and `mwi.edit` are now volatile, so the
  Configure page edits the running row instead of remounting it.

## [0.4.9] - 2026-10-26

### Fixed

- Republished the row settings pages with the client half's declared service list taken from every
  bundled face rather than the two viewer faces. Same pages and same defaults as 0.4.8; this build is
  the installable one.

## [0.4.8] - 2026-10-26

### Fixed

- **The product rows had no settings page.** The bundle's client half never registered a
  `plugins.row.config` entry, so the Plugins page showed no Configure control for `l5x`, `ftview` or
  `mwi`, and the switches the README documents were unreachable without editing the profile patch by
  hand. `scripts/faces/settings.js` now registers one page per row: L5X editing, the Studio 5000 SDK,
  live EtherNet/IP and the two live writes; FactoryTalk View ME edits and the Studio handoff;
  MotionWorks IEC edits. Values are staged and saved through the row's own configuration form, and the
  defaults are unchanged.

## [0.4.7] - 2026-10-25

### Fixed

- **`allowWrites` could not be reached from the L5X row.** The composite entry mounted the live entry
  with no config, so the write switch had no path from the Plugins page. `entries/l5x.js` now declares
  `allowWrites` and `allowedAddresses` and forwards both into the live entry; the write tools still
  refuse without per-call approval.

### Documentation

- README: the safety section states the two keys a live write takes, the tool groups list all seven
  EtherNet/IP tools, and the L5X count is 40 (84 with Optix).
- `docs/examples.md`: a live section covering batch reads, discovery, the controller clock, the trend,
  and a supervised write with the exact fields the reader must see and the refusals they may hit.
- `docs/architecture.md`: a new EtherNet/IP section ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the two workers, the transaction engine's deadline
  and decoding, and the four gates that stand between a write request and a controller.
- `docs/port/l5x.md`: the live surface is recorded as seven tools with the driver call each one uses, and
  the unused capability (CIP subscriptions, UDT `Structure` reads) is named.
- `packages/l5x/README.md`: read and write tool tables, and the full live configuration row.

## [0.4.6] - 2026-10-25

### Added

The EtherNet/IP surface now uses the driver rather than one corner of it. Five new tools, all under the
L5X product row's `live` switch:

- `read_live_tags` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â up to 64 declared scalars in **one** request (CIP tag group) instead of one
  connection-and-read per tag.
- `read_controller_clock` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â controller identity plus the wall clock beside the workstation clock and the
  offset between them; reports "unsupported" on non-L8x models instead of guessing.
- `discover_controllers` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â bounded UDP broadcast discovery: address, product, revision, serial, status.
  Needs no address and no export.
- `write_live_tag` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â one declared scalar, **approval-gated**, then read back over CIP so the result is
  the controller's own value.
- `write_controller_clock` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â set the wall clock (L8x), approval-gated, read back.

### Safety

- Writes need **two** independent switches: the row's new `allowWrites` config (off by default) **and** a
  human approving that exact operation. With `allowWrites` on and a `never` approval policy the tool
  refuses with `APPROVAL_UNAVAILABLE`; a declined prompt is `APPROVAL_DENIED`. Nothing reaches a
  controller before both pass.
- Every write validates against the open export first: declared, not an alias, no array dimensions,
  `ExternalAccess` not `None`, value inside the declared type and range (BOOL boolean; INT/DINT integer
  within range; REAL finite).
- A write whose readback differs from the requested value fails with `WRITE_NOT_VERIFIED` rather than
  reporting success.
- `test/live.spec.ts` covers the gating: switch off, policy `never`, declined prompt, wrong value type,
  and a UDT tag refused as non-scalar ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 70 tests in the package.

## [0.4.5] - 2026-10-25

### Changed

- **FactoryTalk Optix is vendored, so `dependencies` carries no plugin at all.** The Optix tree
  (`lib/`, `bridge/StudioMCPBridge.cs`, `templates/`, `locale/`, `icon.svg`) now lives in
  `packages/optix` and ships under `vendor/optix`; the `optix` row names
  `@aryacode/dsh-engineering/optix`. `@aryacode/dsh-tool-ft-optix` is gone from the manifest, which
  leaves one plugin to install and no component package to publish, keep in sync, or retire.
- The last dependency that remains is Optix's own runtime library, `playwright-core@1.61.1`, declared
  as a plain registry dependency.

One plugin now covers all four products: 5 rows, 79 tools, both previews, no component packages.

## [0.4.4] - 2026-10-25

### Changed

- **One row per product instead of one per surface.** The Plugins page now lists five rows ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â `l5x`,
  `ftview`, `mwi`, `viewers`, `optix` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â instead of sixteen. Each product row mounts its whole surface,
  so one switch turns a product off instead of four.
- **The optional surfaces are the row's config.** `entries/l5x.js` mounts read + guidance and takes
  `editing`, `studio` and `live` (all off by default); `entries/ftview.js` takes `edit` and `studio`
  (both on); `entries/mwi.js` takes `edit` (off). The defaults are unchanged ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a read-only profile
  still pays only for the read surfaces ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but the toggle now lives with the product it belongs to.
- Row ids change from `l5x-read` / `ftview-edit` / `mwi-verify` to `l5x` / `ftview` / `mwi`, so a
  profile's per-row enable state resets once on upgrade. The product-level defaults are identical.
- Legacy subpath exports are kept (`./l5x/read`, `./ftview/edit`, `./mwi/verify`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦) so a profile
  patch that still names one of them keeps working.

### Note

The grouping is plugin-side by choice: `cordis:group` exists in the patch format, but the Plugins
page skips group rows (`plugin-manager/src/index.ts`: "Group rows are containers ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ their children
carry the switches"), so a group switch is a shell feature rather than a bundle one. Collapsing the
row list is what a bundle can do on its own, without a harness change to maintain across DSH
upgrades.

## [0.4.3] - 2026-10-25

### Fixed

- **The vendored rows could not import their own libraries.** The trees under `vendor/` are the
  components' own code, and that code imports `fast-xml-parser`, `fast-xml-validator` and
  `st-ethernet-ip` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but vendoring drops the component manifests, and the bundle declared none of them.
  At mount the loader reported `ERR_MODULE_NOT_FOUND` and every L5X and FactoryTalk View row failed to
  import, taking its tools with them. The bundle now declares all three at the versions the components
  pin, and `test/docs.spec.mjs` fails when a component dependency is not declared here.

## [0.4.2] - 2026-10-25

### Fixed

- **The bundle now installs and mounts in AryaCode.** 0.4.1 fixed the pnpm error, but the install still
  failed one step later, when the profile tried to apply the bundle: the patch's first entry targeted
  the `tool-capability-policy` row, and no such row exists in an AryaCode profile, so composition threw
  `dsh: [@aryacode/dsh-engineering] patch: entry "tool-capability-policy" not found` and the plugin
  manager rolled the install back ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â which is what the market card reported as *Cannot install*.

### Removed

- **The per-skill tool filter.** `policyOnly` / `toolPolicy` / `capabilities` are an AryaAI harness
  feature: AryaAI's fork of `@deepseek-ai/dsh-tool-skill` implements them, and the AryaCode line's copy
  of the same package does not. In this product the layer never filtered anything ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â an older harness
  skipped the missing row with a warning, the current one treats it as fatal. Rows are the switch:
  disabling `l5x-editing`, `l5x-studio`, `l5x-live` or `mwi-edit` unmounts that plugin and removes its
  tool schemas from the request, which is the same context saving by a mechanism this harness has.
- The patch is now **inserts only**, and `test/patch.spec.mjs` fails if any entry targets a row another
  bundle owns.

## [0.4.1] - 2026-10-25

### Fixed

- **The bundle could not be installed.** `dependencies` pointed at the Optix component through a GitHub
  release tarball, and pnpm refuses a URL inside any subdependency:
  `ERR_PNPM_EXOTIC_SUBDEP ... when blockExoticSubdeps is enabled`, which is the default. Every install
  from the market or the registry failed this way. The dependency is now the registry range
  `@aryacode/dsh-tool-ft-optix@0.2.1-rc.3`, which is the same build (its `lib/index.js` is
  byte-identical to the tarball's), so nothing in the bundle changes except that it installs.
- The `optix` row names that package too. The row previously kept the old `@deepseek-ai/` name while
  the dependency was renamed, which would have left the row unable to mount even once the install
  succeeded.
- `test/docs.spec.mjs` now fails when any dependency, optional dependency or peer is a URL, git, file,
  link or workspace spec, so the tarball spec cannot come back quietly.

## [0.4.0] - 2026-10-25

### Changed

- **One package, one client bundle.** The L5X ladder viewer and the FactoryTalk View ME display preview now ship inside `@aryacode/dsh-engineering` itself: `lib/client.js` registers once, under the bundle's own package name, and runs both faces inside that one factory. `@aryacode/dsh-engineering-l5x-viewer` and `@aryacode/dsh-engineering-ftview-viewer` are no longer dependencies, so the bundle declares no `@aryacode/*` dependency at all.
- The `l5x-viewer` and `ftview-viewer` rows collapse into one `viewers` row that mounts the bundle package itself. A client bundle is only discovered through a mounted row, and a package registers exactly one bundle, so both previews mount together; the tool rows stay independent of it.
- The bundle package gains a host half (`lib/index.js`): an entry that registers nothing of its own, present because the Shell scans the client face of packages that a row mounts.

### Added

- `scripts/build-client.mjs` builds `lib/client.js` from the two committed face bundles. The face bodies are copied verbatim, each in its own closure, and the merged plugin exports the union of both faces' services. `pnpm build:client` regenerates the artifact; `pnpm pack` runs it first.
- `test/client-face.spec.mjs` holds the three properties that would otherwise fail silently in the app: the registration id equals the package name, the factory materializes with both faces and merges their services, and `apply` mounts both previews. It also fails when `lib/client.js` is stale against its faces.

## [0.3.0] - 2026-10-23

### Added

- **FactoryTalk Optix as a bundle component:** the `optix` row mounts `@aryacode/dsh-tool-ft-optix` (Studio discovery, live authoring, validation, templates, preview and OCR) from a released component tarball. The standalone tool plugin is no longer a product entry or an installer dependency.
- The bundle now registers 79 tools: the 73 generated reference tools plus six Optix tools. Optix stays unlinked to a skill until one exists.

## [0.2.0] - 2026-10-23

### Added

- **MotionWorks IEC rows:** `mwi-session` (find, stage, open, start, status, worksheet, close), `mwi-read` (overview, list, get, search, references, review, help), `mwi-verify` (compile, diagnostics, saved-source baselines) and `mwi-edit` (code, declarations, structure, block insertion, POU packages, validation, apply), plus the `mwi-read-skill` guidance.
- The redesigned surface is 24 tools over the proven 32-bit COM bridge and the Python saved-model engine. It is verified live against MotionWorks IEC 3 Pro 1.19: stage, start, worksheet, close, saved-project reads, compile diagnostics, code replacement, declaration add, POU create/delete, block insertion and a POU package export/delete/import round trip.
- The edit row is off by default. Edits write only the staged copy and verify unrelated saved and native state.

### Changed

- The bundle is now 73 tools. MotionWorks IEC mounts here instead of as a separate plugin.

Notable changes to `dsh-engineering`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-10-23

### Fixed

- **L5X filesystem contract:** the harness filesystem resolves paths to opaque targets. The session now keeps a target for re-reads and a display path for outputs, so `export_acd_to_l5x`, drafts and SDK tools receive strings again instead of a provider object. Verified against SDK v37: a real ACD exported to a 3.0 MB L5X.
- **FactoryTalk View filesystem contract:** the read, editing and Studio entries adapt composed string paths to the harness target contract, so opening an export, applying edits and Studio discovery no longer pass raw paths to target-based operations.
- Link every L5X tool to the `rockwell-l5x` capability by exact name. The rebuilt tools use descriptive names (`open_project`, `draft_apply`, ...), so the `l5x_` prefix alone did not govern them and their schemas stayed visible when the skill was off.
- Correct the `factorytalk-view` guidance: the editing and Studio entries now exist and are enabled, so the skill no longer calls those operations out of scope.

### Added

- `docs/reference/tools.md` and `tools.json`: a generated reference for all 49 tools, with a test that fails when the committed reference or the policy coverage drifts from the registered definitions.
- `docs/examples.md`: end-to-end sessions for reading, staged edits, SDK verification, supervised controller access, live reads and FactoryTalk View.
- `docs/architecture.md`: the row model, service injection, configuration, client faces, distribution and compatibility.
- Package READMEs for `packages/l5x`, `packages/ftview`, `packages/viewer` and `packages/ftview-viewer`.

### Changed

- Rewrite the README for the current bundle: what it is, the eleven components and their defaults, install, composition, the policy table, tools, requirements, safety and known gaps.
- Add `docs:tools` and `docs:check` scripts; tests now run through tsx so they can read the TypeScript tool factories.

## [0.1.1] - 2026-10-23



- Add the FTView Studio entry `ftview-studio`: `ftview_studio_status`, `ftview_studio_preflight`, `ftview_studio_handoff` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â discovery of installs, schemas, help and the Add Component utility, changed-file preflight with Studio name restrictions, and the ordered manual import plan. No vendor utility is executed.
- Add 6 Studio tests: registration, discovery with a simulated install, absent install, changed-file preflight, unsafe-name blocker and the handoff plan. FTView suite is 26 tests.

- Add the FTView editing entry `ftview-edit`: `ftview_draft_display_set`, `ftview_draft_display_add`, `ftview_draft_tag_upsert`, `ftview_validate`, `ftview_apply` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â one operation per call, text-preserving transforms, re-parsed validation, and apply to a new folder that never touches the source. Row disabled until the old plugin retires.
- Add 8 editing tests: display attribute edit end to end, tag row update, display copy, draft clearing, unknown display, duplicate name, and existing-output refusal. FTView suite is 20 tests.

- Fold the FactoryTalk View display preview into the bundle as `dsh-engineering-ftview-viewer`, mounted by the `ftview-viewer` row (disabled until the old plugin retires, because both claim `.xml` previews).

- Add the FactoryTalk View ME read surface as `dsh-engineering-ftview`: six intents (`ftview_open`, `ftview_list`, `ftview_get`, `ftview_find`, `ftview_check`, `ftview_compare`), 3,557 schema characters, and a 2.5 KB `factorytalk-view` skill. No Python engine; display XML and the tag CSV are parsed in TypeScript.
- Insert `ftview-read` and `ftview-read-skill` disabled until the old FTView plugin retires, because both register the same skill name.
- Add 12 FTView tests: registration, every parameter described, open, list, get, not-found candidates, find, structural checks, compare and skill registration. Design recorded in `docs/port/ftview.md`.

- Fold the L5X ladder viewer into the bundle as `dsh-engineering-l5x-viewer`, mounted by the `l5x-viewer` row. The package carries the copied client source and the built closure-factory artifact re-registered under the bundle name, so the viewer keeps rendering while the standalone `ui-logix-project-viewer` product entry is retired.
- Verified in the dev app: after removing the standalone viewer from `PRODUCT_PLUGINS` and rebuilding, the same L5X document still renders its ladder view from the folded package, and the Plugins page no longer lists the standalone viewer card.

- Retire the old L5X plugin from the dev profile: `dsh-tool-l5x` is removed from its dependencies and its `l5x-tools` and `l5x-skill` patch rows are gone. The composed profile carries only this bundle's rows.
- Verified live after the retirement: the session listed the eleven read tools and the new `rockwell-l5x` description, with no `l5x_*` tool and no old skill text.

- Port the client face: the PLC trend card (`lib/client.js`, 17.2 KB closure-factory bundle) registered for `start_plc_trend`, with its locales, styles and trend model. The card mounts independently of every tool row.
- Record that the old plugin's `face.ts` and `Studio5000.tsx` were dead code ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never imported by its client entry ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â so the two-rung ladder rail is not a ported feature. A ladder viewer for L5X documents would be new work.
- Add `dsh.client` metadata, a `tsdown.client.config.ts` bundle with the package name as its registration id, and the host build now emits both halves.

- Add the `l5x-live` entry: `poll_live_tags` and `start_plc_trend`, 2,971 schema characters, inserted disabled. Reads use the package's polling worker and its own EtherNet/IP connection, so no Studio, FactoryLinx or SDK is required.
- Tags are a real array of flat objects, not the old JSON string: a string is refused with a fix. The trend starts a session-owned job and states that live logic matching the export is unverified.
- Bring the polling worker and the `st-ethernet-ip` dependency into the package, and dispose owned workers when the plugin unloads.
- Add 4 live tests: registration, an undeclared tag, a JSON-string refusal and the trend job refusal. Suite is 60 tests.

- Add the supervised controller tools to `l5x-studio`: `controller_approval_status`, `capture_controller_snapshot`, `go_online`, `read_controller_mode`, `read_live_tag`, `change_controller_mode` and `download_project`. The entry is now 13 tools and 7,901 schema characters, still inserted disabled.
- Port the approval seam as a composition service: the three machine-changing actions refuse with `APPROVAL_UNAVAILABLE` before contacting a controller when the session policy is not `ask`, and proceed only on `allowed-once`. Downloads accept only a `verification_id` this chat produced from a passed build, checked against the built ACD and both L5X hashes.
- `verify_offline_l5x` and `build_acd_from_draft` now return a `verification_id` when the build passed and the review has no blockers.
- Add 4 approval-gate tests: status without the service, status with `ask`, a mode change refused before contact, and a download without a verification id. Suite is 56 tests.

- Add the `l5x-studio` entry with its offline half: `studio_sdk_status`, `studio_capabilities`, `export_acd_to_l5x`, `verify_offline_l5x`, `build_acd_from_draft` and `studio_review_evidence`. 3,914 schema characters, inserted disabled because it needs Studio 5000.
- The entry consumes the read entry's `l5xProjects` service and records ACD exports per chat, so a baseline is accepted only when both the ACD and the L5X hashes still match the export that produced them.
- Verified locally against the installed SDK: an ACD exported to L5X in 29 s, the export reopened by this parser, and a Studio-exported L5X built offline with `offline_build: passed`. The SDK refused to re-import its own export with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`; recorded in the port specification.
- Add 4 studio tests: registration, SDK preflight, capabilities and the unchanged-routine refusal. Suite is 52 tests.

- Add the draft family as its own `l5x-editing` entry: `draft_rung`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member`, `draft_udt_description`, `draft_validate`, `draft_apply`. One operation per call, accumulated per chat and project, validated against the project, then written to one new file.
- The editing entry consumes the read entry's `l5xProjects` service, so a project is opened once for both entries. It is inserted disabled: the read entry stays at 8,107 schema characters and editing costs 7,233 only when enabled.
- Add 7 draft tests: accumulation, argument refusal, validation hash, application to a new file, source preservation, overwrite refusal and draft handles. Suite is 48 tests.
- Update the `rockwell-l5x` guidance for drafting: boundary, one-operation-per-call, validate before apply, and the note that editing may be disabled in a profile.

- Port the `rockwell-l5x` guidance into the package: a 2.9 KB decision tree covering the read workflow, AOI and program scope rules, checks, comparison, reporting limits and revision floors. It is registered by `dsh-engineering-l5x/skill` and mounted as the stable `l5x-read-skill` row; the old 27 KB skill row can stay disabled.
- Add 3 skill tests: registration identity, body budget and frontmatter stripping, and a loud failure when the skills service is missing. Suite is 41 tests.
- Mount the L5X pilot as a bundle component: `cordis.patch.yml` inserts the stable `l5x-read` row, `dsh-engineering-l5x` is a workspace dependency, and the Plugins card lists the component under Engineering. The dev profile no longer inserts the row itself.
- Start the L5X port in `packages/l5x`: four offline read tools (`open_project`, `project_overview`, `list_components`, `get_component`), 2,431 schema characters, every parameter described, results carrying `summary`/`data`/`coverage`/`next`, and failures carrying `code`/`message`/`fix`/`candidates`.
- Add `list_components` because the current 43-tool surface exposes no way to enumerate tags, UDTs, routines or modules; discovery exists only in the legacy twelve-tool API.
- Add the reference cluster: `search_logic`, `find_references`, `trace_dependencies`, `resolve_tag`, `usage_map`. The five tools that answered "where is this used" in the old surface collapse into two named intents plus address resolution and element mapping; the surface is now 9 tools and 6,154 schema characters with 31 of 31 parameters described.
- Complete the offline read surface with `run_checks` and `compare_projects`: findings filtered by rule or severity with review caveats, and a component-level diff that ignores timestamps and XML formatting. The surface is now 11 tools and 7,994 schema characters with 41 of 41 parameters described.
- Document and enforce export revisions: reading accepts any L5X revision 19 or later, flags revisions outside the observed matrix as `untested_revision`, and refuses anything older than 19. The revision-37 floor applies only to a Studio SDK build.
- Add 7 checks and comparison tests, including a real tag-description change and a zero-change comparison, plus 3 revision tests. Suite is 34 tests.
- Scope project handles to the chat that opened them. The first two-chat transcript made the second chat see a handle from the first and fail its listing with `AMBIGUOUS_PROJECT`; handles now live per chat.
- Resolve `AOI_Name::Member` in `trace_dependencies` against the AOI's declaration scope, and refuse an unresolved symbol with `UNRESOLVED_SYMBOL` and the scope fix instead of returning an empty graph. `find_references` coverage now states that external consumers are not visible.
- Add chat isolation, AOI-qualified tracing and unresolved-symbol tests. Suite is 38 tests.
- Document the composed layer, the skill-to-namespace policy, the measured tool exposure, the built-in target composition, the retirement list, and the replacement-map requirement for the flip.
- Record the classification: AryaCode's product catalog lists this bundle as AryaCode-authored with market distribution, so the Plugins page groups it under AryaCode and not Community.
- Record the switch model: a skill is the single per-product switch for guidance and tools, while the client faces (ladder viewer, ME display renderer, DXF viewer) are separate entries that stay mounted. The port shares one isomorphic parser between the host tools and each viewer.
- Specify the L5X port from measured failures: 43 tools, 132 undescribed parameters, nine JSON-in-string parameters, 97 error codes, and the overlapping reference, inspection and drafting clusters. The spec splits the product into `l5x-tools` (default), `l5x-studio` and `l5x-live` (both off), the skill and the independent client.
- Settle the four port decisions: two reference tools rather than one with a mode; `observe_logic` retires; no batch tool; the SDK entry owns the supervised lifecycle and `edit_offline_acd` survives as `build_acd_from_draft`.
- Add `AGENTS.md`: documentation is updated in the same change as the code it describes, diagrams are part of the contract, and known gaps stay explicit.
- Add `test/docs.spec.mjs`, which fails when the README policy table, the documented unlinked namespace, the changelog version heading, or the locale key sets disagree with the patch. Verified to fail on a dropped policy row and on a renamed prefix.

## [0.1.0]

- Add the engineering bundle: a phase-1, additive loader layer that targets the existing `tool-capability-policy` row and links `l5x_*`, `ftview_*` and `mw_*` to the skills that govern them.
- Keep `onDemand: false` so the bundle does not change the product-wide eager tool exposure Arya measured and kept.
- Insert no plugin rows, so existing profiles and product plugin ids are untouched.
