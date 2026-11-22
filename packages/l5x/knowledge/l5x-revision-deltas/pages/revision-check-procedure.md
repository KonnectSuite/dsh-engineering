A short, repeatable procedure for "is this instruction allowed in this project":

1. Read the project. Use l5x_project_overview to see the controller and its structure, and read the export's Controller MajorRev from the opened project, or call read on the export with a text editor if the export is not opened.
2. Pick the documentation revision. Match the Studio release that produced the export: v36.00.00 answers from l5x-help-36-00, v37.05.00 from l5x-help-37-05.
3. Search the installed-help collection with that revision. search {query: "absolute value", collection: "l5x-help-37-05", revision: "37.05.00"} returns the page and its revision-tagged hit.
4. Read the page to confirm the operand shape when you are composing a rung.
5. Apply the spelling rule. If Controller MajorRev is below 36, use the legacy spelling in the draft; from 36, use the current spelling.
6. Run the checks. l5x_run_checks includes the instruction-spelling rule, so a mixed project is reported without a manual comparison.

For a single instruction, the authored page plus the revision map is usually enough: search the authored collection for the mnemonic, read the page, and check the page's revision note. The installed help is needed when you want the vendor's exact operand list for a specific release, and that is precisely the case where the revision must be named.

Do not answer revision questions from the Studio 5000 release number alone. A v37 installation routinely opens projects with older Controller MajorRev values.
