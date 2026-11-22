# Display workflow: graphic displays, display settings and runtime navigation

<!-- section: Authoring; identifiers: graphic display, display settings, Gfx folder, display type, display navigation -->

A **graphic display** is one screen in an ME application. Every display is one file
in the application's `Gfx` folder: `<display name>.gfx`. The file is a binary OLE
compound document, so it cannot be reviewed as text. The text form appears only
when the display is exported as XML through the Graphics Import Export Wizard.

## Creating and editing a display

1. In the Studio Project explorer, open **Displays** and double-click a display, or
   right-click and choose **New**.
2. The Graphics editor draws on a fixed canvas. Set the display size before placing
   objects; a resize after the objects exist moves them but can also change
   alignment and anchored edges.
3. Place objects from the object toolbar or drag images and global objects onto the
   canvas. Every object has a Properties dialog box with tabs: General, Connections,
   Label, States (buttons), Common and, for alarm-aware objects, Alarm.
4. Set the display's own properties: size, background color, and navigation
   behavior. Display properties are not object properties, and a display export
   carries both.
5. Save, then test with **Test Display**. Test Display runs the display against the
   development tag database; it does not prove controller connectivity.

Displays are identified by name. A name is unique within an application, and a
display that is in use by a navigation object (Goto Display, Display List
Selector) must be updated in those objects if it is renamed.

## Display settings that change behavior

- **Display type** — a display can replace the current display or open on top of
  it. An on-top display is a dialog: it can be closed and returns to the display
  underneath. A replace display is a new page and the previous display is gone.
- **Size** — the runtime shows the display at its designed size. Displays larger
  than the terminal's screen are clipped; displays smaller are centered unless the
  terminal is configured otherwise.
- **Background color** — one color for the whole display. Images and objects draw
  over it.
- **Navigation button, Goto Display, Display List Selector** — these carry display
  names. A display list selector points at a **display list**, not directly at a
  display, so renaming a display also means checking the list.
- **Security** — display-level security codes run at runtime and can hide a whole
  display from an account that lacks the code.

## The display/export relationship

The `Gfx` folder is the authoring truth. A display XML export is a projection of
one display at one moment:

- Export writes one XML file per display, named after the display, plus the batch
  file `BatchImport_<application>.xml` that lists them. The measured export in
  `export-import` is the shape to expect.
- The XML preserves objects, their properties, their connections and the display
  settings. It does not preserve anything the XML schema does not model, and it
  does not round-trip unknown future object types.
- Importing a display XML creates objects or updates objects according to the
  chosen import type; see `export-import` for `importType` and the two modes.
- Editing the XML and importing it changes the display in the application. The
  binary `.gfx` is rewritten by Studio at import, so a byte comparison of `.gfx`
  files before and after is not a useful verification; re-export and compare the
  XML instead.

## Runtime navigation as designed versus as found

At runtime the display changes because of three things: a navigation object was
pressed, a display list selector was moved, or a command or expression changed the
display. All three ultimately resolve to a display name. When reviewing a
navigation problem, check the display names in the project first: a missing name
usually means a renamed display, and a list that behaves differently from the
button that opens it usually means the list was updated but the display was not,
or the reverse.

Displays also have a runtime **display ID** in diagnostics and in some command
arguments. The display ID is derived from the display, not from its position in a
list; do not hard-code it in a procedure without reading it from the project that
will be deployed.
