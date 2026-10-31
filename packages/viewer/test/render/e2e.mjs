#!/usr/bin/env node
/**
 * Run the ladder-face end-to-end harness from the command line and report the
 * measurement. Exit code 1 means the face has a rendering defect the harness can
 * prove, so this is the gate a release is signed against.
 */

import { renderLadderFace } from './harness.mjs'

const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const result = await renderLadderFace({
  file: option('file', undefined),
  routine: option('routine', undefined),
  shot: option('shot', '.harness/shots/ladder-face.png'),
  width: option('width', undefined) === undefined ? undefined : Number(option('width')),
  height: option('height', undefined) === undefined ? undefined : Number(option('height')),
})

console.log(`rungs ${result.measurement.rungs}, instructions ${result.measurement.instructions}, clipped ${result.measurement.clipped.length}`)
if (result.shot !== undefined) console.log(`screenshot ${result.shot}`)
for (const failure of result.failures) console.log(`FAIL ${failure}`)
if (result.failures.length === 0) console.log('PASS the ladder pane renders every operand, value and label in full')
process.exitCode = result.failures.length === 0 ? 0 : 1
