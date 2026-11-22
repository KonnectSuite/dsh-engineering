The edit loop without Studio is draft, validate, apply, import.

1. Open the export: l5x_open_project.
2. Read the routine you will change: l5x_get_component with the program and routine names.
3. Stage a change: l5x_compose_rung for a pattern or a structured rung, or l5x_draft_rung with rung text copied from an existing export or written in NeutralText.
4. Inspect the staged operations: l5x_draft_list shows what is pending; l5x_draft_remove_op removes one; l5x_draft_discard throws the whole draft away.
5. Validate: l5x_draft_validate returns a hash, a diff and check findings, and writes nothing.
6. Apply: l5x_draft_apply writes exactly one new L5X file beside the source, never overwriting it and never importing it into Studio.
7. Import the new file in Studio, review the change there and run Studio's own Verify. There are two file shapes and two import routes, and they are not interchangeable:
   - The file l5x_draft_apply writes is a routine export. In Studio, right-click the program folder, choose Import Routine, pick the file, and confirm Import Configuration with Operation Overwrite. The routine's rungs, rung comments and referenced tags arrive together.
   - A file from l5x_export_rungs is a rung export. In the Ladder Editor, right-click the rung, choose Import Rungs, pick the file, and choose Use Existing, Overwrite, Create (Insert or Append) or Discard. The dialog shows a read-only rung count before it changes anything.
   Import Rungs refuses a routine export with "The specified L5X file does not contain a Rung export" (error 5078-0), so use Import Rungs only with a rung export. Exporting the same rungs from Studio's Ladder Editor (Export Rungs) produces the shape l5x_export_rungs writes.
   Import Configuration reads a rung export's count back as Imported Rungs; on Studio 5000 v37.05 with an existing rung selected, the overwrite/insert operation added the imported rungs after the target rung instead of replacing it, so check the resulting routine (rung count, numbers and comments), remove the superseded rung when the operation appended, and run Studio Verify on the result. Importing into an empty routine avoids the substitution question entirely.

When Studio is online in Remote Run, the import happens through the Online Options and Import Logic dialogs and the online rules are stricter than offline ones. Import Rungs is refused if the routine, or another routine in the same program or phase, already has accepted edits; pending edits in the routine are allowed. The controller is locked against other workstations for the duration of an online import, and the import fails if Studio cannot verify the project afterwards. Pending Edits are not downloaded and survive only as pending edits; Accepted Edits are accepted and downloaded; Finalized Edits are accepted, assembled and downloaded. New tags, UDTs and AOIs are downloaded immediately even if the logic change is later cancelled, and motion objects cannot be added online. A project exported while it has pending edits cannot be re-imported.

An online import is asynchronous to the controller scan, and a failed or cancelled import rolls back the whole change, so import one change at a time and verify after each one.

Every draft operation is a replace, insert or delete of one rung in one routine. Per-op your draft can change a rung comment, append a declaration, or add a structured-text body, FBD sheet or SFC chart; it cannot rename a routine or change a controller property. Those are file-level edits and belong in Studio.

One change per apply is the rule that keeps the diff reviewable. If two changes are independent, apply them as two drafts and compare each one.
