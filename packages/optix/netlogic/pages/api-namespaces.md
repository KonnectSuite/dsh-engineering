# Namespaces, types and members for NetLogic

Before writing C#, settle three questions: which namespace the call belongs to, which type holds it, and which member is the supported one. Everything named below is taken from the installed 1.8.1.27 Help or from a page in this directory — if a name you need is not here, it was not verifiable and is deliberately absent.

## Namespaces

- `FTOptix.HMIProject` — `Project.Current` and `InformationModel`. The Help states that the `InformationModel` class is displayed by the `FTOptix.HMIProject` module, and ./alarming.md pairs that directive with `Project.Current` and `InformationModel.GetVariable`.
- `UAManagedCore` — the underlying OPC/UA model that every other namespace builds on: `IUANode`, `IUAVariable`, `IUAObject`, `UAObject`, `UAObjectType`, `NodeId`, `NodePath`, `QualifiedName`, and the `OpcUa` namespace of data types. The pages cast with the full name (`(UAManagedCore.UAObject)item`), which is how you can tell the type family.
- `FTOptix.NetLogic` — the NetLogic module itself: `BaseNetLogic`, `[ExportMethod]`, and the long-running task used by ./threading.md.
- `FTOptix.UI` — widgets and windows: `Panel`, `Label`, `ComboBox`, `DataGrid`, `AdvancedSVGImage`, `PanelLoader`, `UICommands`.
- `FTOptix.Core` — the core object model: aliases and tags (`Alias`, `Tag`), users, and the data types namespace you name in full, e.g. `FTOptix.Core.DataTypes.NodePath`.
- `FTOptix.CoreBase` — reference types, used when you wire a link by hand: `FTOptix.CoreBase.ReferenceTypes.HasDynamicLink`.
- `FTOptix.Alarm` — alarm objects; required by any code that creates or reads alarms (./alarming.md).
- `FTOptix.Recipe` — the recipe module. The assembly ships as `FTOptix.Recipe.Net.dll` under the 1.8.1.27 Modules folder, but neither ./recipes.md nor ./recipex.md shows a `using` block, so take the exact directive from the Studio error list rather than copying one from here.

The block a snippet in this directory actually starts from:

```csharp
using FTOptix.Core;        // Alias, Tag, FTOptix.Core.DataTypes.NodePath
using FTOptix.HMIProject;  // Project, InformationModel
using FTOptix.NetLogic;    // BaseNetLogic, ExportMethod
using FTOptix.UI;          // Panel, Label, DataGrid, PanelLoader
using UAManagedCore;       // IUANode, IUAVariable, NodeId, NodePath, OpcUa
using OpcUa = UAManagedCore.OpcUa;
using System;

public class RuntimeNetLogic1 : BaseNetLogic
{
    public override void Start()
    {
        // your code
    }

    public override void Stop()
    {
        // your code
    }
}
```

`LogicObject`, `Owner` and `Session` need no namespace: the Help describes them as variables every NetLogic displays — the NetLogic node, its parent node, and the session node.

## Reaching a node

```csharp
public class ReachingNodes : BaseNetLogic
{
    public override void Start()
    {
        // relative to this NetLogic's parent: the form that survives being reused elsewhere
        var panel = Owner.Get<Panel>("MainPanel");

        // absolute path from the project: the design node, wherever the logic runs
        var screen = Project.Current.Get("UI/Screens/Screen1");

        // typed get: null when the node is missing or of another type
        var typed = Project.Current.Get<Panel>("UI/Screens/Screen1/MainPanel");

        // this NetLogic's own node, and one variable declared on it
        NodeId myNode = LogicObject.NodeId;
        var speed = LogicObject.GetVariable("Speed");

        if (typed == null)
            return; // wrong name, wrong type, or designed for another project
    }
}
```

- `Project.Current.Get(path)` returns the node as `IUANode`. `Project.Current.Get<T>(path)` returns `null` when the node is missing **or** of the wrong type, while a cast — `(Panel)Project.Current.Get(path)` — returns `null` only when the node is missing and throws when the type is wrong. Pick the behaviour you want before the call, not after.
- `Owner.Get<T>("Child")` walks down from the NetLogic's parent; `Owner` is the node that owns the logic, so the same code works on every instance of the page or type that carries it.
- `LogicObject` is the NetLogic's own node: `LogicObject.NodeId` identifies it, `LogicObject.GetVariable("Name")` reaches a variable declared beside it.
- `NodeId.Empty` is the empty node id. It is what you pass to clear a pointer, for example an alias that should resolve to nothing (./managing-aliases.md).
- A `NodePath` is the string form of a browse path: segments separated by `/`, `..` climbs to the parent, `@` introduces a node id (the pages use `"..@NodeId"`), and `NodePath.EscapeNodePathBrowseName(name)` escapes a BrowseName that contains a separator or a space.
- Warning: a hard-coded absolute path addresses one node in one project. Copy the page, reuse the faceplate on another screen, or open the project under another session, and the path points at the design node that nobody is looking at. Prefer `Owner.Get<T>` and fall back to `Project.Current` only for objects that are genuinely global — see ./accessing-project-nodes.md.

## Variables and dynamic links

```csharp
var speed = LogicObject.GetVariable("Speed");   // IUAVariable
speed.Value = 42;                               // write
object current = speed.Value;                   // read

var source = Project.Current.GetVariable("Model/Motor1/Speed");
speed.SetDynamicLink(source, DynamicLinkMode.Read);   // speed follows the source continuously
speed.ResetDynamicLink();                             // back to a plain value
```

- `IUAVariable.Value` is the read/write path for one variable. In code that reacts to a change, read `Value` only where you mean a snapshot; a link is what keeps a display current.
- `LogicObject.GetVariable("Name")` reaches a variable on the NetLogic's own node, `Owner.GetVariable("Name")` one on its parent, and `Project.Current.GetVariable("Model/Motor1/Speed")` one anywhere in the model.
- `SetDynamicLink(source, DynamicLinkMode.Read)` makes the parent follow the source; `DynamicLinkMode.Write` pushes the other way and `DynamicLinkMode.ReadWrite` both ways. The overload taking a `uint` links one element of an array: `SetDynamicLink(source, 2, DynamicLinkMode.Read)`.
- `ResetDynamicLink()` removes the link; passing a `null` source to `SetDynamicLink` clears it as well. Details, the array and bit-indexed forms and the broken-link checks are in ./dynamic-links.md.
- A link beats assigning a value whenever something else changes the source: the link keeps following, an assignment copies once. Choose the link for a setpoint shown on screen, an assignment for a one-off write your own code owns. `SetDynamicLinkToAlias(...)` is the 1.8.x form when the target is an alias (./dynamic-links.md, ./managing-aliases.md).
- If the DynamicLink runtime optimization converts links to StaticLinks at deploy, every runtime manipulation above stops working; the page explains which links to exclude (./dynamic-links.md). Creating the variable as well as linking it is covered in ./variables-interaction.md.

## Aliases

```csharp
// design time: the alias is declared on the object that gets reused
var page = Project.Current.Get("UI/Pages/MainPage");
page.SetAlias("MainBoilerAlias", Project.Current.Get("Model/Boilers/Boiler1").NodeId);
page.SetAlias("MainBoilerAlias", NodeId.Empty);          // clear it again

// runtime: the same alias name resolves to the instance's own target
var boiler = LogicObject.GetAlias("MainBoilerAlias");
var temperature = boiler.GetVariable("Temperature").Value;

// or create the alias node from code and add it where it belongs
var modelFolder = Project.Current.Get("Model");
var alias = InformationModel.MakeAlias("CurrentMotor");
modelFolder.Add(alias);
```

- `LogicObject.GetAlias("Name")` returns the node the alias points at; cast it to the object type you expect before touching its members.
- `SetAlias("Name", target)` sets the pointer and `SetAlias("Name", NodeId.Empty)` clears it. The Help example sets the alias on the folder that owns it (`modelFolder.SetAlias("Model", Project.Current.Find("Motor1"))`), which is the same call on a different node.
- `InformationModel.MakeAlias("Name")` creates the alias node itself — an `IUAVariable` — which you then `Add` to the folder that should own it.
- An alias resolves per instance. One faceplate type used on ten motors carries one alias name, and every instance points it at its own motor; a hard-coded absolute path would point all ten at the motor whose path was written first. Full decisions in ./managing-aliases.md.

## Creating objects and wiring them

```csharp
var screen = Project.Current.Get("UI/Screens/Screen1");

var panel = InformationModel.MakeObject<Panel>("MyNewPanel");
panel.Width = 300.0;                                                  // set properties before adding
var setpoint = InformationModel.MakeVariable<int>("Setpoint", OpcUa.DataTypes.Int32);
panel.Add(setpoint);

screen.Add(panel);   // one Add publishes the whole subtree
```

- `InformationModel.MakeObject<T>(name)` creates an instance of a built-in type; `MakeObject<T>(name, objectTypeId)` creates an instance of a type you defined, and `InformationModel.MakeObject(name)` the untyped form.
- `InformationModel.MakeVariable<T>(name, dataTypeId)` creates a variable over an OPC/UA data type such as `OpcUa.DataTypes.Int32`; the optional `params uint[]` argument dimensions an array.
- `Add` is the wiring step: `panel.Add(child)` for a child, `container.Add(panel)` for the subtree. Build the tree in memory and add the container once — every `Add` is a change the InformationModel publishes.
- Connecting a callback is a different operator: subscribe with `speed.VariableChange += OnSpeedChanged` and unsubscribe with `-=` (the Help subscription pages document both), as ./alarming.md and ./netlogic-lifecycle.md do. Neither operator adds or removes a node; `Add` does that. Handlers are covered in ./events.md and ./register-observers.md.
- `GetOrCreateVariable("Name")` returns an existing variable or creates it, which is what you want when the same script may run twice.
- Creating at runtime and creating in a design-time method are different jobs: the design-time form makes nodes in the project, the runtime form makes them in the running instance. Which one you need is decided by the session rules, not by preference — ./creating-objects.md explains both, and ./information-model.md explains why an object created in a session disappears with that session.

## Members that fail silently

| What you wrote | Why nothing happened | Page |
|---|---|---|
| `svgImage.SetImageContent(xml)` in a design-time method | it writes into the image buffer, so it does not change the InformationModel — and the page states it does not work at design time at all | ./advanced-svg.md |
| a property set on the object under `Project.Current` while the operator watches a rendered page | `Project.Current` reaches the design node; what is rendered is a session instance made from it | ./information-model.md |
| an update from a thread you started yourself, or a `LongRunningTask` that is never disposed | the runtime schedules each behaviour on its own pool with a per-object affinity; a thread outside that model is not scheduled for you, and a `LongRunningTask` must be disposed in `Stop()` or it leaks an OS thread | ./threading.md |
| assigning one field of a Struct variable, or guessing a nested member's path | Struct variables are read-only at code level: extract the array, change it, set a new Struct — and nested members need the ElementAccess index path, not a BrowseName | ./variables-structure.md, ./element-access.md |

## Limits

Compile-time verification is `optix_script` followed by `dotnet build`, not this page: a namespace listed here can still fail to resolve in your project, and a signature that compiles can still be rejected at runtime by the version installed on the target. When Studio's error list asks for a namespace this page does not name, follow the error list and then add the fact to the page that should own it.
