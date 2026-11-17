import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  acquireWriteLock,
  applyStage,
  census,
  diffBackup,
  projectGates,
  projectInfo,
  readNode,
  restoreBackup,
  sources,
  stageOps,
  validateProject,
} from '../packages/optix/lib/project.js'

/**
 * The file channel exists because the bridge reads and authors Studio's live model and nothing
 * else: it cannot save, cannot compile, and cannot touch a project Studio has closed. That makes
 * an external writer the only route to a C# file, a new chapter or a rename — and exactly the
 * kind of writer that fights Studio when it runs beside it. These specs prove the measured
 * refusals: no write while Studio has the project open, no write while the bridge holds unsaved
 * changes, no apply of a plan whose files moved underneath it, one write at a time, and an apply
 * that is all or nothing. They also prove the read side against a real YAML shape: the chapter
 * registration graph, the `/Objects/<name>/` pointers Studio writes absolutely, and the duplicate
 * node name Studio itself saves. The binding specs below are the file-level half of the same
 * question: a `DynamicLink` into this project must name a node that exists, a relative or aliased
 * one must resolve or be reported as unverifiable, a NetLogic must not aim at a UI object, and a
 * screen must not be fixed to the size it was drawn at.
 */

/** Scratch project folders this spec makes, so a failed run leaves nothing behind. */
const created = []

after(async () => {
  for (const root of created) await rm(root, { recursive: true, force: true })
})

const PROJECT = 'Fixture'

const scratch = async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optix-project-'))
  created.push(root)
  return root
}

/**
 * A small but real project: a project file, a root chapter that mixes inline nodes with two
 * `- File:` chapter registrations, and the OPC UA shape Studio writes
 * (`Authentication/DefaultUserFolder` is an absolute `NodePointer`).
 */
const fixture = async () => {
  const root = await scratch()
  await mkdir(join(root, 'Nodes', 'UI'), { recursive: true })
  await mkdir(join(root, 'Nodes', 'Model'), { recursive: true })
  await mkdir(join(root, 'Nodes', 'Security'), { recursive: true })
  await writeFile(
    join(root, `${PROJECT}.optix`),
    `Project:
  Name: ${PROJECT}
  GUID: 11111111-1111-1111-1111-111111111111
  FormatVersion: 1
  Nodes:
  - File: Nodes/${PROJECT}.yaml
`,
  )
  await writeFile(
    join(root, 'Nodes', `${PROJECT}.yaml`),
    `Name: ${PROJECT}
Type: ProjectFolder
Children:
- Name: Authentication
  Type: AuthenticationCategory
  Children:
  - Name: DefaultUserFolder
    Type: NodePointer
    Value: "/Objects/${PROJECT}/Security/Users"
- File: Security/Security.yaml
- File: UI/UI.yaml
- File: Model/Model.yaml
`,
  )
  await writeFile(
    join(root, 'Nodes', 'Security', 'Security.yaml'),
    `Name: Security
Type: SecurityCategoryFolder
Children:
- Name: Users
  Type: SecurityUsersCategoryFolder
`,
  )
  await writeFile(
    join(root, 'Nodes', 'UI', 'UI.yaml'),
    `Name: UI
Type: UICategoryFolder
Children:
- Name: MainWindow
  Type: Window
  Children:
  - Name: MainLoader
    Type: PanelLoader
`,
  )
  await writeFile(
    join(root, 'Nodes', 'Model', 'Model.yaml'),
    `Name: Model
Type: Folder
Children:
- Name: LineSpeed
  Type: BaseDataVariableType
  DataType: Float
`,
  )
  return root
}

const info = async () => projectInfo(PROJECT, await fixture())

test('census and sources describe the project without writing it', async () => {
  const root = await fixture()
  const project = await projectInfo(PROJECT, root)
  const counted = await census(project)
  assert.equal(counted.files, 4)
  assert.ok(counted.nodes >= 9, `counts every node, got ${counted.nodes}`)
  const listed = await sources(project)
  assert.deepEqual(listed.problems, [])
  assert.deepEqual(
    listed.files.map((file) => file.path).sort(),
    ['Nodes/Fixture.yaml', 'Nodes/Model/Model.yaml', 'Nodes/Security/Security.yaml', 'Nodes/UI/UI.yaml'],
  )
})

test('validation accepts a consistent project and names the three real faults', async () => {
  const project = await info()
  const clean = await validateProject(project)
  assert.equal(clean.ok, true, JSON.stringify(clean.findings.filter((finding) => finding.severity === 'critical')))
  assert.equal(clean.critical, 0)

  // A chapter the root registers but the folder does not hold: Studio refuses to load that.
  const missing = await info()
  await rm(join(missing.root, 'Nodes', 'UI', 'UI.yaml'))
  const broken = await validateProject(missing)
  assert.equal(broken.ok, false)
  assert.ok(broken.findings.some((finding) => finding.code === 'file_missing' && finding.severity === 'critical'))

  // Studio itself saves duplicate names; an edit must not add a third.
  const duplicate = await info()
  await writeFile(
    join(duplicate.root, 'Nodes', 'Model', 'Model.yaml'),
    `Name: Model
Type: Folder
Children:
- Name: LineSpeed
  Type: BaseDataVariableType
  DataType: Float
- Name: LineSpeed
  Type: BaseDataVariableType
  DataType: Float
`,
  )
  const doubled = await validateProject(duplicate)
  assert.ok(doubled.findings.some((finding) => finding.code === 'duplicate_name' && finding.severity === 'warning'))

  // An absolute pointer that names another project is the rename trap, not a fatal fault.
  const pointed = await info()
  await writeFile(
    join(pointed.root, 'Nodes', `${PROJECT}.yaml`),
    `Name: ${PROJECT}
Type: ProjectFolder
Children:
- Name: Authentication
  Type: AuthenticationCategory
  Children:
  - Name: DefaultUserFolder
    Type: NodePointer
    Value: "/Objects/OldName/Security/Users"
- Name: UI
  Type: UICategoryFolder
  Children:
  - File: UI/UI.yaml
- Name: Model
  Type: Folder
  Children:
  - File: Model/Model.yaml
`,
  )
  const foreign = await validateProject(pointed)
  assert.ok(foreign.findings.some((finding) => finding.code === 'absolute_pointer_foreign_root' && finding.severity === 'warning'))
})

/**
 * The project a session hand-wrote while Studio was closed (2026-11-16): a Model chapter, a UI
 * chapter whose DynamicLinks mix one good absolute path, one indexed path, one link at the
 * project root, one relative link, one dead absolute link, one dead relative link, an alias link
 * and a template-parameter link, a screen drawn only with absolute margins, and a NetLogic that
 * points at a UI object.
 */
const bindingsFixture = async () => {
  const root = await scratch()
  for (const folder of ['Model', 'UI', 'UI/Screens', 'NetLogic']) await mkdir(join(root, 'Nodes', folder), { recursive: true })
  await writeFile(
    join(root, 'Proj.optix'),
    `Project:
  Name: Proj
  GUID: 22222222-2222-2222-2222-222222222222
  FormatVersion: 1
  Nodes:
  - File: Nodes/Proj.yaml
`,
  )
  await writeFile(
    join(root, 'Nodes', 'Proj.yaml'),
    `Name: Proj
Type: ProjectFolder
Children:
- File: Model/Model.yaml
- File: UI/UI.yaml
- File: NetLogic/NetLogic.yaml
`,
  )
  await writeFile(
    join(root, 'Nodes', 'Model', 'Model.yaml'),
    `Name: Model
Type: Folder
Children:
- Name: Smt
  Type: Folder
  Children:
  - Name: LineSpeed
    Type: BaseDataVariableType
    DataType: Float
- Name: Speed
  Type: BaseDataVariableType
  DataType: Float
`,
  )
  await writeFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), netlogicChapter())
  await writeFile(join(root, 'Nodes', 'UI', 'UI.yaml'), uiChapter())
  await writeFile(
    join(root, 'Nodes', 'UI', 'Screens', 'Screens.yaml'),
    `Name: Screens
Type: ScreensCategoryFolder
Children:
- Name: Flat
  Id: g=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  Supertype: Screen
  ReferenceType: HasComponent
  Children:
  - Name: Kpi
    Type: Rectangle
    Children:
    - Name: LeftMargin
      Type: BaseVariableType
      DataType: Size
      ModellingRule: Optional
      Value: 24.0
    - Name: TopMargin
      Type: BaseVariableType
      DataType: Size
      ModellingRule: Optional
      Value: 24.0
    - Name: Width
      Type: BaseVariableType
      DataType: Size
      ModellingRule: Optional
      Value: 320.0
    - Name: Height
      Type: BaseVariableType
      DataType: Size
      ModellingRule: Optional
      Value: 120.0
- Name: Scaled
  Id: g=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  Supertype: Screen
  ReferenceType: HasComponent
  Children:
  - Name: Body
    Type: ScaleLayout
`,
  )
  return root
}

/** A NetLogic chapter whose pointer aims at a UI object, which exists only inside a session. */
function netlogicChapter() {
  return `Name: NetLogic
Type: NetLogicCategoryFolder
Children:
- Name: NavLogic
  Type: NetLogic
  Children:
  - Name: WindowPointer
    Type: NodePointer
    DataType: NodeId
    Value: "/Objects/Proj/UI/MainWindow"
`
}

/** The UI chapter: three links that must resolve, two dead ones, one pointer and two aliases. */
const uiChapter = (dead = true) => `Name: UI
Type: UICategoryFolder
Children:
- Name: MainWindow
  Type: Window
  Children:
  - Name: MainLoader
    Type: PanelLoader
- Name: Data
  Type: Folder
  Children:
  - Name: Metrics
    Type: NodePointer
    DataType: NodeId
    Value: "/Objects/Proj/Model"
- Name: Widget
  Type: Folder
  Children:
  - Name: GoodText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "/Objects/Proj/Model/Smt/LineSpeed"
  - Name: IndexedText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "/Objects/Proj/Model/Smt/LineSpeed[0]"
  - Name: RootText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "/Objects/Proj@BrowseName"
  - Name: RelativeGood
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "../GoodText"
  - Name: DeadText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "${dead ? '/Objects/Proj/Model/Missing' : '/Objects/Proj/Model/Smt/LineSpeed'}"
  - Name: RelativeDead
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "${dead ? '../NoSuchSibling' : '../GoodText'}"
  - Name: DeadPointer
    Type: NodePointer
    DataType: NodeId
    Value: "${dead ? '/Objects/Proj/Model/MissingPointer' : '/Objects/Proj/Model'}"
  - Name: ItemText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "{Item}@Value"
  - Name: AliasText
    Type: BaseDataVariableType
    DataType: String
    Children:
    - Name: DynamicLink
      Type: DynamicLink
      DataType: NodePath
      Value: "{Metrics}/Speed"
- File: Screens/Screens.yaml
`

test('validation names the dead bindings, the UI pointer and the flat screens a hand-written chapter leaves', async () => {
  const root = await bindingsFixture()
  const project = await projectInfo('Proj', root)
  const report = await validateProject(project)
  const codes = report.findings.map((finding) => finding.code)
  assert.equal(report.ok, false)
  assert.equal(report.critical, 3, JSON.stringify(report.findings.filter((finding) => finding.severity === 'critical')))
  assert.equal(report.warnings, 3, JSON.stringify(report.findings.filter((finding) => finding.severity === 'warning')))
  assert.equal(report.findings.filter((finding) => finding.severity === 'info').length, 1)
  for (const code of ['unresolved_dynamic_link', 'unresolved_pointer', 'pointer_to_ui_object', 'VIEW-LAYOUT-01', 'VIEW-SCALE-01', 'binding_unverified']) {
    assert.ok(codes.includes(code), `expected ${code} in ${codes.join(', ')}`)
  }

  // Three links resolve and must stay silent: an absolute path, an indexed path and the project root.
  const dead = report.findings.filter((finding) => finding.severity !== 'info')
  for (const finding of dead) {
    assert.ok(!String(finding.value ?? '').includes('Smt/LineSpeed'), `reported a resolving link: ${JSON.stringify(finding)}`)
    assert.ok(!String(finding.value ?? '').startsWith('/Objects/Proj@'), `reported the project root: ${JSON.stringify(finding)}`)
    assert.notEqual(finding.value, '{Metrics}/Speed', `reported a bound alias: ${JSON.stringify(finding)}`)
  }

  // A dead absolute link names the file, the owning node and the segment that is missing.
  const deadAbsolute = dead.find((finding) => finding.code === 'unresolved_dynamic_link' && finding.value === '/Objects/Proj/Model/Missing')
  assert.ok(deadAbsolute !== undefined, JSON.stringify(dead))
  assert.match(deadAbsolute.path, /^Proj\/UI\/Widget\/DeadText/u)
  assert.match(deadAbsolute.message, /Missing/u)
  // Every new finding carries a sentence an author can act on.
  for (const finding of report.findings.filter((entry) => ['unresolved_dynamic_link', 'unresolved_pointer', 'pointer_to_ui_object', 'VIEW-LAYOUT-01', 'VIEW-SCALE-01', 'binding_unverified'].includes(entry.code))) {
    assert.ok(typeof finding.fix === 'string' && finding.fix.length > 20, `no fix on ${JSON.stringify(finding)}`)
  }

  // A dead binding is a project invariant, so staging any edit refuses until it is fixed.
  const staged = await stageOps(project, [
    { op: 'insert_node', path: 'Nodes/Model/Model.yaml', node_path: '', node: { Name: 'DshProbe', Type: 'Folder' } },
  ])
  assert.equal(staged.writable, false)
  // The refusal says whose dead link it is: this plan introduces none, so it must not claim to break anything.
  assert.equal(staged.introduced_criticals, 0, JSON.stringify(staged.next))
  assert.ok(staged.inherited_criticals >= 1, JSON.stringify(staged.next))
  assert.match(staged.next, /already carries/u)
  assert.doesNotMatch(staged.next, /The plan introduces/u)

  // Fixing the dead values is the whole repair: the same project then validates.
  await writeFile(join(root, 'Nodes', 'UI', 'UI.yaml'), uiChapter(false))
  const repaired = await validateProject(await projectInfo('Proj', root))
  assert.equal(repaired.critical, 0, JSON.stringify(repaired.findings.filter((finding) => finding.severity === 'critical')))
  assert.equal(repaired.ok, true)
})

test('the write gate refuses an open Studio and unflushed bridge changes', async () => {
  const project = await info()

  const closed = await projectGates(project, { processes: [] })
  assert.equal(closed.can_write, true)
  assert.deepEqual(closed.blockers, [])

  const open = await projectGates(project, {
    processes: [{ pid: 4242, command_line: `"C:\\Program Files\\Rockwell Automation\\FactoryTalk Optix\\Studio 1.8.1.27\\FTOptixStudio.exe" "${project.optixFile}"` }],
  })
  assert.equal(open.can_write, false)
  assert.equal(open.blockers[0].code, 'project_open_in_studio')
  assert.deepEqual(open.studio.pids, [4242])

  const pending = await projectGates(project, { processes: [], bridgePending: 2 })
  assert.equal(pending.can_write, false)
  assert.equal(pending.blockers[0].code, 'bridge_state_unflushed')
})

test('the write lock allows one writer and reclaims a stale one', async () => {
  const project = await info()
  await writeFile(join(project.root, '.dsh-write.lock'), `${JSON.stringify({ pid: 1, at: Date.now(), label: 'test' })}\n`)
  await assert.rejects(acquireWriteLock(project.root), /another write is in progress/u)

  await writeFile(
    join(project.root, '.dsh-write.lock'),
    `${JSON.stringify({ pid: 1, at: Date.now() - 11 * 60 * 1000, label: 'crashed' })}\n`,
  )
  const lock = await acquireWriteLock(project.root, 'spec')
  assert.match(lock.file, /\.dsh-write\.lock$/u)
  await lock.release()
  const again = await acquireWriteLock(project.root, 'again')
  await again.release()
})

test('stage, apply, diff and restore round-trip one node', async () => {
  const project = await info()
  const before = await census(project)
  const staged = await stageOps(project, [
    { op: 'insert_node', path: 'Nodes/Model/Model.yaml', node_path: '', node: { Name: 'DshProbe', Type: 'Folder' } },
    { op: 'insert_node', path: 'Nodes/Model/Model.yaml', node_path: 'DshProbe', node: { Name: 'DshSpeed', Type: 'BaseDataVariableType', DataType: 'Float' } },
  ])
  assert.equal(staged.writable, true)
  assert.equal(staged.steps.length, 2)
  // Staging writes a manifest only: the project on disk is untouched.
  assert.equal((await census(project)).nodes, before.nodes)

  const applied = await applyStage(project, staged.stage_id)
  assert.equal(applied.applied, 1)
  assert.equal(applied.files[0].path, 'Nodes/Model/Model.yaml')
  const node = await readNode(project, 'Model/DshProbe')
  assert.equal(node.path, 'Model/DshProbe')
  assert.ok(node.children.some((child) => child.name === 'DshSpeed'))

  const diff = await diffBackup(project, applied.backup_id)
  assert.equal(diff.ok, true, JSON.stringify(diff))
  assert.equal(diff.files[0].state, 'unchanged', JSON.stringify(diff))

  const restored = await restoreBackup(project, applied.backup_id)
  assert.equal(restored.restored, 1)
  assert.equal(restored.files[0].restored, true)
  await assert.rejects(readNode(project, 'Model/DshProbe'), /no node/u)
})

test('apply refuses a plan whose file changed on disk, and force writes it anyway', async () => {
  const project = await info()
  const staged = await stageOps(project, [
    { op: 'set_node_value', path: 'Nodes/Model/Model.yaml', node_path: 'LineSpeed', key: 'DataType', value: 'Integer' },
  ])
  const model = join(project.root, 'Nodes', 'Model', 'Model.yaml')
  await writeFile(model, `${await readFile(model, 'utf8')}\n`)
  await assert.rejects(applyStage(project, staged.stage_id), (error) => error.code === 'file_changed_on_disk')
  const forced = await applyStage(project, staged.stage_id, { force: true })
  assert.equal(forced.applied, 1)
})

test('a bridge change pending blocks an apply that no flag bypasses', async () => {
  const project = await info()
  const staged = await stageOps(project, [
    { op: 'insert_node', path: 'Nodes/Model/Model.yaml', node_path: '', node: { Name: 'Gated', Type: 'Folder' } },
  ])
  await assert.rejects(
    applyStage(project, staged.stage_id, { bridgePending: 1, processes: [] }),
    (error) => error.code === 'bridge_state_unflushed',
  )
  const applied = await applyStage(project, staged.stage_id, { processes: [] })
  assert.equal(applied.applied, 1)
})
