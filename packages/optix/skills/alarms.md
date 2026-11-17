# alarms

A real alarm system is three things: alarm objects of a behaviour type, a grid bound to where the raised
alarms live, and an acknowledge path that goes through the alarm engine. Measured end to end on
`AryaSMTLineDemo` on 2026-11-17 against Studio 1.8.1.27: all three work, but the third works through the
shipped grid's own button and only after the assembly is rebuilt — not through a tool call.

## What works

1. **`OffNormalAlarmController` is a bridge-authorable alarm type.** `optix_edit` `create_object` with
   `object_type: "OffNormalAlarmController"` under the project's `Alarms` folder creates a real alarm object.
   Studio saves it as `Type: OffNormalAlarmController` with the eleven `Class: Reference` entries to the type's
   property nodes that a hand-built alarm would have, and the runtime instantiates it and runs it.

   `optix_schema` is where to look first: `OffNormalAlarmController` (namespace `FTOptix-Alarm`, supertype
   `AlarmController`) carries `NormalStateValue Double`, `InputValue Double`, `Message LocalizedText`,
   `Severity UInt16`, `LatchingEnabled`, `Latched`, `AutoAcknowledge`, `AutoConfirm`, `Enabled`, `Active`,
   `Shelved`, `Suppressed`, `MaxTimeShelved`/`PresetTimeShelved Duration`, `LastEvent`. `LimitAlarmController`
   and the `NonExclusive`/`ExclusiveLevelAlarmController` variants add `HighHighLimit`, `HighLimit`, `LowLimit`,
   `LowLowLimit`. `DiscreteAlarmType` and `OffNormalAlarmType` are the OPC-UA types under them.

2. **`DigitalAlarm` is not a type in this build.** It is a Studio menu label. `create_object` refuses it:

   ```
   {"code":"type_not_found","message":"no node at type path: DigitalAlarm (not a builtin catalog type
   either - pass Module.Type, e.g. FTOptix.Alarm.DigitalAlarm)"}
   ```

   Passing the qualified name the refusal itself suggests — `FTOptix.Alarm.DigitalAlarm` — is refused with the
   identical message. Do not chase it; use `OffNormalAlarmController`.

3. **Link the alarm's `InputValue` to a model tag, and the alarm fires from the tag.** `optix_edit` `set_link`
   (`path`, `source`, `mode`), then the runtime raises and clears the alarm as the tag crosses
   `NormalStateValue`. Proven live: `Model/Smt/ActiveFaults` written through a `NodeId` pointer by
   `SmtLineLogic` → `Alarms/Alm_FeederJam` (`NormalStateValue 0`, `Severity 500`, `LatchingEnabled True`,
   `Message "Feeder jam: component feed empty"`) → the alarm appeared in the rendered grid with its own
   timestamp, and re-appeared with a new timestamp after a runtime restart. A Boolean tag drives the Double
   `InputValue` through the link; the engine converts.

   `set_link` is one of the ops this bridge will not preflight: it answers `unknown_op` — "op 'set_link' is not
   validated by this bridge; it will be applied unchecked" — in both `errors` and `warnings` with `ok: false`.
   The batch runner treats that as unchecked rather than refused and reports it in `unchecked`; a concrete
   defect beside it still refuses the batch. The link lands as a `DynamicLink` child, `DataType: NodePath`,
   `Value: "../../../Model/Smt/ActiveFaults"`.

4. **Import the shipped grid and leave its source alone.** `optix_library action="import" library="Widgets"
   item="AlarmGrid"` lands an ObjectType at `UI/Components/Widgets/AlarmGrid` (316 nodes: six Buttons, a
   `NetLogic` named `AlarmGridLogic`, and `AlarmsDataGrid`). Instantiate it with `create_object` whose
   `object_type` is the project path `UI/Components/Widgets/AlarmGrid`, then give it geometry.

   Its alarm source is `AlarmsDataGrid/Model` — a `NodePointer` whose `DynamicLink` is
   `/Objects/RetainedAlarms/LocalizedAlarms@Pointer`. **That is correct, not a defect.** `/Objects/RetainedAlarms`
   is where the runtime puts alarms that have actually been raised, and the grid rendered the authored alarm
   with its source untouched. Retargeting it to the project `Alarms` folder would show alarm *definitions*
   instead of alarm *events*, which is not what an alarm screen shows. Its `ItemKind` is
   `/Types/EventTypes/BaseEventType/ConditionType/AcknowledgeableConditionType/AlarmConditionType`.

5. Properties are materialised when written, not created from the type: a fresh alarm node reports only
   `NormalStateValue`, `InputValue` and `LastEvent`. `Severity`, `Message`, `LatchingEnabled` appear after the
   `set_property` that sets them. A plain string writes a `LocalizedText`.

## What does not work

- **`optix_invoke` cannot drive an alarm.** The bridge refuses it for a tool-created node:

  ```
  CoreException: No behaviour or observer found that handles the method 'Acknowledge' on node
  Root/Objects/AryaSMTLineDemo/Alarms/Alm_FeederJam
  ```

  Same for `Enable`. A node the tools created has the type's properties and none of its behaviour. An
  acknowledge command has to come from the grid's own buttons or from a runtime NetLogic. (Until 2026-11-17
  `optix_invoke` never reached the bridge at all: `applyInvoke` was called without the gateway and threw
  `ReferenceError: bridge is not defined`.)

- **`optix_read clr_type` cannot see any alarm type.** `DigitalAlarm`, `OffNormalAlarmController`,
  `AlarmController`, `AlarmsCategoryFolder`, `AlarmObjectBase` and `AlarmSet` all answer `type_not_found`. The
  CLR diagnostic route does not expose `FTOptix.Alarm`. Use `optix_schema` (the offline catalog) instead.

## Acknowledge: it works, through the grid, and the DOM is readable

The earlier claim in this playbook — that a preview test cannot prove an acknowledge — was wrong, and the
retest found the acknowledge does land.

1. **The shipped grid's own logic must be in the assembly.** The first attempts did nothing and the runtime
   said why: `ERROR (FTOptix.NetLogic) [code=df0009]: User-defined logic type 'AlarmGridLogic' is missing in
   the .NET assembly.` `optix_library import` copies `ProjectFiles/NetSolution/AlarmGridLogic.cs` into the
   project, but the runtime loads `ProjectFiles/NetSolution/bin/<Project>.dll`, and that DLL predated the
   import. After a build the error is gone from the log and the buttons work. **A library import is not
   finished until the assembly is rebuilt** (stop the runtime first, or the build fails on a locked DLL).
   The error appears only in sessions where a browser actually opened the alarm screen: a NetLogic loads when
   its panel is instantiated, not at startup, so a clean-looking startup log proves nothing about it.
2. **The state columns are readable, as icons with names.** Each state cell is a `<div data-column-index="4|5|6">`
   wrapping an `<img>` whose `src` names the state: Active is `RadiobuttonDarkEmpty.svg` / `RadiobuttonDark.svg`,
   and Acked and Confirmed are `ApplyDark.png` (✓) or `CloseDark.png` (✗). Text columns are
   `<span class="sc-3f05b374-0 cByaUT">`. So the state pair is readable without a screenshot diff — read the
   `img src`, not the row's `innerText`.
3. **A row is addressable.** `[data-type="dataGrid"] [data-index="0"]` selects it (the selected row carries
   `background-color: rgb(15, 175, 255)` plus an inset box-shadow). Clicking the widget's `Acknowledge` — a
   `<span>` with no children — flipped **Acked `CloseDark.png` → `ApplyDark.png`** (✗ → ✓) within 1.2 s.
4. **Read the state against the row's timestamp, because a linked alarm re-raises.** The row's timestamp
   advanced every ~12 s (`2:22:19 → 2:23:01 → 2:23:11 → 2:23:27 → 2:23:39 → 2:23:50 → 2:24:02 PM`) while the
   grid was open: an `OffNormalAlarmController` whose `InputValue` is `set_link`ed to a tag the runtime writes
   re-raises a new event on its own poll, faster than the 30 s `SmtLineLogic` write. An acknowledge lands, but
   it does not persist against the next re-raise — so prove it as a **state pair before/after one click on one
   row**, and expect a fresh event to overwrite it. A latch you want to stay acknowledged needs the tag to
   stop crossing `NormalStateValue`.

- **An alarm controller costs a licence token.** The runtime log says `Component: Alarm controller requires 1
  Standard Feature Token`, and the alarm chain is not free on its own: with the DataLogger and store in place
  the same session logged `Component: Data logger requires 1 Standard Feature Token` and the whole runtime
  `requires 6 Standard Feature Tokens` (Native 1 + Web 3 + Alarm controller 1 + Data logger 1). In demo mode
  both the alarm and the logger still ran, so this is a deployment note, not a blocker for a proof.

## Hand-drawn alarm tables

A table drawn from Labels and Ellipses can look right and is still not an alarm system: no latch, no
acknowledge, no history. Keep it only as a summary view, and say so in the project's own docs.
