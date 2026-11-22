# Errors and fixes: diagnostics, validation reports, CSV status codes and runtime error causes

<!-- section: Diagnostics; identifiers: error code, status code, diagnostics list, validation report, CSV export, 701, 700 -->

Most ME problems show up in one of four places: the FactoryTalk Diagnostics log,
the runtime validation report, a tool's own status code, or the error-state
behavior of a graphic object. Read the source before changing the display; the
same symptom has different fixes depending on where it was reported.

## CSV export status codes

CSV export (alarm history, audit trail, diagnostics) reports a numeric status. The
value and the fix are:

| Code | Meaning | Fix |
|---|---|---|
| 0 | Initial state, nothing exported yet | Wait for the export to finish |
| 100 | Another export of alarm/audit/diagnostics data is in progress | Let it finish; a second export is blocked until then |
| 200 | Export completed successfully | Nothing to do |
| 700 | Insufficient disk space | Free disk space on the target, retry |
| 701 | Path or address does not exist, or contains invalid characters | Remove `\ / : * ? " < > |` from the path, confirm the drive exists, retry |
| 702 | File name contains invalid characters | Remove the same character set from the file name, retry |
| 703 | CSV file is missing | Check the drive or network address, retry |
| 704 | Unknown error | Retry; if it persists, capture the diagnostics log for support |

Code 701 and 702 are almost always a Windows path problem, not an HMI problem.
Check the path before rebuilding anything.

## Chart and ChartEx ActiveX runtime errors

Chart and ChartEx objects report a separate code range in the diagnostics log:

- 0 — no error.
- 1000 — all DataSeries are invisible; the chart has nothing to draw.
- 1001 — the fixed-axis DataSeries is invisible.
- 1002 — DataSeries 1 through 8 are invisible.
- 1003 — the number of data points exceeds 500; reduce the visible range.
- 1010 — the X-axis minimum is greater than its maximum.
- 1011 — the Y-axis minimum is greater than its maximum.
- 1100–1103 — warnings: every point lies beyond the X or Y axis maximum/minimum.

A chart that draws nothing is usually a 1000–1002 code or a 1010/1011 axis
configuration; look up the code before replacing the object.

## Validation report problems at .mer creation

- **Errors** block the `.mer`: unresolved tag or object references, unsupported
  features for the chosen ME Station version, over-limit display or alarm counts.
  The report names the object and the reason. Fix the project, do not force the
  build.
- **Warnings** allow the `.mer` but may misbehave at runtime: converted global
  object references on versions without global-object support, fonts that will not
  be on the terminal, features only partly supported for the target version. Read
  the warning list and record which ones were accepted.
- The report is written next to the `.mer` as
  `<application name>ValidationResults.txt`; it is the same content shown in the
  dialog, so it can be attached to a handoff.

## Runtime error causes for graphic objects

Most display-side errors are logged against the object that declared them:

- **Latched push button** — a state value too large for the tag's data type, or
  outside the tag's minimum/maximum, is not written; the state does not change and
  an error is logged. Example: a PLC-5 `N7:0` integer accepts −32,768…32,767, so a
  state value of 2,147,483,647 fails silently. A value connection that matches no
  state value, or an unassigned Value or Handshake connection, puts the button in
  its error state and prevents the latch.
- **Alarms** — an alarm error is logged when the trigger connection is a string,
  when "Message to Tag" is true but no tag is assigned, when a message on an
  analog/digital connection contains non-numeric text, when an analog message value
  is outside the tag's range, or when a digital message value is neither 0 nor 1.
- **Macros** — problems reading the macro file or expression, writing to a tag, or
  communicating within the project or its data source are logged; successful
  reads/writes log information messages. Macros are not guaranteed to run in list
  order, so a sequence that depends on the order can fail even when each macro is
  correct.
- **Local message displays** — a message file renamed without updating the objects
  that use it leaves the object pointing at an old file. The display then shows the
  object but no message.

## First checks, in order

1. Read FactoryTalk Diagnostics, filtered to the runtime or the terminal, and the
   validation report. The error name is usually in the message text.
2. Find the object named in the message and compare its connections with the tag
   database: unresolved tag, wrong data type, range mismatch.
3. If the tag is unresolved, check the tag database (and its CSV or snapshot) for
   the exact name, including folder parts.
4. If the tag exists and the controller is reachable, check the controller-side
   type and value, not just the HMI tag.
5. Only after those: change the display. Rebuilding a display because a tag is
   missing makes the same error appear again after download.
