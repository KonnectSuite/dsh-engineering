# Project workflow: application folders, the .med file and project settings

<!-- section: Foundations; identifiers: application folder, ProjectSettings, PrivateDirectory, .med, FactoryTalk View Studio -->

A FactoryTalk View ME **application** is a directory on the authoring PC plus one
`.med` file that ties the directory to the application name. Everything Studio
edits lives in that folder: displays, the HMI tag database, alarms, recipes,
global objects, accounts and project settings. There is no single database file to
copy around; the folder *is* the project.

The default location on a modern install is:

    C:\Users\Public\Public Documents\RSView Enterprise\ME\HMI projects\<Application Name>

The same path appears in Studio's Project dialog. Keep applications there unless a
site has a documented reason to move them: the export/import wizards, the ME
Transfer Utility and backup scripts all default to looking there, and paths with
spaces are handled for you.

## What Studio creates inside an application folder

A real application folder on this host (a PanelView Plus demo project) contains:

| Entry | What it holds | Why it matters to a reviewer |
|---|---|---|
| `<Application Name>.med` | The Studio project file that names the folder | Copy it with the folder; a lone .med is not a backup |
| `Gfx` | One binary `.gfx` file per graphic display | The authoring store — not readable as text |
| `Global Objects` | One binary `.ggfx` file per global object display | Base objects for faceplates |
| `TAG` | `*.MDF` / `*_log.ldf` SQL Server Express database, plus `.cac`, `.crc`, `.ctl` | Where the HMI tag database actually lives |
| `M_Alarms` | `MachineAlarms.mal` machine alarm definitions | Alarms are separate from the tag database |
| `ProjectSettings` | `ProjectSettings.pts`, `LanguageSwitch.xml`, its own `.cac/.crc/.ctl/.MDF/.ldf` copies, `MachineAlarms.mal` | Runtime behavior, languages, alarm settings |
| `Images`, `GlobalConn`, `PAR`, `RecipePlus`, `Startup`, `DLG` | Library images, global connections, parameter files, recipes, startup display, dialog settings | Parts of the application a display export never touches |
| `Accounts`, `AuditTrail`, `ActivityLog`, `CSVExport`, `cache`, `PrivateDirectory` | Security accounts, auditing, activity logs, exported CSV, transient cache | Evidence and security, not authoring content |

The `cache` and `PrivateDirectory` folders are not part of the deliverable. Do not
treat anything in them as project content when reviewing a folder.

## Creating and opening an application

1. In FactoryTalk View Studio, choose **New** and pick the ME application type.
2. Name the application. The name becomes the folder name and appears in every
   runtime dialog; renaming later is a project-wide change, not a file rename.
3. Choose where to create it. The dialog offers the standard ME projects path.
4. Studio opens the application and creates the standard subfolders. The HMI tag
   database is created empty; displays, alarms and recipes start empty too.
5. Save and close Studio cleanly before copying or backing up the folder. A copy
   taken while the application is open can hold a half-written tag database.

To open an existing project choose **Open**, browse to the `.med`, and let Studio
restore it. A `.med` that belongs to another installation may come with an older
project format; Studio offers to convert it. Accepting the conversion permanently
changes the project format, so take a copy first when the original must still open
on an older Studio.

## Project settings worth knowing before an edit

The Project Settings dialog (and the files under `ProjectSettings`) decide
behavior that a display export cannot show:

- **Startup display** — which display opens when the runtime starts.
- **Auto logout / manual logout** — whether the runtime returns to a login screen
  and after how long.
- **Displays open at startup** — a list, not a single display.
- **Global connections** — connections the whole application shares.
- **Language switching** — the configured runtime languages and the default one;
  missing language resources show as the default language, not as an error.
- **Security** — whether the project uses FactoryTalk security or ME project
  accounts, and the runtime security codes on displays and objects.

An operator-facing change that only touches a display is small. A change that
touches project settings is application-wide: say so in a handoff, because someone
reviewing only the exported displays will not see it.

## Backups, copies and renames

The safe sequence is always: close the application, copy the whole folder, keep
the `.med` with it, and give the copy both a new folder name and a new application
name. A folder copied with the old `.med` and renamed on disk no longer opens
reliably. Renaming is done through the Studio dialogs, which update the internal
references as well as the folder.

Do not put an application folder inside a cloud-synced folder that writes files
while Studio is open. The tag database and the `.gfx` files are binary stores, and
a sync client can leave them inconsistent. Keep working copies local and copy the
closed folder to the backup destination.
