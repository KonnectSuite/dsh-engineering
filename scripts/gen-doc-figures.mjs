/**
 * Regenerate the documentation figures from the viewer itself.
 *
 * Every figure in `docs/figures` that shows logic is a screenshot of the shipped
 * `packages/viewer/lib/client.js`, mounted in headless Chrome through the same document-preview
 * contract the shell uses. That is deliberate: a hand-drawn diagram in a README drifts from the
 * product the moment the product changes, and nothing catches it. Regenerating these is one command,
 * so a stale figure is a visible diff rather than a slow lie.
 *
 * Usage: node scripts/gen-doc-figures.mjs [--only <name>]
 */
import { existsSync } from 'node:fs'
import { renderLadderFace } from '../packages/viewer/test/render/harness.mjs'

/** The figures to draw: one routine of one export, at a size that fits a README. */
const FIGURES = [
  {
    name: 'viewer-ladder',
    file: 'packages/l5x/test/fixtures/sample.l5x',
    routine: 'MainRoutine',
    shot: 'docs/figures/viewer-ladder.png',
    width: 1440,
    height: 900,
    note: 'Ladder as the pane draws it: instruction blocks, tag labels and exported values.',
  },
  {
    name: 'viewer-st',
    file: 'packages/l5x/test/fixtures/sample.l5x',
    routine: 'FaultHandler',
    shot: 'docs/figures/viewer-st.png',
    width: 1280,
    height: 760,
    note: 'Structured Text as the pane shows it, with the copy affordance for the body.',
  },
  {
    name: 'viewer-fbd',
    file: 'packages/viewer/test/fixtures/diagrams.L5X',
    routine: 'Fb',
    diagram: true,
    shot: 'docs/figures/viewer-fbd.png',
    width: 1280,
    height: 760,
    note: 'A function block sheet drawn from the geometry the export records.',
  },
  {
    name: 'viewer-sfc',
    file: 'packages/viewer/test/fixtures/diagrams.L5X',
    routine: 'Chart',
    diagram: true,
    shot: 'docs/figures/viewer-sfc.png',
    width: 1280,
    height: 760,
    note: 'A chart: steps, the initial-step marker, the transition and its condition.',
  },
]

const only = process.argv.indexOf('--only') === -1 ? undefined : process.argv[process.argv.indexOf('--only') + 1]
let failed = false

for (const figure of FIGURES) {
  if (only !== undefined && figure.name !== only) continue
  if (!existsSync(new URL(`../${figure.file}`, import.meta.url))) {
    console.log(`skip ${figure.name}: ${figure.file} is not present`)
    continue
  }
  try {
    const result = await renderLadderFace({
      file: figure.file,
      routine: figure.routine,
      diagram: figure.diagram === true,
      shot: figure.shot,
      width: figure.width,
      height: figure.height,
      // A figure only has to look right; the assertions belong to the e2e suites.
      requireValues: false,
    })
    // A diagram routine has no ladder instructions, so the ladder judge reports that as a failure;
    // it is not a figure failure and is dropped here rather than passed on.
    const failures = (result.failures ?? []).filter(failure => !failure.includes('no instruction rendered'))
    const pageError = failures.find(failure => failure.startsWith('page error'))
    const state = pageError === undefined ? 'ok  ' : 'FAIL'
    if (pageError !== undefined) failed = true
    console.log(`${state} ${figure.name} -> ${figure.shot}${pageError === undefined ? '' : ` — ${pageError}`}`)
  } catch (error) {
    failed = true
    console.log(`FAIL ${figure.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

process.exitCode = failed ? 1 : 0
