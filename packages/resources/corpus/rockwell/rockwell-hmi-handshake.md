---
id: rockwell-hmi-handshake
title: The PLC–HMI handshake
domain: rockwell
level: practitioner
basis: [Rockwell]
tags: [hmi, handshake, comms]
applies_to: [l5x, ftview]
rules: [ROCK-HMI-01, ROCK-HMI-02, ROCK-HMI-03]
---
## Principle

The HMI is a remote peer with a cable that can fail. Treat every command as a request with a status and a
timeout.

## Rules

- **ROCK-HMI-01** Commands are pulse or edge requests with a matching acknowledgement bit; the HMI clears
  the request when it sees the acknowledgement, not on a timer.
- **ROCK-HMI-02** Detect comms loss: a heartbeat the HMI toggles must be watched by the PLC, and its loss
  must put outputs in a defined state.
- **ROCK-HMI-03** Data the PLC owns stays in the PLC. The HMI displays copies; it does not write setpoints
  that the PLC never validates.

## Apply

Write the handshake as a small state pair (`Cmd` / `Sts`) and test it by unplugging the network, not by
clicking twice.

## Anti-patterns

A command bit left on across HMI screens; setpoints accepted with no range check; heartbeat watched by the
HMI but not the PLC.
