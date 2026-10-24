import { defineConfig, type UserConfig } from 'tsdown'

/**
 * Bundle the browser half of this package.
 *
 * The page materializes a closure-factory artifact at `lib/client.js`: one CJS
 * bundle whose banner registers `{ id, factory }` with `window.__ModuleLoader__`
 * and whose body is the factory. Everything the shell's frozen module table
 * answers stays an external `require(...)`; everything else is inlined, because
 * a `require` the table cannot answer throws at materialization.
 *
 * The bundle id is the package name, which is the profile channel's contract: a
 * mismatch registers under a key the shell never asks for, presenting as a
 * plugin that loaded and drew nothing rather than as an error.
 */

/** Bundle id (package name): the module-table registration key. */
const ID = '@aryacode/dsh-engineering-l5x'

/** Specifiers the shell seeds into the module table. */
const MODULE_TABLE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/** The browser half: the closure-factory bundle the page loads. */
const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  sourcemap: true,
  deps: {
    neverBundle: MODULE_TABLE,
    alwaysBundle: (specifier: string) => !MODULE_TABLE.includes(specifier),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    footer: 'return module.exports; } });',
  },
  jsx: 'automatic',
} as UserConfig

export default defineConfig([client])
