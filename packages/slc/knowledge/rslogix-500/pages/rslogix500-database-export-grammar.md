---
id: rslogix500-database-export-grammar
title: RSLogix 500 documentation exports
section: Documentation
identifiers: [.EAS, .ERP, .EIC, .ESG, .CSV, database export, documentation export, symbol, description]
revision: 12.00.00
---

# RSLogix 500 documentation exports

RSLogix 500 can write the project's documentation as a text export rather than the binary project file. These exports are the cleanest offline record of symbols, addresses, descriptions and scopes, and they work on a machine with no RSLogix 500 installed.

## Formats this row accepts

- `.EAS` — address and symbol database export.
- `.ERP` — documentation database export.
- `.EIC` — instruction comment export.
- `.ESG` — rung description or sign-on export.
- `.CSV` — comma-separated export of the same records.
- `.CTD` and plain `.TXT` — tabular dumps with a recognisable header.

`slc500_database` detects the delimiter (tab, pipe or comma) and the column set, and keeps every row as written. A CSV export with a header row is mapped through the header aliases (`address`/`addr`/`tag`, `symbol`/`name`, `description`/`comment`, `scope`/`file`). The vendor writes `.EAS` and `.ERP` without a header, so those two are read from their measured column layouts: `.EAS` is 13 comma-separated cells (address, a reserved cell, symbol, then the description spread over up to four cells, then flags), and `.ERP` is three cells (address or a `RUNG...` reference, title, description text). Rung-description rows in an `.ERP` report are reported as skipped, not as addresses. Any other headerless file is accepted only when its first row starts with something address-shaped; otherwise the answer is `DATABASE_FORMAT_UNSUPPORTED` rather than a guess.

## What the rows mean

Each row pairs an address with a symbol and a description. The address is the authority: it is what the program uses. The symbol and description are documentation that a person wrote, so they can be stale, missing, or duplicated after a copy. Report both and let the operator judge. Scope tells you whether the row belongs to a program file's logic documentation or to a data file.

## Limits and trust

The exports are text, so a corrupt or truncated file can end mid-row; the parser reports warnings and keeps the rows it proved, rather than silently dropping the tail. Values are not always present — an address row does not prove the element's runtime value. Do not treat a documentation export as a substitute for the program logic or for a verified `.SLC` export.

## Cross-check

`slc500_open` can open a project path and an `export` path in one call and compare the two inventories: project name, processor type, program file count, total rung count, symbol count and data-file count. A mismatch is returned as a conflict with both values and both paths named. A match is a cross-check, not a proof that every rung is identical.
