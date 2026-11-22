# PLC-5 tool error codes and fixes

Every failure is a typed envelope: `ok: false`, the action, and an error with `code`,
`message`, and `fix`. The message names the file or argument; the fix says what to
change. Nothing fails silently and no failure is reported as an empty success.

## The binary `.RSP` readers

| Code | Meaning | Fix |
| --- | --- | --- |
| `PLC5_COM_UNAVAILABLE` | RSLogix 5's automation server is not registered on this machine. | Install RSLogix 5 (32-bit) on the machine, or use the text-export readers for a saved text export. |
| `PLC5_POWERSHELL_MISSING` | The 32-bit PowerShell host the reader drives is not present. | Repair the Windows installation or run the row on a machine with the 32-bit host. |
| `PLC5_OPEN_FAILED` | The vendor server could not open the project. | Check the `.RSP` path and that the file is a complete save; open it once in RSLogix 5 to confirm. |
| `PLC5_NO_PROJECT` | The server opened no project. | The file may not be one RSLogix 5 can read, or the open was refused; confirm the file in the vendor IDE. |
| `PLC5_TIMEOUT` | The hidden read did not answer in time. | Retry once; a modal dialog in the hidden vendor session or a very large project causes this. |
| `NOT_AN_RSP` | The path does not end in `.rsp`. | Pass the saved `.RSP` project; a text export belongs to the text tools. |
| `FILE_MISSING` | No file at the path. | Check the path; same-stem candidates are listed when found. |
| `NOT_A_FILE` | The path is a folder. | Pass the file itself. |
| `ACCESS_DENIED` | The filesystem provider refused the read. | Choose a file this chat can read, or move the project into the workspace. |
| `INVALID_ARGUMENT` | A required argument is missing or malformed. | Pass the named argument; the message gives an example. |

## The text-export readers

| Code | Meaning | Fix |
| --- | --- | --- |
| `UNSUPPORTED_FORMAT` | The extension or the content is not a text export this reader knows. | Pass a `.pc5`/`.txt` export that starts with `PC5 EXPORT <n>`. A `.L5X`, `.RSS`, `.ACH`, or `.RSP` belongs to a different tool. |
| `SOURCE_NOT_INSTALLED` | The file is a binary project container (compound-file magic), not the text export. | Open the project in RSLogix 5 and save the text export, then read that file. |
| `PARSE_ERROR` | A record is malformed; the error carries the line number and the directive. | Fix the line in the exporter and regenerate; do not hand-patch a truncated export. |
| `TRUNCATED_EXPORT` | The export ends before `END` or before a program file closes. | Regenerate the export from the project. |
| `EMPTY_EXPORT` | The file has a header but no program file or data file. | Confirm the export scope covered the program files, then regenerate. |
| `FILE_MISSING`, `NOT_A_FILE`, `ACCESS_DENIED` | Same meaning as above. | Same fixes. |
| `INVALID_ARGUMENT` | Missing path, missing second path for the diff, or a limit outside its range. | Pass the named argument. |

## The docs tool

`plc5_docs` shares the docs failure family used by every docs row:

| Code | Meaning | Fix |
| --- | --- | --- |
| `INVALID_ACTION` | `action` is not `contents`, `search`, `read`, `status`, or `lookup`. | Pass one of the five. |
| `QUERY_REQUIRED` | `search` or `lookup` was called with no query. | Pass the words or the exact identifier. |
| `NOT_FOUND` | No page has the id; the error lists the closest ids. | Read one of the listed ids, or search for the topic. |
| `REVISION_REQUIRED` | The collection is version-specific and the call omitted `revision`. | Pass one of the revisions `status` reports. |
| `INSTRUCTION_NOT_IN_REVISION` | The revision does not carry the item asked for. | Ask without a revision, or check the revision's page. |
| `REVISION_UNVERIFIED` | A vendor-backed collection cannot prove the requested revision. | Use a revision the installed help was verified against. |

A docs failure is never a fabricated page: if the authored collection is absent from
this build, `status` says so and the failure names the sync-and-rebuild fix.

## Reading a failure

1. Read the `code` first; it says which family of problem this is.
2. Read the `fix` next; it is written to be actionable, not decorative.
3. If `candidates` is present, one of them is usually the file you meant.
4. Do not retry a failure that is about the machine (vendor registration, access
   rights, a modal dialog) without changing something; the retry will fail the same
   way.
