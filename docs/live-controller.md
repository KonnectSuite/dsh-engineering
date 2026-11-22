# Live controllers: capture, verify, download, read

There are two ways to reach a controller, and the bundle keeps them apart. One is a direct
EtherNet/IP connection that needs an address and nothing else; the other is the Studio 5000 SDK,
which is also the only path that can upload a project, change a mode or download. Both live in the
`l5x` row — 54 tools, of which six are on the Studio SDK group, seven on the controller group and
seven on the live group. The calls themselves are documented in
[Studio 5000 L5X](products/l5x.md); this page is the working procedure.

| Lane | Tools | Needs | Does |
|---|---|---|---|
| Direct CIP | `l5x_poll_live_tags`, `l5x_read_live_tags`, `l5x_write_live_tag`, `l5x_start_plc_trend`, `l5x_discover_controllers`, `l5x_read_controller_clock`, `l5x_write_controller_clock` | IPv4 address and slot; no Studio, no Linx, no SDK | read and write declared scalar tags and members, sample a trend, name controllers on the LAN, read or set an L8x clock |
| Studio SDK | `l5x_studio_sdk_status`, `l5x_capture_controller_snapshot`, `l5x_go_online`, `l5x_read_controller_mode`, `l5x_change_controller_mode`, `l5x_download_project`, `l5x_controller_approval_status` | Studio 5000 and the SDK service; a saved Linx route for the controller | upload a project, build offline, change mode, download |

The direct lane is the one for checking a value: no licence, no route, no save dialog. The SDK lane
is the one for changing what the controller holds, and it is gated on purpose.

## Find the route

Direct reads do not need a route. `l5x_capture_controller_snapshot`, `l5x_go_online`, the mode calls and
`l5x_download_project` do: the SDK resolves the controller through a saved route in RSLinx Enterprise,
not from the IP passed in the call.

```
%ProgramData%\Rockwell\RSLinx Enterprise\RSLinxNG.xml
```

A route is `WORKSTATION!DRIVER\IP`:

```
DESKTOP-N9UEQO4!AB_ETHIP-1\192.168.1.3
```

A saved ACD carries it in `<Controller ... CommPath="...">`, and that attribute survives an ACD
round trip, which is why a captured snapshot can act as the route carrier for later calls. When it
does not match you get `No module was found using the supplied encoded route string` or
`CONTROLLER_IP_MISMATCH`.

## Capture before changing anything

1. `l5x_capture_controller_snapshot` — uploads the controller to a new ACD. It needs the IP and a
   project that already knows the route; the upload is read-only.
2. `l5x_export_acd_to_l5x` — exports that ACD to an export the tools can read. Keep both: the ACD is the
   restore point, the export is the working copy.
3. Keep the ACD. A project you captured can be downloaded back unchanged; nothing else in these
   docs is a restore plan.

`l5x_go_online` connects read-only for diagnostics. It does not change mode and does not write
controller data. `l5x_read_controller_mode` answers Program, Run or Test without a mode change, and it
is the call to make before proposing one.

## Verify and download

The chain is offline until the last step, and the last step is the only one that reaches the
controller with new code:

1. `l5x_verify_offline_l5x` imports the finished export into a **new** ACD, builds it with the running
   Logix Designer release, and exports the result. Its result carries the build and a
   `download_ready` verdict; that verdict needs all of: the build passed, the offline import
   changed engineering content, no import abort, and the export is a qualified baseline of the
   same project. A build is refused for a project below revision 37, and `probe: true` reports the
   SDK's own refusal for a lower revision rather than refusing early.
2. `l5x_build_acd_from_draft` is the same machinery for one changed routine against a baseline.
3. `l5x_change_controller_mode` puts the controller in Program.
4. `l5x_download_project` accepts exactly one credential: the `verification_id` returned by a **passed**
   `l5x_verify_offline_l5x` or `l5x_build_acd_from_draft` in this chat. A hand-built ACD path is not
   accepted, an export that never built is not accepted, and the id is consumed by the attempt. The
   call never changes mode for you.
5. `l5x_change_controller_mode` puts the controller back in Run, once the download reports done.

A passed `download_ready` is not proof the logic is correct; it is proof the file built and imports
cleanly. That distinction is the whole point of the offline step.

## Approval-gated writes

Every SDK call that changes the controller asks for human approval for that exact operation:
`l5x_download_project`, `l5x_change_controller_mode` and `l5x_capture_controller_snapshot` (which only uploads)
all go through it, and an unavailable approval means the call fails closed — it is not retried, and
nothing is attempted without a yes.

The direct lane has two write tools, and each is supervised twice:

| Write | Gate 1 | Gate 2 | Readback |
|---|---|---|---|
| `l5x_write_live_tag` | row `allowWrites` must be on | per-write human approval | reads the tag back and compares |
| `l5x_write_controller_clock` | row `allowWrites` must be on | per-write human approval | reads the clock back (L8x only) |

The row config is the profile-level switch: `allowWrites` on the `l5x` row decides whether the live
write tools are mounted at all. Human approval is per call and per value — approving one write does
not approve the next. The tool results are explicit about which gate failed:
`WRITES_DISABLED`, `APPROVAL_UNAVAILABLE`, `APPROVAL_DENIED`, `UNSUPPORTED_WRITE_TAG`,
`INVALID_WRITE`, and `WRITE_NOT_VERIFIED` when the readback did not match. `allowedAddresses`, when
set on the row, is a third gate: a target outside the list is refused before any socket is opened.

The same two-stage gate applies to the clock: reading is approval-free, writing is not, and only
L8x controllers have one — `l5x_read_controller_clock` reports `clock_supported: false` rather than
guessing on other models. Reads and writes cover whole declared scalar tags and one scalar member
(`Timer.PRE`, `Timer.ACC`), not arrays or structures.

## Read what you downloaded

After a download, the SDK says the file was accepted; it does not say the controller is running it.
The direct lane can answer the narrower question: read the declared tags you care about with
`l5x_read_live_tags` (one request, up to 64 scalars) or `l5x_poll_live_tags` (repeated sweeps with quality
and controller identity), and report `live_logic_matches_export` only when you also uploaded the
project back and compared rungs with `l5x_compare_projects`. A tag whose value happens to match proves a
moment, not that the controller is executing the export.

`l5x_start_plc_trend` is the same read path as a bounded background job: it samples up to 16 tags for a
fixed count, and the chart follows the job. It is stopped through the job controls, not by a tool
call, and it writes nothing.

## Safety controllers

A safety controller is outside every path on this page. `l5x_verify_offline_l5x` refuses it before
attempting a build, because the SDK importer aborts a safety import
(`XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`); a bench upload answers `RxE_NOT_FOUND`; and there is no
download path for a safety project in this bundle. Use Studio 5000's own safety workflow, with its
own verification, and keep the safety task out of any session that edits a standard task in the same
project.

## Before you point any of this at a machine

- A running controller is not a test bench. Read with the direct lane, capture with the SDK lane, and
  change nothing until the request names the controller and the change.
- A successful download is not a commissioning. The five-step loop, the gates and the hand-off
  steps are in [the loop every product follows](getting-started.md#3-the-loop-every-product-follows).
- The machine's capabilities come first: `l5x_studio_sdk_status` reports whether this host can drive the
  SDK at all, and `l5x_controller_approval_status` reports whether approval is available before a call
  needs it.
