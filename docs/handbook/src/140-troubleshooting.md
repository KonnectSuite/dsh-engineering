---
title: Troubleshooting
order: 140
purpose: The first checks when a row, tool, bridge or built artifact is missing.
audience: Anyone stuck
---

## A row or tool is missing

1. **Check whether the row is switched on.** PLC-5 and SLC 500 ship off by default; a profile that switched a row off gets no tools from it. The settings face reports the mounted rows. (The ECAD row that earlier releases shipped off has been retired; its drawing preview remains on the viewers row.)
2. **Check the build.** The tools come from the installed bundle version. `package.json` names the version; the workbench shows it. A profile that kept an older copy of the bundle shadows the new payload.
3. **Check the product install.** Product rows need their vendor software for parts of their surface: Studio ME for FTView export/import, Studio 5000 plus the SDK for L5X builds, Optix Studio for the bridge, MotionWorks IEC for the IDE path, RSLogix 5 for the PLC-5 vendor path. A capability or status tool names what is missing; a read path that parses files may still work.

## A documentation lookup fails

- `SOURCE_NOT_INSTALLED` means the vendor help the collection describes is not on this machine. The error names the roots it searched; install the help or use the authored corpus.
- `NOT_FOUND` carries the closest ids. The page exists in the index only if the vendor help was indexed at build time.
- `REVISION_UNVERIFIED` and `INSTRUCTION_NOT_IN_REVISION` are honesty guards, not failures to work around. Name the revision or accept the generic page.

## The generator fails

`python scripts/gen-handbook.py --check` verifies the Markdown sources and built artifacts. Common causes:

- a page is missing `title`, `order`, `purpose` or `audience` front matter, or two pages share an order;
- the built files are stale relative to the sources (run the generator);
- PDF rendering cannot find Chrome or Edge. The HTML and DOCX still build; the PDF step exits with a message naming the missing browser.

## A preview is blank

A drawing or display preview renders a local file. A blank face usually means the file did not parse, the display is empty, or the browser needed for PNG rendering is missing. SVG output needs no browser; PNG does.

## A vendor step is pending

The bundle produces plans and drafts; Studio and the IDE still act. If the next step is "open Studio and use the import wizard", that is expected, not a failure. The handoff tool lists the exact steps.

## Reporting a problem

Include the row, the tool, the error code, the version and what was installed. The error envelope's `fix` field usually names the next check; the product page's limits section says whether the case is known.
