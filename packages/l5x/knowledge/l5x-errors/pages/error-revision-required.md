Meaning: the call named one of the installed-help collections (l5x-help-37-05 or l5x-help-36-00) but did not name a revision.

Why the tool refuses: the two collections have different page ids, counts and titles for the same instruction, and the tool refuses to silently pick the newest shard. A guessed revision would make search results depend on installation order, which is not reproducible.

Fix: pass revision, for example revision: "37.05.00" for l5x-help-37-05 or revision: "36.00.00" for l5x-help-36-00.

If you want a plain search that always works, omit the collection: a search without a revision searches the authored collections only, which are revision-neutral and always present in the package.

If you named the right collection and revision and still got this code, check the argument type: revision must be a non-empty string, and an empty string is treated as absent.
