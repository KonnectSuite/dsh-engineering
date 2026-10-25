/**
 * Assemble one publishable package out of the engineering components.
 *
 * Each component keeps its own directory tree under `vendor/`. Flattening them
 * into a shared `lib/` would break the relative lookups the modules already do -
 * a skill module resolves `../SKILL.md` from its own package root, and the
 * Studio bridge and MotionWorks engine resolve their asset folders the same way.
 * Keeping the tree means those paths stay true with no source edits.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VENDOR = join(ROOT, 'vendor')

/** Component packages, in build order. Optix arrives built (no source of ours). */
export const COMPONENTS = [
  "l5x",
  "ftview",
  "mwi",
  "optix"
]

/** Copy one component's built tree into the vendored layout. */
async function vendor(name) {
  const from = join(ROOT, 'packages', name)
  const to = join(VENDOR, name)
  const built = await stat(join(from, 'lib', 'index.js')).catch(() => undefined)
  if (built === undefined) throw new Error(`${name}: build it first (pnpm --filter @aryacode/dsh-engineering-${name} build)`)
  await rm(to, { recursive: true, force: true })
  await mkdir(to, { recursive: true })
  // `templates`, `locale` and `icon.svg` belong to the Optix tree; the rest are
  // the three L5X/FTView/MotionWorks layouts. A missing entry is skipped, so one
  // list serves every component.
  for (const entry of ['lib', 'SKILL.md', 'README.md', 'studio-bridge', 'bridge', 'code', 'legacy', 'poll-worker.mjs', 'cip-worker.mjs', 'templates', 'locale', 'icon.svg']) {
    await cp(join(from, entry), join(to, entry), { recursive: true, filter: s => !s.endsWith('.ts') || s.endsWith('.d.ts') }).catch(() => {})
  }
}

await rm(VENDOR, { recursive: true, force: true })
for (const name of COMPONENTS) await vendor(name)
console.log(`assembled ${COMPONENTS.length} components into vendor/`)
