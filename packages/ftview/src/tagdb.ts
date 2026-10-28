/**
 * Read a FactoryTalk View ME tag snapshot without the tag wizard.
 *
 * The application keeps its tag database beside the `.med`: `TAG\<app>.MDF`
 * (plus `_Log.ldf`). Attaching a copy of those files to the local SQL Server
 * instance exposes the same `AllTagsView` rows the DatabaseConverter wizard
 * reads, so the CSV can be produced headlessly. The rendering below is
 * byte-identical to the wizard's output (same header, quoting, folder and tag
 * ordering, trailing columns) - proven against wizard CSVs from two
 * applications.
 *
 * SQL Server runs as its own service account, so the working copy lives under
 * `%ProgramData%` and is granted to that account. Every attach names a unique
 * database and is detached in `finally`; the copy is deleted afterwards.
 *
 * @module dsh-engineering-ftview/tagdb
 */

import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { EngineeringError } from './core.ts'
import { projectFolder } from './vendor.ts'

/** One row of `AllTagsView`, trimmed to the columns the snapshot needs. */
export interface TagDatabaseRow {
  readonly id: number
  readonly name: string
  readonly description: string | null
  /** `0` folder, `1` analog, `2` digital. */
  readonly type: string
  /** `0` device, `2` memory. */
  readonly dataSource: string
  readonly security: string | null
  readonly alarmed: string
  readonly readOnly: string
  readonly retentive: string
  readonly nativeType: string | null
  readonly valueType: string | null
  readonly min: string | null
  readonly max: string | null
  readonly initial: string | null
  readonly scale: string | null
  readonly offset: string | null
  readonly units: string | null
  readonly offLabel: string | null
  readonly onLabel: string | null
  readonly initialLabel: string | null
  readonly address: string | null
}

/** A completed snapshot. */
export interface TagSnapshot {
  /** Application the snapshot came from. */
  readonly application: string
  /** CSV written. */
  readonly path: string
  /** Tag rows (folders excluded). */
  readonly tags: number
  /** Folder rows. */
  readonly folders: number
  /** Size of the written file. */
  readonly bytes: number
  /** SQL Server instance used. */
  readonly instance: string
  /** `sqlcmd` used. */
  readonly sqlcmd: string
}

/** Where the application keeps its tag database. */
export interface TagDatabaseFiles {
  /** Application name. */
  readonly application: string
  /** Primary data file. */
  readonly mdf: string
  /** Transaction log, when the application has one. */
  readonly ldf?: string
}

/** Columns read from `AllTagsView`, in query order. */
const COLUMNS = [
  'Id', 'Name', 'Description', 'Type', 'DataSrcType', 'Security', 'ExternalRefs', 'ReadOnly', 'ParentId',
  'ParentType', 'Retentive', 'AnaNativeType', 'AnaValueType', 'AnaMinValue', 'AnaMaxValue', 'AnaInitValue',
  'AnaScale', 'AnaOffset', 'AnaUnits', 'DigOffLabel', 'DigOnLabel', 'DigInitValue', 'StrLength', 'StrInitValue',
  'BlkElementSize', 'BlkNumElements', 'BlkInitValue', 'DevAddress', 'SysItemName', 'SysItemIndex',
] as const

/** The wizard's header, reproduced verbatim. */
const HEADER = ';Tag Type, Tag Name, Tag Description, Read Only, Data Source, Security Code, Alarmed, Native Type, ' +
  'Value Type, Min Analog, Max Analog, Initial Analog, Scale, Offset, DeadBand, Units, Off Label Digital, ' +
  'On Label Digital, Initial Digital, Length String, Initial String, Retentive, Address, System Source Name, ' +
  'System Source Index, RIO Address, Element Size Block, Number Elements Block, Initial Block'

/** The wizard's version marker, reproduced verbatim. */
const VERSION = ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!'

/** Analog native types the wizard names by letter. */
const NATIVE: Readonly<Record<string, string>> = { '0': 'D', '2': 'I', '3': 'L', '4': 'F' }

/** Analog value types the wizard names by letter. */
const VALUE: Readonly<Record<string, string>> = { '0': 'L', '1': 'F' }

/**
 * Find `SQLCMD.EXE` in the installed client tools, newest first.
 *
 * @returns Absolute path, or `undefined` when no client tools are installed.
 */
export function findSqlcmd(): string | undefined {
  const roots = [
    process.env['ProgramFiles'] ?? 'C:/Program Files',
    process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)',
  ].map(root => join(root, 'Microsoft SQL Server'))
  const found: string[] = []
  const walk = (folder: string, depth: number): void => {
    if (depth > 5) return
    const candidate = join(folder, 'Tools/Binn/SQLCMD.EXE')
    if (existsSync(candidate)) found.push(candidate)
    let children: readonly string[] = []
    try {
      children = readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    } catch {
      return
    }
    for (const child of children) walk(join(folder, child), depth + 1)
  }
  for (const root of roots) {
    if (existsSync(root)) walk(root, 0)
  }
  return found.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0]
}

/**
 * Name the SQL Server instance holding the MVStudio tag schema.
 *
 * @returns The instance name, `MSSQLSERVER` for the default instance.
 */
export function findInstance(): string {
  const key = 'HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL'
  let text = ''
  try {
    text = execFileSync('reg', ['query', key], { encoding: 'utf8' })
  } catch {
    throw new EngineeringError(
      'TAG_DATABASE_UNAVAILABLE',
      'No local SQL Server instance is registered, so the tag database cannot be read.',
      'Export tags with ftview_studio_export_prepare and the DatabaseConverter wizard instead.',
    )
  }
  const names = [...text.matchAll(/^\s{4}(\w+)\s+REG_SZ\s+(\S+)\s*$/gm)].map(match => match[1])
  if (names.length === 0) {
    throw new EngineeringError(
      'TAG_DATABASE_UNAVAILABLE',
      'No local SQL Server instance is registered, so the tag database cannot be read.',
      'Export tags with ftview_studio_export_prepare and the DatabaseConverter wizard instead.',
    )
  }
  return names.includes('MSSQLSERVER') ? 'MSSQLSERVER' : names.sort()[0]
}

/**
 * Locate the tag database of one application.
 *
 * @param application - Application name as the project store lists it.
 * @param folder - Project store root, when not the default.
 * @returns The `.MDF` and, when present, the `.ldf`.
 */
export function storeRoot(): string {
  return join(process.env['PUBLIC'] ?? 'C:/Users/Public', 'Documents', 'RSView Enterprise/ME/HMI projects')
}

/** The wizard-equivalent CSV path for one application. */
export function defaultTagCsv(application: string): string {
  return join(projectFolder(application) ?? join(storeRoot(), application), `${application}-Tags.CSV`)
}

/**
 * Locate the tag database of one application.
 *
 * @param application - Application name as the project store lists it.
 * @param folder - Application folder, when not the default store.
 * @returns The `.MDF` and, when present, the `.ldf`.
 */
export function findTagDatabase(application: string, folder = projectFolder(application) ?? join(storeRoot(), application)): TagDatabaseFiles {
  const tagFolder = join(folder, 'TAG')
  if (!existsSync(tagFolder)) {
    throw new EngineeringError(
      'TAG_DATABASE_MISSING',
      `${application} has no TAG folder, so it carries no tag database.`,
      'Start FactoryTalk View Studio once with this application, export tags with the wizard, or confirm the name.',
    )
  }
  const files = readdirSync(tagFolder)
  const mdf = files.find(name => name.toLowerCase().endsWith('.mdf'))
  if (mdf === undefined) {
    throw new EngineeringError(
      'TAG_DATABASE_MISSING',
      `${application} has no .MDF tag database in ${tagFolder}.`,
      'Export tags with the DatabaseConverter wizard instead.',
    )
  }
  const ldf = files.find(name => name.toLowerCase().endsWith('.ldf'))
  return ldf === undefined
    ? { application, mdf: join(tagFolder, mdf) }
    : { application, mdf: join(tagFolder, mdf), ldf: join(tagFolder, ldf) }
}

/** Columns whose text may contain CR/LF and must survive the line-based pipe. */
const TEXT_COLUMNS = new Set(['Name', 'Description', 'Security', 'AnaUnits', 'DigOffLabel', 'DigOnLabel', 'DigInitValue', 'DevAddress'])

/** Marker for a NULL cell. */
const NULL_TOKEN = '[[NULL]]'

/**
 * Build one select-list expression.
 *
 * Text travels as hex of its UTF-16 form, so no console code page can drop
 * characters (the wizard preserves em dashes and embedded newlines), and the
 * line-based pipe stays intact.
 *
 * @param name - Column name.
 * @returns SQL expression for that column.
 */
function columnExpression(name: string): string {
  if (!TEXT_COLUMNS.has(name)) return `[${name}]`
  return `CASE WHEN [${name}] IS NULL THEN '${NULL_TOKEN}' ELSE CONVERT(varchar(max), CONVERT(varbinary(max), CONVERT(nvarchar(max), [${name}])), 2) END`
}

/**
 * Parse `sqlcmd` output into rows.
 *
 * @param text - Raw command output, one row per line, `|` separated.
 * @returns Rows with the snapshot's columns.
 */
export function parseRows(text: string): readonly TagDatabaseRow[] {
  const rows: TagDatabaseRow[] = []
  const restore = (raw: string): string | null => {
    if (raw === NULL_TOKEN) return null
    return /^[0-9A-Fa-f]*$/.test(raw) && raw.length % 4 === 0 ? Buffer.from(raw, 'hex').toString('utf16le') : raw
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const cells = line.split('|').map(cell => cell.trim())
    const value = (name: typeof COLUMNS[number]): string => cells[COLUMNS.indexOf(name)] ?? NULL_TOKEN
    const plain = (name: typeof COLUMNS[number]): string | null => {
      const raw = value(name)
      return raw === NULL_TOKEN ? null : raw
    }
    rows.push({
      id: Number(value('Id')),
      name: restore(value('Name')) ?? '',
      description: restore(value('Description')),
      type: plain('Type') ?? '',
      dataSource: plain('DataSrcType') ?? '',
      security: restore(value('Security')),
      alarmed: String(Number(value('ExternalRefs'))),
      readOnly: String(Number(value('ReadOnly'))),
      retentive: String(Number(value('Retentive'))),
      nativeType: plain('AnaNativeType'),
      valueType: plain('AnaValueType'),
      min: plain('AnaMinValue'),
      max: plain('AnaMaxValue'),
      initial: plain('AnaInitValue'),
      scale: plain('AnaScale'),
      offset: plain('AnaOffset'),
      units: restore(value('AnaUnits')),
      offLabel: restore(value('DigOffLabel')),
      onLabel: restore(value('DigOnLabel')),
      initialLabel: restore(value('DigInitValue')),
      address: restore(value('DevAddress')),
    })
  }
  return rows
}

/** Quote one CSV string the wizard's way: NULL is empty, `''` is `""`. */
function quoted(value: string | null): string {
  return value === null ? '' : `"${value.replace(/"/g, '""')}"`
}

/** Render one numeric cell the wizard's way. */
function numeric(value: string | null): string {
  return value === null || value === '' ? '' : String(Number(value))
}

/** Sort names the wizard's way: case-insensitive, no numeric collation. */
function order(a: string, b: string): number {
  return a.toLowerCase().localeCompare(b.toLowerCase(), 'en', { numeric: false })
}

/**
 * Render rows as the tag wizard's CSV, byte for byte.
 *
 * @param rows - Rows read from `AllTagsView`.
 * @returns CSV text with CRLF line ends and a trailing newline.
 */
export function renderTagCsv(rows: readonly TagDatabaseRow[]): string {
  const folders = rows.filter(row => row.type === '0' && row.name.toLowerCase() !== 'system').sort((a, b) => order(a.name, b.name))
  const tags = rows.filter(row => row.type !== '0' && !row.name.toLowerCase().startsWith('system\\')).sort((a, b) => order(a.name, b.name))
  const lines: string[] = [HEADER, VERSION, '', ';Folders Section (Must define folders before tags)']
  for (const folder of folders) {
    lines.push(['"F"', quoted(folder.name), quoted(folder.description), '"F"'].join(','))
  }
  lines.push('', ';Tag Section')
  for (const tag of tags) {
    const memory = tag.dataSource === '2'
    const kind = tag.type === '1' ? 'A' : tag.type === '2' ? 'D' : '?'
    const cells: string[] = [
      `"${kind}"`,
      quoted(tag.name),
      quoted(tag.description),
      `"${tag.readOnly === '1' ? 'T' : 'F'}"`,
      `"${memory ? 'M' : 'D'}"`,
      quoted(tag.security),
      `"${Number(tag.alarmed) !== 0 ? 'T' : 'F'}"`,
    ]
    if (tag.type === '1') {
      cells.push(
        `"${NATIVE[tag.nativeType ?? ''] ?? `?nat${tag.nativeType}`}"`,
        `"${VALUE[tag.valueType ?? ''] ?? `?val${tag.valueType}`}"`,
        numeric(tag.min),
        numeric(tag.max),
        numeric(tag.initial),
        numeric(tag.scale),
        numeric(tag.offset),
        '0',
        quoted(tag.units),
        '', '', '', '', '',
      )
    } else {
      cells.push(
        '', '', '', '', '', '', '', '', '',
        quoted(tag.offLabel), quoted(tag.onLabel), quoted(tag.initialLabel), '', '',
      )
    }
    cells.push(memory ? (tag.retentive === '1' ? '1' : '0') : '', quoted(tag.address))
    lines.push(cells.join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/** Run one `sqlcmd` query, failing loudly. */
function query(sqlcmd: string, instance: string, statement: string): string {
  return execFileSync(
    sqlcmd,
    ['-S', instance === 'MSSQLSERVER' ? '(local)' : `(local)\\${instance}`, '-E', '-C', '-b', '-h', '-1', '-s', '|', '-y', '8000', '-f', '65001', '-Q', statement],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  )
}

/** Grant the SQL Server service account access to a staging folder. */
function grantService(folder: string, instance: string): void {
  const account = instance === 'MSSQLSERVER' ? 'NT SERVICE\\MSSQLSERVER' : `NT SERVICE\\MSSQL$${instance}`
  try {
    execFileSync('icacls', [folder, '/grant', `${account}:(OI)(CI)F`], { encoding: 'utf8', windowsHide: true })
  } catch {
    // The grant is best effort: a machine where the service already reads
    // ProgramData needs none, and the attach failure below reports the reason.
  }
}

/**
 * Read every tag row of one application.
 *
 * @param application - Application name in the project store.
 * @param folder - Project store root, when not the default.
 * @returns Rows in database order.
 */
export function readTagRows(application: string, folder = projectFolder(application) ?? join(storeRoot(), application)): readonly TagDatabaseRow[] {
  const files = findTagDatabase(application, folder)
  const sqlcmd = findSqlcmd()
  if (sqlcmd === undefined) {
    throw new EngineeringError(
      'TAG_DATABASE_UNAVAILABLE',
      'SQLCMD.EXE was not found, so the tag database cannot be read headlessly.',
      'Install the SQL Server client tools, or export tags with ftview_studio_export_prepare and the wizard.',
    )
  }
  const instance = findInstance()
  const staging = join(process.env['ProgramData'] ?? 'C:/ProgramData', 'AryaCode/ftview-tagdb', `snap-${process.pid}-${Date.now()}`)
  mkdirSync(staging, { recursive: true })
  grantService(dirname(staging), instance)
  grantService(staging, instance)
  const mdf = join(staging, 'tag.mdf')
  copyFileSync(files.mdf, mdf)
  const ldf = files.ldf === undefined ? undefined : join(staging, 'tag_log.ldf')
  if (files.ldf !== undefined && ldf !== undefined) copyFileSync(files.ldf, ldf)
  const database = `AryaTagSnap_${process.pid}_${Date.now() % 100000}`
  const attach = ldf === undefined
    ? `CREATE DATABASE [${database}] ON (FILENAME='${mdf}') FOR ATTACH_REBUILD_LOG`
    : `CREATE DATABASE [${database}] ON (FILENAME='${mdf}'),(FILENAME='${ldf}') FOR ATTACH`
  try {
    try {
      query(sqlcmd, instance, attach)
    } catch (error) {
      throw new EngineeringError(
        'TAG_DATABASE_UNAVAILABLE',
        `Could not attach ${files.mdf} to ${instance}: ${error instanceof Error ? error.message.split('\n').slice(0, 3).join(' ').trim() : String(error)}`,
        'Check that SQL Server (MSSQLSERVER) is running and the service account can read %ProgramData%\\AryaCode, or export tags with the wizard.',
      )
    }
    const columns = COLUMNS.map(columnExpression).join(', ')
    const text = query(sqlcmd, instance, `SET NOCOUNT ON; SELECT ${columns} FROM [${database}].dbo.AllTagsView ORDER BY Id`)
    return parseRows(text)
  } finally {
    try {
      query(sqlcmd, instance, `IF DB_ID('${database}') IS NOT NULL EXEC sp_detach_db '${database}'`)
    } catch {
      // A detach failure leaves a name to clean up; the copy below still goes.
    }
    try {
      rmSync(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 } as Parameters<typeof rmSync>[1])
    } catch {
      // Files the service still holds are removed on the next run.
    }
  }
}

/**
 * Write the headless tag snapshot for one application.
 *
 * @param application - Application name in the project store.
 * @param path - CSV file to write.
 * @param folder - Project store root, when not the default.
 * @returns What was written.
 */
export function exportTagSnapshot(application: string, path: string, folder = projectFolder(application) ?? join(storeRoot(), application)): TagSnapshot {
  const rows = readTagRows(application, folder)
  const csv = renderTagCsv(rows)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, snapshotBytes(csv))
  return {
    application,
    path,
    tags: rows.filter(row => row.type !== '0').length,
    folders: rows.filter(row => row.type === '0').length,
    bytes: statSync(path).size,
    instance: findInstance(),
    sqlcmd: findSqlcmd() ?? '',
  }
}


/**
 * Encode a rendered CSV exactly as the vendor wizard writes it: UTF-8 with a BOM.
 *
 * @param csv - Rendered rows, CRLF terminated.
 * @returns File bytes.
 */
export function snapshotBytes(csv: string): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, 'utf8')])
}
