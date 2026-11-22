The Studio 5000 Logix Designer instruction set is documented in the installed help as a set of families. This knowledge collection mirrors that structure with authored pages: one page per family and one page per instruction that ladder edits reach for most often.

Measured structure of the two help installations this package indexes:

- v37.05 help: 5,493 topic pages, of which 902 are instruction pages under help/clinset, spread over 46 family directories.
- v36.00 help: 6,581 topic pages, of which 618 are instruction entries under the Instruction Set root, covering 299 distinct mnemonics in 39 family labels.

The counts are not comparable one-to-one: v37 files instruction pages under clinset with a directory per family, while v36 has flat topic pages with a table-of-contents ancestry. Each help index commits identifiers, titles, sections and relative help paths only. Page text is read from the local installation when a revision is requested.

When to use this collection rather than the installed-help index:

- You are offline with no Studio 5000 installation on this host: use the authored family and instruction pages here.
- You want to know which revision documents an instruction: read instruction-versions.json through the revision-check behaviour, or search the installed-help collection for that revision.
- You are editing and need the family's editing caution: the authored family page names the operand and state traps that matter for that family.

Action recipes:

- contents {collection: "l5x-instruction-families"} lists the sections and every page.
- search {query: "timer preset retained", collection: "l5x-instruction-families"} finds the timer page.
- lookup {term: "MOV"} resolves the exact identifier to the MOVE page.
- read {id: "instruction-abs"} returns the ABS page.
