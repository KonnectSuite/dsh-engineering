# Migration error codes and fixes

Every failure from this row is a typed envelope, not a stack trace: `ok: false`,
an action, and an error with `code`, `message`, and `fix`. The codes tell you whether
to change the call, the file, or the plan.

## Tools of the row

| Code | Raised by | Meaning | Fix |
| --- | --- | --- | --- |
| `INVALID_ARGUMENT` | All tools | A required argument is missing or malformed. | Pass the named argument; the message names it and gives an example. |
| `FILE_MISSING` | Assessment, lint, read, compare, report | No file at the path. | Check the path; when a same-named file exists in the folder, the failure lists candidates. |
| `NOT_A_FILE` | The same readers | The path is a folder. | Pass the file itself, not the folder that holds it. |
| `ACCESS_DENIED` | The same readers | The filesystem provider refused the read. | Choose a file this chat can read, or move the export into the workspace. |
| `UNSUPPORTED_FORMAT` | Assessment, lint, compare, report | The extension is not the format that tool reads. | Use `migration_assess` for `.RSS`/`.ACH`/`.SLC`/`.RSP`, `l5k_lint` for `.L5K`, and pass the right file to compare and report. |
| `PLAN_MISSING` | `migration_plan` | There is no plan file at the path. | Create one, or pass the path of the existing plan. |
| `PLAN_UNREADABLE` | `migration_plan` | The plan file exists but is not valid schema-1 JSON. | Restore the file from its last good copy; the tool never overwrites an unreadable plan. |
| `PLAN_UNWRITABLE` | `migration_plan` | The plan path cannot be written. | Choose a writable workspace path; do not retry the same path. |
| `INVALID_DECISION` | `migration_plan` | A decision value is not one of the accepted values. | Use one of the values the error lists (`offline_build`, `sequence_test`, `golden_part` for acceptance). |
| `REPORT_EXISTS` | `migration_report` | The report path is already used. | Pick a new report name; keep the signed report. |
| `REPORT_UNWRITABLE` | `migration_report` | The report could not be written. | Choose a writable directory and retry once. |
| `INTERNAL` | All tools | An unexpected failure. | Retry once; if it persists, report the message with the arguments used. |

The vendor-backed reader (`slc_read`) uses its own family, because its failures come
from RSLogix 500 and the 32-bit automation server: `SLC_COM_UNAVAILABLE`,
`SLC_OPEN_FAILED`, `SLC_NO_PROJECT`, `SLC_READ_FAILED`, `SLC_TIMEOUT`,
`SLC_POWERSHELL_MISSING`, `SLC_NO_ANSWER`, `SLC_BAD_ANSWER`, `SLC_FILE_MISSING`. A COM
failure is an installation fact on the machine; a timeout is often a modal dialog in
the hidden vendor session. The fix names which.

## Lint and audit rule names

These appear inside successful reports as rule names, not as error codes. Treat them as
the vocabulary of the findings tables:

- `.L5K` lint: `TRAILING_COMMA`, `ROUTINE_PAREN`, `DUPLICATE_TAG`,
  `TAG_NAME_TOO_LONG`, `PLACEHOLDER_TAG`, `INDIRECT_ADDRESS`,
  `REVISION_BELOW_TARGET`, `ROUTINE_UNBALANCED`.
- Wizard audit: `MODULE_NAME_ILLEGAL`, `LEGACY_CHASSIS_DECLARED`,
  `WIZARD_ANALOG_DEFAULT`, `MODULE_UNNAMED`, `WIZARD_ARTIFACT`,
  `RESIDUAL_MARKERS`.
- Comparison: `ROUTINE_MISSING`, `SYMBOL_MISSING`, `DATA_FILE_UNMAPPED`,
  `ROUTINE_ADDED`, `RUNG_SPLIT`, `RUNG_LOST`, `INDIRECT_LEFT`,
  `NO_ROUTINE_MATCHED`.

## The docs tool

`migration_docs` has its own small failure family, shared with every docs row:

| Code | Meaning | Fix |
| --- | --- | --- |
| `INVALID_ACTION` | `action` is not `contents`, `search`, `read`, `status`, or `lookup`. | Pass one of the five. |
| `QUERY_REQUIRED` | `search` or `lookup` was called without a query. | Pass the words or the exact identifier. |
| `NOT_FOUND` | No page has the id, and the error lists the closest ids. | Read one of the listed ids, or search for the topic. |
| `REVISION_REQUIRED` | The collection is version-specific and the call omitted `revision`. | Pass one of the revisions `status` reports. |
| `INSTRUCTION_NOT_IN_REVISION` | The revision does not carry the instruction asked for. | Check the instruction's revision, or ask without a revision for the general page. |
| `REVISION_UNVERIFIED` | A vendor-backed collection cannot prove the requested revision. | Use a revision the installed help was verified against. |

A docs failure is never a fabricated page. If the collection is absent from this build
(status `absent` or `index-only`), the tools say so and name the fix rather than
returning empty text.
