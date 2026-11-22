# Tag handling: the HMI tag database, tag types and tag placeholders

<!-- section: Data; identifiers: HMI tag, tag database, tag placeholder, parameter file, parameter list, device tag, memory tag -->

An ME application's **HMI tag database** holds the tags the application reads and
writes. It is created empty with the application and is edited in the Studio Tags
editor, also called the tag database editor. On disk it is a SQL Server Express
database under the application's `TAG` folder (`<application>.MDF` plus log file and
the `.cac/.crc/.ctl` control files), which is why a tag database cannot be read or
repaired with a text editor.

## Tag types

ME distinguishes three HMI tag types, and the type decides what a display can do
with the tag:

- **Analog** — a numeric tag with an optional range: temperature, pressure, flow,
  position, counters. Analog tags are the ones that can carry scale and offset
  conversions and analog alarms.
- **Digital** — any numeric tag read as a two-state value: 0 is False, any nonzero
  value is True. Switches, contacts, relay states, interlock bits. Digital alarms
  attach to digital tags.
- **String** — an ASCII string tag, at most 82 characters, used for barcode
  scanner input, product codes and operator-entered text.

Two more words appear constantly but are **data sources**, not types: a **device
tag** addresses a controller (through the configured communications path), and a
**memory tag** lives only in the runtime's memory. Both can be analog, digital or
string. Do not call a tag a "device type" tag.

System tags exist in every application and report runtime facts (for example the
current user name or the display number). They are not editable and do not count
against the tag database limits.

## Names, folders and expressions

- A tag name can be up to 255 characters, using letters A–Z, digits 0–9, the
  underscore and the dash. Mixed case is preserved but comparison is
  case-insensitive.
- A backslash separates folder parts: `tanks\oil\temperature` is a tag named
  `temperature` in folder `oil` in folder `tanks`. Folders exist to organize the
  database; they are part of the name, not a separate object.
- A dash in a name is an operator in an expression. To reference such a tag, use
  braces: `{N33-0}`. A wildcard in braces matches a set: `{alarm*}`.
- The Tags editor also creates folders and sets each tag's name, data type, data
  source, scaling and alarm configuration. Alarm limits belong to the tag; the
  alarm summary and banners read them from there.

Practical naming rule: choose a plant → machine → device folder hierarchy and keep
it. A flat database of several thousand tags is unmaintainable in the Tags editor
and in an export CSV.

## Tag placeholders and parameter files

A **tag placeholder** is the text `#` followed by a number from 1 to 500, placed in
a tag name or in part of one. At runtime the placeholder is replaced by a tag name
supplied through a **parameter file** (an ordered list of tag names) or a
**parameter list** (the first tag becomes `#1`, the second `#2`, and so on).

- A placeholder need not be a whole tag name. It can stand for a folder part, or a
  device-number suffix, which is how one display family is reused across several
  identical machines.
- Placeholders work with global objects, on both base-object connections and
  reference-object connections whose `LinkConnections` is False.
- They are used by the startup display, the logout / goto / display-list-selector
  displays, the auto-logout project setting and the Global Connections Display tab.
- Placeholders cannot be tested in Test Display Mode, and they cannot be used in
  macros. Test them on a terminal or with the runtime, not in the editor.
- A placeholder that the runtime cannot replace produces an error in the
  diagnostics list. "The display opened with a blank tag" is usually an unreplaced
  placeholder, not a communications failure.

## Limits worth checking before a design is accepted

- At most **40,000 alarmable tags** per HMI server, of which at most **10,000 are
  analog**.
- Each display can reference at most **1,000 expressions or tags**. A display that
  hits the limit usually does so through a large multi-state indicator or a long
  alarm banner list.
- A string tag holds at most 82 characters. A longer barcode or message is
  truncated.

## Importing and exporting tags

The Tags editor imports PLC tags from a controller's tag database and exports the
HMI tag database to CSV for review or bulk editing. The CSV export is a text
projection: it carries names, types and data sources, but it is not the database.
Importing a CSV that was edited by hand rebuilds the affected tag definitions;
verify the result by exporting again and comparing, not by assuming the import
applied. A tag snapshot taken from the `.MDF` database (through the
`dbo.AllTagsView` view) is a second, independent reading of the same data and is
useful precisely because it does not depend on the CSV path.

Deleting a tag does not delete the objects that reference it: their connections
become unresolved. Search the project for the tag name before deleting it, and
afterwards check the validation report for unresolved connections.
