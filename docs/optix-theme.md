# Optix design languages

A screen is not designed by choosing colours at every widget: it is designed by choosing a **language**
once, and letting every control read its colour, radius, padding and type from that language. Optix has
the mechanism for this — a `StyleSheet` object bound on the presentation engine — and the kit now authors
it instead of leaving every screen at the stock grey.

This page covers `optix_ui`: the seven languages it ships, what a language turns into in the model, the
two actions that write and audit it, and the measured traps that make a naive stylesheet look applied
while the runtime still draws the old one.

## The languages

`optix_ui { action: "languages" }` lists them with their accent colour, window colour, font size and
radius. The catalogue is a data file (`packages/optix/lib/languages.js`) so a project can be pinned to a
language without a code change.

| Language | For | Character |
| --- | --- | --- |
| `modern` | **default** — dashboards, machine HMIs, line overviews | light grey backdrop, white cards, navy header band, one accent for interactive state, 4/8 px radii, one soft elevation |
| `modern-dark` | control rooms, wall displays, night shifts | the same anatomy on `#11151B`, restrained accent, no pure black |
| `isa101` | process HMIs under ISA-101 / ISA-18.2 | muted greys, no shadows or gradients, square corners, colour only for abnormal state |
| `isa101-hc` | high-contrast variant of the above | 7:1 text contrast, ≥44 px targets, thicker borders |
| `material-dark` | touch panels with a Material feel | `#121212` surface, cyan accent, 16 px type, larger radii |
| `minimal-light` | engineering and configuration screens | near-white, hairline rules, no accent fills |
| `kiosk` | gloved-hand and long-distance use | 1.5× type and targets, fewer, larger controls |

Every language carries three things: **tokens** (the `StyleSheet`'s own properties — `WindowColor`,
`AccentColor`, `TextColor`, `FontPixelSize`, `Radius`, …), **named styles** (`Primary`/`Secondary`/
`Danger` button styles, `Title`/`Body`/`Caption` labels, a screen background style, a navigation style)
and a **rubric profile** (minimum target size, font floor, density band) that the design checks in
`optix_rubric`/`optix_production_check` read. A language missing a token fails validation before it can
be applied.

## What applying one writes

`optix_ui { action: "theme", mode: "plan" }` returns the operations without touching the model:

1. `create_object` of type `StyleSheet` under `UI` — Studio populates its **17 named style collections**
   (`ButtonStyles`, `InputBoxStyles`, `NavigationPanelStyles`, `ScreenStyles`, `ChartStyles`, …) itself.
2. one `set_property` per token on the sheet node.
3. one `create_object` per named style inside its collection (`ButtonStyles/Primary` of type
   `ButtonStyle`) plus its properties (`Color`, `TextColor`, `BorderWidth`, `Radius`, …).
4. two pointer writes: `UI/NativePresentationEngine/StyleSheet` **`Value`** and
   `UI/WebPresentationEngine/StyleSheet` **`Value`**, each set to the **project-relative** path
   `UI/<Sheet>`. The absolute `/Objects/<Project>/UI/<Sheet>` spelling is refused by `validate_ops`
   (see the trap below).

Then `mode: "apply"` (behind `allowWrites`) validates the whole batch strictly, dispatches it one
operation at a time with a health re-check before each, and **reads both engines back**. The answer
carries `engine_refs_after` and `engine_refs_verified`; a theme whose engines did not take is reported as
`applied_unverified`, never as done.

Re-applying is safe and is how a theme is repaired: tokens and styles are restated, only the sheet
creation is skipped when the node already exists.

## The two traps that make a theme look applied

Measured on bridge 1.0.9 (Studio 1.8.1.27):

```
set_property  path="UI/NativePresentationEngine"  name="StyleSheet"  value="UI/Sheet_modern"
  -> ok            # the bridge accepted it
read UI/NativePresentationEngine/StyleSheet
  -> ref: "UI/DefaultStyleSheet"   # the engine never moved
```

A `NodeId` property is not written by naming it on the owning node. It is written on the pointer node's
own **`Value`** child, and the truth is the `ref` that comes back when you read it. The kit writes the
pointer that way everywhere (`theme.js`, the navigation rail's `Panel` items, the dialog button's
`Dialog` argument) and reads it back before it reports success — "the write answered ok" is not one of
the facts a theme can rest on.

The second trap is how the value is spelled. `validate_ops` resolves a `NodeId` value against the
project tree and accepts only the project-relative form:

```
set_property  path="UI/NativePresentationEngine/StyleSheet"  name="Value"  value="UI/Sheet_modern"
  -> validates
set_property  path="UI/NativePresentationEngine/StyleSheet"  name="Value"  value="/Objects/<Project>/UI/Sheet_modern"
  -> bad_value: NodeId value must be a resolvable node path
```

The refusal happens whether or not the sheet exists, so it is not a timing problem: write `UI/<Sheet>`,
then read the engine's `ref` back. `samePointer` treats the relative, `/Objects/<Project>/…` and
`<Project>/…` spellings as one node so an audit judges the pointer, not its formatting.


## Auditing what the model carries

`optix_ui { action: "audit" }` reads the sheet and both engine pointers and answers with a score:

| Finding | Severity | Means |
| --- | --- | --- |
| `THEME-01` | critical | nothing was named to audit |
| `THEME-02` | critical | an engine still reads another sheet — the language is not applied at runtime |
| `THEME-03` | warning | tokens are missing from the sheet (someone deleted one, or the apply stopped) |
| `THEME-04` | warning | named styles are missing, so a control that references one falls back to the sheet defaults |

`ok` is true only when no critical finding stands. The audit is what a release report cites: it is the
difference between "I ran the theme tool" and "the running project reads this sheet".

Proved live on 2026-11-15 against project `AryaOptixTemplate` (bridge 1.0.9, Studio 1.8.1.27):
`plan` validated 21 sheet operations, `apply` wrote 78 operations in three phases,
`engine_refs_after` showed both engines on `UI/Sheet_dsh_live`, `engine_refs_verified` was true, and
`audit` then reported `ok: true, score: 100`. The harness that does it — and puts both engine pointers
and the sheet node back afterwards — is `test/optix-live-theme.mjs`.

## Where the language shows up next

The language is not a skin applied at the end. The screen generator reads the same language when it
decides layout density, type scale, target sizes and which controls get a card, and the design checks
read its rubric profile so `isa101` is judged by ISA-101 rules rather than by `modern` ones. Switching a
project from `modern` to `isa101` is one `optix_ui { action: "theme", mode: "apply" }` call plus the
Studio save and build; no blueprint is rewritten.

For a project that needs the vendor's own look, the Studio install ships four stylesheets
(`FriendlyLight`, `FriendlyDark`, `MaterialDark`, `ISAStyleSheet`) — name one as `sheet_path` and the
audit will confirm the engines read it, without authoring anything.
