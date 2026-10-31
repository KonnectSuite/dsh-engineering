/**
 * One-off inspection of the harness measurement: dumps the geometry so a layout
 * defect can be read as numbers instead of guessed from a screenshot.
 */
import { renderLadderFace } from './harness.mjs'

const result = await renderLadderFace({
  file: process.argv[2],
  routine: process.argv[3],
  shot: '.harness/shots/diag.png',
})
console.log(JSON.stringify(result.measurement.layout, undefined, 1))
console.log(`document ${result.measurement.documentHeight}, pane ${result.measurement.paneHeight}, width ${result.measurement.width}`)
for (const failure of result.failures) console.log(`FAIL ${failure}`)
