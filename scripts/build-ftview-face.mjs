#!/usr/bin/env node
/**
 * Bundle the FTView preview face into the module-loader registration the shell
 * expects.
 *
 * The face is written in TypeScript against the maintained renderer, so it has
 * to be bundled before `build-client.mjs` can merge it: the loader gives every
 * face a plain `require`, and the bundle resolves `react` through it.
 */

import { createRequire } from 'node:module'
import { copyFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE = join(ROOT, 'packages', 'ftview-viewer')
const ENTRY = join(PACKAGE, 'face', 'face.ts')
const OUT = join(PACKAGE, 'lib', 'client.js')
const LEGACY = join(PACKAGE, 'lib', 'client-legacy.js')
const ID = '@aryacode/dsh-engineering-ftview-viewer'

/** Load the esbuild that pnpm installed. */
function loadEsbuild() {
  // A hoisted install (`--config.node-linker=hoisted`) puts esbuild at the top
  // level instead of node_modules/.pnpm; accept either layout.
  const hoisted = join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js')
  if (existsSync(hoisted)) return createRequire(import.meta.url)(hoisted)
  const store = join(ROOT, 'node_modules', '.pnpm')
  const directory = readdirSync(store).find(name => name.startsWith('esbuild@'))
  if (directory === undefined) throw new Error('esbuild is not installed in node_modules/.pnpm or node_modules/esbuild')
  return createRequire(import.meta.url)(join(store, directory, 'node_modules', 'esbuild', 'lib', 'main.js'))
}


const esbuild = loadEsbuild()
const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  external: ['react'],
  logLevel: 'silent',
})
const body = result.outputFiles[0].text
const wrapped = `window.__ModuleLoader__.load({
  id: '${ID}',
  factory: (require) => {
    const module = { exports: {} }
    ;(function (module, exports, require) {
${body}
    })(module, module.exports, require)
    return module.exports
  },
})
`
if (!existsSync(LEGACY)) copyFileSync(OUT, LEGACY)
writeFileSync(OUT, wrapped, 'utf8')
console.log(`ftview face: ${wrapped.length} bytes -> ${OUT.replace(ROOT, '.')}`)
