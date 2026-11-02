/**
 * Verify that a release is actually installable.
 *
 * Publishing is not the same as being visible: npm stages a publish until the owner approves it, and the
 * market caches each package's `latest` dist-tag for 30 minutes on top of that. This script answers the
 * only question that matters before telling anyone "it is live": does the registry's `latest` equal the
 * version in this repository, and does the tarball resolve?
 *
 * Usage: node scripts/verify-release.mjs [--wait <seconds>] [--package <name>]
 * Exit 0 only when every checked package resolves to its local version.
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const waitIndex = args.indexOf('--wait')
const waitSeconds = waitIndex === -1 ? 0 : Number(args[waitIndex + 1] ?? 0)
const packageIndex = args.indexOf('--package')

/** Packages this repository publishes, with the package.json that declares each version. */
const PACKAGES = [
  { name: '@aryacode/dsh-engineering', manifest: 'package.json' },
]

async function latestOf(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name).replace(/%40/gu, '@')}/latest`, {
    headers: { accept: 'application/json' },
  })
  if (response.status === 404) return { error: 'no version is published yet' }
  if (!response.ok) return { error: `registry answered ${response.status}` }
  const body = await response.json()
  return { version: body.version, tarball: body.dist?.tarball }
}

async function main() {
  const packages = packageIndex === -1
    ? PACKAGES
    : [{ name: args[packageIndex + 1], manifest: 'package.json' }]
  const deadline = Date.now() + waitSeconds * 1000
  let failed = false
  for (const pkg of packages) {
    const local = JSON.parse(readFileSync(new URL(`../${pkg.manifest}`, import.meta.url), 'utf8')).version
    let seen
    // Poll while waiting: a staged publish becomes visible only after the owner approves it.
    for (;;) {
      seen = await latestOf(pkg.name)
      if (seen.version === local || Date.now() >= deadline) break
      await new Promise(done => setTimeout(done, 5000))
    }
    if (seen.error !== undefined) {
      console.log(`FAIL ${pkg.name}: ${seen.error}`)
      failed = true
      continue
    }
    if (seen.version !== local) {
      console.log(`FAIL ${pkg.name}: registry latest is ${seen.version}, this repository is ${local}`)
      console.log(`     ${Number(seen.version.split('.')[1]) < Number(local.split('.')[1]) ? 'the publish is staged — approve it at npmjs.com' : 'the repository is behind the registry'}`)
      failed = true
      continue
    }
    console.log(`ok   ${pkg.name}@${seen.version} → ${seen.tarball ?? '(no tarball)'}`)
  }
  process.exitCode = failed ? 1 : 0
}

await main()
