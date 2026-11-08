---
id: view-alarm-xml
title: Alarm setup XML export, edit, import
domain: view
level: practitioner
basis: [VIEWME-UM004T]
tags: [xml, alarms, import, wizard]
applies_to: [ftview]
rules: [VIEW-ALMX-01, VIEW-ALMX-02, VIEW-ALMX-03]
---
## Principle

The alarm setup is a supported XML document (VIEWME-UM004T Appendix C, p.452-454): root `<alarms>`,
exported from **Alarms > Alarm Setup > Import and Export**, edited as text, imported back.

## Rules

- **VIEW-ALMX-01** Import replaces the entire alarm configuration, so export the current setup as a
  backup file in the same folder before importing an edited one.
- **VIEW-ALMX-02** Export in the current language, and write the file with the XML declaration on the
  first line, UTF-8 or UTF-16; the wizard checks well-formedness before it reads a single alarm.
- **VIEW-ALMX-03** The import ends by opening an import error log text file. Read it: an alarm whose
  expression, tag, or handshake is refused is named there, and the alarm list shows nothing about it.

## Apply

Snapshot the live setup to XML, draft changes against that text, import through the wizard with the
backup exported, and prove the result from the import log.

## Anti-patterns

Editing an exported alarm file and importing it over a live setup with no backup; assuming a silent
import succeeded; mixing alarm XML from an older language export into the current application.
