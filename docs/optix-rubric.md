# The design rubric

`optix_ui { action: "review" }` grades a screen the way an engineer would before signing it off. It reads the live model through the bridge — geometry, font sizes, the presentation engines' style-sheet pointers, the widget types on the screen — and returns a score, a grade, the critical findings that must be fixed, and the runtime-only rules it refuses to call proven.

The point is to catch the difference the user cared about: a project can be *made* and still be entry level. The rubric makes that judgement mechanical instead of a matter of taste.

## What it grades

| rule | severity | what it decides |
| --- | --- | --- |
| `VIEW-SHELL-01` | critical | a band across the top at least 48 px tall and 80 % of the canvas wide — the window's `ShellHeader` counts, and the content host does not |
| `VIEW-NAV-01` | critical | a native `NavigationPanel` with at least two items, in the screen or in the window it sits in |
| `HMI-TARGET-01` | critical | every control is at least 44 × 44 px |
| `VIEW-TYPE-02` | critical | no text below 11 px |
| `HMI-CONTRAST-01` | critical | both presentation engines carry a style sheet, and the same one |
| `VIEW-CONSIST-01` | critical | the shell — header height, content host rectangle — agrees across screens |
| `VIEW-HDR-01` | warning | the header carries a title at 20 px or more, a status chip and the user or clock |
| `VIEW-ADAPTER-01` | warning | a vendor component or a process drawing carries the content, not a hand-drawn lookalike |
| `VIEW-EMPTY-01` | warning | the screen has enough on it to be a screen |

`VIEW-SHELL-01` and `VIEW-NAV-01` look at the window first: a screen inside a shell inherits the band and the rail, and grading it as if it had to draw its own would punish the correct design.

## What it refuses to claim

The rules that need a running runtime are reported, never counted as a pass:

- `VIEW-DLG-01` — a destructive command opens a confirm dialog (prove it by clicking it after Save and Build);
- `VIEW-STATE-01` — the active tab follows the open screen;
- `VIEW-DATA-01` — a data component shows live values.

## Score and grades

Start at 100. A critical finding costs 40, a warning costs 10, and the floor is 0.

- `professional` — score 85 or more **and** no critical finding;
- `acceptable` — score 70 to 84;
- `entry-level` — below 70, or any critical finding.

`must_fix` lists every critical finding with the node path and the one-line repair, so the answer is actionable rather than a score with no next step.

## Reading the model

`map` reports the tree (names, types, `ref`) but not property values, and every rule is geometry or a font size, so `review` reads each node once through `nodes` and merges `LeftMargin`/`TopMargin`/`Width`/`Height`/`FontSize` in. The walk is bounded to 400 nodes per descriptor and is batched eight at a time, so a large screen cannot turn a review into a crawl.

The window is read as a second descriptor and passed to the rubric as `window`; when the reviewed path *is* the window, the consistency rule is skipped because a window is not a screen.

## Measured on the live project

`AryaOptixTemplate`, bridge 1.0.9, 1280 × 800, after the shell, the modern theme and a kit screen were authored:

```
$ node test/optix-live-review.mjs UI/Screens/UiProbe
score                  90 (professional)
must fix               0
  warning              VIEW-ADAPTER-01 UiProbe - nothing on the screen is a vendor component or a process drawing
  unverified           VIEW-DLG-01 - a destructive command opens a confirm dialog - prove it by clicking it in the runtime
```

Before the shell and the theme the same screen graded `30 (entry-level)` with `VIEW-NAV-01` and `HMI-CONTRAST-01` critical — which is exactly the two things the earlier project was missing.

## Preparing a screen for a good grade

1. `optix_ui { action: "theme", mode: "apply" }` — one language on both engines.
2. `optix_ui { action: "shell", mode: "apply" }` — header band with title, chip, clock and user; native rail; content host; status strip.
3. `optix_ui { action: "screen", mode: "apply", blueprint }` — a designed screen inside that shell.
4. Import a vendor component and place it through `adapters[]` when the screen carries data.
5. `optix_ui { action: "review", screen }` — repair `must_fix`, repeat until the grade is `professional`.
6. Save and Build in Studio, then prove the runtime-only rules: `optix_nav verify`, a click on a destructive command.

`optix_ui { action: "components" }` returns the same rule list under `rubric`, so an agent can read the bar before it draws anything.
