---
name: factorytalk-optix
description: FactoryTalk Optix Studio engineering — inspect and author the loaded project through the Studio bridge, validate expressions, take preview screenshots, read NetLogic C# snippets from the pinned cheat-sheet snapshot, and start from a template.
whenToUse: The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, or the emulator preview. Route FactoryTalk View ME elsewhere.
---

# FactoryTalk Optix engineering

## Boundary

The project lives in FactoryTalk Optix Studio. `optix_status` finds the Studio bridge; the bridge runs
inside Studio and must be started there (StartBridge). Nothing here deploys to a panel or changes
runtime values unless a tool says it does, and every authoring call is validated against the live
model first.

The rows are switches. `allowWrites`, `allowDestructive` and `allowInvoke` gate what
`optix_edit` and `optix_action` may do; the preview tools need the emulator browser and its CDP
endpoint. If a tool is missing, that switch is off in this profile.

## Read before you write

1. `optix_status` — is Studio reachable, which project is loaded, which capabilities are on.
2. `optix_read` — screens, widgets, types, variable members, schemas, CLR diagnostics. Start with
   `map` at `overview` depth, then `detail` for the one subtree that matters.
3. `optix_validate_expression` — check an expression against real node paths before attaching it.

Saved state and the live model are different sources. Say which one you read, and which you changed.

## NetLogic C#

The bundle ships a pinned snapshot of Rockwell's
[NetLogic cheat sheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet). Read it instead of
writing C# from memory:

- `optix_netlogic` with no arguments returns the contents.
- `optix_netlogic { query: "sessions" }` ranks pages by title, topic and symbol, then by body text.
- `optix_netlogic { slug: "netlogic-lifecycle" }` returns that page verbatim, with its risk flag, the
  upstream commit and the upstream disclaimer.

Every page carries a `risk`:

- `normal` — the repository presents it as guidance;
- `advanced` — the page itself warns about low-level or non-public behaviour;
- `unsupported` — it is listed in the repository's Advanced section, which says those features are not
  officially supported and may change.

The repository states the snippets may use non-public APIs, may break a project and must not be used in
production as-is. Quote the risk with the snippet, adapt it to the loaded project, and treat
compilation and runtime behaviour as unverified until Studio compiles it.

## Author and verify

- `optix_edit` applies one typed batch; run it with `dry_run` first and read the validation result.
- `optix_action` creates NetLogic, ensures a web engine, adds a translation, converts an instance to a
  type, or invokes an exported method. Invocation needs a session-safe bridge and `allowInvoke`.
- `optix_preview` and `optix_screenshot` inspect the emulator through CDP. Input can change runtime
  values; state that before using it.
- `optix_template` discovers the packaged Optix IPC and OptixPanel starter projects. Copy the chosen
  project with filesystem tools, never overwrite an existing project, and keep the template's name.

A successful model change does not save Studio and does not prove rendering. Say what was applied, what
was only validated, and what a human must check in Studio.

## Reporting

Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
completeness: it names what the call cannot establish — rendering, runtime behaviour, the installed
Optix version, and anything outside the loaded project.
