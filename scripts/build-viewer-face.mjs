#!/usr/bin/env node
/**
 * Bundle the L5X ladder viewer face into the module-loader registration the
 * shell expects.
 *
 * The face was previously a vendored tsdown artifact built in the AryaCode
 * workspace, which meant a change to `src/client` could not reach the shipped
 * bundle on a machine without that workspace. Everything the face needs is
 * here instead: React and the shell's primitives come through the loader's
 * `require`, the CSS modules transform is a plugin in this file, and the two
 * workspace-path helpers the shell inlines upstream are vendored beside the
 * face. `scripts/build-client.mjs` then folds this registration into the
 * bundle's single client module.
 *
 * The output must keep the artifact's shape: one
 * `window.__ModuleLoader__.load({ id, factory })` call whose factory builds a
 * CommonJS module and returns its exports, because that is what
 * `scripts/build-client.mjs` slices out and what the shell's loader applies.
 */

import { createRequire } from 'node:module'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE = join(ROOT, 'packages', 'viewer')
const ENTRY = join(PACKAGE, 'src', 'client', 'index.ts')
const OUT = join(PACKAGE, 'lib', 'client.js')
/** The vendored upstream tsdown build, kept once as provenance before the first rebuild. */
const UPSTREAM = join(PACKAGE, 'lib', 'client-upstream.js')

/**
 * The registration id. It must be the id `scripts/build-client.mjs` extracts,
 * and the shell keys a client module by package name, so it also has to be
 * resolvable as this package's name in the bundle.
 */
const ID = 'dsh-engineering-l5x-viewer'

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

/**
 * Scope one stylesheet's class names, the way the client build's CSS-module
 * transform does: a per-file prefix, so a name cannot collide with the shell or
 * another face, and an exported map the component reads as `css.rungNumber`.
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
 * The esbuild plugins that make this face buildable outside the AryaCode
 * workspace: CSS modules, and the one harness utility the shell inlines.
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
  }, {
    name: 'workspace-path',
    setup(build) {
      // The upstream client build inlines this utility into the face; this
      // repository has no harness packages, so the copy beside the face serves.
      build.onResolve({ filter: /^@deepseek-ai\/dsh-util-workspace-path$/ }, () => ({
        path: join(PACKAGE, 'src', 'client', 'vendor', 'workspace-path.ts'),
      }))
    },
  }]
}

/**
 * Bundle the face and wrap it in its module-loader registration.
 * @returns the registration source written to `packages/viewer/lib/client.js`.
 */
export async function buildViewerFace() {
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
    // Everything the shell's module table serves, plus React. The face must not
    // bundle a second copy of either: one React per page, one primitive set.
    external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'],
  })
  const body = result.outputFiles[0].text
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
  if (!existsSync(UPSTREAM)) copyFileSync(OUT, UPSTREAM)
  const source = await buildViewerFace()
  writeFileSync(OUT, source, 'utf8')
  console.log(`viewer face: ${source.length} bytes -> ${relative(ROOT, OUT)}`)
}
