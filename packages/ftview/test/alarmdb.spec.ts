import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  alarmXmlBytes,
  decodeAlarmStreams,
  defaultAlarmXml,
  exportAlarmSnapshot,
  findAlarmDatabase,
  parseAlarmsStream,
  parseLsStream,
  readCompoundFile,
  renderAlarmXml,
} from '../src/alarmdb.ts'

/** Wizard exports this decoder is proven against, with the counts they carry. */
const PROVEN: readonly { readonly application: string; readonly triggers: number; readonly messages: number; readonly bytes: number }[] = [
  { application: 'Carpenter_EPS_Laminator001', triggers: 64, messages: 70, bytes: 34_559 },
  { application: 'AryaFTV_CarpenterPilot_20261007', triggers: 64, messages: 47, bytes: 29_089 },
  { application: 'CC019_Main', triggers: 1, messages: 320, bytes: 71_865 },
]

/** Fixture root: `test/fixtures/alarms`. */
const FIXTURES = fileURLToPath(new URL('./fixtures/alarms', import.meta.url))

/**
 * Run one body against a temporary application folder holding a fixture `.mal`.
 *
 * The folder is shaped like an installed application (`M_Alarms\MachineAlarms.mal`)
 * so the public entry points resolve it exactly as they resolve a real store.
 *
 * @param application - Fixture folder to copy from.
 * @param body - Receives the temporary application folder and the temporary root.
 */
function withApplication(application: string, body: (folder: string, root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'ftview-alarmdb-'))
  try {
    const folder = join(root, application)
    mkdirSync(join(folder, 'M_Alarms'), { recursive: true })
    copyFileSync(join(FIXTURES, application, 'MachineAlarms.mal'), join(folder, 'M_Alarms', 'MachineAlarms.mal'))
    body(folder, root)
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

describe('rendering the alarm XML of a wizard-exported application', () => {
  for (const expected of PROVEN) {
    it(`writes ${expected.application} byte for byte`, () => {
      withApplication(expected.application, (folder, root) => {
        const found = findAlarmDatabase(expected.application, folder)
        expect(found.mal).toBe(join(folder, 'M_Alarms', 'MachineAlarms.mal'))

        const output = join(root, 'Alarms.xml')
        const snapshot = exportAlarmSnapshot(expected.application, output, folder)
        expect(snapshot.triggers).toBe(expected.triggers)
        expect(snapshot.messages).toBe(expected.messages)
        expect(snapshot.bytes).toBe(expected.bytes)

        const rendered = readFileSync(output)
        const wizard = readFileSync(join(FIXTURES, expected.application, 'Alarms.xml'))
        // The whole file, not a parse: BOM, line ends, indent and attribute order.
        expect(rendered.equals(wizard)).toBe(true)
      })
    })
  }

  it('defaults to its own path and writes the wizard bytes without a BOM', () => {
    withApplication('CC019_Main', (folder, _root) => {
      // Named after the application, so a decode never overwrites the wizard's
      // own Alarms.xml, which is the file it is compared against.
      expect(defaultAlarmXml('CC019_Main', folder)).toBe(join(folder, 'CC019_Main-Alarms.xml'))
      const snapshot = exportAlarmSnapshot('CC019_Main', undefined, folder)
      expect(snapshot.path).toBe(join(folder, 'CC019_Main-Alarms.xml'))
      const bytes = readFileSync(snapshot.path)
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
      expect(bytes.toString('utf8', 0, 38)).toBe('<?xml version="1.0" encoding="UTF-8"?>')
      expect(bytes.toString('utf8').endsWith('</alarms>\r\n')).toBe(true)
      expect(bytes.toString('utf8')).not.toContain('\n\n')
      expect(bytes.equals(readFileSync(join(FIXTURES, 'CC019_Main', 'Alarms.xml')))).toBe(true)
    })
  })

  it('escapes the message text and keeps a literal tab', () => {
    withApplication('Carpenter_EPS_Laminator001', (folder, root) => {
      const output = join(root, 'alarms.xml')
      exportAlarmSnapshot('Carpenter_EPS_Laminator001', output, folder)
      const lines = readFileSync(output, 'utf8').split('\r\n')
      // M63 of this application carries a literal tab inside the attribute.
      const message = lines.find(line => line.includes('id="M63"')) ?? ''
      expect(message).toContain('\t')
      expect(message).toContain('trigger="#T36"')
      const cc019Folder = join(root, 'cc019')
      mkdirSync(join(cc019Folder, 'M_Alarms'), { recursive: true })
      copyFileSync(join(FIXTURES, 'CC019_Main', 'MachineAlarms.mal'), join(cc019Folder, 'M_Alarms', 'MachineAlarms.mal'))
      const cc019 = join(root, 'cc019.xml')
      exportAlarmSnapshot('CC019_Main', cc019, cc019Folder)
      // Six CC019 texts contain "&" and the wizard writes it as "&amp;".
      expect(readFileSync(cc019, 'utf8')).toContain('&amp;')
    })
  })

  it('reads the settings record out of the message table', () => {
    // The last record of the table is not a message: its trigger-value is empty
    // and its last u32 holds history-size, so the message count is one lower.
    withApplication('AryaFTV_CarpenterPilot_20261007', folder => {
      const streams = readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal'))
      const parsed = parseAlarmsStream(streams.get('Alarms') as Buffer)
      expect(parsed.messageCount).toBe(48)
      const db = decodeAlarmStreams('AryaFTV_CarpenterPilot_20261007', streams)
      expect(db.messages).toHaveLength(47)
      expect(db.historySize).toBe(128)
      // This application names no alarm display, while Carpenter_EPS_Laminator001 names "Alarm Screen".
      expect(db.displayName).toBe('')
      expect(db.holdTime).toBe(250)
      expect(db.maxUpdateRate).toBe('1.00')
    })
  })

  it('maps a message to the trigger named by the previous record', () => {
    withApplication('Carpenter_EPS_Laminator001', folder => {
      const db = decodeAlarmStreams('Carpenter_EPS_Laminator001', readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal')))
      const byId = new Map(db.messages.map(message => [message.id, message]))
      expect(byId.get('M1')?.trigger).toBe(1)
      // Records 17 and 18 carry the "no trigger" marker, so their messages have none.
      expect(byId.get('M17')?.trigger).toBe(0)
      expect(byId.get('M18')?.trigger).toBe(0)
      expect(byId.get('M19')?.trigger).toBe(17)
      expect(byId.get('M63')?.trigger).toBe(36)
      expect(byId.get('M70')?.trigger).toBe(44)
      expect(byId.get('M1')?.text).toBe('Master Control Relay Open — entire E-stop safety chain dropped')
      expect(db.triggers[0]?.label).toBe('Label1')
      expect(db.triggers[0]?.type).toBe('value')
      expect(db.triggers[0]?.exp).toBe('{[Laminator]Alarm_Word.0}')
    })
  })

  it('reads a bit trigger with a remote ack expression', () => {
    withApplication('CC019_Main', folder => {
      const db = decodeAlarmStreams('CC019_Main', readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal')))
      expect(db.triggers).toHaveLength(1)
      expect(db.triggers[0]?.type).toBe('bit')
      expect(db.triggers[0]?.useAckAll).toBe(true)
      expect(db.triggers[0]?.ackAllValue).toBe(1)
      expect(db.triggers[0]?.remoteAckExp).toBe('{[PLC]CMD_RESET}')
      expect(db.displayName).toBe('[ALARM]')
      expect(db.historySize).toBe(500)
      expect(db.messages[0]?.text).toBe('emergency')
      expect(db.messages[0]?.audio).toBe(true)
      expect(db.messages.every(message => message.trigger === 1)).toBe(true)
    })
  })

  it('decodes the localised string table by id', () => {
    withApplication('CC019_Main', folder => {
      const ls = parseLsStream(readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal')).get('ls00000409') as Buffer)
      expect(ls.version).toBe(1)
      expect(ls.text(37)).toBe('emergency')
      expect(ls.text(999_999)).toBeUndefined()
    })
  })
})

describe('the sample pair that a stale wizard export does not describe', () => {
  it('decodes Carpenter_ESP_Cutter from its own database, not from the XML beside it', () => {
    // The Alarms.xml stored in that application folder is a copy of
    // Carpenter_EPS_Laminator001's export: it names [Laminator], carries 70
    // messages and a display name, while this .mal holds 48 messages and no
    // display name. Only the .mal is decoded here.
    withApplication('Carpenter_ESP_Cutter', (folder, root) => {
      const db = decodeAlarmStreams('Carpenter_ESP_Cutter', readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal')))
      expect(db.triggers).toHaveLength(64)
      expect(db.messages).toHaveLength(48)
      expect(db.displayName).toBe('')
      expect(db.triggers[0]?.exp).toBe('{[Cutter]Alarm_Word.0}')
      const output = join(root, 'Alarms.xml')
      exportAlarmSnapshot('Carpenter_ESP_Cutter', output, folder)
      const stale = readFileSync(join(FIXTURES, 'Carpenter_EPS_Laminator001', 'Alarms.xml'))
      expect(readFileSync(output).equals(stale)).toBe(false)
    })
  })
})

describe('refusing what it cannot decode', () => {
  it('reports a missing alarm database', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-alarmdb-empty-'))
    try {
      expect(() => findAlarmDatabase('Nothing', root)).toThrowError(/no M_Alarms/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports an alarm stream version it does not know', () => {
    withApplication('CC019_Main', folder => {
      const streams = new Map(readCompoundFile(join(folder, 'M_Alarms', 'MachineAlarms.mal')))
      const alarms = Buffer.from(streams.get('Alarms') as Buffer)
      alarms.writeUInt32LE(14, 0)
      streams.set('Alarms', alarms)
      expect(() => decodeAlarmStreams('Old', streams)).toThrowError(/stream version 14/)
    })
  })
})

describe('rendering a database without a wizard export', () => {
  /** Build an `ls00000409` stream from ids 1..n holding the given text. */
  function lsStream(strings: readonly string[]): Buffer {
    const header = Buffer.alloc(10)
    header.writeUInt16LE(1, 0)
    header.writeUInt32LE(strings.length, 2)
    header.writeUInt32LE(0, 6)
    const entries: Buffer[] = []
    const pool: Buffer[] = []
    let charOffset = 0
    strings.forEach((text, index) => {
      const entry = Buffer.alloc(12)
      entry.writeUInt32LE(index + 1, 0)
      entry.writeUInt32LE(charOffset, 4)
      entry.writeUInt32LE(0, 8)
      entries.push(entry)
      pool.push(Buffer.from(text, 'utf16le'))
      charOffset += text.length
    })
    return Buffer.concat([header, ...entries, ...pool])
  }

  /** One `FF`-tagged string: `FF FE` for null, else `FF <chars>` + UTF-16LE. */
  function tagged(text: string | null): Buffer {
    if (text === null) return Buffer.from([0xff, 0xfe])
    return Buffer.concat([Buffer.from([0xff, text.length]), Buffer.from(text, 'utf16le')])
  }

  /** Build a minimal version-16 `Alarms` stream: one value trigger, one message plus settings. */
  function alarmsStream(flags: number): Buffer {
    const u32 = (value: number): Buffer => {
      const buf = Buffer.alloc(4)
      buf.writeUInt32LE(value, 0)
      return buf
    }
    const header = Buffer.concat([u32(16), Buffer.from([1, 0])])
    const trigger = [tagged(null), tagged('{[PLC]Bit.0}'), u32(0), u32(0), u32(0), u32(0)]
    for (let pair = 0; pair < 7; pair++) trigger.push(tagged(null), tagged(''))
    trigger.push(u32(3)) // label -> "Start"
    const messages = Buffer.concat([u32(2), Buffer.from([0, 0])])
    const first = [tagged(null), tagged('1'), u32(1), u32(flags), u32(128), u32(16_777_215), u32(7), u32(0)]
    const settings = [tagged(null), tagged(''), u32(3), u32(1), u32(128), u32(16_777_215), u32(0), u32(64)]
    const trailer = [u32(1), u32(250), u32(250), u32(1000), u32(1000)]
    for (let pair = 0; pair < 8; pair++) trailer.push(tagged(null), tagged(pair === 7 ? '[ALARM]' : ''))
    trailer.push(u32(3), u32(0), u32(90), u32(99))
    for (let pair = 0; pair < 4; pair++) trailer.push(tagged(null), tagged(''))
    return Buffer.concat([header, ...trigger, messages, ...first, ...settings, ...trailer])
  }

  it('renders flag bits that no sample varies', () => {
    // Only bit 0 (display) and bit 8 (audio) are proven by the samples; print and
    // message-to-tag are the remaining display flags and are pinned here only so a
    // change is deliberate.
    const streams = new Map([['Alarms', alarmsStream(0x1 | 0x2 | 0x4)], ['ls00000409', lsStream(['Alarm text', 'unused', 'Start', ''])]] as [string, Buffer][])
    const db = decodeAlarmStreams('Synthetic', streams)
    expect(db.messages).toHaveLength(1)
    expect(db.messages[0]?.display).toBe(true)
    expect(db.messages[0]?.audio).toBe(false)
    expect(db.messages[0]?.print).toBe(true)
    expect(db.messages[0]?.messageToTag).toBe(true)
    expect(db.historySize).toBe(64)
    expect(db.displayName).toBe('[ALARM]')
    expect(db.triggers[0]?.label).toBe('Start')
    expect(db.messages[0]?.text).toBe('Alarm text')
    const xml = renderAlarmXml(db)
    expect(xml).toContain('history-size="64" capacity-high-warning="90" capacity-high-high-warning="99" display-name="[ALARM]" hold-time="250" max-update-rate="1.00"')
    expect(xml).toContain('<trigger id="T1" type="value" ack-all-value="0" use-ack-all="false" ack-tag="" exp="{[PLC]Bit.0}"')
    expect(xml).toContain('<message id="M1" trigger-value="1" identifier="7" trigger="#T1" backcolor="#800000" forecolor="#FFFFFF" audio="false" display="true" print="true" message-to-tag="true" text="Alarm text"/>')
    expect(alarmXmlBytes(xml).equals(Buffer.from(xml, 'utf8'))).toBe(true)
  })
})
