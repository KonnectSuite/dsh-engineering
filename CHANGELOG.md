# Changelog

Notable changes to `dsh-engineering`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- Document the composed layer, the skill-to-namespace policy, the measured tool exposure, the built-in target composition, the retirement list, and the replacement-map requirement for the flip.
- Record the classification: AryaAI's product catalog lists this bundle as AryaAI-authored with market distribution, so the Plugins page groups it under AryaAI and not Community.
- Record the switch model: a skill is the single per-product switch for guidance and tools, while the client faces (ladder viewer, ME display renderer, DXF viewer) are separate entries that stay mounted. The port shares one isomorphic parser between the host tools and each viewer.
- Add `AGENTS.md`: documentation is updated in the same change as the code it describes, diagrams are part of the contract, and known gaps stay explicit.
- Add `test/docs.spec.mjs`, which fails when the README policy table, the documented unlinked namespace, the changelog version heading, or the locale key sets disagree with the patch. Verified to fail on a dropped policy row and on a renamed prefix.

## [0.1.0]

- Add the engineering bundle: a phase-1, additive loader layer that targets the existing `tool-capability-policy` row and links `l5x_*`, `ftview_*` and `mw_*` to the skills that govern them.
- Keep `onDemand: false` so the bundle does not change the product-wide eager tool exposure Arya measured and kept.
- Insert no plugin rows, so existing profiles and product plugin ids are untouched.
