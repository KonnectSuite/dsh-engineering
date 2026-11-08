---
id: view-graphics-import-export
title: Graphics display XML import and export
domain: view
level: practitioner
basis: [VIEWME-UM004T]
tags: [xml, import, wizard, gfx]
applies_to: [ftview]
rules: [VIEW-IMP-01, VIEW-IMP-02, VIEW-IMP-03, VIEW-IMP-04]
---
## Principle

FactoryTalk View ME documents display XML as a supported interchange format (VIEWME-UM004T Appendix D,
p.455-458): a display is a `<gfx>` document the Graphics Import Export Wizard turns into application
data.

## Rules

- **VIEW-IMP-01** A display document is `<gfx>` root with `<displaySettings />`, numbered object
  elements, `<caption />`, `<imageSettings />`, `<animations>` (`animateVisibility`, `animateColor`),
  `<connections>`, `<confirm>`, `<states>`, `<group>`, `<vbaProject>`; an element with no content is
  self-closing.
- **VIEW-IMP-02** Import is wizard-only: right-click **Displays > Import and Export** in Studio
  Explorer, "Multiple displays batch import file", a `BatchImport_<app>.xml` manifest of
  create/update entries. A create entry fails when the display exists; an update entry fails when it
  does not.
- **VIEW-IMP-03** Export the current displays as a backup before importing, and accept the wizard's
  own backup prompt. When the import ends the wizard opens an import error log text file: that log,
  not a display comparison, is the proof a file landed.
- **VIEW-IMP-04** Write the file with the XML declaration on the first line, UTF-8 or UTF-16; a
  PanelView Plus runtime enforces a licensed display count, so a batch that adds displays can import
  and still refuse to run.

## Apply

Draft displays as XML, package the batch manifest with the import prepare tool, run the wizard, then
read the import error log before opening any display.

## Anti-patterns

Importing without a backup; trusting a green display list while the error log names a refused file;
hand-writing `<gfx>` with non-self-closing empty elements.
