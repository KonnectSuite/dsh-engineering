#!/usr/bin/env node
/**
 * gen-l5x-knowledge.mjs — regenerate every committed L5X knowledge corpus file.
 *
 * Usage
 *   node scripts/gen-l5x-knowledge.mjs
 *       Write packages/l5x/knowledge/ from the authored sources and the
 *       Studio 5000 help installed on this host.
 *   node scripts/gen-l5x-knowledge.mjs --check
 *       Regenerate in memory and exit 1 when a committed file differs,
 *       is missing, or is not produced by the generator any more.
 *   node scripts/gen-l5x-knowledge.mjs --out <directory>
 *       Write the corpus into <directory> instead of packages/l5x/knowledge/
 *       (the determinism test builds two clean copies this way).
 *   node scripts/gen-l5x-knowledge.mjs --skip-help
 *       Regenerate only the authored collections and goldens.json, so the
 *       command works on a machine with no Studio 5000 installation.
 *
 * Inputs
 *   packages/l5x/knowledge-src/<collection>.mjs   authored pages, in our words
 *   packages/l5x/knowledge-src/goldens.mjs        retrieval goldens
 *   packages/l5x/src/engine/mnemonics.ts          legacy/current spelling pairs
 *   %ProgramFiles(x86)%\Rockwell Software\Studio 5000\Logix Designer\ENU\
 *     v37\Bin\Help\ENU\rs5000                     v37.05.00 installed help
 *     v36\Bin\Help\ENU\rs5000                     v36.00.00 installed help
 *   L5X_HELP_ROOT_V37_05 / L5X_HELP_ROOT_V36_00   override those two roots
 *
 * Outputs (all deterministic: sorted, UTF-8, LF, no timestamps, no absolute paths)
 *   packages/l5x/knowledge/<authored collection>/index.json
 *   packages/l5x/knowledge/<authored collection>/pages/<page>.md
 *   packages/l5x/knowledge/l5x-help-37-05/index.json   structural index only
 *   packages/l5x/knowledge/l5x-help-36-00/index.json   structural index only
 *   packages/l5x/knowledge/instruction-versions.json
 *   packages/l5x/knowledge/goldens.json
 *
 * The installed-help indexes carry identifiers, titles, sections and relative
 * help paths. They never carry help page text: `read` parses the locally
 * installed help at call time, so the committed files stay structural.
 */

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIRECTORY, '..')
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'l5x')
const KNOWLEDGE_ROOT = join(PACKAGE_ROOT, 'knowledge')
const SOURCE_ROOT = join(PACKAGE_ROOT, 'knowledge-src')
const MNEMONICS_SOURCE = join(PACKAGE_ROOT, 'src', 'engine', 'mnemonics.ts')

const HELP_COLLECTIONS = [
  {
    id: 'l5x-help-37-05',
    title: 'Studio 5000 Logix Designer v37.05 installed help index',
    source: 'installed-help',
    revision: '37.05.00',
    major: 37,
    layout: 'v37',
    env: 'L5X_HELP_ROOT_V37_05',
  },
  {
    id: 'l5x-help-36-00',
    title: 'Studio 5000 Logix Designer v36.00 installed help index',
    source: 'installed-help',
    revision: '36.00.00',
    major: 36,
    layout: 'v36',
    env: 'L5X_HELP_ROOT_V36_00',
  },
]

/** Chrome pages at the help root; they are not topics and are not indexed. */
const V37_CHROME_PAGES = new Set(['cshelp.html', 'index.html', 'indexTerms.html', 'search.html'])

/** Directory beneath the v37 root whose content is not a topic page. */
const V37_SKIP_DIRECTORIES = new Set(['oxygen-webhelp', 'graphics'])

/** Display names for the 46 instruction families of the v37 help. */
const V37_CLINSET_FAMILIES = {
  Alarm: 'Alarm Instructions',
  ArrayFileShift: 'Array (File)/Shift Instructions',
  Bit: 'Bit Instructions',
  Compare: 'Compare Instructions',
  Compute: 'Compute/Math Instructions',
  Debug: 'Debug Instructions',
  ForBreak: 'For/Break Instructions',
  License: 'License Instructions',
  Sequencer: 'Sequencer Instructions',
  Special: 'Special Instructions',
  Trigonometric: 'Trigonometric Instructions',
  arrayfilemisc: 'Array File-Misc Instructions',
  'ascii-convert': 'ASCII Conversion Instructions',
  'ascii-string': 'ASCII String Instructions',
  cip_motion: 'CIP Motion Exceptions',
  clinset_extras: 'Shared Instruction Topics',
  drivesafety: 'Drive Safety Instructions',
  embeds: 'Embedded Instruction Topics',
  'equip-phase': 'Equipment Phase Instructions',
  'equipment-sequence-instructions': 'Equipment Sequence Diagram Instructions',
  'gen-adv-math': 'Advanced Math Instructions',
  hmi: 'HMI Instructions',
  'input-output': 'Input/Output Instructions',
  'math-conversions': 'Math Conversion Instructions',
  metalforms: 'Metal Form Instructions',
  motion: 'Immediate Instructions',
  'motion-move-instructions': 'Motion Move Instructions',
  motion_motion_configuration: 'Motion Configuration Instructions',
  motion_motion_event: 'Motion Event Instructions',
  motion_motion_group: 'Motion Group Instructions',
  motion_multiaxis_coordinated_motion: 'Multi-Axis Coordinated Motion Instructions',
  motion_state: 'Motion State Instructions',
  'move-logical': 'Move/Logical Instructions',
  plantpax: 'PlantPAx Instructions',
  'proc-drives': 'Structured Text Instructions',
  'proc-drives-drives': 'Drives Instructions',
  'proc-drives-proc-control': 'Process Control Instructions',
  procdrivesstat: 'Statistical Instructions',
  processdrives_filter: 'Filter Instructions',
  processdrives_move_logical: 'Logical and Move Instructions',
  profile_gui_faults_errors: 'Fault and Error Topics',
  'prog-control': 'Program Control Instructions',
  safety: 'Safety Instructions',
  selectlimit: 'Select/Limit Instructions',
  sfc: 'SFC Instructions',
  'timer-counter': 'Timer and Counter Instructions',
}

/** Display names for the v37 guide sections. Falls back to the directory name. */
const V37_GUIDE_SECTIONS = {
  af_gx_lib: 'Add-On Instruction Library',
  af_utilities: 'Application Utilities',
  alarms: 'Alarms',
  aoi: 'Add-On Instructions',
  comments_correlate: 'Comments and Correlation',
  common_help: 'Common Help Topics',
  controllersecurity: 'Controller Security',
  controller_config: 'Controller Configuration',
  controller_org: 'Controller Organization',
  cross_ref: 'Cross Reference',
  datamon_taged: 'Data Monitor',
  emulate: 'Emulate',
  equipment_phases: 'Equipment Phases',
  equipment_sequences: 'Equipment Sequences',
  'firmware-supervisor': 'Firmware Supervisor',
  forcing: 'Forces',
  function_block: 'Function Block Editor',
  'high-integ-aoi': 'High-Integrity Add-On Instructions',
  hmi: 'HMI',
  'import-and-export': 'Import and Export',
  ladder_editor: 'Ladder Editor',
  lang_switch: 'Language Switching',
  logical_org: 'Logical Organizer',
  logixac: 'Logix Designer Application',
  menu_toolbar: 'Menus and Toolbars',
  motion: 'Motion',
  navigate: 'Navigation',
  plantpaxprops: 'PlantPAx Properties',
  'profile-gui-tasks-commands': 'Tasks and Commands',
  profile_gui_comm_formats: 'Communication Formats',
  profile_gui_dialogs: 'Dialogs',
  Profile_gui_faults_errors: 'Faults and Errors',
  program_config: 'Program Configuration',
  quick_start: 'Quick Start',
  reports: 'Reports',
  'search-replace': 'Search and Replace',
  sfc: 'Sequential Function Charts',
  source_protection: 'Source Protection',
  structured_text_: 'Structured Text',
  task_configuration: 'Task Configuration',
  trending: 'Trending',
  'user-defined_datatype': 'User-Defined Data Types',
}

/** Display names for the v37 module help sections. */
const V37_MODULE_SECTIONS = {
  '1734point_1738armorpoint': 'Point I/O and ArmorPoint Modules',
  '1756analog': '1756 Analog Modules',
  '1756common': '1756 Common Module Features',
  '1756specialty': '1756 Specialty Modules',
  '1769compact': '1769 Compact I/O',
  adapters: 'Communication Adapters',
  drivelogix: 'DriveLogix',
  flexanalog: 'Flex Analog Modules',
  flexcommon: 'Flex Common Module Features',
  flexdiscrete: 'Flex Discrete Modules',
  flexspecialty: 'Flex Specialty Modules',
  miscmodules: 'Other Modules',
  'module-errors': 'Module Error Codes',
  panelview: 'PanelView Terminals',
  wiringdiagram: 'Wiring Diagrams',
}

/** Display names for the v37 shared common-content sections. */
const V37_COMMON_SECTIONS = {
  'comm-attributes': 'Common Attributes',
  'electronic-keying': 'Electronic Keying',
  embeds: 'Embedded Topics',
  glossary: 'Glossary',
  studio5000mainenu: 'Studio 5000 Main Help',
}

/** v36 instruction family label as the v36 help spells it -> v37 family name. */
const V36_FAMILY_NAMES = {
  'Array (File)/Misc Instructions': 'Array File-Misc Instructions',
  'Equipment Sequence instructions': 'Equipment Sequence Diagram Instructions',
}

/** Words that look like a filename mnemonic but are topic words, never instructions. */
const MNEMONIC_STOPWORDS = new Set([
  'add', 'all', 'and', 'any', 'app', 'assignments', 'attribute', 'attributes', 'bit', 'bits', 'bnd',
  'bst', 'case', 'cell', 'chart', 'charts', 'code', 'comment', 'comments', 'configuration',
  'considerations', 'constructs', 'contents', 'control', 'controls', 'conventions', 'data', 'date',
  'default', 'definition', 'definitions', 'detail', 'details', 'display', 'edit', 'element', 'elements',
  'else', 'end', 'entry', 'error', 'event', 'example', 'examples', 'exit', 'expressions', 'false',
  'file', 'flag', 'flags', 'font', 'for', 'form', 'function', 'functions', 'general', 'guideline',
  'guidelines', 'help', 'index', 'info', 'input', 'instruction', 'instructions', 'integer',
  'introduction', 'item', 'items', 'key', 'keys', 'list', 'locale', 'map', 'menu', 'message',
  'messages', 'mode', 'modes', 'module', 'modules', 'name', 'next', 'node', 'note', 'notes', 'null',
  'open', 'output', 'overview', 'page', 'panel', 'param', 'parameters', 'path', 'props', 'property',
  'reference', 'references', 'result', 'row', 'rows', 'rule', 'rules', 'run', 'save', 'set', 'state',
  'status', 'step', 'steps', 'string', 'struct', 'structure', 'structures', 'summary', 'tab', 'table',
  'tag', 'tags', 'term', 'text', 'time', 'topic', 'topics', 'true', 'type', 'types', 'unit', 'units',
  'value', 'values', 'view', 'warning', 'warnings', 'word', 'words',
])

const RM_ID_PATTERN = /^(?:instruction-[a-z0-9_]+|family-[a-z0-9-]+|[a-z][a-z0-9-]*)$/

/** Decode the small set of entities the help titles use. */
function decodeEntities(text) {
  return text
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/giu, "'")
    .replace(/&nbsp;/gu, ' ')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/gu, '&')
}

/** Collapse runs of whitespace to one space and trim. */
function collapse(text) {
  return text.replace(/\s+/gu, ' ').trim()
}

/** Read a file as UTF-8, dropping a byte-order mark. */
function readText(file) {
  return readFileSync(file, 'utf8').replace(/^\uFEFF/u, '')
}

/** Recursively list files beneath a directory, sorted by codepoint path. */
function walkFiles(directory, skipDirectories = new Set()) {
  const files = []
  const visit = (current) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    )
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        if (skipDirectories.has(entry.name)) continue
        visit(full)
      } else if (entry.isFile()) {
        files.push(full)
      }
    }
  }
  visit(directory)
  return files
}

/** Relative POSIX path from a root. */
function relativePosix(root, file) {
  return relative(root, file).split(sep).join('/')
}

/** Derive a readable title from a file name when a page states none. */
function humanizedTitle(name) {
  const stem = basename(name).replace(/\.(?:html?|xhtml)$/iu, '')
  return collapse(stem.replace(/[-_]+/gu, ' '))
    .replace(/^\p{Ll}/u, (character) => character.toUpperCase())
}

/** Extract the <title> of a help page from its first few kilobytes. */
function pageTitle(file) {
  let descriptor
  try {
    descriptor = openSync(file, 'r')
    const buffer = Buffer.alloc(24 * 1024)
    const read = readSync(descriptor, buffer, 0, buffer.length, 0)
    const head = buffer.toString('utf8', 0, read)
    const match = /<title>([\s\S]*?)<\/title>/iu.exec(head)
    return match === null ? '' : collapse(decodeEntities(match[1]))
  } catch {
    return ''
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

/** Every instruction mnemonic a help page title states, e.g. "Jump to Subroutine (JSR), Subroutine (SBR), and Return (RET)". */
function titleMnemonics(title) {
  const found = []
  for (const segment of title.split(/,|\band\b/gu)) {
    const parenthetical = /\(([A-Z][A-Z0-9_]{1,19})\)\s*$/u.exec(segment.trim())
    if (parenthetical !== null && !found.includes(parenthetical[1])) found.push(parenthetical[1])
  }
  if (found.length > 0) return found
  const dashed = /-([A-Z][A-Z0-9_]{1,19})\s*$/u.exec(title)
  return dashed === null ? [] : [dashed[1]]
}

/** The first instruction mnemonic a help page title states. */
function titleMnemonic(title) {
  const all = titleMnemonics(title)
  return all.length === 0 ? null : all[0]
}

/** Mnemonic encoded with a doubled dash in a clinset topic file name, e.g. absolute-value--abs-.html. */
function doubledFileMnemonic(name) {
  const doubled = /-{2,}([a-z][a-z0-9_]*)-?\.html$/iu.exec(name)
  return doubled === null ? null : doubled[1].toUpperCase()
}

/** Single-dash file mnemonic, accepted only when the word is a known instruction name. */
function singleFileMnemonic(name, knownMnemonics) {
  const single = /-([a-z][a-z0-9_]*)\.html$/iu.exec(name)
  if (single === null) return null
  if (MNEMONIC_STOPWORDS.has(single[1].toLowerCase())) return null
  const candidate = single[1].toUpperCase()
  return knownMnemonics.has(candidate) ? candidate : null
}

/** Compare strings by codepoint, never by locale. */
function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

/** Serialise a value as deterministic pretty JSON with one trailing newline. */
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** The candidate install roots for one help collection, in search order. */
function helpRootCandidates(collection) {
  const override = process.env[collection.env]
  if (override !== undefined && override.trim() !== '') return [resolve(override.trim())]
  const roots = []
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const programFiles = process.env['ProgramFiles'] ?? 'C:\\Program Files'
  const bases = [
    join(programFilesX86, 'Rockwell Software', 'Studio 5000', 'Logix Designer', 'ENU'),
    join(programFiles, 'Rockwell Software', 'Studio 5000', 'Logix Designer', 'ENU'),
  ]
  for (const base of bases) {
    roots.push(join(base, `v${collection.major}`, 'Bin', 'Help', 'ENU', 'rs5000'))
  }
  return roots
}

/** The installed help root for one collection, or null with the roots searched. */
function resolveHelpRoot(collection) {
  const searched = helpRootCandidates(collection)
  for (const candidate of searched) {
    try {
      if (statSync(candidate).isDirectory()) return { root: candidate, searched }
    } catch {
      // Try the next candidate.
    }
  }
  return { root: null, searched }
}

/** Every help page of one v37 installation, as a structural index entry. */
function v37Pages(root) {
  const files = walkFiles(root, V37_SKIP_DIRECTORIES)
  const pathOf = (file) => relativePosix(root, file)
  const candidates = files.filter((file) => {
    if (!/\.html$/iu.test(file)) return false
    const relativePath = pathOf(file)
    if (!relativePath.includes('/')) return false
    return !V37_CHROME_PAGES.has(relativePath)
  })
  const titles = new Map()
  for (const file of candidates) {
    const relativePath = pathOf(file)
    titles.set(relativePath, pageTitle(file) || humanizedTitle(file))
  }
  const clinsetPaths = [...titles.keys()].filter((relativePath) => relativePath.startsWith('help/clinset/'))
  const knownMnemonics = new Set()
  for (const relativePath of clinsetPaths) {
    for (const mnemonic of titleMnemonics(titles.get(relativePath) ?? '')) knownMnemonics.add(mnemonic)
  }
  for (const relativePath of clinsetPaths) {
    const mnemonic = doubledFileMnemonic(relativePath)
    if (mnemonic !== null && !MNEMONIC_STOPWORDS.has(mnemonic.toLowerCase())) knownMnemonics.add(mnemonic)
  }
  const pages = []
  for (const relativePath of titles.keys()) {
    const title = titles.get(relativePath)
    const segments = relativePath.split('/')
    let section
    if (segments[0] === 'help' && segments[1] === 'clinset') {
      section = V37_CLINSET_FAMILIES[segments[2]] ?? humanizeSection(segments[2])
    } else if (segments[0] === 'help' && segments[1] === 'rs5000') {
      section = V37_GUIDE_SECTIONS[segments[2]] ?? humanizeSection(segments[2])
    } else if (segments[0] === 'help' && segments[1] === 'modules') {
      section = V37_MODULE_SECTIONS[segments[2]] ?? `Modules: ${humanizeSection(segments[2])}`
    } else if (segments[0] === 'common-content') {
      section = segments[1] === undefined ? 'Common Content' : (V37_COMMON_SECTIONS[segments[1]] ?? humanizeSection(segments[1]))
    } else if (segments[0] === 'publications') {
      section = `Publication ${(segments[1] ?? '').toUpperCase()}`
    } else {
      section = humanizeSection(segments[0])
    }
    const id = relativePath.replace(/\.html$/iu, '')
    const identifiers = new Set()
    if (segments[0] === 'help' && segments[1] === 'clinset') {
      for (const mnemonic of titleMnemonics(title)) identifiers.add(mnemonic)
      const doubled = doubledFileMnemonic(relativePath)
      if (doubled !== null && !MNEMONIC_STOPWORDS.has(doubled.toLowerCase())) identifiers.add(doubled)
      const single = singleFileMnemonic(relativePath, knownMnemonics)
      if (single !== null) identifiers.add(single)
    }
    const identifierList = [...identifiers].sort(compareCodepoint)
    pages.push({
      id,
      title,
      section,
      path: relativePath,
      ...(identifierList.length === 0 ? {} : { identifiers: identifierList }),
    })
  }
  return pages
}

/** A readable section label from a directory or file segment. */
function humanizeSection(segment) {
  if (segment === undefined || segment === '') return 'Help Topics'
  return collapse(segment.replace(/[-_]+/gu, ' '))
    .replace(/^\p{Ll}/u, (character) => character.toUpperCase())
}

/** A v36 search.json page identifier: URL stem without an anchor. */
function v36PageId(url) {
  const [file] = url.split('#')
  return file.replace(/\.html?$/iu, '')
}

/** The structural index entries of one v36 installation. */
function v36Pages(root) {
  const search = JSON.parse(readText(join(root, 'search.json')))
  const toc = JSON.parse(readText(join(root, 'toc.json')))
  const ancestry = new Map()
  const stack = []
  for (const node of toc) stack.push({ node, ancestors: [] })
  while (stack.length > 0) {
    const { node, ancestors } = stack.pop()
    const next = typeof node.text === 'string' && node.text !== '' ? [...ancestors, node.text] : ancestors
    if (typeof node.url === 'string' && node.url !== '' && !ancestry.has(node.url)) ancestry.set(node.url, next)
    if (Array.isArray(node.children)) {
      for (let index = node.children.length - 1; index >= 0; index--) stack.push({ node: node.children[index], ancestors: next })
    }
  }
  const records = (Array.isArray(search.pages) ? search.pages : [])
    .map((record) => {
      const url = String(record.url ?? '')
      const title = collapse(decodeEntities(String(record.title ?? ''))) || humanizedTitle(url)
      const chain = ancestry.get(url) ?? ancestry.get(url.split('#')[0]) ?? []
      return { url, title, chain }
    })
    .filter((record) => record.url !== '')
  const pages = []
  const used = new Set()
  for (const record of records) {
    const { url, title, chain } = record
    let id = v36PageId(url)
    if (used.has(id)) {
      const anchor = url.includes('#') ? url.slice(url.indexOf('#') + 1).replace(/[^A-Za-z0-9_]/gu, '') : ''
      id = anchor === '' ? `${id}-${used.size}` : `${id}-${anchor}`
    }
    used.add(id)
    const section = chain.length >= 2 ? chain[chain.length - 2] : (chain[0] ?? 'Help Topics')
    const identifiers = chain.includes('Instruction Set') ? titleMnemonics(title).sort(compareCodepoint) : []
    pages.push({
      id,
      title,
      section,
      path: url.split('#')[0],
      ...(identifiers.length === 0 ? {} : { identifiers }),
    })
  }
  return pages
}

/** Sort index pages by section first (so contents groups them) then id. */
function sortPages(pages) {
  return [...pages].sort((left, right) => compareCodepoint(left.section, right.section) || compareCodepoint(left.id, right.id))
}

/** The instruction mnemonics a v37 help page carries, with its family. */
function v37Instructions(root) {
  const files = walkFiles(join(root, 'help', 'clinset'))
    .filter((file) => /\.html$/iu.test(file))
    .sort(compareCodepoint)
  const titles = new Map()
  for (const file of files) titles.set(file, pageTitle(file))
  const known = new Set()
  for (const file of files) {
    for (const mnemonic of titleMnemonics(titles.get(file) ?? '')) known.add(mnemonic)
  }
  for (const file of files) {
    const mnemonic = doubledFileMnemonic(relativePosix(root, file))
    if (mnemonic !== null && !MNEMONIC_STOPWORDS.has(mnemonic.toLowerCase())) known.add(mnemonic)
  }
  const instructions = new Map()
  for (const file of files) {
    const relativePath = relativePosix(root, file)
    const familyDirectory = relativePath.split('/')[2]
    const family = V37_CLINSET_FAMILIES[familyDirectory] ?? humanizeSection(familyDirectory)
    const title = titles.get(file) ?? ''
    const candidates = []
    for (const mnemonic of titleMnemonics(title)) candidates.push({ mnemonic, confidence: 2 })
    const doubled = doubledFileMnemonic(relativePath)
    if (doubled !== null && !MNEMONIC_STOPWORDS.has(doubled.toLowerCase())) candidates.push({ mnemonic: doubled, confidence: 1 })
    const single = singleFileMnemonic(relativePath, known)
    if (single !== null) candidates.push({ mnemonic: single, confidence: 0 })
    candidates.sort((left, right) => right.confidence - left.confidence || compareCodepoint(left.mnemonic, right.mnemonic))
    for (const candidate of candidates) {
      if (!instructions.has(candidate.mnemonic)) instructions.set(candidate.mnemonic, family)
    }
  }
  return instructions
}

/** The instruction mnemonics a v36 help page carries, with its family. */
function v36Instructions(root) {
  const search = JSON.parse(readText(join(root, 'search.json')))
  const toc = JSON.parse(readText(join(root, 'toc.json')))
  const ancestry = new Map()
  const stack = []
  for (const node of toc) stack.push({ node, ancestors: [] })
  while (stack.length > 0) {
    const { node, ancestors } = stack.pop()
    const next = typeof node.text === 'string' && node.text !== '' ? [...ancestors, node.text] : ancestors
    if (typeof node.url === 'string' && node.url !== '' && !ancestry.has(node.url)) ancestry.set(node.url, next)
    if (Array.isArray(node.children)) {
      for (let index = node.children.length - 1; index >= 0; index--) stack.push({ node: node.children[index], ancestors: next })
    }
  }
  const instructions = new Map()
  for (const record of Array.isArray(search.pages) ? search.pages : []) {
    const url = String(record.url ?? '')
    const title = collapse(decodeEntities(String(record.title ?? '')))
    const chain = ancestry.get(url) ?? ancestry.get(url.split('#')[0]) ?? []
    if (!chain.includes('Instruction Set')) continue
    const label = chain.length >= 3 ? chain[chain.length - 2] : 'Instruction Set'
    const family = V36_FAMILY_NAMES[label] ?? label
    for (const mnemonic of titleMnemonics(title)) {
      if (!instructions.has(mnemonic)) instructions.set(mnemonic, family)
    }
  }
  return instructions
}

/** The legacy/current spelling pairs the product engine publishes. */
function spellingPairs() {
  const source = readText(MNEMONICS_SOURCE)
  const pairs = []
  for (const match of source.matchAll(/\{\s*legacy:\s*'([A-Z0-9_]+)',\s*modern:\s*'([A-Z0-9_]+)'\s*\}/gu)) {
    pairs.push({ legacy: match[1], modern: match[2] })
  }
  if (pairs.length === 0) throw new Error(`no legacy/modern spelling pairs found in ${MNEMONICS_SOURCE}`)
  return pairs
}

/** Merge both help revisions into the committed instruction-versions document. */
function instructionVersions(pages37, pages36, pairs) {
  const entries = new Map()
  const add = (mnemonic, family, revision) => {
    const existing = entries.get(mnemonic)
    if (existing === undefined) entries.set(mnemonic, { mnemonic, family, revisions: new Set([revision]) })
    else {
      existing.revisions.add(revision)
      if (existing.family === '' || existing.family === 'Instruction Set') existing.family = family
    }
  }
  for (const [mnemonic, family] of pages37) add(mnemonic, family, '37.05.00')
  for (const [mnemonic, family] of pages36) add(mnemonic, family, '36.00.00')
  for (const pair of pairs) {
    const legacy = entries.get(pair.legacy)
    const modern = entries.get(pair.modern)
    if (legacy !== undefined && modern !== undefined) {
      for (const revision of modern.revisions) legacy.revisions.add(revision)
      for (const revision of legacy.revisions) modern.revisions.add(revision)
      if (legacy.family === 'Instruction Set') legacy.family = modern.family
      if (modern.family === 'Instruction Set') modern.family = legacy.family
    } else if (legacy !== undefined) {
      add(pair.modern, legacy.family, [...legacy.revisions][0] ?? '36.00.00')
      for (const revision of legacy.revisions) entries.get(pair.modern).revisions.add(revision)
    } else if (modern !== undefined) {
      add(pair.legacy, modern.family, [...modern.revisions][0] ?? '37.05.00')
      for (const revision of modern.revisions) entries.get(pair.legacy).revisions.add(revision)
    }
  }
  const instructions = [...entries.values()]
    .map((entry) => ({
      mnemonic: entry.mnemonic,
      family: entry.family,
      revisions: [...entry.revisions].sort(compareCodepoint),
    }))
    .sort((left, right) => compareCodepoint(left.mnemonic, right.mnemonic))
  return {
    schema: 1,
    provenance: {
      source: 'Studio 5000 Logix Designer installed help, parsed structurally',
      helpVersions: ['36.00.00', '37.05.00'],
      v37Parse: 'clinset topic page titles and file names; one revision shard per installed help tree',
      v36Parse: 'search.json titles with toc.json Instruction Set ancestry',
      spellingPairs: 'legacy/current spellings from packages/l5x/src/engine/mnemonics.ts; either spelling answers at either revision',
      generator: 'scripts/gen-l5x-knowledge.mjs',
    },
    instructions,
  }
}

/** Load every authored collection source, in file-name order. */
async function authoredCollections() {
  const files = readdirSync(SOURCE_ROOT)
    .filter((name) => name.endsWith('.mjs') && name !== 'goldens.mjs')
    .sort(compareCodepoint)
  const collections = []
  for (const name of files) {
    const module = await import(pathToFileURL(join(SOURCE_ROOT, name)).href)
    const exported = module.default ?? module.collection
    if (exported === undefined) continue
    collections.push(exported)
  }
  return collections
}

/** The authored corpus outputs: index.json plus one markdown file per page. */
function authoredOutputs(collections) {
  const outputs = new Map()
  const knownIds = new Set()
  for (const collection of collections) {
    const seen = new Set()
    const aliases = {}
    const pages = []
    for (const page of collection.pages) {
      if (!RM_ID_PATTERN.test(page.id)) throw new Error(`collection ${collection.id}: page id "${page.id}" is not a lowercase slug`)
      if (seen.has(page.id)) throw new Error(`collection ${collection.id}: page id "${page.id}" is duplicated`)
      seen.add(page.id)
      if (knownIds.has(page.id)) throw new Error(`page id "${page.id}" is used by more than one collection`)
      knownIds.add(page.id)
      const body = String(page.body ?? '').replace(/\r\n?/gu, '\n').replace(/^\n+/u, '').replace(/\n*$/u, '')
      if (body === '') throw new Error(`collection ${collection.id}: page "${page.id}" has no body`)
      const identifiers = (page.identifiers ?? []).map((identifier) => identifier.trim()).filter((identifier) => identifier !== '')
      for (const alias of page.aliases ?? []) {
        const raw = alias.trim()
        if (raw === '') continue
        if (aliases[raw] !== undefined) throw new Error(`collection ${collection.id}: alias "${raw}" is used twice`)
        aliases[raw] = page.id
      }
      outputs.set(`${collection.id}/pages/${page.id}.md`, `${body}\n`)
      pages.push({
        id: page.id,
        title: page.title,
        ...(page.section === undefined ? {} : { section: page.section }),
        body: `pages/${page.id}.md`,
        ...(identifiers.length === 0 ? {} : { identifiers }),
        ...(page.revision === undefined ? {} : { revision: page.revision }),
      })
    }
    const sectionOrder = collection.sections ?? []
    const sectionIndex = (section) => {
      const index = sectionOrder.indexOf(section)
      return index === -1 ? sectionOrder.length : index
    }
    pages.sort((left, right) => sectionIndex(left.section) - sectionIndex(right.section) || compareCodepoint(left.id, right.id))
    const index = {
      schema: 1,
      collection: collection.id,
      title: collection.title,
      source: 'authored',
      revisions: [],
      pageCount: pages.length,
      pages,
      ...(Object.keys(aliases).length === 0 ? {} : { aliases: Object.fromEntries(Object.entries(aliases).sort(([left], [right]) => compareCodepoint(left, right))) }),
    }
    outputs.set(`${collection.id}/index.json`, jsonText(index))
  }
  return { outputs, knownIds }
}

/** A committed installed-help index from the pages of one installation. */
function helpIndexOutput(collection, pages) {
  const sorted = sortPages(pages)
  const index = {
    schema: 1,
    collection: collection.id,
    title: collection.title,
    source: collection.source,
    revisions: [collection.revision],
    pageCount: sorted.length,
    pages: sorted,
  }
  return { [`${collection.id}/index.json`]: jsonText(index) }
}

/** Validate and serialise the retrieval goldens. */
function goldensOutput(source, knownIds, strict = true) {
  const cases = [...(source.cases ?? [])].sort((left, right) => compareCodepoint(left.id, right.id))
  if (cases.length === 0) throw new Error('goldens source has no cases')
  const seen = new Set()
  for (const item of cases) {
    if (typeof item.id !== 'string' || item.id === '') throw new Error('every golden needs an id')
    if (seen.has(item.id)) throw new Error(`golden id "${item.id}" is duplicated`)
    seen.add(item.id)
    if (typeof item.query !== 'string' || item.query.trim() === '') throw new Error(`golden "${item.id}" needs a query`)
    if (!['answer', 'exact', 'no-match'].includes(item.kind)) throw new Error(`golden "${item.id}" has an unknown kind "${item.kind}"`)
    if (!Array.isArray(item.expect)) throw new Error(`golden "${item.id}" needs an expect array`)
    if (item.expect.length > 3) throw new Error(`golden "${item.id}" expects more than three ids`)
    if (item.kind !== 'no-match' && item.expect.length === 0) throw new Error(`golden "${item.id}" expects at least one id`)
    for (const id of item.expect) {
      if (strict && !knownIds.has(id)) throw new Error(`golden "${item.id}" expects page "${id}", which is not in the committed indexes`)
    }
  }
  return {
    schema: 1,
    collection: 'all',
    cases,
  }
}

/** Compare a generated file map with the committed knowledge directory. */
function checkOutputs(outputs, ungenerated = []) {
  const problems = []
  const generated = new Set()
  const absent = new Set(ungenerated)
  for (const [relativePath, content] of [...outputs.entries()].sort(([left], [right]) => compareCodepoint(left, right))) {
    generated.add(relativePath)
    const file = join(KNOWLEDGE_ROOT, relativePath)
    if (!existsSync(file)) {
      problems.push(`missing: ${relativePath}`)
      continue
    }
    const committed = readText(file)
    if (committed !== content) problems.push(`stale: ${relativePath}`)
  }
  if (existDirectory(KNOWLEDGE_ROOT)) {
    for (const file of walkFiles(KNOWLEDGE_ROOT)) {
      const relativePath = relativePosix(KNOWLEDGE_ROOT, file)
      if (!generated.has(relativePath) && !absent.has(relativePath)) problems.push(`unexpected: ${relativePath}`)
    }
  }
  return problems
}

/** Whether a path is an existing directory. */
function existDirectory(directory) {
  try {
    return statSync(directory).isDirectory()
  } catch {
    return false
  }
}

/** Write one output map beneath a root. */
function writeOutputs(outputs, root) {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
  for (const [relativePath, content] of [...outputs.entries()].sort(([left], [right]) => compareCodepoint(left, right))) {
    const file = join(root, relativePath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content, 'utf8')
  }
}

/** Read the goldens source module, when present. */
async function goldensSource() {
  const file = join(SOURCE_ROOT, 'goldens.mjs')
  if (!existsSync(file)) return { cases: [] }
  const module = await import(pathToFileURL(file).href)
  return module.default ?? module.goldens ?? { cases: [] }
}

/** Run the generator. */
async function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const skipHelp = args.includes('--skip-help')
  const outIndex = args.indexOf('--out')
  const out = check ? null : outIndex === -1 ? KNOWLEDGE_ROOT : resolve(args[outIndex + 1] ?? '')

  if (check && out !== null) throw new Error('--check and --out are mutually exclusive')

  const collections = await authoredCollections()
  const authored = authoredOutputs(collections)
  const outputs = new Map(authored.outputs)
  const knownIds = new Set(authored.knownIds)

  const helpNotes = []
  const ungenerated = []
  let helpComplete = false
  if (!skipHelp) {
    const roots = new Map()
    for (const collection of HELP_COLLECTIONS) {
      const found = resolveHelpRoot(collection)
      if (found.root === null) {
        console.error(
          `Cannot find the Studio 5000 Logix Designer ${collection.revision} installed help.\n` +
            `Searched:\n${found.searched.map((candidate) => `  ${candidate}`).join('\n')}\n` +
            `Set ${collection.env} to the help root, or pass --skip-help to regenerate the authored corpus only.`,
        )
        process.exitCode = 2
        return
      }
      roots.set(collection.id, found.root)
    }
    const pages = new Map(HELP_COLLECTIONS.map((collection) => [collection.id, collection.layout === 'v37'
      ? v37Pages(roots.get(collection.id))
      : v36Pages(roots.get(collection.id))]))
    const versions = instructionVersions(
      v37Instructions(roots.get('l5x-help-37-05')),
      v36Instructions(roots.get('l5x-help-36-00')),
      spellingPairs(),
    )
    for (const collection of HELP_COLLECTIONS) {
      const collectionPages = pages.get(collection.id)
      for (const page of collectionPages) knownIds.add(page.id)
      for (const [relativePath, content] of Object.entries(helpIndexOutput(collection, collectionPages))) {
        outputs.set(relativePath, content)
      }
    }
    outputs.set('instruction-versions.json', jsonText(versions))
    helpComplete = true
    helpNotes.push(`v37.05.00: ${pages.get('l5x-help-37-05').length} pages, ${versions.instructions.length} instruction mnemonics`)
    helpNotes.push(`v36.00.00: ${pages.get('l5x-help-36-00').length} pages`)
  } else {
    ungenerated.push('instruction-versions.json', ...HELP_COLLECTIONS.map((collection) => `${collection.id}/index.json`))
    helpNotes.push('installed-help indexes and instruction-versions.json are left as committed (--skip-help)')
  }

  const goldens = await goldensSource()
  if (goldens.cases.length > 0) {
    outputs.set('goldens.json', jsonText(goldensOutput(goldens, knownIds, helpComplete)))
    if (!helpComplete) helpNotes.push('goldens.json expected page ids were not checked against the help indexes (--skip-help)')
  }

  if (check) {
    const problems = checkOutputs(outputs, ungenerated)
    for (const note of helpNotes) console.log(note)
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem)
      console.error(`\n${problems.length} committed knowledge file(s) do not match the generator. Run: node scripts/gen-l5x-knowledge.mjs`)
      process.exitCode = 1
      return
    }
    console.log('l5x knowledge is up to date')
    return
  }

  writeOutputs(outputs, out)
  for (const note of helpNotes) console.log(note)
  console.log(`wrote ${outputs.size} file(s) under ${relative(REPO_ROOT, out) || out}`)
}

export { authoredOutputs, helpIndexOutput, instructionVersions, jsonText, sortPages, spellingPairs, v36Pages, v37Pages }

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
