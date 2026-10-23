# bridge/

The 32-bit PowerShell COM bridge that talks to the running MotionWorks IEC 3 Pro IDE ships here with
the session row (Phase 1): `mw_bridge.ps1`, its generated interop sources and their configuration.

Phase 0 defines only the typed boundary in `src/core/bridge.ts`. The asset is copied from the retiring
plugin after the session row's contract test proves the redesign against the running IDE; it is not
carried here before that.
