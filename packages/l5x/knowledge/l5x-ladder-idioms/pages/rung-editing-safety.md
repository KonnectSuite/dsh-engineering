Most offline-editing defects are not syntax errors; they are behaviour changes that parse cleanly. A short procedure that catches them:

1. One rung per operation. A draft that replaces one rung is easy to compare; a draft that touches several is easy to mis-review.
2. Keep the original rung text. l5x_draft_rung refuses an undriven rung, but only l5x_compare_projects shows what the rung used to be.
3. Read the tags before the rung: l5x_resolve_tag and l5x_find_references tell you whether the bit you are about to drive is already written elsewhere.
4. Prefer named patterns over hand composition for known idioms: the composer's patterns are the tested shapes.
5. Validate before apply, and keep the validation hash with the review note.
6. Record unverified items: a message path, a drive connection or a safety placement is not proven by a parse.
7. Re-open the generated file and run l5x_open_project plus l5x_run_checks on it; that closes the loop on the file actually written.

Common accident to avoid: replacing just the tag name in a copied rung changes the addressed bit but leaves the rung comment describing the old tag. Update the comment in the same operation.
