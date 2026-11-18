# runtime-csharp

When the bridge cannot make a feature work, the feature is usually a *behaviour*, and a behaviour needs C#.
`optix_script` is the channel: it writes `ProjectFiles/NetSolution/<Name>.cs`, creates the `NetLogic/<Name>`
node the class binds to by name, points the `NodePointer` variables the class reads, and compiles.

## The shape that runs

```csharp
public class SomethingLogic : BaseNetLogic
{
    private IUAVariable written;
    private PeriodicTask task;

    public override void Start()
    {
        // The node to write is a NodePointer variable on this logic node, not a path in
        // the source: see "Pointers, not paths" below.
        IUAVariable pointer = LogicObject.GetVariable("Target");
        if (pointer == null)
        {
            Log.Error("SomethingLogic", "missing Target pointer");
            return;
        }
        NodeId targetId = (NodeId)pointer.Value;
        if (targetId == null || targetId == NodeId.Empty)
        {
            Log.Error("SomethingLogic", "the Target pointer is empty");
            return;
        }
        written = InformationModel.GetVariable(targetId);
        if (written == null)
        {
            Log.Error("SomethingLogic", "the Target pointer does not resolve to a variable");
            return;
        }
        task = new PeriodicTask(Refresh, 1000, Owner);
        task.Start();
    }

    public override void Stop()
    {
        if (task != null) { task.Dispose(); task = null; }
    }

    private void Refresh() { /* write the model through `written`, UI through Owner */ }
}
```

## Pointers, not paths

A node path written in C# compiles, passes every static check, and then breaks silently the moment the
object is moved, renamed or re-created in the project — no build and no review can see it. Rockwell's own
cheat sheet says the pointer form exists for exactly this: *"Access an object by passing a NodeId pointer
to a NetLogic variable. This keeps references valid even if the object is moved in the project tree."*
(`accessing-project-nodes.md`)

So: **the path lives in the project, the class holds only the variable name.**

```
optix_script action="add" name="LineLogic" template="periodic" pointers=[{"name":"Target","target":"Model/Smt/LineSpeed"}]
```

- `pointers` creates a variable under the logic node with **DataType `NodeId`** and points it at that
  project-relative path. The template reads it as `LogicObject.GetVariable("Target")`.
- **The datatype is the whole trick, and `NodePointer` is the wrong one.** A variable created as
  `NodePointer` keeps `DataType: BaseDataType`, so the bridge's Value coercion misses its `NodeId` arm and
  stores the authored path as a plain String; Studio saves it as `{"Type":12,"Body":"Model/..."}`; the
  runtime then hands that String to `(NodeId)pointer.Value` and the node dies at boot with
  `[code=df0003] … InvalidCastException … UAValue.op_Implicit` — `Start()` is never retried and the class
  simply never runs. With DataType `NodeId` the same two writes land as `BaseDataVariableType` +
  `DataType: NodeId` + a path Value, which is the shape Rockwell's own `SystemNode` pointers carry.
  `retype` cannot repair the wrong one: it refuses every datatype outside its ten scalar names.
- `IUAVariable.Value` hands back a `UAManagedCore.UAValue` wrapper, never a raw `NodeId`, so
  `raw is NodeId` is always false. **The conversion is the read**: `targetId = (NodeId)target.Value;`
  inside a `try/catch`, because that conversion is exactly what throws when the variable is not a NodeId.
- Resolve it once in `Start()` with `InformationModel.GetVariable(targetId)` — not per tick, and not with
  `Project.Current.GetVariable("path")`, which is the string form this convention replaces.
- Test `targetId == null || targetId == NodeId.Empty` before use. An unset pointer resolves to nothing,
  `Start()` still succeeds, and the class then does nothing at all: the quietest failure the model has.
  The review names this as `OPTIX-NL-14`.
- `OPTIX-NL-12` (warning) still fires on a `"Model/..."` or `"UI/..."` literal in the source, comments
  excluded — that literal is the bug.
- A pointer to a **UI** object from a class that is not itself inside that UI object's tree is dead at
  runtime: UI objects are instantiated per session, so a design-time path resolves to an object the
  session never uses. Reach UI through `Owner.Get(...)` (the class sits beside the element) or through
  an alias. The live twin of this rule is `OPTIX-PROD-01`; the design-time twin is `pointer_to_ui_object`.
- **Proven on a running runtime (2026-11-17, `AryaSMTLineDemo`):** a bridge-created `NodeId` pointer named
  `Target` on a bridge-created NetLogic node, pointing at `Model/Smt/ProbeCount`, resolved in the runtime
  and a `PeriodicTask` wrote through it — the log carries `INFO (ProbeTickLogic): Target resolved to
  ProbeCount 9/232dc5fd-…` then `wrote through the pointer: ProbeCount = 10`, `= 20`, `= 30` one second
  apart, with no `df0003`. Two details from that run: the runtime instantiates a NetLogic node the bridge
  created (so `optix_script add` + save + build is a working route, and the runtime loads the class from
  `ProjectFiles\NetSolution\bin\<project>.dll` on disk — a class edit needs a build, not a Studio restart,
  while the runtime is stopped); and a NodeId's **namespace index is session-local** — the bridge echoed
  `102/232dc5fd-…` where the runtime logged `9/232dc5fd-…` for the same node, so compare pointers by the
  Guid body, never by the index.


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
- `kind: "design"` is the `[ExportMethod]` route, and `optix_script action "run"` executes one at design
  time through the bridge (`invoke` must be enabled). What it cannot do is reach a class the loaded
  assembly predates — see "Fixture: prove a class without the runtime".

## Fixture: prove a class without the runtime

A fixture is a design-time `[ExportMethod]` you invoke through the bridge: the route for proving a class
does what you think before the runtime is up, and for reading a variable no screen shows.

```
optix_script action="add" kind="design" template="fixture" name="LineProbeFixture" parent="NetLogic" \
  pointers='[{"name":"Target","target":"Model/Smt/TotalUnits"}]'
optix_script action="run" name="LineProbeFixture" method="RunFixture"
```

- `template: "fixture"` refuses `kind: "runtime"`: Studio runs it through right-click Execute or
  `optix_script action "run"`, never through `Start()`.
- The shipped class reads `LogicObject.GetVariable("Target")`, casts `(NodeId)target.Value`, refuses
  `NodeId.Empty`, resolves `InformationModel.GetVariable(targetId)`, then reads the value, writes the value
  it just read, and reads it again — a fixture that touches a tag puts it back. It returns a JSON string
  (`{"ok":true,"target":…,"before":…,"after":…,"restored":true}`) and every failure branch returns a JSON
  reason plus a `Log.Error`.
- `action: "add"` compiles it and `reviewNetLogic` counts its writes against **OPTIX-NL-15** ("a fixture
  writes a variable and never puts the original back", severity warning). The census looks only inside
  `[ExportMethod]` bodies, and a write whose right-hand side is the local the method read out counts as
  restored.
- **The measured gap.** On the reference machine (2026-11-18) `LineProbeFixture` was added, reviewed clean,
  pointed at `Model/Smt/TotalUnits` with `DataType: NodeId`, and `optix_build action check` compiled the
  whole solution in a scratch folder: 0 errors, 0 warnings. `optix_script action "run"` then answered
  `status: "not-loaded"` — the class compiles, but Studio's loaded NetLogic assembly predates it. A save
  does not fix that: after `Ctrl+S` moved 29 sources, `bin/<Project>.dll` was still the older file
  (05:40:00Z against a newest source at 05:54:46Z) and the run answered `not-loaded` again. The build is a
  tool's job (`optix_build action build`, emulator stopped); making Studio reload the assembly it already
  loaded is not — that needs a Studio restart.
- So a fixture proves three things without the runtime: the class is real C# (`action check`), the node
  binds it (`optix_read action: "node"` shows the pointer as `NodeId`), and what the class returns once the
  assembly is current. It does not prove the class runs in the runtime.

## Deploying a class change

1. `optix_script action="add|edit" ...` (compiles in place; fails while the runtime holds the DLL — stop it first).
2. `optix_save` — it writes the design model and the `.cs`, and it does not rebuild (measured 2026-11-18: a
   save that moved 29 sources under `ProjectFiles/NetSolution` left `bin/<Project>.dll` at its older
   timestamp). Build with `optix_build action build` once the runtime is stopped.
3. Stop Studio and start it again if the change is a *new* class or a new bridge route; a loaded assembly is
   not reloaded by a save alone.
4. `optix_emulator action="restart"`, then read the runtime log for the class's own `Log.Info` lines.
