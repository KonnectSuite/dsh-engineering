# data-logger-trend-sql

Historical data in Optix is one chain — store, logger, chart, query — and each link has a silent failure.
Work down the chain and check each link in the runtime log.

## 1. The store

```
optix_edit ops=[{"op":"create_object","parent":"DataStores","name":"LineHistory","object_type":"SQLiteStore"}]
```

Then `set_property` `InMemory=false`, `Filename="line.db"`. With `InMemory` left at its default the store
works and writes nowhere — fine for a demo, useless for history.

## 2. The logger (two silences)

```
optix_edit ops=[{"op":"create_object","parent":"Loggers","name":"LineDataLogger","object_type":"DataLogger"}]
optix_edit ops=[{"op":"set_property","path":"Loggers/LineDataLogger","name":"Store","value":"DataStores/LineHistory"}]
```

- `SamplingMode` on 1.8.1.27 is **0 = None, 1 = Value change, 2 = Periodic**. Set `2` and
  `SamplingPeriod=10000000` (ticks: 10,000,000 = 1 s). Configured as 1 the logger never samples.
- The `VariablesToLog` children must be the logger's typed `VariableToLog` elements **and** carry a dynamic
  link. Children appended through a generic structured write sit in a plain container and are never linked —
  the runtime reports them as properties with a Null value. Do it from a runtime NetLogic, and let the tool
  author the two pointers it needs (one to the logger, one to the folder holding the tags):

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

1. `optix_library action="import" library="Widgets" item="AdvancedTrend"` → `UI/Components/Widgets/AdvancedTrend`.
2. `create_object` its `AdvancedTrendMain` PanelType on the Trends screen; give it the lower half of the screen.
3. Set the panel's existing `Logger` `NodePointer` value to `Loggers/LineDataLogger` — that is its "Logger Alias".
   The legend then names the logger's own variables.
4. The library creates the pens **disabled**; switch them on from a NetLogic with a `PeriodicTask`, because the
   panel's pens only exist once the screen is mounted.

## 4. SQL on a screen

```csharp
// third pointer on the same logic node: {"name":"HistoryStore","target":"DataStores/LineHistory"}
var store = InformationModel.Get((NodeId)LogicObject.GetVariable("HistoryStore").Value) as FTOptix.Store.Store;
store.Query("SELECT * FROM LineMetrics ORDER BY Timestamp DESC LIMIT 5", out string[] header, out object[,] rows);
```

`Query` returns **void**; the row count is `rows.GetLength(0)`. Put the result in a String tag and `bind` a
Label to it — that is the shortest honest "SQL results on a screen". The `DataGrid` widget also takes
`Model` (the store) + `Query`, and needs `Columns` or it shows values without headers.
