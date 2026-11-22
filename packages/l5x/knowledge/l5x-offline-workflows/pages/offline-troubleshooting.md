The message tells you which layer refused the edit. Work down this list before changing anything.

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
- the export declares a release this build has no measured profile for: it opens as untested_revision, not as an error.
