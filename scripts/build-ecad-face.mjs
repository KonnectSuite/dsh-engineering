#!/usr/bin/env node
/**
 * Bundle the ECAD drawing preview face into the module-loader registration the
 * shell expects.
 *
 * The face is written in TypeScript against React and the document-preview slot
 * contract, so it has to be bundled before `scripts/build-client.mjs` can fold
 * it into the bundle's single registration: the loader gives every face a plain
 * `require`, and the bundle resolves `react` through it.
 *
 * The transforms AryaCode's client toolchain supplies are here instead: a
 * CSS-module transform (a scoped class map plus one injected stylesheet tag), and
 * the workspace-address helpers vendored beside the face. The output keeps the
 * artifact shape `scripts/build-client.mjs` slices:
 *
 *   window.__ModuleLoader__.load({ id, factory: (require) => { … } })
 *
 * The registration id is this face's own; the merged bundle discards it and
 * registers under the package name, but the loader contract above is what the
 * fold reads.
 */

import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE = join(ROOT, 'packages', 'ecad')
const ENTRY = join(PACKAGE, 'src', 'client', 'index.tsx')
const OUT = join(PACKAGE, 'lib', 'client.js')

/** The registration id this face's own artifact carries. */
const ID = '@aryacode/dsh-engineering-ecad'

/**
 * Load the esbuild that pnpm installed.
 * @returns the esbuild module.
 */
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

/**
 * Scope one stylesheet's class names, the way the client build's CSS-module
 * transform does: a per-file prefix so a name cannot collide with the shell or
 * another face, and an exported map the component reads as `css.root`.
 * @param file - absolute path of the stylesheet.
 * @param source - its text.
 * @returns the scoped stylesheet and the class map.
 */
export function scopeStylesheet(file, source) {
  const prefix = `_${createHash('sha256').update(relative(ROOT, file).replace(/\\/g, '/')).digest('base64url').slice(0, 6)}`
  const classes = new Map()
  const css = source.replace(/(?<![\w-])\.([A-Za-z_][\w-]*)/g, (match, name) => {
    if (!classes.has(name)) classes.set(name, `${prefix}_${name}`)
    return `.${classes.get(name)}`
  })
  return { css, classes }
}

/**
 * The stylesheet module: inject the sheet once per document, then export the
 * class map as the default export.
 * @param tagId - the stable id the injected `<style>` carries.
 * @param plugin - the package the stylesheet belongs to, stamped on the tag.
 * @param css - the scoped stylesheet text.
 * @param classes - class name to scoped name.
 * @returns the module source.
 */
export function stylesheetModule(tagId, plugin, css, classes) {
  const map = Object.fromEntries([...classes].map(([name, scoped]) => [name, scoped]))
  return `const css = ${JSON.stringify(css)}
const tagId = ${JSON.stringify(tagId)}
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style")
  tag.dataset.plugin = ${JSON.stringify(plugin)}
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}
const classes = ${JSON.stringify(map, null, 2)}
export default classes
`
}

/**
 * The esbuild plugin that makes a CSS module importable outside the AryaCode
 * workspace.
 * @returns the plugin list.
 */
export function facePlugins() {
  return [{
    name: 'css-modules',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, args => ({ path: join(args.resolveDir, args.path), namespace: 'css-module' }))
      build.onLoad({ filter: /.*/, namespace: 'css-module' }, (args) => {
        const source = readFileSync(args.path, 'utf8')
        const { css, classes } = scopeStylesheet(args.path, source)
        const name = args.path.split(/[\\/]/).pop() ?? 'stylesheet.css'
        return { contents: stylesheetModule(`${ID}/${name}`, ID, css, classes), loader: 'js', resolveDir: dirname(args.path) }
      })
    },
  }]
}

/**
 * Bundle the face and wrap it in its module-loader registration.
 * @returns the registration source written to `packages/ecad/lib/client.js`.
 */
export async function buildEcadFace() {
  const esbuild = loadEsbuild()
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'react',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: facePlugins(),
    // One React per page: the shell's module table serves it, and the face must
    // not bundle a second copy. The face draws with plain SVG elements rather
    // than the shell's component primitives, so nothing else is external.
    external: ['react', 'react/jsx-runtime'],
  })
  // esbuild annotates a virtual module with its absolute path; keep the checkout
  // path out of the committed artifact.
  const body = result.outputFiles[0].text.replace(/^\/\/ css-module:[^\r\n]*\r?\n/gmu, '')
  return `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
${body}
    return module.exports
  },
})
`
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(dirname(OUT), { recursive: true })
  const source = await buildEcadFace()
  writeFileSync(OUT, source, 'utf8')
  console.log(`ecad face: ${source.length} bytes -> ${relative(ROOT, OUT)}`)
}
