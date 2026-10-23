# dsh-engineering

One install surface for AryaAI's automation-engineering plugins, and one place where their tool exposure is decided.

This bundle exists so a person installs **Engineering** once instead of five plugins, and so the per-product switches keep working underneath it. It does not replace the product plugins: `dsh-tool-l5x`, `dsh-tool-factorytalk-view`, `dsh-tool-ft-optix`, `dsh-tool-motionworks-iec`, and the CAD packages stay separate packages with their own rows, versions, tests, and safety rules.

## Status: phase 1

Phase 1 is additive on purpose. The bundle contains a single loader patch entry and inserts nothing:

- It targets the existing `tool-capability-policy` row and links each engineering tool namespace to the skill that governs it.

Nothing else changes. The product plugins keep their ids, their entries, their enable state, and their published versions. Adding the bundle to a profile adds no row that another bundle already inserts, so there is no duplicate registration.

### What the policy entry does

| Skill | Tools it governs |
|---|---|
| `rockwell-l5x` | `l5x_*` |
| `factorytalk-view` | `ftview_*` |
| `motionworks-iec` | `mw_*` |

Turning a skill off in the Skills page now removes its tool schemas as well as its guidance. Before this, the switch only affected the guidance, and the schemas stayed exposed.

`optix_*` is deliberately unlinked: there is no FactoryTalk Optix skill yet, and linking tools to a skill that never registers would hide them permanently.

`onDemand` stays `false`. Arya measured bounded on-demand discovery against eager exposure and kept eager exposure because discovery cost more turns than the schema characters it saved. Changing that is a product decision, not a bundle side effect.

## What phase 1 does not do

- It does not install or compose the product plugins yet. That is phase 2, where the bundle starts inserting the product rows and the profile drops the product bundle entries in the same edit.
- It does not fold the L5X ladder viewer into the L5X package. That is phase 3, and it is the only step that changes a plugin id.
- It does not reduce the size of any existing tool schema. That work belongs in the product repositories.

## Install in a development profile

Link the checkout into the profile and add the bundle to the profile's bundle list:

```json
{
  "dependencies": { "dsh-engineering": "link:C:/Users/<you>/.arya/github/KonnectSuite/dsh-engineering" },
  "dsh": { "profile": { "bundles": [ "…", "dsh-engineering" ] } }
}
```

The bundle must be listed **after** `@deepseek-ai/dsh-web-app`, because it overrides a row that bundle inserts.

Verify the composed config before starting the app:

```sh
pnpm dsh --profile <name> --dump-config | Select-String 'tool-capability-policy'
```

## Compatibility

Pinned to the DSH `0.2.x` line (`@deepseek-ai/dsh-tool-skill` `^0.2.0-rc.2`, Cordis `~4.0.4`). A profile on another line refuses the bundle at boot rather than composing it partially.

## Rollback

Remove the bundle from the profile bundle list. No product plugin, row id, or enable state is touched, so the previous behavior returns exactly.

## Verification

```sh
pnpm install
pnpm test
```

The test parses `cordis.patch.yml` and enforces the phase-1 invariants: one override entry, no inserted rows, a known skill for every prefix, and no prefix claimed twice.

## Roadmap

1. **Phase 1 (this):** exposure policy, no code moved.
2. **Phase 2:** bundle inserts the product rows; profiles swap from product bundles to this one; ids and enable state preserved.
3. **Phase 3:** the ladder viewer moves into `dsh-tool-l5x` as its client face over the existing `./analysis` entry; the standalone `ui-logix-project-viewer` plugin retires with a documented row reset.
4. **Ongoing:** per-product schema budgets enforced in each product repository, and one umbrella skill only if the per-product skills prove insufficient for routing.
