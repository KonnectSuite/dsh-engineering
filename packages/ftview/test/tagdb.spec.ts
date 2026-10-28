import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { exportTagSnapshot, findTagDatabase, parseRows, renderTagCsv, snapshotBytes, type TagDatabaseRow } from '../src/tagdb.ts'

/** One synthetic row with every field at its default. */
function row(overrides: Partial<TagDatabaseRow>): TagDatabaseRow {
  return {
    id: 1,
    name: 'Tag',
    description: null,
    type: '2',
    dataSource: '0',
    security: '*',
    alarmed: '0',
    readOnly: '0',
    retentive: '0',
    nativeType: null,
    valueType: null,
    min: null,
    max: null,
    initial: null,
    scale: null,
    offset: null,
    units: null,
    offLabel: null,
    onLabel: null,
    initialLabel: null,
    address: null,
    ...overrides,
  }
}

const HEADER = ';Tag Type, Tag Name, Tag Description, Read Only, Data Source, Security Code, Alarmed, Native Type, ' +
  'Value Type, Min Analog, Max Analog, Initial Analog, Scale, Offset, DeadBand, Units, Off Label Digital, ' +
  'On Label Digital, Initial Digital, Length String, Initial String, Retentive, Address, System Source Name, ' +
  'System Source Index, RIO Address, Element Size Block, Number Elements Block, Initial Block'

describe('rendering the tag snapshot CSV', () => {
  it('writes the wizard header, folder rows and a device analog row', () => {
    const csv = renderTagCsv([
      row({ name: 'Line', type: '0', description: null }),
      row({ name: 'Line\\Speed', type: '1', nativeType: '4', valueType: '0', min: '0', max: '100', initial: '0', scale: '1', offset: '0', address: '[PLC]Speed' }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(HEADER)
    expect(lines[1]).toBe(';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!')
    expect(lines[3]).toBe(';Folders Section (Must define folders before tags)')
    expect(lines[4]).toBe('"F","Line",,"F"')
    expect(lines[5]).toBe('')
    expect(lines[6]).toBe(';Tag Section')
    expect(lines[7]).toBe('"A","Line\\Speed",,"F","D","*","F","F","L",0,100,0,1,0,0,,,,,,,,"[PLC]Speed"')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('writes a memory digital row with its labels and retentive flag', () => {
    const csv = renderTagCsv([
      row({ name: 'Run', type: '2', dataSource: '2', retentive: '1', offLabel: 'OFF', onLabel: 'ON', initialLabel: '0' }),
    ])
    const line = csv.split('\r\n').at(-2) ?? ''
    const cells = line.split(',')
    expect(cells[0]).toBe('"D"')
    expect(cells[1]).toBe('"Run"')
    expect(cells[4]).toBe('"M"')
    expect(cells[16]).toBe('"OFF"')
    expect(cells[17]).toBe('"ON"')
    expect(cells[18]).toBe('"0"')
    expect(cells[21]).toBe('1')
  })

  it('quotes an empty description but leaves a null one unquoted', () => {
    const csv = renderTagCsv([
      row({ name: 'A', type: '1', nativeType: '0', valueType: '0', description: '', min: '0', max: '10', initial: '0', scale: '1', offset: '0' }),
      row({ name: 'B', type: '1', nativeType: '0', valueType: '0', min: '0', max: '10', initial: '0', scale: '1', offset: '0' }),
    ])
    const lines = csv.split('\r\n').filter(line => line.startsWith('"A","A"') || line.startsWith('"A","B"'))
    expect(lines[0]).toContain('"A","A","",')
    expect(lines[1]).toContain('"A","B",,')
  })

  it('drops the built-in system folder and its tags', () => {
    const csv = renderTagCsv([
      row({ name: 'system', type: '0' }),
      row({ name: 'system\\DateTime', type: '2' }),
      row({ name: 'Keep', type: '2' }),
    ])
    expect(csv).not.toContain('system')
    expect(csv).toContain('"D","Keep"')
  })

  it('sorts folders and tags alphabetically, ignoring case', () => {
    const csv = renderTagCsv([
      row({ name: 'b', type: '0' }),
      row({ name: 'A', type: '0' }),
      row({ name: 'beta', type: '2' }),
      row({ name: 'Alpha', type: '2' }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[4]).toBe('"F","A",,"F"')
    expect(lines[5]).toBe('"F","b",,"F"')
    const tags = lines.slice(lines.indexOf(';Tag Section') + 1).filter(Boolean)
    expect(tags[0]).toContain('"Alpha"')
    expect(tags[1]).toContain('"beta"')
  })
})

describe('parsing sqlcmd rows', () => {
  it('keeps NULL distinct from an empty string', () => {
    // Id,Name,Description,Type,DataSrcType,Security,ExternalRefs,ReadOnly,ParentId,ParentType,Retentive,
    // AnaNativeType,AnaValueType,AnaMinValue,AnaMaxValue,AnaInitValue,AnaScale,AnaOffset,AnaUnits,
    // DigOffLabel,DigOnLabel,DigInitValue,StrLength,StrInitValue,BlkElementSize,BlkNumElements,BlkInitValue,
    // DevAddress,SysItemName,SysItemIndex
    const line = ['1', 'Line\\Speed', 'NULL', '1', '0', '*', '0', '0', '1', '0', '0', '4', '0', '0', '100', '0',
      '1', '0', '[[NULL]]', '[[NULL]]', '[[NULL]]', '[[NULL]]', '[[NULL]]', '[[NULL]]', '0', '0', '0', '::[PLC]Speed', '[[NULL]]', '0'].join('|')
    const rows = parseRows(line)
    expect(rows[0]?.units).toBeNull()
    expect(rows[0]?.name).toBe('Line\\Speed')
    expect(rows[0]?.address).toBe('::[PLC]Speed')
    expect(rows[0]?.nativeType).toBe('4')
  })
})

describe('snapshot file bytes', () => {
  it('writes UTF-8 with a BOM, like the vendor wizard', () => {
    const csv = 'a,b\r\nc,d\r\n'
    const bytes = snapshotBytes(csv)
    expect(bytes.subarray(0, 3).toString('hex')).toBe('efbbbf')
    expect(bytes.subarray(3).toString('utf8')).toBe(csv)
  })
})

describe('finding the tag database', () => {
  it('names the MDF and LDF of an application', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-tagdb-'))
    mkdirSync(join(root, 'App', 'TAG'), { recursive: true })
    writeFileSync(join(root, 'App', 'TAG', 'App.MDF'), 'mdf')
    writeFileSync(join(root, 'App', 'TAG', 'App_log.ldf'), 'ldf')
    const files = findTagDatabase('App', join(root, 'App'))
    expect(files.mdf.endsWith('App.MDF')).toBe(true)
    expect(files.ldf?.endsWith('App_log.ldf')).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses an application without a TAG folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-tagdb-'))
    expect(() => findTagDatabase('Absent', join(root, 'Absent'))).toThrow(/TAG folder/)
    rmSync(root, { recursive: true, force: true })
  })
})

const LIVE = process.env['FTVIEW_LIVE_TAGDB'] === '1'
const STORE = 'C:/Users/Public/Documents/RSView Enterprise/ME/HMI projects'

describe.runIf(LIVE)('live tag snapshot against the wizard', () => {
  const cases = [
    { application: 'CC019_Main', csv: join(STORE, 'CC019_Main', 'CC019_Main-Tags.CSV') },
    { application: 'AryaFTV_CarpenterPilot_20261007', csv: join(STORE, 'AryaFTV_CarpenterPilot_20261007', 'AryaFTV_CarpenterPilot_20261007-Tags.CSV') },
    { application: 'Carpenter_EPS_Laminator001', csv: join(STORE, 'Carpenter_EPS_Laminator001', 'Carpenter_EPS_Laminator001-Tags.CSV') },
  ]

  it.each(cases)('matches the wizard CSV for $application', ({ application, csv }) => {
    if (!existsSync(csv)) return
    const output = join(mkdtempSync(join(tmpdir(), 'ftview-live-')), `${application}.csv`)
    const result = exportTagSnapshot(application, output, join(STORE, application))
    const mine = readFileSync(output)
    const wizard = readFileSync(csv)
    expect(mine.equals(wizard)).toBe(true)
    expect(mine.subarray(0, 3).toString('hex')).toBe('efbbbf')
    expect(result.tags).toBeGreaterThan(0)
  }, 120_000)
})







