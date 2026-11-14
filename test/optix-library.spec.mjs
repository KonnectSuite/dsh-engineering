import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { findEntry, itemNames, libraryRoots, noStudioInstall, parseDictionary, parseItems, readCatalog, suggestNames } from '../packages/optix/lib/library.js'

/**
 * Optix ships engineered screen parts (AlarmWidgets, TagGrid, PanelWithBackground, the StyleSheets,
 * the Keyboards) that the plugin could not reach: the bridge only creates builtin widget types, and
 * `TemplateLibrary.ImportLibraryItem` is a static call the generic `node/invoke` route cannot make.
 * These tests hold both halves of the fix — the disk catalog that answers "what quality parts exist"
 * with Studio closed, and the bridge verb that actually pulls one in.
 */

const bridge = readFileSync(new URL('../packages/optix/bridge/StudioMCPBridge.cs', import.meta.url), 'utf8')
const plugin = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')

/** The shipped shape, trimmed: two importable items, one group reference, one folder entry. */
const itemsFixture = `Name: Items
Type: FolderType
Children:
- Name: AlarmIcon
  DisplayName: {"NamespaceIndex":26,"TextId":"AlarmIconDisplayName"}
  Description: {"NamespaceIndex":26,"TextId":"AlarmIconDescription"}
  Type: ObjectLibraryItem
  Children:
  - Class: Reference
    Type: HasOwnedType
    Target: g=14a0a0b086b64ca4b72d063ce4f1eaac
  - Name: LibraryItemGuid
    Type: BaseDataVariableType
    DataType: Guid
    Value: "14a0a0b086b64ca4b72d063ce4f1eaac"
  - Name: LibraryItemVersion
    Type: BaseDataVariableType
    DataType: UInt32
    Value: 1
- File: SignsAndSymbols/SignsAndSymbols.yaml
- Name: Toolbar
  Type: FolderType
  Children:
  - Name: LibraryItemGuid
    Type: BaseDataVariableType
    DataType: Guid
    Value: "40ba6efe122cdad117439a0ae790faf9"
- Name: LoginForm
  DisplayName: {"NamespaceIndex":26,"TextId":"LoginFormDisplayName"}
  Type: ObjectLibraryItem
  Children:
  - Name: LibraryItemGuid
    Type: BaseDataVariableType
    DataType: Guid
    Value: "64c3e1535979981f3ad5449b009a965c"
  - Name: LibraryItemVersion
    Type: BaseDataVariableType
    DataType: UInt32
    Value: 2
  - File: LoginFormComponents/LoginFormComponents.yaml
`

const dictionaryFixture = `Name: Translations
Type: FolderType
Children:
- Name: WidgetsLocalizationDictionary
  Type: LocalizationDictionary
  DataType: String
  ValueRank: 2
  ArrayDimensions: [0,0]
  Value:
  {
  "Type": 12,
  "Dimensions": [3,10],
  "Body": [
  "","en-US","it-IT","de-DE","es-ES","fr-FR","zh-CN","pt-BR","ja-JP","ko-KR",
  "AlarmIconDisplayName","Alarm Icon","Icona allarme","","","","报警图标","","","",
  "AlarmIconDescription","DESCRIPTION\\nAn animated bell.\\n\\nUSAGE\\n- Drop the widget in any UI container","","","","","","","","",
  ]
  }
`

test('the catalog reader separates importable items from the groups that hold the rest', () => {
  const parsed = parseItems(itemsFixture)
  assert.deepEqual(parsed.items.map(item => item.name), ['AlarmIcon', 'LoginForm'], 'the importable set is wrong')
  assert.deepEqual(parsed.groups, ['SignsAndSymbols', 'Toolbar'], 'a group reference or a non-item folder was read as importable')
})

test('a multi-line item block still yields its name, guid, version and owned types', () => {
  const [alarm] = parseItems(itemsFixture).items
  assert.equal(alarm.guid, '14a0a0b086b64ca4b72d063ce4f1eaac')
  assert.equal(alarm.version, 1)
  assert.equal(alarm.display_key, 'AlarmIconDisplayName')
  assert.equal(alarm.description_key, 'AlarmIconDescription')
  assert.equal(alarm.owned_types, 1, 'an item that owns a type must not look like a single object')
  const login = parseItems(itemsFixture).items[1]
  assert.equal(login.version, 2)
  assert.deepEqual(login.components, ['LoginFormComponents'], 'the component files an import drags in are not reported')
})

test('the localization matrix is read by its own header row, not by a guessed column', () => {
  const dictionary = parseDictionary(dictionaryFixture)
  assert.equal(dictionary.get('AlarmIconDisplayName').en, 'Alarm Icon')
  assert.equal(dictionary.get('AlarmIconDisplayName').zh, '报警图标')
  assert.match(dictionary.get('AlarmIconDescription').en, /An animated bell/u)
  const noEnglish = parseDictionary(dictionaryFixture.replace(/"en-US"/u, '"en-GB"'))
  assert.equal(noEnglish.size, 0, 'a dictionary without an English column must answer nothing, not shift every label one column')
})

test('a misspelled library or item answers the closest catalog names', () => {
  const names = ['LoginForm', 'AlarmIcon', 'AlarmGrid', 'PanelLoaderWithBack']
  assert.equal(suggestNames('loginform', names)[0], 'LoginForm', 'an exact match in another case is not the best answer')
  assert.ok(suggestNames('alarm', names).slice(0, 2).every(name => name.startsWith('Alarm')), 'containment is not ranked ahead of distance')
  assert.equal(suggestNames('LoginFormComponents', names, 1).length, 1, 'the limit is not honoured')
  assert.deepEqual(suggestNames('', names), [], 'an empty query suggests names it was never asked about')
})

test('findEntry accepts a browse name or a display name, case-insensitive', () => {
  const catalog = [{
    library: 'Widgets',
    item_count: 1,
    groups: [],
    items: [{ name: 'AlarmIcon', guid: '', version: 1, display_key: '', description_key: '', owned_types: 0, components: [], display: 'Alarm Icon' }],
  }]
  assert.equal(findEntry(catalog, ' widgets ', 'ALARMICON').item.name, 'AlarmIcon')
  assert.equal(findEntry(catalog, 'Widgets', 'Alarm Icon').item.name, 'AlarmIcon')
  assert.equal(findEntry(catalog, 'Widgetz', 'AlarmIcon'), null, 'a misspelled library must be refused, not guessed')
  assert.equal(findEntry(catalog, 'Widgets', 'Alarm Grid'), null, 'an item the library does not hold must be refused')
  assert.deepEqual(itemNames(catalog[0]), ['AlarmIcon', 'Alarm Icon'], 'the names a caller may pass are not both offered')
})

test('the bridge serves the import as a mutation route and runs it inside an impersonated session', () => {
  assert.match(bridge, /firstLine\.StartsWith\("POST \/bridge\/library\/import"\)/u, 'the dispatcher does not serve the import')
  assert.match(bridge, /"POST \/bridge\/library\/import",/u, 'the import is not in the mutation route list MaybeLogMutation consults')
  const handler = bridge.slice(bridge.indexOf('ImportLibraryItemInline(string firstLine'))
  assert.ok(handler.includes('Context.Sessions.ImpersonateRootTemporary()'), 'a design-time static call without a session aborts FTOptixStudio.exe with native heap corruption')
  assert.ok(handler.includes('TemplateLibrary.ImportLibraryItem('), 'the handler does not call the shipped import')
  assert.ok(handler.includes('TemplateLibrary.TypeConflictResolutionChoice'), 'the conflict types are nested in TemplateLibrary; bare names fail with CS0246')
  assert.ok(handler.includes('TemplateLibrary.ConflictResolution.Replace'), 'only Replace is documented; the verb must not invent another resolution')
  assert.match(bridge, /template_library\\":true/u, 'optix_status no longer advertises that this build serves the import')
  assert.match(bridge, /BridgeVersion\s*=\s*"1\.0\.9"/u, 'the build that adds the verb must say so in its version')
})

test('the health payload the bridge assembles is JSON, not only a shape a regex likes', () => {
  // Every optix call reads health first, and the gateway refuses a body that is not
  // JSON, so a dropped quote in this one concatenation breaks every bridge verb.
  // Each piece the bridge fills in at runtime is replaced with null, which is a valid
  // value whether the bridge quoted it or not, leaving the literal text itself on trial.
  const start = bridge.indexOf('private string HealthJson(')
  assert.ok(start >= 0, 'HealthJson is not where it was')
  const block = bridge.slice(start, bridge.indexOf('private string NodeJson('))
  const returned = block.slice(block.indexOf('return "')).replace(/\/\/[^\n]*/gu, '')
  const end = returned.indexOf('";')
  assert.ok(end > 0, 'the health payload does not end where it was')
  const payload = returned
    .slice('return '.length, end + 1)
    .split('+')
    .map(part => {
      const literal = /^"((?:[^"\\]|\\.)*)"/u.exec(part.trim())
      return literal === null ? 'null' : literal[1].replace(/\\"/gu, '"').replace(/\\\\/gu, '\\')
    })
    .join('')
  const health = JSON.parse(payload)
  assert.deepEqual(
    Object.keys(health),
    ['bridge_version', 'project', 'model_loaded', 'port', 'project_path', 'pid', 'invoke_session', 'template_library'],
    'the health fields the plugin reads are not the ones the bridge reports',
  )
  assert.equal(health.invoke_session, 'root', 'invoke_session is not a closed string, so the payload after it is unparseable')
  assert.equal(health.template_library, true)
})

test('the plugin registers optix_library and keeps an import out of the reversible batch', () => {
  assert.match(plugin, /name: "optix_library"/u, 'optix_library is not registered')
  assert.match(plugin, /library_import_unsupported_bridge/u, 'an import against an older bridge is not refused by name')
  assert.match(plugin, /"library\/import"/u, 'the plugin never posts the bridge verb')
  const allowlist = /const operations = \{([\s\S]*?)\n\};/u.exec(plugin)
  assert.ok(allowlist, 'the closed operation allowlist is not where it was')
  assert.ok(!allowlist[1].includes('library/'), 'a library import is not batch-reversible and must not join the optix_edit allowlist')
})

test('the manifest counts every tool the Optix row mounts, including the reader written here', () => {
  const catalog = JSON.parse(readFileSync(new URL('../components.json', import.meta.url), 'utf8'))
  const optix = catalog.components.find(component => component.id === 'optix')
  const registered = [...plugin.matchAll(/name: "(optix_[a-z_]+)"/gu)].map(match => match[1])
  assert.equal(new Set(registered).size, registered.length, 'two Optix tools register the same name')
  assert.equal(optix.tools.count, registered.length + 1, `${optix.tools.count} claimed against ${registered.length} vendored tools plus optix_netlogic`)
  assert.ok(catalog.contextBudget.note.includes('optix_netlogic'), 'the budget measurement does not say which tool is registered outside the vendored engine')
  assert.ok(optix.skill.allow.includes('optix_library'), 'the skill does not allow the tool it is meant to teach')
})

test('a machine with the Studio install answers from its own catalog, and one without is refused in words', async () => {
  const roots = await libraryRoots()
  if (roots.length === 0) {
    const refusal = noStudioInstall()
    assert.equal(refusal.status, 'failed')
    assert.match(refusal.error, /Files[\\/]Libraries/u)
    return
  }
  const catalog = await readCatalog(roots.at(-1).libraries, AbortSignal.timeout(20000))
  assert.ok(catalog.length > 0, 'the Libraries folder held nothing readable')
  assert.ok(catalog.some(entry => entry.item_count > 0), 'no library answered a single importable item')
  for (const entry of catalog) {
    assert.equal(entry.item_count, entry.items.length, `${entry.library}: item_count disagrees with the items it names`)
    for (const item of entry.items) {
      assert.ok(item.name.length > 0, `${entry.library}: an item was parsed with no name`)
      assert.ok(item.guid.length === 32, `${entry.library}/${item.name}: no LibraryItemGuid, so the catalog shape changed`)
    }
  }
})
