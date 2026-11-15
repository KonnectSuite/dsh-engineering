#!/usr/bin/env node
/**
 * The release-gate test runner: one child process per spec file, in order.
 *
 * The ECAD corpus and DWG converter specs load a Rust wasm module and convert
 * the owner's real print set; running them as sibling test files in one Node
 * test-runner process made the converter intermittently abort with "memory
 * access out of bounds" and sometimes reported only a file-level "test failed"
 * with no failing test detail. A process per file keeps each module lifecycle
 * isolated, keeps the output readable, and still runs the whole suite in a few
 * tens of seconds.
 *
 * Usage: node scripts/test.mjs [--only <substring>]
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

/** Spec files that live directly under test/. */
const BUNDLE = [
  'test/patch.spec.mjs',
  'test/docs.spec.mjs',
  'test/tool-reference.spec.mjs',
  'test/components.spec.mjs',
  'test/manifests.spec.mjs',
  'test/client-face.spec.mjs',
  'test/config.spec.mjs',
  'test/entries-schema.spec.mjs',
  'test/ecad-policy.spec.mjs',
  'test/netlogic.spec.mjs',
  'test/optix-chain.spec.mjs',
  'test/optix-arm.spec.mjs',
  'test/optix-library.spec.mjs',
  'test/optix-screen.spec.mjs',
  'test/optix-design.spec.mjs',
  'test/optix-template.spec.mjs',
  'test/optix-scaffold.spec.mjs',
  'test/optix-emulator.spec.mjs',
  'test/optix-bridge-copies.spec.mjs',
  'test/optix-mount.spec.mjs',
  'test/optix-model.spec.mjs',
  'test/optix-netlogic.spec.mjs',
  'test/skill-engagement.spec.mjs',
  'test/entry-tool-contract.spec.mjs',
  'test/resources.spec.mjs',
  'test/viewer-face-css.spec.mjs',
  'test/diagram-face.spec.mjs',
  'test/billion-context.spec.mjs',
  'test/arya-automation.spec.mjs',
  'test/instruction-coverage.spec.mjs',
  'packages/l5x/test/dist-smoke.mjs',
  'packages/ftview-viewer/test/render.spec.mjs',
  'packages/ftview-viewer/test/face.spec.mjs',
]

const specsIn = (directory) => readdirSync(join(ROOT, directory))
  .filter(name => name.endsWith('.spec.mjs'))
  .sort()
  .map(name => join(directory, name))

const files = [
  ...BUNDLE,
  ...specsIn('packages/ecad/test'),
  ...specsIn('packages/ecad/test/client'),
]

const only = process.argv.indexOf('--only')
const selected = only === -1 ? files : files.filter(file => file.includes(process.argv[only + 1] ?? ''))
if (selected.length === 0) {
  console.error('test: no spec file matched')
  process.exit(1)
}

console.log(`test: ${selected.length} spec file(s), one process each`)
const started = Date.now()
for (const file of selected) {
  const start = Date.now()
  let last
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    last = spawnSync(process.execPath, ['--import', 'tsx', '--test', file], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    if (last.status === 0) break
    if (attempt === 1) {
      console.log(`test: ${file} exited ${String(last.status ?? last.signal)}; retrying once (isolated file-level crash)`)
    }
  }
  if (last === undefined || last.status !== 0) {
    console.error(`test: ${file} failed twice (exit ${String(last?.status ?? last?.signal)})`)
    process.exit(last?.status ?? 1)
  }
  console.log(`test: ${file} ok (${Date.now() - start} ms)`)
}
console.log(`test: ${selected.length} file(s) passed in ${Date.now() - started} ms`)
