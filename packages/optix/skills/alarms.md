# alarms

A real alarm system is three things the bridge cannot fake: alarm objects of a behaviour type, an
`AlarmGrid` bound to where those objects live, and an acknowledge path that goes through the alarm engine.

## What does not work

- `create_object object_type="DigitalAlarm"` and `"FTOptix.Alarm.DigitalAlarm"` both fail or yield a
  `BaseObject` shell: right property names (`Severity`, `Message`, `InputValue`), no behaviour, never reaches
  `/Objects/RetainedAlarms`.
- The shipped `Widgets/AlarmGrid` as imported points its `Model` at
  `/Objects/RetainedAlarms/LocalizedAlarms`, a folder Studio creates only for a configured alarm subsystem.
  Left alone, the grid renders empty forever.

## What works

1. Import the grid: `optix_library action="import" library="Widgets" item="AlarmGrid"`. It lands as an
   ObjectType under `UI/Components/Widgets/AlarmGrid`; instantiate it on the Alarms screen
   (`create_object` with the type path, then geometry).
2. Create the alarm objects **in C#**, from a runtime NetLogic's `Start()`:

```csharp
var folder = Project.Current.Get("Alarms");
var alarm = InformationModel.MakeObject<FTOptix.Alarm.DigitalAlarm>("Alm_Quality");
folder.Children.Add(alarm);
alarm.Severity = 250;
alarm.LatchingEnabled = true;
alarm.AutoAcknowledge = false;
alarm.Enabled = true;
alarm.NormalStateValue = 0.0;
alarm.Message = "Quality: rejected board rate high";
alarm.InputValueVariable.SetDynamicLink(Project.Current.Get("Model/Smt/Alarm3") as IUAVariable, DynamicLinkMode.Read);
```

A Boolean tag can drive the Double `InputValue` through that link; the engine converts.

3. Retarget the grid's `Model` to the `Alarms` folder (a `NodeId` set through `set_property` with the node
   path). The grid then lists the objects: Timestamp, Name, Source Variable, Message, Active, Acked,
   Confirmed, Severity.

## Acknowledging

The grid's own buttons call the alarm engine, not a tag: clicking **Acknowledge** flips the row from
`Acked ✗` to `Acked ✓` and moves `Confirmed` the other way. Do not wire those buttons yourself.

`POST /bridge/node/invoke` cannot call `Acknowledge` on a tool-created node (`No behaviour or observer
found`); if a command is needed outside the grid, drive it from a runtime NetLogic or the shipped
`AlarmCommands`.

## Hand-drawn alarm tables

A table drawn from Labels and Ellipses can look right and is still not an alarm system: no latch, no
acknowledge, no history. Keep it only as a summary view, and say so in the project's own docs.
