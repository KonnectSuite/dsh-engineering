/**
 * Authored corpus: error codes and fixes.
 *
 * Three layers of errors meet in this product: the stable JSON envelope every
 * tool returns, the L5X package's own tool error codes, and the Studio 5000
 * compiler diagnostics a checker quotes. Each page says which layer it belongs
 * to and what the caller should do next.
 */

export default {
  id: 'l5x-errors',
  title: 'L5X error codes and fixes',
  sections: ['Tool errors', 'Studio compiler errors', 'Evidence gaps'],
  pages: [
    {
      id: 'error-envelope',
      title: 'The failure envelope every tool returns',
      section: 'Tool errors',
      identifiers: ['ERROR ENVELOPE', 'INTERNAL'],
      body: `Every L5X tool returns the same JSON envelope on failure:

    {
      "ok": false,
      "action": "...",
      "error": {
        "code": "TAG_NOT_FOUND",
        "message": "Tag "Start" does not exist in ...",
        "fix": "Call l5x_search_logic to find the tag name, then retry.",
        "candidates": ["Start_PB", "StartPB"]
      }
    }

Rules the envelope follows:

- ok is always false on failure and true on success; a caller checks ok first.
- action names the call that failed, so a multi-call chat answer can match an error to a step.
- code is stable and machine-readable. Do not parse message text; match code.
- message states what happened in one sentence, with the names that matter.
- fix tells the caller what to do next, usually naming the tool or argument to change.
- candidates appears when a near-match exists: the closest ids, tags or instruction names. Use it instead of guessing.
- roots appears on SOURCE_NOT_INSTALLED: the filesystem roots the adapter searched.
- revisions appears when a revision conflict is reported.

Unexpected failures return code INTERNAL with the fix "Retry the call; if it fails the same way, report the message and the arguments used." An INTERNAL code is a defect in this bundle, not a caller mistake: record the arguments.`,
    },
    {
      id: 'error-code-index',
      title: 'L5X tool error code index',
      section: 'Tool errors',
      identifiers: ['ERROR CODE INDEX'],
      body: `The codes the L5X read and edit surfaces raise, grouped by what they mean.

File and project state:

- FILE_NOT_FOUND: the path does not exist or is not readable.
- ACD_CHANGED: the ACD changed under the open snapshot; re-open.
- STALE_EXPORT: the export is older than the ACD or than a verification.
- OUTPUT_EXISTS: an output file or folder already exists; nothing is overwritten.
- PROTECTED_TARGET: the target is source-protected or otherwise not writable.

Lookup and structure:

- TAG_NOT_FOUND, ROUTINE_NOT_FOUND, COMPONENT_NOT_FOUND, TYPE_MISMATCH: the named thing is absent or has the wrong shape.
- NOT_FOUND: generic absence; candidates carry the nearest names.
- UNSUPPORTED_TARGET, INSTRUCTION_NOT_MODELLED, COMPOSER_DEFECT: the target shape is outside what the offline composer models.

Arguments and drafts:

- INVALID_ARGUMENT, INVALID_MODE, INVALID_POLL, MODE_ALREADY_SET: an argument is malformed or a mode conflict.
- INVALID_OPERAND, INVALID_LADDER_SPEC, LADDER_TOO_LARGE, NO_RUNGS: the rung text or its operands are wrong.
- UNKNOWN_INSTRUCTION: the mnemonic is not in the catalogue; candidates list the nearest.
- COMPOSER_DEFECT: the composer produced a defect instead of a rung; report it.

Docs tool codes (from the shared knowledge core):

- INVALID_ACTION, QUERY_REQUIRED, NOT_FOUND for docs lookups.
- REVISION_REQUIRED, INSTRUCTION_NOT_IN_REVISION, SOURCE_NOT_INSTALLED for the knowledge plane.

Read the specific page for the code that is blocking the work; the index exists so a caller can tell which page applies.`,
    },
    {
      id: 'error-instruction-not-in-revision',
      title: 'INSTRUCTION_NOT_IN_REVISION and the revision guard',
      section: 'Tool errors',
      identifiers: ['INSTRUCTION_NOT_IN_REVISION'],
      body: `Meaning: the documentation page being read is an instruction page (instruction-<mnemonic>), and the committed revision map documents that mnemonic in revisions other than the one requested.

Example message: "Instruction TRUNC is documented for revision 37.05.00, but this call asked for "36.00.00"." (The real message names the recorded revision list.)

Why it is a hard refusal rather than a warning: the caller asked for a revision, and serving the wrong revision's documentation as if it were the requested one would be a silent correctness bug in the answer. The failure names the recorded revisions, so the repair is one argument away.

Fixes, in order of preference:

1. Read the page without a revision for the authored text: it is revision-neutral and usually answers the question.
2. Request one of the recorded revisions, named in the error.
3. If the page is returned by search rather than requested by read, search the matching installed-help collection with the correct revision.

Related codes: REVISION_REQUIRED (no revision given for a revision-specific collection) and REVISION_UNVERIFIED (the check could not run; the page is served anyway). The distinction matters: INSTRUCTION_NOT_IN_REVISION is a verified mismatch, REVISION_UNVERIFIED is an admitted gap.`,
    },
    {
      id: 'error-revision-required',
      title: 'REVISION_REQUIRED when a help collection needs a revision',
      section: 'Tool errors',
      identifiers: ['REVISION_REQUIRED'],
      body: `Meaning: the call named one of the installed-help collections (l5x-help-37-05 or l5x-help-36-00) but did not name a revision.

Why the tool refuses: the two collections have different page ids, counts and titles for the same instruction, and the tool refuses to silently pick the newest shard. A guessed revision would make search results depend on installation order, which is not reproducible.

Fix: pass revision, for example revision: "37.05.00" for l5x-help-37-05 or revision: "36.00.00" for l5x-help-36-00.

If you want a plain search that always works, omit the collection: a search without a revision searches the authored collections only, which are revision-neutral and always present in the package.

If you named the right collection and revision and still got this code, check the argument type: revision must be a non-empty string, and an empty string is treated as absent.`,
    },
    {
      id: 'error-source-not-installed',
      title: 'SOURCE_NOT_INSTALLED and the searched roots',
      section: 'Tool errors',
      identifiers: ['SOURCE_NOT_INSTALLED'],
      body: `Meaning: the read targeted an installed-help page, the collection's adapter resolved no local help root, so the page body cannot be read on this host.

What the failure carries: the collection id, the revision that was requested, and error.roots - every filesystem root the adapter searched. That list is the useful part: it tells an administrator exactly which path is missing.

What is still available: the committed index. status reports the collection as index-only, and contents can list its sections and page titles. Only the page body read is unavailable, because shipping vendor page bodies is not allowed.

Fixes:

- Install the matching Studio 5000 Logix Designer help on this host.
- If help is installed in a non-standard place, set the adapter's root override for the revision (L5X_HELP_ROOT_V37_05 or L5X_HELP_ROOT_V36_00).
- If you only need our explanation, search the authored collections instead; they answer without any installation.

Expected default roots: Program Files (x86)/Rockwell Software/Studio 5000/Logix Designer/ENU/v37/Bin/Help/ENU/rs5000 for 37.05, with the same path under Program Files as a fallback, and v36 for 36.00.`,
    },
    {
      id: 'error-unknown-instruction',
      title: 'UNKNOWN_INSTRUCTION and nearest catalogue names',
      section: 'Tool errors',
      identifiers: ['UNKNOWN_INSTRUCTION'],
      body: `Meaning: the rung named an instruction mnemonic that the offline instruction catalogue does not model.

The failure carries candidates: the nearest catalogue names by edit distance. Start from those before assuming the instruction is unsupported.

Three causes, in order of frequency:

1. A typo or a legacy/current spelling confusion: MOV versus MOVE, EQU versus EQ, SQR versus SQRT, LIM versus LIMIT, TRN versus TRUNC. The catalogue accepts both spellings for renamed instructions, so a spelling error here is usually a transposed letter, not a revision issue.
2. An add-on instruction from the project. AOIs live in the project, not in the base catalogue. With an open project, the composer looks them up from the export; without one, l5x_compose_rung cannot know them, and l5x_compose_logic validates against the base catalogue only.
3. An instruction from a newer revision or a different product family that this build does not model. l5x_list_instructions is the authoritative list of what the composer accepts.

Do not invent an operand list for an unknown mnemonic. Read the documentation page for that instruction and the installed help for the exact revision, then decide whether to compose it or to hand the change back to Studio.`,
    },
    {
      id: 'error-invalid-operand',
      title: 'INVALID_OPERAND and the operand slot model',
      section: 'Tool errors',
      identifiers: ['INVALID_OPERAND'],
      body: `Meaning: one operand of an instruction does not match the slot the catalogue declares. The failure names the slot and the reason.

The catalogue models each instruction as ordered operand slots. A slot declares its kind (BOOL, NUMBER, ANY, TIMER, COUNTER, STRING, EXPRESSION, ROUTINE, LABEL or KEYWORD), whether it is optional, the allowed tag types, and its array restrictions. The written order matters: the composer and Studio agree on it, so a swapped operand is a real defect, not a formatting difference.

Common cases:

- a BOOL slot given a numeric tag (XIC on an INT),
- a destination slot given a tag marked readonly,
- an array element index missing where the slot forbids arrays,
- a timer or counter structure slot given an ordinary DINT tag,
- a ROUTINE slot given a quoted string instead of a routine name,
- a literal where the slot requires a tag.

Fix: read l5x_list_instructions for that mnemonic and match the slots in order. The list includes kinds, writable flags, array restrictions and types, which is everything needed to repair the operands without Studio.`,
    },
    {
      id: 'error-tag-not-found',
      title: 'TAG_NOT_FOUND and l5x_resolve_tag',
      section: 'Tool errors',
      identifiers: ['TAG_NOT_FOUND'],
      body: `Meaning: an operand names a tag that does not exist in the open project or in the selected scope.

The failure carries candidates: the closest tag names found in the project. Use them, do not guess a case variation.

What to check:

- controller- versus program-scoped: a tag declared in another program is not visible unless it is controller-scoped, and a controller-scoped tag with the same name as a program tag shadows it in that program.
- an alias versus its base tag: aliases resolve, but an operand that needs a writable tag may not accept an alias.
- an array tag used without an element index, or with an index outside the declared dimension.
- a member of a user-defined type: the member path is part of the tag name and is case-sensitive.

Tools that help: l5x_resolve_tag resolves one name and explains how it resolved; l5x_search_logic searches names and text in the open project; l5x_find_references shows where a tag is used; l5x_usage_map summarises read/write use.

If the tag is genuinely new, declare it with l5x_draft_tag first and validate before composing rungs that use it.`,
    },
    {
      id: 'error-rung-not-output',
      title: 'RUNG_NO_OUTPUT: the rung never drives the right rail',
      section: 'Studio compiler errors',
      identifiers: ['RUNG_NO_OUTPUT', 'RxCMP_E_AUDIT_INVALIDOPTYPE'],
      body: `Meaning: the rung ends in an instruction that reads the rung condition but never drives the right power rail. Studio refuses to build such a rung and the offline check reports it with severity warning and confidence high.

Typical shape: a rung whose last instruction is a compare, a MOV, a TON or a JSR that is not followed by an output coil; or a branch where only one path ends in an output.

Why Studio is strict: ladder rungs are evaluated for their side effect, and a rung with no output is almost always a drafting mistake - the instruction was meant to be conditional on the rung, not to be the rung's result.

Fix: end the rung with an output instruction (OTE, OTL, OTU, or an instruction that writes a destination such as MOV or ADD used as the intended side effect), or move the rung's work into a branch that does drive the rail.

The offline rule exists so a draft fails before it becomes a file. l5x_run_checks reports the same condition as a finding, so a legacy export with no drafts can be reviewed for it too.`,
    },
    {
      id: 'error-serial-port-instruction',
      title: 'Serial port instructions on controllers without a serial port',
      section: 'Studio compiler errors',
      identifiers: ['SERIAL_PORT_INSTRUCTION_UNSUPPORTED'],
      body: `Meaning: the logic uses one of the ASCII serial port instructions on a controller family that has no serial port. Studio rejects the build with RxCMP_E_AUDIT_INVALIDOPTYPE.

The serial port instruction set: ABL, ACB, ACL, AHL, ARD, ARL, AWA, AWT.

Controllers without a serial port: the 5069 CompactLogix family and the 1756-L8 ControlLogix family, matched by controller type prefix in the offline rule.

Fix: move the serial-port logic to a controller that has a serial port, for example a 1756-L73, and pass the data to the other controller over an existing network connection. Do not attempt to emulate a serial port in ladder.

The offline rule reports severity critical, because Studio will refuse the build; the finding is a certainty, not a style opinion. The same instruction set is documented only in the v36.00 help, so a pure v37.05 documentation search will not find these instructions - use the authored page or the v36 collection.`,
    },
    {
      id: 'error-jsr-without-return',
      title: 'JSR without a return path, and SBR outside the first rung',
      section: 'Studio compiler errors',
      identifiers: ['JSR_WITHOUT_RETURN', 'SBR_NOT_FIRST', 'RxCMP_E_AUDIT_INVALIDNOOFOPS'],
      body: `Two related routine-structure refusals.

JSR_WITHOUT_RETURN (critical): the ladder calls a routine with JSR, but the called routine has no RET that can return. Studio rejects a JSR with no return operand with RxCMP_E_AUDIT_INVALIDNOOFOPS.

Two repairs:

- write JSR(Sub,0) to declare that the routine is called without parameters and returns normally, or
- add the RET the routine is missing.

The correct choice depends on whether the routine's last rung is reachable; a conditional RET that is never true is still a missing return path.

SBR_NOT_FIRST (warning): the called routine contains SBR, but SBR is not the first rung. Studio requires the subroutine header to open the routine.

Fix: move SBR, and any SBR parameters, to the first rung of the routine.

Offline, both findings are reported by l5x_run_checks against the export, and l5x_draft_validate reports them on a draft. They are structure errors, so fix them before applying a draft; they are not suppressible style findings.`,
    },
    {
      id: 'error-import-export',
      title: 'Import, export and stale-file errors',
      section: 'Tool errors',
      identifiers: ['STALE_EXPORT', 'ACD_CHANGED', 'OUTPUT_EXISTS'],
      body: `The file-lifecycle errors, and what each one protects.

STALE_EXPORT: the export is older than the ACD, or older than the verification record. Studio and the tools both refuse to treat a stale export as the project's current logic. Fix: re-export and re-open.

ACD_CHANGED: an ACD changed after the snapshot was opened. The open project handle cannot be trusted to match the file. Fix: re-open the file; do not patch the snapshot.

OUTPUT_EXISTS: a write target already exists. l5x_draft_apply, l5x_document_project and the studio builders never overwrite: an existing file or folder means the caller must choose a new path. Fix: choose a new name; overwriting a previous deliverable is not a retry, it is data loss.

FILE_NOT_FOUND and PROTECTED_TARGET: the path is absent or not writable. For a protected routine or program the fix is in Studio (source protection is a project property), not in the file.

VERIFICATION-related refusals: l5x_download_project requires a verification_id from l5x_verify_offline_l5x. Passing a draft hash where a verification id is expected answers a mode error; re-run the verification.

A useful habit: keep the exported L5X and every generated deliverable in separate directories, and delete stale deliverables by hand rather than asking a tool to overwrite them.`,
    },
    {
      id: 'error-evidence-gaps',
      title: 'Evidence gaps: what a passing check does not prove',
      section: 'Evidence gaps',
      identifiers: ['COVERAGE', 'UNVERIFIED'],
      body: `Offline checks prove statements about the file. They do not prove statements about the plant. The review evidence carries this distinction as coverage.unverified.

What a passing l5x_run_checks does prove:

- the rungs parse and drive the right rail,
- the instructions exist in the catalogue and their operands have the right kinds and counts in the written order,
- the structural rules hold (SBR first, JSR returns, no serial port instruction on a controller without one),
- the instruction spelling matches the project revision,
- I/O differences against a supplied baseline are reported.

What it does not prove:

- that a MSG path, a drive connection, an I/O module connection or a produced/consumed tag actually exists on the network,
- that a motion path is physically reachable and safe,
- that safety logic placement satisfies a site's certification,
- that an HMI faceplate event is wired as intended,
- that the program does what the process intends.

Any answer that says "verified" must say verified how. The honest phrasing is: "the offline checks pass for these rules; the following items remain unverified" and then name them. Anything else overstates the evidence and is exactly the failure the review tools are meant to prevent.`,
    },
  ],
}
