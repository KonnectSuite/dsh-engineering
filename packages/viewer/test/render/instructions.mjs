/**
 * Renders one rung per catalogued instruction, so "we support the whole set" is asserted rather than claimed.
 *
 * The fixture is generated from the catalogue the composer validates against, which is why a new
 * instruction cannot appear in one and be missing from the other.
 * Usage: node --import tsx packages/viewer/test/render/instructions.mjs [--shot path]
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, renderLadderFace } from './harness.mjs'
import { INSTRUCTIONS } from '../../../l5x/src/engine/instructions.ts'

const FIXTURE = join(REPO, '.harness/AllInstructions.L5X')
const CONTACTS = new Set(['XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'ONS', 'OSF', 'OSR'])
const OUTPUTS = new Set(['OTE', 'OTL', 'OTU'])

/** One operand per slot, chosen so the text is a legal-looking address of that kind. */
function operandFor(kind, index) {
  if (kind === 'BOOL') return `B${index + 1}`
  if (kind === 'TIMER') return 'T1'
  if (kind === 'COUNTER') return 'C1'
  if (kind === 'ANY') return 'CTL1'
  return index < 2 ? `D${index + 1}` : 'D3'
}

function callOf(instruction) {
  const operands = instruction.operands.map((operand, index) => operandFor(operand.kind, index))
  return `${instruction.name}(${operands.join(',')})`
}

/** Every rung must end in a coil, so each instruction gets one, and an output gets an input in front of it. */
function rungText(instruction, index) {
  const call = callOf(instruction)
  if (OUTPUTS.has(instruction.name)) return `XIC(B1)${call}OTE(OB${(index % 20) + 1});`
  if (CONTACTS.has(instruction.name)) return `${call}OTE(OB${(index % 20) + 1});`
  return `${call};`
}

const rungs = INSTRUCTIONS.map(rungText)

const tags = [
  ...Array.from({ length: 20 }, (_, index) => `<Tag Name="B${index + 1}" TagType="Base" DataType="BOOL" Radix="Decimal" Constant="false" ExternalAccess="Read/Write"/>`),
  ...Array.from({ length: 20 }, (_, index) => `<Tag Name="OB${index + 1}" TagType="Base" DataType="BOOL" Radix="Decimal" Constant="false" ExternalAccess="Read/Write"/>`),
  ...Array.from({ length: 6 }, (_, index) => `<Tag Name="D${index + 1}" TagType="Base" DataType="DINT" Radix="Decimal" Constant="false" ExternalAccess="Read/Write"/>`),
  '<Tag Name="T1" TagType="Base" DataType="TIMER" Radix="NullType" Constant="false" ExternalAccess="Read/Write"/>',
  '<Tag Name="C1" TagType="Base" DataType="COUNTER" Radix="NullType" Constant="false" ExternalAccess="Read/Write"/>',
  '<Tag Name="CTL1" TagType="Base" DataType="CONTROL" Radix="NullType" Constant="false" ExternalAccess="Read/Write"/>',
].join('\n')

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetName="AllInstructions" TargetType="Controller" ContainsContext="false" Owner="arya" ExportDate="Fri Oct 31 05:00:00 2026" ExportOptions="NoRawData References NoRawData L5KData DecoratedData ForceProtectedEncoding Utf8">
<Controller Use="Context" Name="AllInstructions">
<RedundancyEnabled>false</RedundancyEnabled>
<DataTypes/>
<Modules/>
<Tags>
${tags}
</Tags>
<Programs>
<Program Name="MainProgram" Use="Target" Disabled="false" UseAsFolder="false">
<Tags/>
<Routines>
<Routine Name="MainRoutine" Type="RLL">
<RLLContent>
${rungs.map((text, index) => `<Rung Number="${index}" Type="N"><Text>${text}</Text></Rung>`).join('\n')}
</RLLContent>
</Routine>
</Routines>
</Program>
</Programs>
<Tasks>
<Task Name="MainTask" Type="CONTINUOUS" Priority="10" Watchdog="500" Disabled="false">
<ScheduledPrograms>
<ScheduledProgram Name="MainProgram"/>
</ScheduledPrograms>
</Task>
</Tasks>
</Controller>
</RSLogix5000Content>
`

writeFileSync(FIXTURE, xml, 'utf8')
const expected = INSTRUCTIONS.length
const shot = process.argv.includes('--shot') ? process.argv[process.argv.indexOf('--shot') + 1] : join(REPO, '.harness/shots/all-instructions.png')
const result = await renderLadderFace({
  file: FIXTURE, shot, requireValues: false, width: 1680, height: 1200,
  // The pane pages its rung list, so a fixture longer than one page is loaded to the end before judging.
  scenario: async tab => {
    for (let page = 0; page < 12; page += 1) {
      const more = tab.locator('button', { hasText: /load more|more rungs/iu }).first()
      if (await more.count() === 0) break
      await more.click()
      await tab.waitForTimeout(200)
    }
    return []
  },
})
const { measurement, failures } = result
const blocks = measurement.blocks
const generic = blocks.flatMap(block => block.rows.filter(row => /^Operand \d+$/u.test(row.label)).map(row => `${block.mnemonic}.${row.label}`))
const problems = [...failures]
if (measurement.rungs !== expected) problems.push(`rendered ${measurement.rungs} rungs of ${expected} catalogued instructions`)
if (generic.length > 0) problems.push(`${generic.length} slot(s) fell back to an index: ${generic.slice(0, 8).join(', ')}`)
// A contact draws a glyph and a zero-operand instruction (AFI, UID, …) has no pins at all, so only a
// BLOCK that ought to have operands is a failure.
const takesOperands = name => (INSTRUCTIONS.find(instruction => instruction.name === name)?.operands.length ?? 0) > 0
const unlabelled = blocks.filter(block => block.rows.length === 0 && !CONTACTS.has(block.mnemonic) && takesOperands(block.mnemonic))
if (unlabelled.length > 0) problems.push(`block(s) with no operand shown: ${unlabelled.slice(0, 8).map(block => block.mnemonic).join(', ')}`)
console.log(`empty-row blocks: ${blocks.filter(block => block.rows.length === 0).map(block => block.mnemonic).join(' ')}`)

console.log(`${measurement.rungs}/${expected} instructions rendered, ${blocks.length} blocks, clipped ${measurement.clipped.length}, generic labels ${generic.length}`)
if (problems.length > 0) {
  for (const problem of problems) console.error(`FAIL ${problem}`)
  process.exitCode = 1
} else console.log('PASS every catalogued instruction renders with named operands')
