Three different "revisions" show up when working offline on a Logix project, and mixing them up is the usual cause of a revision finding:

1. The controller major revision (Controller MajorRev in the export). This is what decides instruction spelling: revision 36 and later prefer the IEC-61131 spellings, and an export without a major revision is treated as pre-36.
2. The Studio 5000 Logix Designer release that produced the export (the software revision recorded when the L5X/ACD was written). It selects which installed help is authoritative for documentation answers.
3. The documentation revision a docs call asks for, for example "36.00.00" or "37.05.00". It selects the installed-help collection, and it is what the revision guard compares a page against.

The two installed help trees this package indexes are:

- l5x-help-37-05: Studio 5000 Logix Designer v37.05.00 (CPR 9 SR 16), DITA-produced help, 5,493 topic pages.
- l5x-help-36-00: Studio 5000 Logix Designer v36.00.00 (CPR 9 SR 14), flat-topic help, 6,581 topic pages.

Rules the L5X tools apply:

- A docs search or lookup that names an installed-help collection without a revision answers REVISION_REQUIRED. The tool never silently picks the newest shard.
- A docs search or lookup with no revision searches the authored collections only; those pages are revision-neutral.
- A read of an instruction page whose recorded revision differs from the requested revision answers INSTRUCTION_NOT_IN_REVISION.
- A missing or unreadable instruction-versions.json warns and fails open. The documentation answer degrades; the offline edit is never blocked.

When the question is "can I use this instruction in this project", answer it from the project's Controller MajorRev and the installed help revision together, not from the Studio release number alone.
