---
title: FactoryTalk View ME and SE
order: 40
purpose: Read ME exports, author displays against the installed schema, prove an import, and know where SE help fits.
audience: HMI engineers
---

## The product row

FactoryTalk View ME is a product row; the generated tool reference counts its tools and is the count of record. Its read path works on a Studio ME text export: it copies the display XML, the HMI tag CSV when Studio exported one, and the alarm XML into a new folder, then reads them. It never decodes the native `.med`/`.mer`, never contacts a PanelView terminal, and never launches Studio to answer a read.

The row needs Studio ME on Windows for three things only: listing applications, producing an export, and the import wizard at the end. A read session needs just an export folder. SQL Server Express and `sqlcmd` are optional, for tag snapshots. Chrome or Edge is needed only for PNG rendering; SVG needs none.

## Where SE help fits

FactoryTalk View SE is not a separate product row in this bundle. Its installed help is a **documentation source**: the knowledge plane indexes the SE help pages that Studio installs and parses their bodies locally when a documentation tool reads one. Nothing from the SE help tree is shipped, and a missing SE install produces `SOURCE_NOT_INSTALLED`, not a broken page.

## First session

1. `ftview_apps` lists the applications Studio knows.
2. `ftview_export` copies a fresh export into a new folder and records whether the alarm and tag files are fresh, stale or missing.
3. `ftview_open` opens the export; `ftview_check` looks for unbound tags, missing images and alarm setup problems, and lists checks it did not run.
4. `ftview_object_types` reports the schema versions installed; `ftview_render` draws displays to SVG and, with a browser, PNG, reporting objects off-canvas or overflowing.

## Draft, import, prove

Draft tools write a new export folder. A draft writes the schema attributes the export declared - ME 17 in the recorded case; an ME 10-16 display declares a different `Gfx-ME*.xsd`, so validation reports the declared version first and refuses to pretend it is ME 17. `ftview_apply` writes text files only; it does not rewrite binary `Images/`.

To get the draft into Studio: `ftview_studio_handoff` returns the ordered steps, the Studio Graphics Import Export Wizard imports `BatchImport_<app>.xml`, and `ftview_verify_import` re-exports and compares the imported result object by object. Building the `.mer` and downloading it to a terminal remain Studio steps.

## Limits recorded at 0.103.0

- One ME export has been measured on the recorded host; other ME versions, a second application, PanelView terminals and the Studio import step remain unmeasured.
- The alarm decoder reads 34 of 66 applications measured on that host; the rest fall back to the wizard snapshot and write the reason into export warnings. Tag decoding succeeds on 64 of 66.
- The ApplicationManagerServer backup path fails with "Class not registered" for ME, so the bundle claims no ME backup.
- `ftview_check` is structural, not an XSD validation.
- A missing alarm or tag file means the export did not carry it, not that the application is broken.

## What this row will not claim

It will not decode native project files, touch a terminal, automate the Studio import, or promise that an export copied yesterday describes the application running today. The snapshot's age is reported, and stale means stale.
