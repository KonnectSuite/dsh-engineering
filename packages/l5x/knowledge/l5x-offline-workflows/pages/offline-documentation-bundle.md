l5x_document_project writes a documentation bundle to a NEW folder. It never writes the export itself, and it never overwrites an existing folder.

The bundle contains:

- a project summary,
- the I/O list,
- tag CSVs,
- every program's rungs with their comments,
- a decoded FBD and SFC view,
- one file per add-on instruction,
- a printable report.

Call shape: l5x_open_project, then l5x_document_project with the destination folder and the parts wanted. Use it as the handover artifact when a reviewer needs the logic without Studio; the printed report is the part intended to be read on paper.

Because it writes a folder, treat the destination as a deliverable path: pick an empty or new directory, and do not point it at the export directory.
