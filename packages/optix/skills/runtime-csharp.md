# runtime-csharp

When the bridge cannot make a feature work, the feature is usually a *behaviour*, and a behaviour needs C#.
`optix_script` is the channel: it writes `ProjectFiles/NetSolution/<Name>.cs`, creates the matching
`NetLogic/<Name>` node with `bound_class`, and compiles.

## The shape that runs

```csharp
public class SomethingLogic : BaseNetLogic
{
    private PeriodicTask task;

    public override void Start()
    {
        Build();
        task = new PeriodicTask(Refresh, 1000, Owner);
        task.Start();
    }

    public override void Stop()
    {
        task?.Dispose();
        task = null;
    }

    private void Refresh() { /* write model tags, UI labels, whatever */ }
}
```

- Usings that actually resolve inside a project: `System`, `FTOptix.Core`, `FTOptix.CoreBase`,
  `FTOptix.HMIProject`, `FTOptix.NetLogic`, `UAManagedCore`, `FTOptix.UI`, `FTOptix.Store`,
  `FTOptix.DataLogger`, `FTOptix.Alarm`.
- `OpcUa.DataTypes.*` is **not** in scope; write `UAManagedCore.OpcUa.DataTypes.*`.
- `Session` and `Project` are members of `BaseNetLogic` where a static helper cannot see them: helpers that
  use either must be instance methods (`error CS0120`).
- `SetConverter` is an extension on `IUAVariable`, not on `Label` (`error CS1929`).
- `Session.ChangePassword(userName, newPassword, oldPassword)` — the third argument is the OLD password.

## Creating a NetLogic node

```
optix_script action="add" kind="runtime" name="MyLogic" parent="NetLogic" code="<whole class>"
```

- `action: "add"` refuses when the `.cs` already exists; delete the file first, or use `action: "edit"` with
  the whole class as `code`.
- Creating the node through `create_object` gives a `BaseObject` shell that never binds the class — its
  methods answer `No behaviour or observer found`. Always go through `optix_script`.
- A *new method added later* to an existing class does not reach the node: the node's method children were
  materialised when the class was added. Delete and re-add the node, then restart Studio.
- `kind: "design"` ([ExportMethod] helpers) is not exercisable in this build: the tree offers no Execute item
  and the invoke route answers `No behaviour or observer found`. Use `kind: "runtime"` and do the work in
  `Start()`.

## Deploying a class change

1. `optix_script action="add|edit" ...` (compiles in place; fails while the runtime holds the DLL — stop it first).
2. `optix_save` (Studio rebuilds `bin\AryaOptixTemplate.dll`).
3. Stop Studio and start it again if the change is a *new* class or a new bridge route; a loaded assembly is
   not reloaded by a save alone.
4. `optix_emulator action="restart"`, then read the runtime log for the class's own `Log.Info` lines.
