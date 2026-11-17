# alarms

A real alarm system is three things: alarm objects of a behaviour type, a grid bound to where the raised
alarms live, and an acknowledge path that goes through the alarm engine. Measured end to end on
`AryaSMTLineDemo` on 2026-11-17 against Studio 1.8.1.27: the first two are authorable through the tools, the
third is not.

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

- **The grid's rows are not addressable in the preview DOM.** A rendered `AlarmGrid` exposes no
  `dataGridRow`, no `dataGridCell`, no `role="row"` and no `tr` — its body is one styled div
  (`sc-ec00d451-0`), and Active/Acked/Confirmed are icons, not text. So a preview-driven test can read the row
  through the grid's `innerText` (Timestamp, Name, Source Variable, Message, Severity come through; the three
  state columns do not), but it cannot click a row or prove an acknowledge changed state. Proving acknowledge
  needs a screenshot diff, or a model read of the alarm node's `AckedState`.

- **An alarm controller costs a licence token.** The runtime log says `Component: Alarm controller requires 1
  Standard Feature Token`. In demo mode the alarm still fired, so this is a deployment note, not a blocker for
  a proof.

## Hand-drawn alarm tables

A table drawn from Labels and Ellipses can look right and is still not an alarm system: no latch, no
acknowledge, no history. Keep it only as a summary view, and say so in the project's own docs.
