/**
 * Authored corpus: revision deltas between Studio 5000 Logix Designer v36.00
 * and v37.05, and the rules this product applies when a revision is named.
 *
 * The page counts here were measured from the two installed help trees on a
 * development host and are reproduced each time the knowledge generator runs.
 * They are structural facts about the help index, never vendor prose.
 */

export default {
  id: 'l5x-revision-deltas',
  title: 'L5X revision deltas',
  sections: ['Revisions', 'Instruction spelling'],
  pages: [
    {
      id: 'revision-overview',
      title: 'Which revision a project, a page and a tool call mean',
      section: 'Revisions',
      identifiers: ['REVISION'],
      body: `Three different "revisions" show up when working offline on a Logix project, and mixing them up is the usual cause of a revision finding:

1. The controller major revision (Controller MajorRev in the export). This is what decides instruction spelling: revision 36 and later prefer the IEC-61131 spellings, and an export without a major revision is treated as pre-36.
2. The Studio 5000 Logix Designer release that produced the export (the software revision recorded when the L5X/ACD was written). It selects which installed help is authoritative for documentation answers.
3. The documentation revision a docs call asks for, for example "36.00.00" or "37.05.00". It selects the installed-help collection, and it is what the revision guard compares a page against.

The two installed help trees this package indexes are:

- l5x-help-37-05: Studio 5000 Logix Designer v37.05.00 (CPR 9 SR 16), DITA-produced help, 5,493 topic pages.
- l5x-help-36-00: Studio 5000 Logix Designer v36.00.00 (CPR 9 SR 14), flat-topic help, 6,581 topic pages.

Rules the L5X tools apply:

- A docs search or lookup that names an installed-help collection without a revision answers REVISION_REQUIRED. The tool never silently picks the newest shard.
- A docs search or lookup with no revision searches the authored collections only; those pages are revision-neutral.
- A read of an instruction page whose recorded revision differs from the requested revision answers INSTRUCTION_NOT_IN_REVISION.
- A missing or unreadable instruction-versions.json warns and fails open. The documentation answer degrades; the offline edit is never blocked.

When the question is "can I use this instruction in this project", answer it from the project's Controller MajorRev and the installed help revision together, not from the Studio release number alone.`,
    },
    {
      id: 'revision-36-rename-table',
      title: 'The revision 36 ladder mnemonic rename',
      section: 'Instruction spelling',
      identifiers: ['MNEMONIC RENAME', 'LEGACY MNEMONIC'],
      body: `Logix Designer revision 36 aligned the ladder instruction mnemonics with IEC 61131-3. Programs written before revision 36 use the legacy spellings; a project's Controller MajorRev decides which spelling the composer emits.

The complete legacy-to-current table, from packages/l5x/src/engine/mnemonics.ts:

    legacy  current
    ACS     ACOS
    ASN     ASIN
    ATN     ATAN
    EQU     EQ
    FRD     BCD_TO
    GEQ     GE
    GRT     GT
    LEQ     LE
    LES     LT
    LIM     LIMIT
    MOV     MOVE
    NEQ     NE
    SQR     SQRT
    TOD     TO_BCD
    TRN     TRUNC
    XPY     EXPT

How the tools treat the two spellings:

- A lookup or search accepts either spelling at any revision, so MOV answers for MOVE.
- The instruction catalogue keeps one name per instruction: the name the ladder viewer labels a block with.
- A composed rung emits the spelling the project's revision prefers.
- The review reports a project that mixes legacy and current spellings: it is legal, but it is a maintenance hazard and not what Studio writes.

Because revision 36 help titles use the current spellings, an export opened from a pre-36 project will still show legacy rungs; that is expected, not a mixed-diagnostics defect.`,
    },
    {
      id: 'revision-installed-help-36-vs-37',
      title: 'How the v36.00 and v37.05 installed help differ structurally',
      section: 'Revisions',
      body: `Both installed help trees document the same product, but they are built by different toolchains and their structure differs. These are the measured differences, and they are why the two installed-help indexes are committed separately instead of merged:

v36.00.00 help (flat topic help):

- 6,581 topic records, one flat .htm page per record, no subdirectories for topics.
- A JSON search index (search.json) holding each page's title, url and body text; the body text is deliberately not copied into the committed index.
- A JSON table of contents (toc.json) whose ancestry gives each page its section. Instruction pages sit under "Instruction Set", then a family label such as "Compute/Math Instructions".
- 618 instruction entries with an instruction title, covering 299 distinct mnemonics under 39 family labels.

v37.05.00 help (DITA-produced help):

- 5,493 topic pages, organised as help/clinset (902 instruction pages in 46 family directories), help/rs5000 (3,579 pages in 42 section directories), help/modules (886 pages in 15 module directories), common-content (104 pages) and publications (22 pages).
- A sitemap with 5,380 URLs; it is not a complete inventory (it omits four clinset pages and 86 other content pages), so the committed index enumerates the installed files rather than the sitemap.
- DITA page titles such as "Absolute Value (ABS)"; instruction filenames encode the mnemonic, for example absolute-value--abs-.html.
- 328 instruction mnemonics recovered from page titles and filenames.

Practical consequence: a docs answer about page counts or help structure is revision-specific, and the same instruction can have two different page ids in the two collections. Search both revisions when you are describing a difference; read one revision when you are answering for a project.`,
    },
    {
      id: 'revision-instructions-36-vs-37',
      title: 'Instructions documented in only one of the two revisions',
      section: 'Revisions',
      body: `The committed instruction-versions.json records, per mnemonic, every help revision that documents it. Comparing the two installed help trees yields three useful groups:

Documented in both 36.00.00 and 37.05.00: the everyday ladder set - XIC, XIO, OTE, OTL, OTU, ONS, TON, TOF, CTU, CTD, ABS, ADD, SUB, MUL, DIV, COP, FLL, JSR, SBR, RET, MSG and the comparison instructions.

Documented in 36.00.00 only: the ASCII serial port instructions ABL, ACB, ACL, AHL, ARD, ARL, AWA and AWT. They are real instructions for controllers with a serial port, and the l5x_run_checks rule SERIAL_PORT_INSTRUCTION_UNSUPPORTED refuses them for controllers without one (the 5069 family and the 1756-L8 controllers). The current help no longer documents them, but programs that use them still exist, so the revision map keeps them.

Documented in 37.05.00 only: instructions introduced or documented after revision 36, including DCAF, ISINF and ISNAN. A project at revision 36 that contains one of these is a real finding: either the export was mislabelled or the program was written by a newer release.

Instruction count difference: 299 distinct mnemonics in the v36 flat help versus 328 in the v37 clinset help. The difference is not only new instructions - the two helps file different sub-topic pages under instruction titles, so count differences alone never prove a new instruction exists.

Reproduce the grouping with: read {id: "instruction-versions.json"} is not a page; instead use the adapter revision check, or inspect the committed knowledge/instruction-versions.json in the package.`,
    },
    {
      id: 'revision-project-major-rev',
      title: 'Reading the controller major revision from an export',
      section: 'Revisions',
      body: `The L5X export states the controller major revision in the controller's attributes (Controller MajorRev). The tools treat that value as the source of truth for instruction spelling:

- MajorRev 36 or later: the project prefers the IEC spellings (MOVE, EQ, SQRT, LIMIT, ...).
- MajorRev missing or below 36: the project is treated as pre-36, so legacy spellings (MOV, EQU, SQR, LIM, ...) are what the composer emits and what the review expects to see in existing rungs.

When you open a project, l5x_project_overview reports the controller and the structure; the export's software revision is recorded on the opened snapshot as the revision that wrote the file (observed_parse) or as untested_revision when the export declares a release this build has no measured profile for.

Why it matters for editing: the same authored instruction page answers for both revisions, but the rung you draft will use the project's preferred spelling. If you are preparing a draft that will later be pasted into Studio, take the paste text from l5x_rung_preview: it emits the spelling the target revision expects.

A frequent confusion: the controller major revision and the Studio 5000 release are not the same number. A v37 Studio installation can open projects whose Controller MajorRev is 34, and those projects keep their old spellings.`,
    },
    {
      id: 'revision-export-software-revision',
      title: 'The export software revision and the verification state',
      section: 'Revisions',
      body: `Every opened project carries a software revision and a verification state:

- softwareRevision is the Studio 5000 Logix Designer release the export declares.
- verification is observed_parse when this build has a measured profile for that revision, and untested_revision when it does not.

The practical meaning of untested_revision: the parse still succeeded, the project opened, and the read and draft tools work, but the release has not been measured against this build's ladder and instruction profiles. The review evidence records that difference instead of claiming a verification it does not have.

For documentation questions, the export software revision selects the installed-help collection:

- v36.00.00 exports answer from l5x-help-36-00.
- v37.05.00 exports answer from l5x-help-37-05.

If the host has only one of the two helps installed, a docs call for the other revision answers SOURCE_NOT_INSTALLED with the roots it searched, and the authored revision-delta pages above remain available. That is the intended degradation path: documentation loses revision-specific detail, the edit does not lose its guard rails.`,
    },
    {
      id: 'revision-guard-rules',
      title: 'Revision guard codes and when they apply',
      section: 'Revisions',
      identifiers: ['REVISION_REQUIRED', 'INSTRUCTION_NOT_IN_REVISION', 'REVISION_UNVERIFIED'],
      body: `The revision guard has three answer codes and one repair posture. They are deliberately different because they mean different things to the caller.

REVISION_REQUIRED (docs search, docs lookup, docs read on an installed-help collection)

- Raised when the caller names an installed-help collection but no revision.
- The tool refuses to guess the newest shard: page ids and counts differ between revisions, so a guessed answer would be semi-random.
- Fix: pass the revision, for example "37.05.00", or search the authored collections, which are revision-neutral.

INSTRUCTION_NOT_IN_REVISION (docs read, and the adapter's explicit revision check)

- Raised when the page id names an instruction (instruction-<mnemonic>) and the committed revision map documents that mnemonic only in other revisions.
- Example: read the page for an instruction the v36 help does not document with revision "36.00.00".
- The failure names the recorded revisions so the caller can re-request one of them.
- Fix: read without a revision for the plain authored text, or request a recorded revision.

REVISION_UNVERIFIED (adapter revision check only)

- Raised when the check cannot run: the revision map is missing or unreadable, the mnemonic is not in the map, or the caller named no revision.
- This is a warning, not a refusal. The page is served and the caller is told the check did not run.
- Fix: regenerate the committed corpus, or check the mnemonic with lookup.

Fail-open rule: when knowledge/instruction-versions.json is missing or malformed, the adapter logs one warning naming the artifact and the generator command, then serves instruction pages without a revision check. The documentation answer degrades; a valid offline edit is never blocked.`,
    },
    {
      id: 'revision-check-procedure',
      title: 'Checking an instruction against a project revision',
      section: 'Revisions',
      body: `A short, repeatable procedure for "is this instruction allowed in this project":

1. Read the project. Use l5x_project_overview to see the controller and its structure, and read the export's Controller MajorRev from the opened project, or call read on the export with a text editor if the export is not opened.
2. Pick the documentation revision. Match the Studio release that produced the export: v36.00.00 answers from l5x-help-36-00, v37.05.00 from l5x-help-37-05.
3. Search the installed-help collection with that revision. search {query: "absolute value", collection: "l5x-help-37-05", revision: "37.05.00"} returns the page and its revision-tagged hit.
4. Read the page to confirm the operand shape when you are composing a rung.
5. Apply the spelling rule. If Controller MajorRev is below 36, use the legacy spelling in the draft; from 36, use the current spelling.
6. Run the checks. l5x_run_checks includes the instruction-spelling rule, so a mixed project is reported without a manual comparison.

For a single instruction, the authored page plus the revision map is usually enough: search the authored collection for the mnemonic, read the page, and check the page's revision note. The installed help is needed when you want the vendor's exact operand list for a specific release, and that is precisely the case where the revision must be named.

Do not answer revision questions from the Studio 5000 release number alone. A v37 installation routinely opens projects with older Controller MajorRev values.`,
    },
    {
      id: 'revision-matrix-summary',
      title: 'Revision matrix: worked examples',
      section: 'Revisions',
      body: `Worked cases, each with the answer the tools should give. Use them as a sanity check when a revision finding looks surprising.

Case 1 - legacy spelling in a pre-36 project.

- Project: Controller MajorRev 34, rung contains MOV.
- lookup {term: "MOV"} answers the MOVE instruction page: either spelling resolves at any revision.
- The composer emits MOV for this project, because the project prefers legacy spellings below 36.
- l5x_compare_projects does not report a spelling finding for MOV alone; the finding is a project that mixes MOV and MOVE.

Case 2 - asking the wrong help revision.

- Project: export written by v36.00.00.
- search {query: "message instruction", collection: "l5x-help-37-05"} without revision answers REVISION_REQUIRED.
- search {query: "message instruction", collection: "l5x-help-37-05", revision: "37.05.00"} answers from the v37 pages; the MSG page exists in both revisions, so this is legal but is documentation for the wrong release for this project.

Case 3 - instruction documented only after revision 36.

- Project: Controller MajorRev 36, draft contains ISNAN.
- The revision map records ISNAN for 37.05.00 only.
- The authored page (if present) read with revision "36.00.00" answers INSTRUCTION_NOT_IN_REVISION.
- Correct action: do not put ISNAN in a revision-36 project; rewrite with a comparison or raise the project revision deliberately.

Case 4 - guard artifact missing.

- knowledge/instruction-versions.json is deleted or corrupt.
- The adapter logs one warning and serves the instruction page.
- The documentation answer still works; only the revision check is skipped. This is the fail-open case and must never block an edit.

Case 5 - ASCII serial port instruction on a CompactLogix 5069.

- A draft adds ABL to a program for a 5069 controller.
- l5x_run_checks raises SERIAL_PORT_INSTRUCTION_UNSUPPORTED (critical): Studio rejects the build with RxCMP_E_AUDIT_INVALIDOPTYPE. Move the logic to a controller with a serial port, such as a 1756-L73.
- The instruction is documented in the v36 help only, so a search of l5x-help-36-00 finds it and l5x-help-37-05 does not.`,
    },
  ],
}
