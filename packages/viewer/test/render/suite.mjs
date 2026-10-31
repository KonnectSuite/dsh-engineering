/**
 * The ladder face's end-to-end suite: real Chrome, the shipped bundle, real
 * exports, one line per case.
 *
 * Every case mounts `packages/viewer/lib/client.js` - the exact bytes the
 * package ships - reads an export through the same document-preview contract
 * the shell uses, opens a routine the way a reader clicks it, and then asserts
 * on the rendered document rather than on a model of it: no clipped text, one
 * tag label per instruction, no label escaping its cell, no two labels
 * overlapping, semantic timer pins, and the exported values on screen.
 *
 * Usage: node packages/viewer/test/render/suite.mjs [--keep]
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderLadderFace } from './harness.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const SHOTS = join(REPO, '.harness/shots')

/**
 * One routine of one export, at one viewport.
 * `requireValues` is false only where the export records no values for the
 * routine at all (a rung list of bare JSR calls), because then there is
 * nothing to show and asserting a chip would assert the fixture, not the face.
 */
const cases = [
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'BottomCutter_Comms', width: 1680, height: 1200 },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'BottomCutter_Comms', width: 1280, height: 900 },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'BottomCutter_Axis', width: 1680, height: 1200, requireValues: false },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'Cutter_AxisInterlocks', width: 1680, height: 1200, requireValues: false },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'Cutter_StopControl', width: 1680, height: 1200, requireValues: false },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'TopCutter_Comms', width: 1680, height: 1200 },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'CutterMain', width: 1680, height: 1200, requireValues: false },
  { file: '../_e2e/out/CT9-Source.L5X', routine: 'BottomCutter_Comms', width: 1680, height: 1200, bundle: true },
  { file: '../_e2e/out/CT10-Source.L5X', routine: 'BottomCutter_Comms', width: 1680, height: 1200 },
  { file: '../_e2e/out/Century-fixed.L5X', routine: '_2_MAIN', width: 1680, height: 1200 },
  { file: '../_e2e/out/Century-fixed.L5X', routine: '_9_POSITIONS', width: 1680, height: 1200, requireValues: false },
]

mkdirSync(SHOTS, { recursive: true })
const results = []
for (const [index, item] of cases.entries()) {
  const file = resolve(REPO, item.file)
  const name = `${item.file.split('/').at(-1)} ${item.routine} ${item.width}x${item.height}${item.bundle === true ? ' bundled' : ''}`
  if (!existsSync(file)) {
    results.push({ name, ok: false, detail: `missing export ${item.file}` })
    continue
  }
  const shot = join(SHOTS, `suite-${String(index).padStart(2, '0')}.png`)
  let result
  try {
    result = await renderLadderFace({
      file: item.file,
      routine: item.routine,
      width: item.width,
      height: item.height,
      requireValues: item.requireValues ?? true,
      bundle: item.bundle === true,
      shot,
    })
  } catch (error) {
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) })
    continue
  }
  const { measurement, failures } = result
  results.push({
    name,
    ok: failures.length === 0,
    detail: failures.length === 0
      ? `rungs ${measurement.rungs}, instructions ${measurement.instructions}, labels ${measurement.labels.length}, clipped ${measurement.clipped.length}`
      : failures.join('; '),
    shot,
  })
}

let failed = 0
for (const result of results) {
  if (!result.ok) failed += 1
  console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name} — ${result.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} cases passed`)
if (failed > 0) process.exitCode = 1
