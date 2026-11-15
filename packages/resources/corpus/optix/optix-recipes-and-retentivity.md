---
id: optix-recipes-and-retentivity
title: Recipes are rows, retentivity is a scope
domain: optix
level: practitioner
basis: [creating-projects/recipes/Recipes.html, creating-projects/recipes/Recipe-schemas.html, creating-projects/recipes/recipe_schema_model_structure.html, creating-projects/recipes/recipe_schema_methods_events.html, creating-projects/recipes/Manage-recipes-at-runtime.html, creating-projects/recipes/Import-or-export-recipes-at-runtime.html, creating-projects/retentivity/Retentitivity-storage.html, creating-projects/retentivity/Create-retentivity-storage.html, creating-projects/retentivity/retentivity_storage_properties.html, creating-projects/retentivity/retentivity_storage_methods.html, creating-projects/project-nodes/Paths.html]
tags: [recipes, schema, retentivity, storage, backup]
applies_to: [optix]
rules: [OPTIX-RCP-07, OPTIX-RCP-08]
---
## Principle
A recipe schema declares the ingredients — the model nodes a recipe is allowed to write — and every recipe
belongs to exactly one schema. The current schema is row based: a `Recipes` table holds identity and metadata,
`RecipeItems` holds the targeted nodes, and `RecipeDataItems` holds one string value per ingredient, with a
`RecipeMetadata_<schema>` table for the plant-specific columns the project declares. Because values are stored
as strings, the model type of the ingredient is the authority for conversion, and a schema that targets a
folder writes whatever the folder contains — wide schemas are cheap to author and expensive to review.

Two models exist and they are told apart by their names and their editors. The legacy editor is
column-oriented, one table per schema, no object support, no concurrent editing and no metadata; the current
editor and schema are row-oriented, support objects, concurrent editing and metadata, and use three tables
plus one per schema. A recipe still stored in the legacy layout migrates by re-authoring the schema, not by
renaming it, and `Legacy Recipes Import Export` exists precisely because the two shapes cannot be swapped.

Editing is not storing. The edit model an operator fills in is a temporary runtime model; its data disappears
when the application stops, so a recipe is durable only after a transfer to the store. Applying writes the
store's or the edit model's values to the target nodes, and the transfer methods are explicit about which of
the three places — edit model, store, target — is the source and which is the destination.

Retentivity is the same idea for live variables rather than recipes: a retentivity storage names the nodes
whose runtime changes must survive a restart, and writes them to a database file. Two rules matter. The
storages must not overlap — each storage monitors independent project nodes — and the write is batched by a
delay, so the design chooses between disk stress and the size of the window that can be lost.

## Rules
- **OPTIX-RCP-07** Every recipe belongs to one schema whose ingredients are the model nodes that recipe may
  write, with at least one metadata field declared per schema and a name plus a version recorded on the recipe;
  a durable recipe reaches the store through an explicit `TransferFromEditModelToStore`, never by leaving it in
  the edit model, and CSV import or export uses a script whose CSV columns match the schema's database columns
  one for one.
- **OPTIX-RCP-08** Retentivity storages declare their `Nodes` without intersecting any other storage, the
  default `SecurityRetentivityStorage` and `AlarmsRetentivityStorage` are kept, and `Write delay` is set to a
  stated number of milliseconds with the loss window accepted — 0 means a disk write per detected change — while
  `Delta observer enabled` False is chosen only when the storage must apply existing data and detect nothing
  new; backup and restore are wired to the storage's `Backup`/`Restore` methods and a completed backup is
  recorded.

## Apply
Read the schema, not just the screen. `optix_read` `{action:"map", path:"Recipes"}` lists schemas and their
recipes, `{action:"node"}` on a schema returns its name, its ingredient nodes and its metadata fields, and
`{action:"variable_members", path:"<schema>", name:"..."}` reaches the collections the bridge exposes. On the
retentivity side, `{action:"node"}` on a storage returns `Nodes`, `Write delay` and `Delta observer enabled`,
which is the evidence for `OPTIX-RCP-08`.

Author the schema through the model. `optix_edit` `create_type` with `object_type` `RecipeSchema` under
`Recipes`, then `set_property` its name and add the ingredient nodes and the metadata columns; recipes are
`create_object` with `object_type` `Recipe` under the schema, and their values are set with the schema's
`SetRecipeDataItemValue` and `SetRecipeMetadataValue` methods rather than by writing the string columns
directly. The recipe screen itself is the Recipes editor widget from `optix_library`, mounted by `optix_screen`
or placed with `create_widget`; its buttons are wired to the editor's own methods (save, delete, apply), and the
alias to the edit model node is created under the project root by the widget.

Ground the storage. `create_object` with `object_type` `RetentivityStorage` under `Retentivity`, `set_property`
`Nodes` (a single node or a folder such as `Model`), `Write delay` and `Delta observer enabled`. The database is
`RetentivityStorage.db` under `%APPLICATIONDIR%\ApplicationFiles`, so the file is not a project asset and is not
deployed with the screens; adding the High Availability module switches every storage to the shared cluster
database without a project edit, which is worth stating to whoever plans the backup.

Make the exchange and the backup explicit. CSV import and export run through the script component from
`optix_library` (Scripts), whose properties are the schema, the CSV path, the separator and field wrapping,
with a button's `MouseClick` wired by `optix_edit` `wire_event` to the script's Import or Export method. For
retentivity, `wire_event` the same way on `Backup` (argument `OutputFilePath`) and `Restore` (argument
`BackupFilePath`), and report the `Backup Completed` event as the evidence that a backup ran.

Verify the durable path, not the picture. `optix_design_check` reports a recipe schema with no metadata field
and a retentivity storage whose nodes overlap another storage; `optix_emulator` `{action:"restart"}` after
saving a recipe and a retentivity value is the only proof that both survived, and the acceptance record names
the file under `%APPLICATIONDIR%` and the recipe version that was restored.
