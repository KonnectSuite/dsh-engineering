The file-lifecycle errors, and what each one protects.

STALE_EXPORT: the export is older than the ACD, or older than the verification record. Studio and the tools both refuse to treat a stale export as the project's current logic. Fix: re-export and re-open.

ACD_CHANGED: an ACD changed after the snapshot was opened. The open project handle cannot be trusted to match the file. Fix: re-open the file; do not patch the snapshot.

OUTPUT_EXISTS: a write target already exists. l5x_draft_apply, l5x_document_project and the studio builders never overwrite: an existing file or folder means the caller must choose a new path. Fix: choose a new name; overwriting a previous deliverable is not a retry, it is data loss.

FILE_NOT_FOUND and PROTECTED_TARGET: the path is absent or not writable. For a protected routine or program the fix is in Studio (source protection is a project property), not in the file.

VERIFICATION-related refusals: l5x_download_project requires a verification_id from l5x_verify_offline_l5x. Passing a draft hash where a verification id is expected answers a mode error; re-run the verification.

A useful habit: keep the exported L5X and every generated deliverable in separate directories, and delete stale deliverables by hand rather than asking a tool to overwrite them.
