# What an XML export cannot prove

<!-- section: Limits; identifiers: XSD, schema, PLC binding, runtime behavior, coverage, re-import -->

Every claim this knowledge collection makes about a FactoryTalk View application is
read from one of two places: our own operator knowledge, or a file the application
produced. The second kind is evidence only for what the file actually contains. The
distinction matters in reviews, because an export folder looks more authoritative
than it is.

## The projection is not the store

Studio stores each display as a binary `.gfx` file (OLE compound document). The XML
file produced by the Graphics Import Export Wizard is a projection of that display
into a documented interchange format. That means:

- objects and properties the export format does not model are absent from the XML;
  their absence is not evidence that they are absent from the application;
- a later Studio version can export a property the older schema did not have, and a
  reader built for the older schema will not see it;
- the `.gfx` file is rewritten by Studio on import, so comparing `.gfx` bytes before
  and after import does not tell you what changed; compare re-exported XML instead.

## Things a display XML cannot establish

- **XSD validity.** The XML is only proven to match the installed `Gfx-ME*.xsd`
  schema if a validation step ran against that schema. An export from Studio is
  usually valid by construction; a hand-edited file is not, until validated.
- **PLC binding.** A connection expression names a tag. The XML proves the display
  references that name, not that the tag database defines it, that the controller
  has a matching tag, that the data type matches, or that the controller is
  reachable.
- **Tag database completeness.** Displays reference a subset of the tags. A tag
  that no display references can still be used by alarms, macros, recipes or
  another application; the display export cannot prove a tag is unused.
- **Alarms, recipes, security and project settings.** None of these are in the
  display export. Alarm configuration lives in `M_Alarms/MachineAlarms.mal`,
  recipes in the `RecipePlus` folder, security in the project's accounts, runtime
  behavior in `ProjectSettings`. A review that cites only display XML has not looked
  at them.
- **Runtime behavior.** The XML says what the display is configured to do, not what
  the terminal does. Handshakes, timing, display replacement, language switching
  and security codes all execute at runtime.
- **Visual result.** Images, fonts, colors and gradients are approximate in any
  static preview. A missing font or image produces a layout the XML cannot show.
- **Global object resolution.** A reference object is stored in the normal display;
  the base object is in the global object display. The XML of one display does not
  prove the other exists in the loaded application.

## What does prove things

| Claim | Evidence |
|---|---|
| The import landed | Re-export the display and compare the object graph; `ftview_verify_import` exists for exactly this |
| The display matches the installed schema | Run a schema validation against the installed `Gfx-ME*.xsd`; report whether it ran |
| The tag exists | Tag CSV, tag snapshot from the `.MDF` database, or the Tags editor | |
| The application compiles for the terminal | `.mer` creation completed without validation errors |
| The terminal runs this build | ME Transfer Utility compare is green |
| The display behaves as intended | A runtime test on the target or an equivalent test terminal |

## How to report the boundary

State what was read and what it proves, for example:

- "Read the display export folder (65 display XML files, 8 global object files) and
  the tag CSV. The displays reference 214 tags; all 214 are defined in the CSV. Not
  proven: controller tag types, schema validity (no validation run against the
  installed XSD), and runtime behavior."
- "Compared the re-exported XML with the exported input: no object differences.
  This proves the import round-tripped; it does not prove the display runs on the
  terminal."

Honesty here is not hedging. A report that says "the export is correct" when only
the XML was read invites a download that fails on the terminal, and the failure
will be traced back to the review. Say what was checked and what was not, and list
the outstanding proof as a next step.
