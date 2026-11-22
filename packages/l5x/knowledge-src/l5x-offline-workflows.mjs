/**
 * Authored corpus: editing, comparing and verifying L5X exports without
 * Studio 5000. Every workflow names the tool that performs the step, so a
 * caller can go from a question to an action without a manual.
 */

export default {
  id: 'l5x-offline-workflows',
  title: 'Offline L5X edit, compare and verify workflows',
  sections: ['Workflows', 'Exports', 'Checks'],
  pages: [
    {
      id: 'offline-editing-overview',
      title: 'What can be done offline, and what cannot',
      section: 'Workflows',
      identifiers: ['OFFLINE EDIT'],
      body: `The L5X tools work on an exported L5X file, not on the online controller. What they can do offline:

- open and inspect an export (l5x_open_project, l5x_project_overview, l5x_list_components, l5x_get_component),
- find logic and tags (l5x_search_logic, l5x_find_references, l5x_trace_dependencies, l5x_resolve_tag, l5x_usage_map),
- compose and stage a change (l5x_draft_rung, l5x_compose_rung, l5x_compose_batch, l5x_draft_validate),
- apply a validated draft to ONE new L5X file beside the source (l5x_draft_apply),
- compare two exports by engineering component (l5x_compare_projects),
- run evidence-backed checks (l5x_run_checks),
- write a documentation bundle (l5x_document_project),
- describe instructions and search help (l5x_list_instructions, l5x_docs).

What they cannot do offline:

- import the edited file into Studio or download it to a controller. l5x_draft_apply writes a new file; importing it is a Studio step.
- prove that a message path, a drive connection or an I/O module connection actually exists. Those are recorded as unverified coverage items.
- change safety logic state on a live controller. Safety findings must be resolved before a draft is applied, and writes to a live controller are out of scope for offline tools.

The rule of thumb: offline the tools can prove what the file says and what the editor would refuse; they cannot prove what the plant does. Say so in the answer - the review evidence already distinguishes the two.`,
    },
    {
      id: 'offline-open-and-inspect',
      title: 'Open an export and inspect its structure',
      section: 'Workflows',
      body: `The first call on any export is l5x_open_project. It reads the file once, parses it, and returns the project handle plus a structure summary. Every other tool reads that handle, so opening the same file twice is wasted work.

    l5x_open_project {path: "C:/exports/line3.L5X"}

Then inspect:

- l5x_project_overview: controller, tasks, programs, component counts and the limits that apply.
- l5x_list_components: the document's components, one row each, with type and name.
- l5x_get_component: one component's full structure, for the routine or tag you are about to edit.

The opened snapshot records the export's software revision and verification state. Read them: an untested_revision project is still readable, but the review evidence should say the release has not been measured.

If the file is an ACD rather than an L5X, it must be exported first. The studio tools do this when the SDK is available (l5x_export_acd_to_l5x); without Studio, the answer is that an ACD cannot be read offline and the work must start from an L5X export.`,
    },
    {
      id: 'offline-edit-without-studio',
      title: 'Editing logic without Studio 5000',
      section: 'Workflows',
      body: `The edit loop without Studio is draft, validate, apply, import.

1. Open the export: l5x_open_project.
2. Read the routine you will change: l5x_get_component with the program and routine names.
3. Stage a change: l5x_compose_rung for a pattern or a structured rung, or l5x_draft_rung with rung text copied from an existing export or written in NeutralText.
4. Inspect the staged operations: l5x_draft_list shows what is pending; l5x_draft_remove_op removes one; l5x_draft_discard throws the whole draft away.
5. Validate: l5x_draft_validate returns a hash, a diff and check findings, and writes nothing.
6. Apply: l5x_draft_apply writes exactly one new L5X file beside the source, never overwriting it and never importing it into Studio.
7. Import the new file in Studio and review the change there.

Every draft operation is a replace, insert or delete of one rung in one routine. Per-op your draft can change a rung comment, append a declaration, or add a structured-text body, FBD sheet or SFC chart; it cannot rename a routine or change a controller property. Those are file-level edits and belong in Studio.

One change per apply is the rule that keeps the diff reviewable. If two changes are independent, apply them as two drafts and compare each one.`,
    },
    {
      id: 'offline-draft-to-apply',
      title: 'From a staged draft to a new L5X file',
      section: 'Workflows',
      body: `The draft lifecycle, in the order the tools enforce it:

- l5x_draft_rung appends a replace/insert/delete operation. It refuses a malformed rung, a rung that does not drive the right rail, a wrong operand count or type, and an unresolved tag. Nothing is written at this point.
- l5x_compose_rung composes one validated rung from a structure or one of the named patterns. It also writes a ladder preview document under .l5x-preview/ so a human can see what was composed, and the project stays untouched.
- l5x_compose_batch is all-or-nothing: if one rung in the batch is invalid, none are staged.
- l5x_draft_validate checks the accumulated draft against the open project and returns the hash, the diff and the findings. It writes nothing.
- l5x_draft_apply requires a validated draft. It writes ONE new file beside the source with a new name, never the source, never an overwrite, never a controller connection.

Practical rules:

- Re-open the project after applying if you are going to validate the new file: l5x_draft_apply returns the new path, and l5x_open_project on that path is the next step of a re-edit loop.
- Drafts are per session. A process restart loses the draft; the validated hash is the only durable record.
- A draft that reports an unverified coverage item still applies, but the answer must carry the unverified item into the review, not drop it.`,
    },
    {
      id: 'offline-compare-exports',
      title: 'Compare two exports by engineering difference',
      section: 'Checks',
      body: `l5x_compare_projects answers "what changed in the logic", not "what changed in the file text". It compares two opened exports by engineering component and deliberately ignores:

- export timestamps in the file header,
- XML formatting and attribute order,
- Studio-added defaults such as built-in data types and the embedded Local module,
- release patch revision strings,
- diagram node ids and structured-text padding.

That is what makes a comparison useful: a re-export of the same project with no logic change compares equal, even though the files differ byte for byte.

Call shape: open both files, then l5x_compare_projects with both project handles (pass a baseline where the tool offers one). Read the result as a list of component-level differences: added, removed, changed routines and tags, with the changed rungs named.

Common false signals to explain rather than "fix":

- a controller property difference that only the newer Studio writes (release patch revision),
- an embedded Local module the editor added on save,
- a data type that moved because the editor reordered it.

Document the filter in the comparison output so a reviewer does not re-open the two files to verify the claim by hand.`,
    },
    {
      id: 'offline-verify-checks',
      title: 'Run checks and read the findings',
      section: 'Checks',
      body: `l5x_run_checks runs the evidence-backed rules this build implements against an open export. Each finding carries the rule id, severity and the reason, and the answer names the coverage: what was checked, and what could not be checked offline.

The rules that catch most editing mistakes:

- a rung that never drives the right rail (RUNG_NO_OUTPUT),
- an instruction that reads the rung condition but is used as an output,
- a JSR whose routine has no return path and an SBR that does not open the first rung,
- a serial-port instruction on a controller without a serial port,
- a tag written by more than one instruction, and a latch with no writer of its clear path,
- a mixed instruction spelling against the project revision,
- FBD wiring and SFC chart structure,
- I/O changes against a baseline export when a baseline_id is passed.

How to read the result:

- severity critical: Studio itself would refuse to build this; fix before applying.
- severity warning: valid file, review hazard. Decide and record the decision.
- coverage.unverified lists what the tool could not prove; carry it into the answer.

Passing l5x_run_checks is not proof that the plant is safe. It is proof that the file's own rules hold.`,
    },
    {
      id: 'offline-documentation-bundle',
      title: 'Write a documentation bundle from an export',
      section: 'Exports',
      body: `l5x_document_project writes a documentation bundle to a NEW folder. It never writes the export itself, and it never overwrites an existing folder.

The bundle contains:

- a project summary,
- the I/O list,
- tag CSVs,
- every program's rungs with their comments,
- a decoded FBD and SFC view,
- one file per add-on instruction,
- a printable report.

Call shape: l5x_open_project, then l5x_document_project with the destination folder and the parts wanted. Use it as the handover artifact when a reviewer needs the logic without Studio; the printed report is the part intended to be read on paper.

Because it writes a folder, treat the destination as a deliverable path: pick an empty or new directory, and do not point it at the export directory.`,
    },
    {
      id: 'offline-rung-preview',
      title: 'Turn composed logic into Studio-pasteable text',
      section: 'Exports',
      body: `l5x_rung_preview returns two things for one rung: a paste_text in Studio's copy format, and a minimal L5X preview document.

The paste text is what makes the tool practical: Studio accepts rung text as space-separated mnemonics and operands, with parallel branches bracketed as BST/NXB/BND. Paste text from l5x_rung_preview into Studio's ladder editor and the rung appears as composed.

It needs neither an open project nor an L5X file when the rung is given directly; with an open project it can resolve tag names and apply the project's instruction spelling.

Limits to state when handing paste text to a human:

- the preview document is a preview, not an export: it is for viewing and pasting, not for importing as a project.
- paste text does not carry the rung comment; add the comment separately in Studio.
- the paste text uses the target revision's spelling, so do not mix paste text generated for two different revisions in one rung.`,
    },
    {
      id: 'offline-compose-logic',
      title: 'Compose logic without a project at all',
      section: 'Workflows',
      body: `l5x_compose_logic is the chat-only composer: it needs no L5X and no ACD, validates syntax and the instruction catalogue, and writes nothing. Use it when the answer is "here is the rung you should write" and the caller has not exported a file yet.

Two input styles are accepted:

- structured, from a named pattern or a rung specification;
- rung text, in NeutralText such as XIC(Start) XIC(Run) XIO(Stop) OTE(Run); or in Studio paste form.

Named patterns the composer knows: start_stop_latch, fault_latch, ton_delay, interlock, analog_scale, totalizer, run_hour_meter. A pattern encodes an idiomatic, tested rung shape; prefer it over hand-writing the same logic.

What it validates: rung syntax, operand count and type against the instruction catalogue, branch structure, and that the rung drives the right rail. What it does not validate: that a tag with that name exists in your project - that requires an open project and l5x_draft_rung.

Because it writes nothing, it is the safe first step in a chat that may end with a suggestion rather than a file.`,
    },
    {
      id: 'offline-acd-export',
      title: 'Getting an L5X from an ACD with the Studio SDK',
      section: 'Exports',
      body: `An ACD file cannot be read offline by this bundle. When Studio 5000 and its SDK are installed on the host, the studio tools can export one:

1. l5x_studio_sdk_status confirms the SDK is reachable and names its version.
2. l5x_studio_capabilities lists what this build can ask the SDK to do.
3. l5x_export_acd_to_l5x exports the ACD to an L5X file.
4. l5x_verify_offline_l5x re-checks the exported L5X and returns a verification id.
5. l5x_build_acd_from_draft asks the SDK to build an ACD from the draft, for the review loop.

The verification id matters: l5x_download_project requires a verification from l5x_verify_offline_l5x, so an unverified draft cannot be pushed online by accident.

Without the SDK: studio_* tools answer that Studio is not installed or the SDK is unavailable. The offline path still starts from an L5X export produced on another machine - the tools never guess an ACD's contents from its name or size.`,
    },
    {
      id: 'offline-troubleshooting',
      title: 'Troubleshooting an offline edit that will not apply',
      section: 'Workflows',
      body: `The message tells you which layer refused the edit. Work down this list before changing anything.

Draft refused (l5x_draft_rung / l5x_compose_rung):

- unknown instruction: read l5x_list_instructions and use the mnemonic the catalogue lists; the failure names the nearest catalogue names.
- wrong operand count or type: read the operand slots for that instruction in l5x_list_instructions; Studio and this bundle agree on the written order.
- rung does not drive the right rail: end the rung in an output instruction.
- unresolved tag: the tag must exist in the open project; use l5x_resolve_tag or l5x_search_logic to find the real name.

Validate refused (l5x_draft_validate):

- the finding names the rung and rule. Fix the draft, do not force the hash.
- a safety finding must be resolved; there is no override for safety placement.

Apply refused (l5x_draft_apply):

- the draft was not validated in the current session: validate first.
- the output name already exists: l5x_draft_apply never overwrites; choose a new name.

File refused (l5x_open_project):

- the file is not an L5X export (an ACD, an XML fragment, a zipped export): get a real export.
- the file exceeds maxFileBytes: raise the configured limit deliberately, do not truncate.
- the export declares a release this build has no measured profile for: it opens as untested_revision, not as an error.`,
    },
  ],
}
