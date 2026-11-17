# data-logger-trend-sql

Historical data in Optix is one chain — store, logger, chart, query — and each link has a silent failure.
Work down the chain and check each link in the runtime log.

## 1. The store

```
optix_edit ops=[{"op":"create_object","parent":"DataStores","name":"LineHistory","object_type":"SQLiteStore"}]
```

Then `set_property` `InMemory=false`, `Filename="line.db"`. With `InMemory` left at its default the store
works and writes to a generated name: measured 2026-11-17 on `AryaSMTLineDemo`, a `SQLiteStore` with no
`Filename` wrote `ApplicationFiles/66ed320271f14e16872f8d02949f8555.sqlite` — the store's own guid with the
dashes removed, under the project folder. Name the file or you will look for a table in a file named after a
guid you did not write down.

**Poll the `-wal` file, not the store file.** SQLite runs in write-ahead mode, so the main file can sit at
4 096 bytes for two minutes while `…sqlite-wal` grows to 4 144 752 bytes. A size poll on the main file reads
as "the logger is writing nothing". The file is locked while the runtime holds it — copy it before reading
(`[System.IO.File]::Open($f,'Open','Read','ReadWrite')` into a stream), and read it with
`node:sqlite`'s `DatabaseSync`.

**Set a record limit, or the runtime says so.** A bridge-authored store and logger ship with none, and every
runtime session logs `WARNING (urn:FTOptix:SQLiteStore) [code=1c] Root/Objects/<project>/DataStores/LineStore:
No record limit is set on 'SmtTrend', which may cause an out-of-memory issue on your device.` The limit lives
on the **table** (`Table.RecordLimit`, `UInt32`), not on the store, and `SQLiteStore` has no property for it.

## 2. The logger (two silences)

```
optix_edit ops=[{"op":"create_object","parent":"Loggers","name":"LineDataLogger","object_type":"DataLogger"}]
optix_edit ops=[{"op":"set_property","path":"Loggers/LineDataLogger","name":"Store","value":"DataStores/LineHistory"}]
```

- `SamplingMode` on 1.8.1.27 is **0 = None, 1 = Value change, 2 = Periodic**. Set `2` and
  `SamplingPeriod=10000000` (ticks: 10,000,000 = 1 s). Configured as 1 the logger never samples.
- `LogVariableTimestamp` and `LogVariableOperationCode` are **refused** as `unknown_property` even though the
  bridge's own `valid_properties` list names them, and the property that list also names — `LogMethod` — is
  refused as `proxy_only_property` with "creating it crashes Studio". Leave all three alone: the runtime logs
  `Timestamp` and `LocalTimestamp` columns whether you ask or not.
- **`VariableToLog` is a variable kind, so the bridge can author the whole chain.** Measured end to end on
  `AryaSMTLineDemo` (2026-11-17): four `create_variable datatype:"VariableToLog"` under the logger, each
  followed by a `set_link` to its tag (a relative `../../../../Model/Smt/OEE` resolves), `Store` pointed at
  the store, `TableName "SmtTrend"`, `SamplingMode 2` — and the runtime built the table from those children:

  ```sql
  CREATE TABLE "SmtTrend" ("Timestamp" DATETIME,"LocalTimestamp" DATETIME,"OEE" REAL,"UPH" INTEGER,
    "CycleTime" REAL,"TotalUnits" INTEGER, "Id" INTEGER)
  ```

  360 rows in 162 s. A `Float` tag becomes `REAL`, an `Int32`/`UInt32` tag becomes `INTEGER`. The children
  decide the schema, so author them before the first sample: **the table's columns freeze on the first
  sample** and a variable added later reads null.
- `set_link` is the only route that works here. A `bind` on a `VariableToLog` answers "VariableToLog has no
  settable property 'Value'", and the bridge answers `validate_ops` with `unknown_op` for `set_link` — that is
  the bridge naming an op it cannot preflight, not a defect, and the batch goes through and reports it as
  `unchecked`.
- A runtime NetLogic is the alternative when the tag list is computed rather than fixed. Author one pointer
  per folder and let the class name no path (`OPTIX-NL-12`):

```
optix_script action="add" name="LoggerSetup" kind="runtime" pointers=[{"name":"Logger","target":"Loggers/LineDataLogger"},{"name":"Tags","target":"Model/Smt"}]
```

```csharp
private IUAVariable loggerPointer;
private IUAVariable tagsPointer;
private FTOptix.DataLogger.DataLogger logger;
private Folder tagFolder;

public void Start() {
    loggerPointer = LogicObject.GetVariable("Logger");
    tagsPointer = LogicObject.GetVariable("Tags");
    if (loggerPointer == null || tagsPointer == null) { Log.Warning("logger pointers are missing on the logic node"); return; }
    try {
        logger = InformationModel.Get((NodeId)loggerPointer.Value) as FTOptix.DataLogger.DataLogger;
        tagFolder = InformationModel.Get((NodeId)tagsPointer.Value) as Folder;
    } catch (Exception ex) { Log.Error($"logger pointer: {ex.Message}"); return; }
    if (logger == null || tagFolder == null) { Log.Warning("a logger pointer resolves to nothing; check the pointers"); return; }
    while (logger.VariablesToLog.Count > 0) logger.VariablesToLog.Remove(logger.VariablesToLog[logger.VariablesToLog.Count - 1]);
    foreach (var browseName in new[] { "OEE", "UPH", "CycleTime" }) {
        var item = InformationModel.Make<FTOptix.DataLogger.VariableToLog>(browseName);
        logger.VariablesToLog.Add(item);
        // Link the element the collection now holds, not the one Add was handed.
        logger.VariablesToLog[logger.VariablesToLog.Count - 1]
            .SetDynamicLink(tagFolder.GetVariable(browseName) as IUAVariable, DynamicLinkMode.Read);
    }
}
```

  One pointer per folder, then a `BrowseName` lookup per tag: the class names no path, so `OPTIX-NL-12` stays
  quiet and a tag that moves inside the model is a project edit, not a code edit.

- The table appears on the first sample and its **columns freeze then**: a variable added later reads null.

## 3. The trend

A `Trend` created through the bridge is not a behaviour instance: it draws axes and legend and nothing else,
and `Refresh()` answers `No behaviour or observer found`. Use the shipped panel:

1. `optix_library action="import" library="Widgets" item="AdvancedTrend"` → it lands as a **Folder** at
   `UI/Components/Widgets/AdvancedTrend` holding `AdvancedTrendMain` (a 104-node `PanelType`) plus a
   `Components` subfolder of 11 more types (`AdvancedTrendConfiguration` 478 nodes, `AdvancedTrendColorPicker`
   a PopupType, `AdvancedTrendPens`, `AdvancedTrendYAxis`, …). `Widgets/AlarmGrid` by contrast lands as one
   `PanelType` with no folder, so do not assume the shape from one import to the next.
2. Instantiate it with `create_object` whose `object_type` **is the project path of the imported type** —
   `{"op":"create_object","parent":"UI/Screens/TrendView/Canvas","name":"Trend1","object_type":"UI/Components/Widgets/AdvancedTrend/AdvancedTrendMain"}`. A project path instantiates a shipped type; the created node reports `node_class Object`.
3. Set the panel's `Logger` value to the logger — that is its "Logger Alias". It is a **`NodeId` variable**,
   not a NodePointer, so `set_property name="Value" value="Loggers/LineDataLogger"` writes it and the bridge
   echoes the resolved guid. Measured: with that one write the shipped panel drew four pens (OEE, UPH,
   CycleTime, TotalUnits) straight from the logger's `VariableToLog` children, with its own legend, axes and
   Pens panel. Nothing else had to be authored.
4. **Do not name the screen `Trend`.** Studio generates one global-namespace class per project Screen, Panel,
   Window, Dialog or Popup into `ProjectFiles/NetSolution/Private/UITypeDefinitions.cs`, so a screen called
   `Trend` generated `public class Trend : FTOptix.UI.Screen` and shadowed `FTOptix.UI.Trend` for every
   NetLogic in the project. The widget's own `TrendPensLogic.cs` declares `private Trend myTrend;`
   unqualified, and the solution failed with `CS0029: Cannot implicitly convert type 'FTOptix.UI.Trend' to
   'Trend'` plus four `CS1061: 'Trend' does not contain a definition for 'Pens'` — the project's own NetLogic
   stopped compiling too, and `bin/<project>.dll` was deleted and never rewritten. Renaming the screen to
   `TrendView` cleared all five errors. `optix_build` now reports the collision list read off that generated
   file, and an authoring batch that would create such a type is refused before a byte is sent.
   A screen cannot be renamed by a `move` (`not_an_object: … is ObjectType - move handles Object instances`):
   create the new screen, repoint what mounts it, then delete the old one, in that order.
5. The library's pens are not reliably created disabled: in the measured instance all four arrived **enabled**
   and drew without a NetLogic touching them. Check the Pens panel in the preview before writing code to
   switch them on.

## 4. SQL on a screen

```csharp
// third pointer on the same logic node: {"name":"HistoryStore","target":"DataStores/LineHistory"}
var store = InformationModel.Get((NodeId)LogicObject.GetVariable("HistoryStore").Value) as FTOptix.Store.Store;
store.Query("SELECT * FROM LineMetrics ORDER BY Timestamp DESC LIMIT 5", out string[] header, out object[,] rows);
```

`Query` returns **void**; the row count is `rows.GetLength(0)`. Put the result in a String tag and `bind` a
Label to it — that is the shortest honest "SQL results on a screen". The `DataGrid` widget also takes
`Model` (the store) + `Query`, and needs `Columns` or it shows values without headers.
