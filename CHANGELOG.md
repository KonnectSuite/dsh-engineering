# Changelog

Notable changes to `dsh-engineering`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Add the supervised controller tools to `l5x-studio`: `controller_approval_status`, `capture_controller_snapshot`, `go_online`, `read_controller_mode`, `read_live_tag`, `change_controller_mode` and `download_project`. The entry is now 13 tools and 7,901 schema characters, still inserted disabled.
- Port the approval seam as a composition service: the three machine-changing actions refuse with `APPROVAL_UNAVAILABLE` before contacting a controller when the session policy is not `ask`, and proceed only on `allowed-once`. Downloads accept only a `verification_id` this chat produced from a passed build, checked against the built ACD and both L5X hashes.
- `verify_offline_l5x` and `build_acd_from_draft` now return a `verification_id` when the build passed and the review has no blockers.
- Add 4 approval-gate tests: status without the service, status with `ask`, a mode change refused before contact, and a download without a verification id. Suite is 56 tests.

- Add the `l5x-studio` entry with its offline half: `studio_sdk_status`, `studio_capabilities`, `export_acd_to_l5x`, `verify_offline_l5x`, `build_acd_from_draft` and `studio_review_evidence`. 3,914 schema characters, inserted disabled because it needs Studio 5000.
- The entry consumes the read entry's `l5xProjects` service and records ACD exports per chat, so a baseline is accepted only when both the ACD and the L5X hashes still match the export that produced them.
- Verified locally against the installed SDK: an ACD exported to L5X in 29 s, the export reopened by this parser, and a Studio-exported L5X built offline with `offline_build: passed`. The SDK refused to re-import its own export with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`; recorded in the port specification.
- Add 4 studio tests: registration, SDK preflight, capabilities and the unchanged-routine refusal. Suite is 52 tests.

- Add the draft family as its own `l5x-editing` entry: `draft_rung`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member`, `draft_udt_description`, `draft_validate`, `draft_apply`. One operation per call, accumulated per chat and project, validated against the project, then written to one new file.
- The editing entry consumes the read entry's `l5xProjects` service, so a project is opened once for both entries. It is inserted disabled: the read entry stays at 8,107 schema characters and editing costs 7,233 only when enabled.
- Add 7 draft tests: accumulation, argument refusal, validation hash, application to a new file, source preservation, overwrite refusal and draft handles. Suite is 48 tests.
- Update the `rockwell-l5x` guidance for drafting: boundary, one-operation-per-call, validate before apply, and the note that editing may be disabled in a profile.

- Port the `rockwell-l5x` guidance into the package: a 2.9 KB decision tree covering the read workflow, AOI and program scope rules, checks, comparison, reporting limits and revision floors. It is registered by `dsh-engineering-l5x/skill` and mounted as the stable `l5x-read-skill` row; the old 27 KB skill row can stay disabled.
- Add 3 skill tests: registration identity, body budget and frontmatter stripping, and a loud failure when the skills service is missing. Suite is 41 tests.
- Mount the L5X pilot as a bundle component: `cordis.patch.yml` inserts the stable `l5x-read` row, `dsh-engineering-l5x` is a workspace dependency, and the Plugins card lists the component under Engineering. The dev profile no longer inserts the row itself.
- Start the L5X port in `packages/l5x`: four offline read tools (`open_project`, `project_overview`, `list_components`, `get_component`), 2,431 schema characters, every parameter described, results carrying `summary`/`data`/`coverage`/`next`, and failures carrying `code`/`message`/`fix`/`candidates`.
- Add `list_components` because the current 43-tool surface exposes no way to enumerate tags, UDTs, routines or modules; discovery exists only in the legacy twelve-tool API.
- Add the reference cluster: `search_logic`, `find_references`, `trace_dependencies`, `resolve_tag`, `usage_map`. The five tools that answered "where is this used" in the old surface collapse into two named intents plus address resolution and element mapping; the surface is now 9 tools and 6,154 schema characters with 31 of 31 parameters described.
- Complete the offline read surface with `run_checks` and `compare_projects`: findings filtered by rule or severity with review caveats, and a component-level diff that ignores timestamps and XML formatting. The surface is now 11 tools and 7,994 schema characters with 41 of 41 parameters described.
- Document and enforce export revisions: reading accepts any L5X revision 19 or later, flags revisions outside the observed matrix as `untested_revision`, and refuses anything older than 19. The revision-37 floor applies only to a Studio SDK build.
- Add 7 checks and comparison tests, including a real tag-description change and a zero-change comparison, plus 3 revision tests. Suite is 34 tests.
- Scope project handles to the chat that opened them. The first two-chat transcript made the second chat see a handle from the first and fail its listing with `AMBIGUOUS_PROJECT`; handles now live per chat.
- Resolve `AOI_Name::Member` in `trace_dependencies` against the AOI's declaration scope, and refuse an unresolved symbol with `UNRESOLVED_SYMBOL` and the scope fix instead of returning an empty graph. `find_references` coverage now states that external consumers are not visible.
- Add chat isolation, AOI-qualified tracing and unresolved-symbol tests. Suite is 38 tests.
- Document the composed layer, the skill-to-namespace policy, the measured tool exposure, the built-in target composition, the retirement list, and the replacement-map requirement for the flip.
- Record the classification: AryaAI's product catalog lists this bundle as AryaAI-authored with market distribution, so the Plugins page groups it under AryaAI and not Community.
- Record the switch model: a skill is the single per-product switch for guidance and tools, while the client faces (ladder viewer, ME display renderer, DXF viewer) are separate entries that stay mounted. The port shares one isomorphic parser between the host tools and each viewer.
- Specify the L5X port from measured failures: 43 tools, 132 undescribed parameters, nine JSON-in-string parameters, 97 error codes, and the overlapping reference, inspection and drafting clusters. The spec splits the product into `l5x-tools` (default), `l5x-studio` and `l5x-live` (both off), the skill and the independent client.
- Settle the four port decisions: two reference tools rather than one with a mode; `observe_logic` retires; no batch tool; the SDK entry owns the supervised lifecycle and `edit_offline_acd` survives as `build_acd_from_draft`.
- Add `AGENTS.md`: documentation is updated in the same change as the code it describes, diagrams are part of the contract, and known gaps stay explicit.
- Add `test/docs.spec.mjs`, which fails when the README policy table, the documented unlinked namespace, the changelog version heading, or the locale key sets disagree with the patch. Verified to fail on a dropped policy row and on a renamed prefix.

## [0.1.0]

- Add the engineering bundle: a phase-1, additive loader layer that targets the existing `tool-capability-policy` row and links `l5x_*`, `ftview_*` and `mw_*` to the skills that govern them.
- Keep `onDemand: false` so the bundle does not change the product-wide eager tool exposure Arya measured and kept.
- Insert no plugin rows, so existing profiles and product plugin ids are untouched.
