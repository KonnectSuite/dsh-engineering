The codes the L5X read and edit surfaces raise, grouped by what they mean.

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

Read the specific page for the code that is blocking the work; the index exists so a caller can tell which page applies.
