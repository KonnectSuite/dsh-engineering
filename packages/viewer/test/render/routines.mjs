#!/usr/bin/env node
/**
 * Sweep every ladder routine of an export through the shipped face.
 *
 * The case table in `suite.mjs` proves chosen routines; this sweep proves the
 * ones nobody looked at, in one browser, so a shape that only appears in an
 * unscheduled program or a migrated routine cannot slip through. It reports one
 * line per routine and fails when any routine renders nothing, clips text,
 * escapes a cell, overprints a neighbour or logs to the console.
 *
 * Usage:
 *   node --import tsx packages/viewer/test/render/routines.mjs
 *   node --import tsx packages/viewer/test/render/routines.mjs --file ../_e2e/out/Century-fixed.L5X
 *   node --import tsx packages/viewer/test/render/routines.mjs --shots .harness/shots/sweep
 *
 * Options:
 *   --file <path>   Export to sweep, repo-relative. Default: CT9-Source.L5X.
 *   --width <px>    Viewport width. Default 1680.
 *   --height <px>   Viewport height. Default 1200.
 *   --shots <dir>   Write one screenshot per routine.
 *   --limit <n>     Visit at most n routines (for a quick pass while iterating).
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, renderLadderFace } from './harness.mjs'

/** Read the option that follows a flag on the command line. */
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const file = option('file', '../_e2e/out/CT9-Source.L5X')
const width = Number.parseInt(option('width', '1680'), 10)
const height = Number.parseInt(option('height', '1200'), 10)
const shots = option('shots', undefined)
const limit = option('limit', undefined) === undefined ? undefined : Number.parseInt(option('limit'), 10)
if (!existsSync(join(REPO, file))) throw new Error(`routines: no export at ${file}`)

// The organizer is the authority on what a reader can open, so the sweep asks
// the face itself rather than re-deriving routine names from the export.
const result = await renderLadderFace({
  file,
  width,
  height,
  routines: '*',
  shots,
  requireValues: false,
})

const cases = limit === undefined ? result.cases : result.cases.slice(0, limit)
const failed = cases.filter(item => item.failures.length > 0)
for (const item of cases) {
  const measurement = item.measurement
  const counts = `${measurement.rungs} rung(s), ${measurement.instructions} instruction(s), ${measurement.labels.length} label(s), clipped ${measurement.clipped.length}`
  if (item.failures.length === 0) console.log(`PASS ${item.routine} — ${counts}`)
  else console.log(`FAIL ${item.routine} — ${counts}: ${item.failures.join('; ')}`)
}
console.log(`${cases.length - failed.length}/${cases.length} routines of ${file} passed`)
if (failed.length > 0) process.exitCode = 1
