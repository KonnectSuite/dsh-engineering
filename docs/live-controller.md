# Live controllers: capture, verify, download, read

Studio 5000 work splits into two lanes that use different transports. Keeping them apart
avoids most of the confusion a live bench produces.

- **Direct CIP** (`poll_live_tags`, `read_live_tags`, `write_live_tag`, `start_plc_trend`)
  connects to an IPv4 address and slot with no Studio, FactoryTalk Linx or SDK. It needs the
  export open only to resolve declarations.
- **Studio SDK** (`capture_controller_snapshot`, `verify_offline_l5x`, `download_project`,
  `change_controller_mode`) opens a project through Logix Designer, so it needs a saved
  FactoryTalk Linx route to the controller.

## Find the route headlessly

FactoryTalk Linx stores its topology in one XML file:

```
%ProgramData%\Rockwell\RSLinx Enterprise\RSLinxNG.xml
```

Walk from the controller IP upward: the port `address` is the IP, then a bus element
(`AB_ETHIP-1`), then the channel (`Ethernet 3`), then the workstation device
(`DESKTOP-...`). The route string the SDK accepts is:

```
WORKSTATION!DRIVER\IP
```

Example: `DESKTOP-N9UEQO4!AB_ETHIP-1\192.168.1.3`. A route written as `AB_ETHIP-1\IP`, or a
full `\\WORKSTATION\...` path, is rejected with `No module was found using the supplied encoded
route string` or `CONTROLLER_IP_MISMATCH`.

To give an export a route, set the controller attribute and re-verify:

```xml
<Controller ... CommPath="DESKTOP-N9UEQO4!AB_ETHIP-1\192.168.1.3">
```

The attribute survives an ACD round trip, so it can be written into the L5X that a capture or
download step reads.

## Capture before changing anything

1. `capture_controller_snapshot` with the IP, a route carrier L5X and a **new** ACD path.
   Nothing is written to the controller; the ACD is an upload of what it runs.
2. `export_acd_to_l5x` the uploaded ACD. That export is now a **qualified baseline**: a build
   can only be downloaded when the baseline is an L5X this chat exported from an ACD.

Keep the uploaded ACD. It is the restore point.

## Verify and download

1. Edit the project (drafts, composer), `draft_apply` to a new L5X.
2. `verify_offline_l5x` against the qualified baseline. `download_ready` requires: build passed,
   engineering changes found, no import abort, and a qualified baseline.
3. `change_controller_mode` to **Program**, with a matching ACD. Logix refuses a download in Run.
4. `download_project` with the verification id.
5. `change_controller_mode` back to **Run**.

Every one of those three controller calls asks for human approval for that exact operation;
approval unavailable means the call fails closed.

## Read what you downloaded

Direct CIP reads are the fastest proof: declared scalars, or one scalar member such as
`Timer.PRE` and `Timer.ACC`. A member read resolves the declaration on the base tag and the type
on the member. Writes accept whole scalar tags only, so one write changes one known operand and
the readback is the controller's answer.

A read proves a moment, not that the controller runs this export. Uploading after a download and
comparing the rungs does prove what it runs.

## Safety controllers

A safety project is refused before a build (`SAFETY_PROJECT_OFFLINE_VERIFY`): the Studio SDK
importer aborts on safety projects with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`. On the bench, a
safety controller upload returned `RxE_NOT_FOUND` as well. Without an upload there is no baseline,
and without a build there is no verification id, so there is no download path for safety logic.
Use Studio 5000's safety workflow (unlock, edit, verify signature, download) for that controller.
