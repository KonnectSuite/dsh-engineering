#!/usr/bin/env node
/**
 * Keep the knowledge library copies byte-identical.
 *
 * `packages/knowledge/src/` is the one source of the knowledge plane: `core.ts`
 * (the docs-tool library) and `html.ts` (help HTML -> readable text). The
 * package has no build and no manifest of its own; each product package that
 * serves a docs tool compiles its own copy, so the copies have to be the same
 * bytes or two products would answer differently from the same corpus.
 *
 * Usage:
 *   node scripts/sync-knowledge-lib.mjs           # refresh stale copies
 *   node scripts/sync-knowledge-lib.mjs --check   # exit 1, list stale copies
 *
 * A consumer whose package directory does not exist yet is skipped with a
 * warning: a component is retired by removing its package, and the copy list
 * must not make the repository's suite fail while that removal is in flight.
 * A consumer that exists but has no `src/knowledge/` directory is stale, not
 * skipped -- the sync creates it.
 *
 * @module dsh-engineering/scripts/sync-knowledge-lib
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const LIBRARY_DIR = join(root, 'packages', 'knowledge', 'src')

/** The library files every consumer compiles. */
const LIBRARY_FILES = ['core.ts', 'html.ts']

/** The packages that serve a docs tool and therefore carry a copy. */
const CONSUMERS = ['l5x', 'ftview', 'migration', 'plc5', 'slc']

/** A repository-relative path with forward slashes, for stable output. */
const display = path => relative(root, path).replaceAll('\\', '/')

/** The sha256 of a file, lowercase hex. */
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')

/** Print the usage block. */
function usage() {
  console.log(`Usage:
  node scripts/sync-knowledge-lib.mjs           Refresh stale copies.
  node scripts/sync-knowledge-lib.mjs --check   Exit 1 and list stale copies.

Copies ${LIBRARY_FILES.join(' and ')} from ${display(LIBRARY_DIR)}/ into
packages/<consumer>/src/knowledge/ for: ${CONSUMERS.join(', ')}.

A consumer package that does not exist yet is skipped with a warning.`)
}

/**
 * Compare every consumer copy with the library.
 *
 * @returns {{ stale: { consumer: string, file: string, sourcePath: string, targetPath: string, sourceHash: string, targetHash: string | null }[], skipped: string[] }}
 */
function collectStale() {
  const stale = []
  const skipped = []
  for (const consumer of CONSUMERS) {
    const packageDir = join(root, 'packages', consumer)
    if (!existsSync(packageDir)) {
      skipped.push(consumer)
      continue
    }
    const targetDir = join(packageDir, 'src', 'knowledge')
    for (const file of LIBRARY_FILES) {
      const sourcePath = join(LIBRARY_DIR, file)
      const targetPath = join(targetDir, file)
      const sourceHash = sha256(sourcePath)
      const targetHash = existsSync(targetPath) ? sha256(targetPath) : null
      if (targetHash === sourceHash) continue
      stale.push({ consumer, file, sourcePath, targetPath, sourceHash, targetHash })
    }
  }
  return { stale, skipped }
}

/**
 * Refresh stale copies or report them.
 *
 * @param {string[]} argv - The command-line arguments after the script name.
 * @returns {number} The process exit code.
 */
function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage()
    return 0
  }
  const check = argv.includes('--check')
  const unknown = argv.filter(argument => argument !== '--check')
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}`)
    usage()
    return 2
  }

  const missing = LIBRARY_FILES.filter(file => !existsSync(join(LIBRARY_DIR, file)))
  if (missing.length > 0) {
    console.error(`Missing knowledge library source: ${missing.map(file => display(join(LIBRARY_DIR, file))).join(', ')}`)
    return 2
  }

  const { stale, skipped } = collectStale()
  for (const consumer of skipped) {
    console.warn(`Skipping consumer "${consumer}": packages/${consumer} does not exist yet.`)
  }

  if (check) {
    if (stale.length === 0) {
      console.log(`Knowledge library copies are current (${CONSUMERS.length - skipped.length} consumer package(s) checked).`)
      return 0
    }
    console.error(`Knowledge library copies are stale (${stale.length}):`)
    for (const item of stale) {
      console.error(`  ${display(item.targetPath)} (source sha256 ${item.sourceHash}, target ${item.targetHash === null ? 'missing' : item.targetHash})`)
    }
    console.error('Run `node scripts/sync-knowledge-lib.mjs` to refresh the copies.')
    return 1
  }

  for (const item of stale) {
    mkdirSync(dirname(item.targetPath), { recursive: true })
    writeFileSync(item.targetPath, readFileSync(item.sourcePath))
    console.log(`copied ${display(item.sourcePath)} -> ${display(item.targetPath)}`)
  }
  const refreshed = stale.length === 0 ? 'all copies were current' : `${stale.length} file(s) refreshed`
  console.log(`Knowledge library synced: ${refreshed}; ${skipped.length} consumer package(s) skipped.`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
