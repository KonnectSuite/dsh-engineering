// The build channel: find the Studio install, generate the `.references` file Studio would
// generate, scaffold a solution for a project that has none, and compile it out of tree.
//
// Every test writes only under a mkdtemp scratch. The one thing this file never does is run
// `dotnet build` against the engineer's project: `checkBuild` copies the solution to `%TEMP%`
// first, and the test asserts the project folder stayed untouched.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  buildState,
  checkBuild,
  dotnetSdk,
  initNetSolution,
  readReferences,
  studioInstall,
  studioInstalls,
  writeReferences,
} from '../packages/optix/lib/build.js'

const PROJECT = 'BuildProbe'

const roots = []
const scratch = async (name = '') => {
  const folder = await mkdtemp(join(tmpdir(), `dsh-optix-build-spec-${name}`))
  roots.push(folder)
  return folder
}

test.after(async () => {
  for (const folder of roots) await rm(folder, { recursive: true, force: true })
})

/** A project folder shaped like Studio's: one `.optix`, and a NetSolution with a csproj. */
const project = async ({ csproj = true } = {}) => {
  const folder = join(await scratch('project'), PROJECT)
  const solution = join(folder, 'ProjectFiles', 'NetSolution')
  await mkdir(solution, { recursive: true })
  await writeFile(join(folder, `${PROJECT}.optix`), `Project:\n  Name: ${PROJECT}\n`)
  if (csproj) {
    await writeFile(
      join(solution, `${PROJECT}.csproj`),
      `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
  </PropertyGroup>
  <Import Project="${PROJECT}.references"/>
</Project>
`,
    )
    await writeFile(join(solution, 'Probe.cs'), 'using UAManagedCore;\n\nnamespace BuildProbe\n{\n    public class Probe\n    {\n    }\n}\n')
  }
  return folder
}

/**
 * A fake Studio install tree under a redirected Program Files: two module versions per
 * module (the older one must never be referenced) and both binding assemblies.
 */
const fakeStudio = async (name = 'Studio 1.8.1.27', programFiles) => {
  const tree = programFiles ?? await scratch('pf')
  const install = join(tree, 'Rockwell Automation', 'FactoryTalk Optix', name)
  await mkdir(install, { recursive: true })
  await writeFile(join(install, 'IDEVersion.txt'), `${name.replace(/^Studio\s*/u, '')}-Stable\n`)
  const modules = join(install, 'Modules')
  for (const [module, version, older, assembly] of [
    ['FTOptix.UI', '21.2', '20.0', 'FTOptix.UI.Net.dll'],
    ['FTOptix.CoreBase', '6.1', '5.0', 'FTOptix.CoreBase.Net.dll'],
    ['FTOptix.NetLogic', '4.0', '3.0', 'FTOptix.NetLogic.Net.dll'],
  ]) {
    await mkdir(join(modules, module, version, 'Any'), { recursive: true })
    await writeFile(join(modules, module, version, 'Any', assembly), '')
    await mkdir(join(modules, module, older, 'Any'), { recursive: true })
    await writeFile(join(modules, module, older, 'Any', assembly), '')
  }
  const binding = join(install, 'Bindings', 'Net', '5.0.1.46', 'Win32_x64')
  await mkdir(binding, { recursive: true })
  await writeFile(join(binding, 'UAManagedCore.dll'), '')
  await writeFile(join(binding, 'UAManagedCoreCommon.dll'), '')
  return { programFiles: tree, install }
}

/** Run `body` with PROGRAMFILES pointed at a scratch tree, restoring it afterwards. */
const withProgramFiles = async (programFiles, body) => {
  const previous = process.env.PROGRAMFILES
  process.env.PROGRAMFILES = programFiles
  try {
    return await body()
  } finally {
    if (previous === undefined) delete process.env.PROGRAMFILES
    else process.env.PROGRAMFILES = previous
  }
}

test('the install scan finds Studio versions and picks the newest', async () => {
  const tree = await scratch('pf')
  const newest = await fakeStudio('Studio 1.8.1.27', tree)
  await fakeStudio('Studio 1.7.0.9', tree)
  const installs = await withProgramFiles(tree, () => studioInstalls())
  assert.equal(installs.length, 2)
  assert.deepEqual(installs.map((entry) => entry.version), ['1.7.0.9-Stable', '1.8.1.27-Stable'])
  const chosen = await studioInstall()
  assert.match(chosen.version, /1\.8\.1\.27/u)
  assert.equal(existsSync(newest.install), true)
})

test('references are generated from the newest module version and both bindings', async () => {
  const folder = await project()
  const fake = await fakeStudio()

  const plan = await withProgramFiles(fake.programFiles, () => writeReferences(folder, { dryRun: true }))
  assert.equal(plan.action, 'generated')
  assert.equal(plan.written, false)
  assert.equal(plan.count, 5, 'three module assemblies plus two bindings')
  assert.equal(plan.modules, 3)
  assert.equal((await readReferences(folder)).exists, false, 'a dry run writes nothing')

  const written = await withProgramFiles(fake.programFiles, () => writeReferences(folder))
  assert.equal(written.written, true)
  assert.equal(written.studio, '1.8.1.27-Stable')
  const text = await readFile(written.file, 'utf8')
  assert.match(text, /<HintPath>[A-Za-z]:\/.*\/Modules\/FTOptix\.UI\/21\.2\/Any\/FTOptix\.UI\.Net\.dll<\/HintPath>/u)
  assert.match(text, /<HintPath>[A-Za-z]:\/.*\/Bindings\/Net\/5\.0\.1\.46\/Win32_x64\/UAManagedCoreCommon\.dll<\/HintPath>/u)
  assert.equal(text.includes('20.0'), false, 'the older module version is never referenced')
  assert.equal((text.match(/<Private>False<\/Private>/gu) ?? []).length, 5)

  const check = await readReferences(folder)
  assert.equal(check.count, 5)
  assert.deepEqual(check.missing, [])
  assert.equal(check.modules, 3)

  const again = await writeReferences(folder)
  assert.equal(again.action, 'unchanged')

  // A reference whose assembly disappeared is what a Studio upgrade leaves behind.
  const { install } = fake
  await rm(join(install, 'Modules', 'FTOptix.NetLogic', '4.0', 'Any', 'FTOptix.NetLogic.Net.dll'))
  const stale = await readReferences(folder)
  assert.equal(stale.missing.length, 1)
  const repaired = await withProgramFiles(fake.programFiles, () => writeReferences(folder))
  assert.equal(repaired.action, 'rewritten_after_upgrade')
  assert.equal(repaired.missing_before, 1)
  assert.deepEqual((await readReferences(folder)).missing, [])
})

test('references refuse politely when Studio is not installed', async () => {
  const folder = await project()
  const empty = await scratch('pf-empty')
  await assert.rejects(
    withProgramFiles(empty, () => writeReferences(folder)),
    /no FactoryTalk Optix Studio install found under Program Files/u,
  )
  assert.equal((await readReferences(folder)).exists, false)
})

test('initNetSolution writes a solution a Studio project can build, and never a .cs', async () => {
  const folder = await project({ csproj: false })
  const solution = join(folder, 'ProjectFiles', 'NetSolution')
  const classFile = join(solution, 'KeepMe.cs')
  await writeFile(classFile, '// written by the engineer\n')
  const fake = await fakeStudio()

  const plan = await withProgramFiles(fake.programFiles, () => initNetSolution(folder, { dryRun: true }))
  assert.equal(plan.action, 'create')
  assert.equal(plan.written, false)
  assert.equal(plan.references.written, false)
  assert.equal(existsSync(plan.csproj), false)

  const created = await withProgramFiles(fake.programFiles, () => initNetSolution(folder))
  assert.equal(created.action, 'created')
  assert.equal(created.written, true)
  assert.equal(created.references.count, 5)
  const csproj = await readFile(created.csproj, 'utf8')
  assert.match(csproj, /<TargetFramework>net8\.0<\/TargetFramework>/u)
  assert.match(csproj, new RegExp(`<Import Project="${PROJECT}\\.references"/>`, 'u'))
  const sln = await readFile(created.sln, 'utf8')
  assert.ok(
    sln.includes(`Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "${PROJECT}", "${PROJECT}.csproj"`),
    sln,
  )
  assert.match(sln, /Debug\|Any CPU = Debug\|Any CPU/u)
  assert.equal(await readFile(classFile, 'utf8'), '// written by the engineer\n', 'a solution scaffold leaves existing classes alone')

  const refused = await withProgramFiles(fake.programFiles, () => initNetSolution(folder))
  assert.equal(refused.action, 'replace')
  assert.match(refused.next, /pass force/u)

  const replaced = await withProgramFiles(fake.programFiles, () => initNetSolution(folder, { force: true }))
  assert.equal(replaced.action, 'replaced')
})

test('buildState answers never_built, built and stale from the DLL against the newest source', async () => {
  const folder = await project()
  const solution = join(folder, 'ProjectFiles', 'NetSolution')

  const never = await buildState(folder)
  assert.equal(never.state, 'never_built')
  assert.equal(never.sources, 1)
  assert.equal(never.artifact, null)

  const dll = join(solution, 'bin', `${PROJECT}.dll`)
  await mkdir(dirname(dll), { recursive: true })
  await writeFile(dll, 'not really a dll')
  // The DLL must be newer than the source for `built` to be the honest answer.
  const source = join(solution, 'Probe.cs')
  const past = new Date(Date.now() - 60_000)
  await utimes(source, past, past)
  const built = await buildState(folder)
  assert.equal(built.state, 'built')
  assert.equal(built.artifact.bytes, 16)

  const now = new Date(Date.now() + 60_000)
  await utimes(source, now, now)
  const stale = await buildState(folder)
  assert.equal(stale.state, 'stale')
  assert.match(stale.next, /save and build in Studio|optix_build action build/u)
})

test('checkBuild compiles a copy and leaves the project untouched', async (t) => {
  const sdk = await dotnetSdk()
  if (!sdk.available) {
    t.skip(`no dotnet SDK on this machine (${sdk.error || 'dotnet --list-sdks answered nothing'})`)
    return
  }
  const folder = await project({ csproj: false })
  const solution = join(folder, 'ProjectFiles', 'NetSolution')
  // A bare net8.0 class library: no Optix references, so the check does not depend on a Studio install.
  await writeFile(
    join(solution, `${PROJECT}.csproj`),
    `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
  </PropertyGroup>
</Project>
`,
  )
  await writeFile(join(solution, 'Probe.cs'), 'namespace BuildProbe\n{\n    public static class Probe\n    {\n        public static int Answer = 42;\n    }\n}\n')

  const result = await checkBuild(folder)
  assert.equal(result.ok, true, result.tail)
  assert.equal(result.isolated, true)
  assert.equal(result.exit_code, 0)
  assert.deepEqual(result.errors, [])
  assert.equal(result.scratch, '', 'the scratch copy is removed unless keep is set')
  assert.equal(existsSync(join(solution, 'bin')), false, 'the check never writes bin/ into the project')
  assert.equal(existsSync(join(solution, 'obj')), false, 'the check never writes obj/ into the project')
  assert.match(result.next, /Studio still has to build/u)

  const kept = await checkBuild(folder, { keep: true })
  assert.notEqual(kept.scratch, '')
  assert.equal(existsSync(kept.scratch), true)
  await rm(kept.scratch, { recursive: true, force: true })
  const after = await stat(solution)
  assert.equal(after.isDirectory(), true)
})
