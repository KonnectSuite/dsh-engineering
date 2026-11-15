# NetLogic tasks and the page that answers them

Find the page by the task in the request, not by guessing a slug. Every page in this directory appears twice below: once under the task that needs it, once in the index at the end.

## The phrases requests actually use

The pages below are written in their own vocabulary; a request rarely uses it. When the words in the request are not on the page, this list is the translation:

- "alarm banner", "alarm list", "acknowledge an alarm", "shelve an alarm" -> [Alarms](./alarming.md)
- "trend", "history", "log a value over time" -> [Trends](./trends.md)
- "read a tag", "write a tag", "poll a tag", "watch a tag" -> [Field tags](./plc-tags.md)
- "log in", "log out", "who is logged in", "idle timeout", "session" -> [Sessions](./sessions.md), [Users, groups and roles](./users-groups.md)
- "save a recipe", "load a recipe", "recipe values" -> [Recipes](./recipes.md)
- "popup", "dialog", "confirm a command" -> [Dialog boxes](./dialog-boxes.md)
- "grid", "table of values", "list of rows" -> [Data grids](./datagrids.md)
- "colour changes", "lamp turns red", "animate", "blink" -> [UI animations](./ui-animations.md), [Advanced SVG](./advanced-svg.md)
- "walk the model", "find a node", "query nodes" -> [Queries](./queries.md)
- "heartbeat", "poll every second", "background job", "timer" -> [Asynchronous tasks](./async-tasks.md), [Threading](./threading.md)

## Start here: lifecycle and conventions

- Decide whether a snippet belongs in a page NetLogic or a global one — [NetLogic overview](./netlogic-overview.md)
- Know when `Start()` and `Stop()` run, in what order, and what a 2-second `Start()` costs — [NetLogic Lifecycle](./netlogic-lifecycle.md)
- Match the naming and project conventions the plant's projects already use — [Good practices](./good-practices.md)

## Alarms and events

- Create a digital or analog alarm at runtime and bind it to a tag — [Alarms](./alarming.md)
- Handle UI and variable events from NetLogic (low-level in parts) — [Events handling](./events.md)
- Fire an event into the Optix core (low-level, unsupported) — [Triggering events to the FactoryTalk Optix core](./dispatch-events.md)

## Trends and history

- Add a pen to a trend and point it at a variable — [Trends](./trends.md)

## Reading and writing PLC tags

- Read or write a field tag, or force it to read or write the controller — [Field tags](./plc-tags.md)
- Watch value changes with an OPC/UA observer (low-level, unsupported) — [OPC/UA Observers](./register-observers.md)
- Import tags while the application is running (TwinCAT, RA EtherNet/IP) — [Run time import of PLC tags](./runtime-tags-import.md)

## Importing tags and building from the CLI

- Import a tag set from a TwinCAT or RA EtherNet/IP project file, design time only — [Design time import of PLC tags](./designtime-tags-import.md)
- Package an application for an OptixPanel over USB from a script — [FactoryTalk Optix Studio CLI](./fto-studio-cli.md)

## Sessions, login and users

- Count the runtime sessions or impersonate one — [Sessions](./sessions.md)
- Create a user, set a password, assign a group or role — [Users, groups and roles](./users-groups.md)
- Attach a CFR21 audit signature to a variable — [Audit Signature (CFR21 workflow)](./audit-signature.md)

## Recipes

- Work with recipe schemas and their values — [Recipes](./recipes.md)
- Use the 1.7+ recipe module instead of the legacy recipe objects — [RecipeX](./recipex.md)

## Dialogs, grids and lists

- Open a DialogBox, show information and gather input — [DialogBox](./dialog-boxes.md)
- Read the selected row's column values from a DataGrid — [Data grids](./datagrids.md)
- Address a nested struct or array member by index path — [ElementAccess](./element-access.md)

## Colours, animation and SVG

- Build a `Color` from a named, RGB or ARGB value and set opacity — [Colors](./colors.md)
- Animate a value with an easing curve, sequentially or in parallel — [UI Animations](./ui-animations.md)
- Redraw an SVG at runtime without touching the InformationModel — [Advanced SVG image](./advanced-svg.md)

## Walking the node tree and querying the model

- Get a node by path, by generic type or by search, and know which one you want — [Accessing project nodes](./accessing-project-nodes.md)
- Understand node kinds and the difference between the design node and a session instance — [The Information Model](./information-model.md)
- Manipulate nodes through the low-level API (unsupported) — [Manipulate Optix nodes](./manipulate-nodes.md)
- Load an application or read device state from the System object (runtime only) — [The system object](./system-node.md)

## Creating elements, links and aliases

- Create a panel, a variable or a custom object and add it to the tree — [Creating elements](./creating-objects.md)
- Instantiate a Template Library object or type by script — [Template Library](./template-library.md)
- Bind two variables with a dynamic link and choose the direction — [Dynamic Links](./dynamic-links.md)
- Create a variable and interact with it — [Variables interaction](./variables-interaction.md)
- Point one faceplate type at many motors with an alias — [Managing Aliases](./managing-aliases.md)

## Data types, structures and formatting

- Read or write a Struct variable, including arrays of structs — [Variables structures](./variables-structure.md)
- Convert and zero-pad a value for display — [Variables formatting](./variables-formatting.md)
- Attach or read engineering units on an analog variable — [Engineering Units](./engineering-units.md)
- Strip or validate characters in a string — [Regex](./regex.md)

## Timers, threads and async work

- Understand the dispatch pool, per-object affinity and what may run where — [FT Optix Runtime – Threading Model](./threading.md)
- Run asynchronous work from a NetLogic — [Asynchronous tasks](./async-tasks.md)

## MQTT, OPC/UA and serial links

- Publish and subscribe over MQTT (runtime only) — [MQTT](./mqtt.md)
- Read and follow the references of an OPC/UA node — [OPC/UA](./opcua.md)
- Load a companion specification so vendor types resolve — [Companion Specifications](./companion-specs.md)
- Talk to a serial device through the SerialPort driver — [Serial port](./serial-port.md)

## Database access

- Insert, update or delete rows through the Store APIs — [Database Interaction](./database-interaction.md)
- Run a query and read the result rows (runtime only) — [Database queries](./queries.md)

## Reports, translations and resources

- Generate a report and act on the result code — [Reports](./reports.md)
- Assign a translation key to a text property — [Translations](./translations.md)
- Resolve a file under the project directory as a relative URI — [Resource URIs](./resource-uri.md)

## Logging, commands and diagnostics

- Log a message at the right level and category — [Log messages](./log-output.md)
- Run an external command or call an OPC/UA method at runtime — [Calling or running commands](./execute-command.md)
- Debug a `Start()` method you cannot breakpoint normally — [Debugging tips](./debugging-tips.md)
- Generate a random number, with the system-tick caveat — [Random generation](./random-generation.md)

## Choosing a page

- For reading the tree, prefer [Accessing project nodes](./accessing-project-nodes.md) over [Manipulate Optix nodes](./manipulate-nodes.md): `Project.Current.Get` and `Owner.Get<T>` are the supported API, the second page is low-level and unsupported.
- If a value must follow another variable continuously, use [Dynamic Links](./dynamic-links.md), not a loop that copies `Value`; a copy is a one-off assignment.
- For one object type reused as many instances, read [Managing Aliases](./managing-aliases.md) before writing per-instance code; a hard-coded absolute path breaks across projects and across sessions.
- Anything that exists only at runtime — sessions, MQTT, databases, reports, DialogBoxes, the System object — must come from its own page; check the page's own note before writing it into a design-time script.
- When two pages describe the same object, [The Information Model](./information-model.md) tells you which copy your code will reach: the design node under `Project.Current` or the session instance under `Owner`.

## Pages index

- [Accessing project nodes](./accessing-project-nodes.md) — `Project.Current.Get`, `Owner.Get<T>`, typed versus cast, and search.
- [Advanced SVG image](./advanced-svg.md) — `SetImageContent` on an `AdvancedSVGImage`, runtime only.
- [Alarms](./alarming.md) — create digital and analog alarms from code.
- [Asynchronous tasks](./async-tasks.md) — run work asynchronously from a NetLogic.
- [Audit Signature (CFR21 workflow)](./audit-signature.md) — attach signatures to variables and track changes.
- [Colors](./colors.md) — the `Color` struct, named and RGB/ARGB values, alpha.
- [Companion Specifications](./companion-specs.md) — add UA-Nodeset files so vendor types load.
- [Creating elements](./creating-objects.md) — `InformationModel.Make*`, add to a folder, types and instances.
- [Database Interaction](./database-interaction.md) — Store APIs for insert, update and delete.
- [Data grids](./datagrids.md) — read the selected row's columns from a DataGrid.
- [Debugging tips](./debugging-tips.md) — practical ways to debug NetLogic code.
- [Design time import of PLC tags](./designtime-tags-import.md) — TwinCAT and RA EtherNet/IP tag import at design time.
- [DialogBox](./dialog-boxes.md) — `UICommands.OpenDialog` and DialogType objects.
- [Triggering events to the FactoryTalk Optix core](./dispatch-events.md) — low-level event dispatch, unsupported.
- [Dynamic Links](./dynamic-links.md) — create, inspect, repair and redirect links, including alias links and converters.
- [ElementAccess](./element-access.md) — navigate nested structs and arrays by index path.
- [Engineering Units](./engineering-units.md) — `EUInformation` on analog variables and unit dictionaries.
- [Events handling](./events.md) — UI and variable events, low-level in parts.
- [Calling or running commands](./execute-command.md) — OPC/UA methods and external processes.
- [FactoryTalk Optix Studio CLI](./fto-studio-cli.md) — export an application for an OptixPanel from a script.
- [Good practices](./good-practices.md) — naming and project conventions.
- [The Information Model](./information-model.md) — node kinds, and the design node versus the session instance.
- [Log messages](./log-output.md) — `Log` levels and categories, design time and run time.
- [Managing Aliases](./managing-aliases.md) — create, set and clear aliases; one faceplate, many instances.
- [Manipulate Optix nodes](./manipulate-nodes.md) — low-level node manipulation, unsupported.
- [MQTT](./mqtt.md) — publish and subscribe with the MQTT client.
- [NetLogic Lifecycle](./netlogic-lifecycle.md) — `Start()`/`Stop()` order and the 2-second warning.
- [NetLogic overview](./netlogic-overview.md) — what a NetLogic is and what it may reference.
- [OPC/UA](./opcua.md) — node references and browsing.
- [Field tags](./plc-tags.md) — read and write tags, forced refresh, synchronisation.
- [Database queries](./queries.md) — supported query shapes and result reading.
- [Random generation](./random-generation.md) — `System.Random` with the system-tick caveat.
- [Recipes](./recipes.md) — legacy recipe schemas and their values.
- [RecipeX](./recipex.md) — the 1.7+ recipe module.
- [Regex](./regex.md) — validate and clean strings.
- [OPC/UA Observers](./register-observers.md) — observe value changes, low-level.
- [Reports](./reports.md) — generate a report and read the result code.
- [Resource URIs](./resource-uri.md) — project-relative paths for `ResourceUri` variables.
- [Run time import of PLC tags](./runtime-tags-import.md) — import tags while the application runs.
- [Serial port](./serial-port.md) — COM port names and the SerialPort driver.
- [Sessions](./sessions.md) — count the runtime sessions or impersonate one.
- [The system object](./system-node.md) — device methods and events, runtime only.
- [Template Library](./template-library.md) — import library objects and types by script.
- [FT Optix Runtime – Threading Model](./threading.md) — dispatch pool, affinity, long-running tasks.
- [Translations](./translations.md) — translation keys on text properties.
- [Trends](./trends.md) — add pens and drive a trend chart.
- [UI Animations](./ui-animations.md) — numeric animations with easing, sequential or parallel.
- [Users, groups and roles](./users-groups.md) — create users and assign roles at runtime.
- [Variables formatting](./variables-formatting.md) — string conversion and zero padding.
- [Variables interaction](./variables-interaction.md) — create a variable and interact with it.
- [Variables structures](./variables-structure.md) — read and write Struct variables and arrays of them.

## Coverage

51 pages existed in this directory when this index was written (52 with this page); every one of them is linked above, and the link count was checked against the directory listing.
