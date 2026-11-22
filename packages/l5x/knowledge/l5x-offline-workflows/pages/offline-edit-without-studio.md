The edit loop without Studio is draft, validate, apply, import.

1. Open the export: l5x_open_project.
2. Read the routine you will change: l5x_get_component with the program and routine names.
3. Stage a change: l5x_compose_rung for a pattern or a structured rung, or l5x_draft_rung with rung text copied from an existing export or written in NeutralText.
4. Inspect the staged operations: l5x_draft_list shows what is pending; l5x_draft_remove_op removes one; l5x_draft_discard throws the whole draft away.
5. Validate: l5x_draft_validate returns a hash, a diff and check findings, and writes nothing.
6. Apply: l5x_draft_apply writes exactly one new L5X file beside the source, never overwriting it and never importing it into Studio.
7. Import the new file in Studio and review the change there.

Every draft operation is a replace, insert or delete of one rung in one routine. Per-op your draft can change a rung comment, append a declaration, or add a structured-text body, FBD sheet or SFC chart; it cannot rename a routine or change a controller property. Those are file-level edits and belong in Studio.

One change per apply is the rule that keeps the diff reviewable. If two changes are independent, apply them as two drafts and compare each one.
