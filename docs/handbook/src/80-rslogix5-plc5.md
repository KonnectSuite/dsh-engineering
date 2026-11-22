---
title: RSLogix 5 and PLC-5 reads
order: 80
purpose: Read a PLC-5 project through RSLogix 5 or the container parser, and know what remains unread.
audience: Legacy PLC-5 engineers
---

## The product row

PLC-5 is a product row: 8 read tools at 0.103.0, with a documentation tool and six more read tools in this change. It ships switched off. It is read-only by construction: there is no write tool, no write switch and no controller session.

The row has two independent read paths:

1. **Vendor automation** - `RSLogix5.Application`, a 32-bit local COM server driven from 32-bit PowerShell. The server is opened with `Visible=False` and `PromptForRevNote=False`, and every exit calls `Quit(0, false)` so no hidden instance is left behind. The server is single-instance, so a stray hidden `RSLGX5.exe` can make the next open fail with `CO_E_SERVER_EXEC_FAILURE`; the error names the process to end.
2. **Container parser** - a dependency-free reader for the `.RSP` OLE2 compound file. It answers without RSLogix 5 installed, but it knows less.

Both paths were measured on one project, `F00607.RSP`, through RSLogix 5 v10. Other versions, SFC and sequential files, and point-card part numbers were not tested.

## What a read reports

`plc5_open` returns the project inventory measured for that project: 52 program files, 2,168 rungs, 226 data files, 4,189 symbol records, 10 configured chassis and 443 I/O cells. The container named the same project and processor (`MML10PF3PX3R9`) and its route (`045_VIM\10.164.108.113\Backplane\1\CH A\1`) across 53 streams and 38 ladder files.

Three inventories, and they deliberately do not pretend to be one:

- **configured chassis** - from the project configuration;
- **point cards** - not recorded in this project, so absent rather than empty;
- **referenced addresses** - what the logic actually names.

The gap between the second and third is a finding, not a bug.

## What a read does not prove

- **Data-file values are not readable** through these paths, so tag values are out of scope.
- **No online state**: the row reads a saved file and never contacts a controller.
- **No point-card part numbers**: a configured chassis is not a bill of materials.
- **The container's answer says it knows less**: its coverage reports `coverage.unverified`, and the read-only contract is only as strong as the recorded project.

Treat a PLC-5 read as evidence of what the file says, not of what the machine does.
