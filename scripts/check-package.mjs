#!/usr/bin/env node
/**
 * Packaging conformance for the published tarball.
 *
 * `npm publish` ships exactly two things: the `files` whitelist and what those
 * entries resolve to. Everything a row needs at mount time therefore has to be
 * inside that whitelist, and anything that is not is a bug the author cannot see
 * locally, because the checkout always has more on disk than the tarball does.
 *
 *   pnpm check:package        # this script, human-readable
 *   test/package.spec.mjs     # the same findings as a test, so the suite gates them
 *
 * `docs.spec.mjs` already covers dependency provenance; this is about identity,
 * what ships, and how big it is.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load } from 'js-yaml'

const ROOT = resolve(import.meta.dirname, '..')

/** Sizes are the unpacked tarball, which is what npm reports and what a market caps. */
const WARN_BYTES = 48 * 1024 * 1024
const ERROR_BYTES = 64 * 1024 * 1024

const read = path => readFileSync(join(ROOT, path), 'utf8')
const exists = path => existsSync(join(ROOT, path))

/**
 * npm's `files` semantics, near enough for a whitelist this shape: a bare path
 * matches itself or everything under it, a trailing `/**` is recursive, `**`
 * inside a path spans any number of segments (`lib/**\/*` includes lib/index.js),
 * and `*` is one path segment.
 */
function globToRegExp(pattern) {
  const parts = pattern.split('/')
  let source = ''
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1
    if (part === '**') source += last ? '.*' : '(?:[^/]+/)*'
    else {
      source += part.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '[^/]*')
      if (!last) source += '/'
    }
  }
  return new RegExp(`^${source}$`, 'u')
}

/** npm always includes these at the package root, whatever `files` says. */
const ALWAYS_SHIPPED = name => /^(?:package\.json|readme(?:\.[a-z]+)?|licen[cs]e(?:\.[a-z]+)?)$/iu.test(name)

function shippedMatcher(patterns) {
  return path => ALWAYS_SHIPPED(path)
    || patterns.some(pattern => {
      if (pattern.endsWith('/**')) return path === pattern.slice(0, -3) || path.startsWith(`${pattern.slice(0, -3)}/`)
      if (!pattern.includes('*')) return path === pattern || path.startsWith(`${pattern}/`)
      return globToRegExp(pattern).test(path)
    })
}

function walk(directory, out = []) {
  for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) walk(path, out)
    else if (entry.isFile()) out.push(path)
  }
  return out
}

function exportTargets(exports) {
  const targets = []
  const visit = value => {
    if (typeof value === 'string') targets.push(value)
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(exports ?? {})
  return targets
}

const packageOf = name => (name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0])

/**
 * What `files` resolves to on disk: every shipped file and its size. The tarball
 * npm builds is this set, so a number here is the number the market reads.
 */
export function payload() {
  const manifest = JSON.parse(read('package.json'))
  const files = manifest.files ?? []
  const found = new Map()
  for (const pattern of files) {
    const parts = pattern.split('/')
    const wildcard = parts.findIndex(part => part.includes('*'))
    const base = wildcard === -1 ? pattern : parts.slice(0, wildcard).join('/') || '.'
    if (!existsPattern(base) || !statSync(join(ROOT, base)).isDirectory()) continue
    const regex = globToRegExp(pattern)
    for (const path of walk(base)) if (regex.test(path)) found.set(path, statSync(join(ROOT, path)).size)
  }
  // npm includes the manifest and the licence even when `files` omits them.
  if (exists('package.json') && !found.has('package.json')) found.set('package.json', statSync(join(ROOT, 'package.json')).size)
  return [...found].map(([path, bytes]) => ({ path, bytes })).sort((a, b) => b.bytes - a.bytes)
}

export { WARN_BYTES, ERROR_BYTES }

const existsPattern = path => path !== '.' && exists(path)

/**
 * @returns {{ level: 'error' | 'warning', rule: string, message: string }[]}
 */
export function findings() {
  const out = []
  const error = (rule, message) => out.push({ level: 'error', rule, message })
  const warning = (rule, message) => out.push({ level: 'warning', rule, message })

  const manifest = JSON.parse(read('package.json'))
  const patch = load(read(manifest.dsh?.bundle?.patch ?? 'cordis.patch.yml'))
  const rows = patch.flatMap(entry => entry.insert ?? [])
  const files = manifest.files ?? []
  const shipped = shippedMatcher(files)

  // --- identity: what npm and the market read before anything runs -------------
  if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/u.test(manifest.name ?? '')) error('PKG-01', `name ${manifest.name} is not a scoped package name`)
  if (manifest.publishConfig?.access !== 'public') error('PKG-01', 'publishConfig.access must be "public"; a scoped package publishes private by default')
  if (manifest.license !== 'MIT') error('PKG-01', `license is ${manifest.license}; the bundle ships MIT code`)
  if (!manifest.author) error('PKG-01', 'author is missing')
  if (!manifest.description || manifest.description.length < 60) error('PKG-01', 'description is missing or too short to describe the bundle')
  if (manifest.description.length > 200) warning('PKG-01', `description is ${manifest.description.length} characters; npm truncates the listing`)
  if (!manifest.repository?.url?.match(/^(?:git\+)?https:\/\/github\.com\//u)) error('PKG-01', 'repository.url is not a GitHub https URL')
  if (!Array.isArray(manifest.keywords) || manifest.keywords.length < 5) error('PKG-01', 'keywords are missing or too few to be found in a search')
  if (!manifest.engines?.node) warning('PKG-01', 'engines.node is not declared')

  // --- dsh plugin structure ----------------------------------------------------
  const dsh = manifest.dsh ?? {}
  if (!dsh.bundle?.patch) error('PKG-02', 'dsh.bundle.patch is missing; the harness cannot mount the bundle')
  else if (!exists(dsh.bundle.patch)) error('PKG-02', `dsh.bundle.patch names ${dsh.bundle.patch}, which is not in the repository`)
  if (!dsh.engines?.dsh) error('PKG-02', 'dsh.engines.dsh is missing; the market cannot state a host requirement')
  if (dsh.client?.platform !== 'web') warning('PKG-02', `dsh.client.platform is ${dsh.client.platform ?? 'absent'}; the viewers are registered for web`)

  // --- what ships --------------------------------------------------------------
  const baseOf = pattern => {
    const parts = pattern.split('/')
    const wildcard = parts.findIndex(part => part.includes('*'))
    return wildcard === -1 ? pattern : parts.slice(0, wildcard).join('/') || '.'
  }
  /** Every file on disk the whitelist would ship for one pattern. */
  const shippedFiles = pattern => {
    const base = baseOf(pattern)
    if (!exists(base) || !statSync(join(ROOT, base)).isDirectory()) return []
    const regex = globToRegExp(pattern)
    return walk(base).filter(path => regex.test(path))
  }
  for (const pattern of files) {
    if (pattern.includes('*') && shippedFiles(pattern).length === 0) error('PKG-03', `files lists ${pattern}, but no matching path exists`)
    else if (!pattern.includes('*') && !exists(pattern)) error('PKG-03', `files lists ${pattern}, but it does not exist`)
  }

  const internal = [/\/(?:^|\/)test\//u, /^scripts\//u, /^tmp\//u, /^artifacts\//u, /^\.github\//u, /^\.migration\//u, /node_modules\//u, /\.(?:env|log)$/u]
  for (const pattern of files) {
    for (const rule of internal) {
      if (rule.test(pattern)) error('PKG-05', `files ships ${pattern}, which is repository state, not product`)
    }
  }

  const required = new Set([
    dsh.bundle?.patch?.replace(/^\.\//u, ''),
    'README.md',
    'LICENSE',
    'locale/en.json',
    'locale/zh.json',
  ].filter(Boolean))
  for (const row of rows) {
    const sub = row.name?.startsWith(`${manifest.name}/`) ? row.name.slice(manifest.name.length + 1) : ''
    const key = sub === '' ? '.' : `./${sub}`
    const target = manifest.exports?.[key]
    if (target === undefined) {
      error('PKG-04', `${row.id}: row name ${row.name} has no exports["${key}"], so the row cannot mount`)
      continue
    }
    for (const value of exportTargets(target)) {
      required.add(value.replace(/^\.\//u, ''))
      if (!exists(value.replace(/^\.\//u, ''))) error('PKG-04', `${row.id}: exports["${key}"] points at ${value}, which does not exist`)
    }
  }
  for (const target of exportTargets(manifest.exports)) {
    const path = target.replace(/^\.\//u, '')
    if (!exists(path)) error('PKG-04', `exports target ${target} does not exist`)
    required.add(path)
  }
  for (const path of [...required].filter(Boolean)) {
    if (!exists(path)) error('PKG-03', `${path} is needed at mount time but does not exist`)
    else if (!shipped(path)) error('PKG-03', `${path} is needed at mount time but files does not ship it`)
  }

  // --- dependency hygiene ------------------------------------------------------
  const specs = ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']
  for (const section of specs) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (!/\d/u.test(spec)) error('PKG-07', `${section}.${name} is "${spec}"; pin a range`)
    }
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (manifest.peerDependencies?.[name]) error('PKG-07', `${name} is declared in both dependencies and peerDependencies; a type-identity-sensitive library must resolve to one copy`)
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (!manifest.dependencies?.[name] && packageOf(name) !== name) warning('PKG-07', `peer dependency ${name} is not also a dependency`)
  }

  // --- size --------------------------------------------------------------------
  const sizes = payload()
  const total = sizes.reduce((sum, file) => sum + file.bytes, 0)
  if (total > ERROR_BYTES) error('PKG-06', `the shipped files total ${(total / 1048576).toFixed(1)} MiB; the market caps an archive at 64 MiB`)
  else if (total > WARN_BYTES) warning('PKG-06', `the shipped files total ${(total / 1048576).toFixed(1)} MiB`)
  out.push({
    level: 'info',
    rule: 'PKG-06',
    message: `${(total / 1048576).toFixed(1)} MiB in ${String(sizes.length)} files; largest: ${sizes.slice(0, 5).map(file => `${file.path} ${(file.bytes / 1048576).toFixed(2)} MiB`).join(', ')}`,
  })

  return out
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const results = findings()
  const errors = results.filter(result => result.level === 'error')
  const warnings = results.filter(result => result.level === 'warning')
  for (const result of [...errors, ...warnings]) console.error(`${result.level === 'error' ? 'error' : 'warning'} ${result.rule} ${result.message}`)
  for (const result of results.filter(item => item.level === 'info')) console.log(`info ${result.rule} ${result.message}`)
  if (errors.length === 0 && warnings.length === 0) console.log('check:package: the tarball is conforming')
  process.exit(errors.length > 0 ? 1 : 0)
}
