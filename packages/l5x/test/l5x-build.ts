/**
 * L5X fixture builder.
 *
 * Hand-written fixture strings have repeatedly used the wrong element name
 * (`AddOnInstructions` instead of `AddOnInstructionDefinitions`), which surfaces as a parse
 * error or a `NO_PROJECT` tool answer rather than a clear mistake. This module owns the
 * envelope and the element names so a test supplies only content.
 */

/** What to place inside the controller, each already built by a helper below. */
export interface L5xParts {
  readonly dataTypes?: string
  readonly tags?: string
  readonly modules?: string
  readonly aois?: string
  readonly programs?: string
  readonly tasks?: string
}

/** How the controller element is declared. */
export interface L5xOptions extends L5xParts {
  readonly name?: string
  readonly processorType?: string
  readonly majorRev?: string
  readonly minorRev?: string
  readonly extraAttributes?: string
}

/** A complete L5X export wrapping the given parts. */
export function l5x(options: L5xOptions = {}): string {
  const softwareRevision = `${options.majorRev ?? '37'}.00`
  const parts = [
    options.dataTypes === undefined ? '' : `<DataTypes>${options.dataTypes}</DataTypes>`,
    options.tags === undefined ? '' : `<Tags>${options.tags}</Tags>`,
    options.modules === undefined ? '' : `<Modules>${options.modules}</Modules>`,
    options.aois === undefined ? '' : `<AddOnInstructionDefinitions>${options.aois}</AddOnInstructionDefinitions>`,
    options.programs === undefined ? '' : `<Programs>${options.programs}</Programs>`,
    options.tasks === undefined ? '' : `<Tasks>${options.tasks}</Tasks>`,
  ].join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="${softwareRevision}" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="${options.name ?? 'Fixture'}" ProcessorType="${options.processorType ?? '5069-L320ER'}" MajorRev="${options.majorRev ?? '37'}" MinorRev="${options.minorRev ?? '0'}"${options.extraAttributes ?? ''}>
    ${parts}
  </Controller>
</RSLogix5000Content>`
}

/** One controller or program tag. */
export function tag(name: string, dataType = 'BOOL', attributes = ''): string {
  return `<Tag Name="${name}" TagType="Base" DataType="${dataType}"${attributes}/>`
}

/** One ladder rung. */
export function rung(number: number, text: string, comment?: string): string {
  const commentXml = comment === undefined ? '' : `<Comment><![CDATA[${comment}]]></Comment>`
  return `<Rung Number="${number}" Type="N">${commentXml}<Text><![CDATA[${text}]]></Text></Rung>`
}

/** One ladder routine. */
export function rllRoutine(name: string, rungs: readonly { readonly text: string; readonly comment?: string }[]): string {
  return `<Routine Name="${name}" Type="RLL"><RLLContent>${rungs.map((entry, index) => rung(index, entry.text, entry.comment)).join('')}</RLLContent></Routine>`
}

/** One program, with its routines already built. */
export function program(
  name: string,
  routines: string,
  options: { readonly mainRoutine?: string; readonly safety?: boolean; readonly tags?: string } = {},
): string {
  const main = options.mainRoutine ?? 'MainRoutine'
  const safety = options.safety === true ? ' Class="Safety"' : ''
  const tags = options.tags ?? ''
  return `<Program Name="${name}" MainRoutineName="${main}"${safety}><Tags>${tags}</Tags><Routines>${routines}</Routines></Program>`
}

/** One task scheduling the named programs. */
export function task(
  name: string,
  programs: readonly string[],
  options: { readonly type?: string; readonly safety?: boolean; readonly rate?: string; readonly priority?: string } = {},
): string {
  const type = options.type ?? 'CONTINUOUS'
  const safety = options.safety === true ? ' Class="Safety"' : ''
  const rate = options.rate === undefined ? '' : ` Rate="${options.rate}"`
  const priority = options.priority === undefined ? '' : ` Priority="${options.priority}"`
  const scheduled = programs.map(entry => `<ScheduledProgram Name="${entry}"/>`).join('')
  return `<Task Name="${name}" Type="${type}"${rate}${priority}${safety}><ScheduledPrograms>${scheduled}</ScheduledPrograms></Task>`
}

/** One AOI parameter. */
export function parameter(
  name: string,
  options: { readonly dataType?: string; readonly usage?: string; readonly aliasFor?: string; readonly required?: boolean } = {},
): string {
  const alias = options.aliasFor === undefined ? '' : ` TagType="Alias" AliasFor="${options.aliasFor}"`
  return `<Parameter Name="${name}" Usage="${options.usage ?? 'Input'}" DataType="${options.dataType ?? 'BOOL'}" Required="${options.required === false ? 'false' : 'true'}" Visible="true" ExternalAccess="Read/Write"${alias}/>`
}

/** One add-on instruction definition. */
export function aoi(
  name: string,
  options: {
    readonly revision?: string
    readonly safety?: boolean
    readonly parameters?: readonly string[]
    readonly localTags?: string
    readonly routines?: string
  } = {},
): string {
  const revision = options.revision ?? '1.0'
  const safety = options.safety === true ? ' Class="Safety"' : ' Class="Standard"'
  const parameters = options.parameters === undefined ? '' : `<Parameters>${options.parameters.join('')}</Parameters>`
  const localTags = options.localTags === undefined ? '' : `<LocalTags>${options.localTags}</LocalTags>`
  const routines = options.routines === undefined ? '' : `<Routines>${options.routines}</Routines>`
  return `<AddOnInstructionDefinition Name="${name}"${safety} Revision="${revision}" ExecutePrescan="false" ExecutePostscan="false" ExecuteEnableInFalse="false">${parameters}${localTags}${routines}</AddOnInstructionDefinition>`
}

/** One user-defined-type member, with the attributes a real Studio export writes. */
export function member(
  name: string,
  options: {
    readonly dataType?: string
    readonly dimensions?: string
    readonly radix?: string
    readonly hidden?: boolean
    readonly externalAccess?: string
    readonly description?: string
    readonly target?: string
    readonly bitNumber?: number
  } = {},
): string {
  // A real export writes an array member as Dimension="N"; Dimensions is not a member attribute.
  const dimensions = ` Dimension="${options.dimensions ?? '0'}"`
  const target = options.target === undefined ? '' : ` Target="${options.target}" BitNumber="${options.bitNumber ?? 0}"`
  const description = options.description === undefined ? '' : ` Description="${options.description}"`
  return `<Member Name="${name}" DataType="${options.dataType ?? 'DINT'}"${dimensions} Radix="${options.radix ?? 'Decimal'}" Hidden="${options.hidden === true ? 'true' : 'false'}"${target} ExternalAccess="${options.externalAccess ?? 'Read/Write'}"${description}/>`
}

/** One user-defined type. */
export function userType(name: string, members: readonly string[], family = 'NoFamily'): string {
  return `<DataType Name="${name}" Family="${family}" Class="User"><Members>${members.join('')}</Members></DataType>`
}

/** One vendor instruction whose body the export stores encrypted. */
export function encodedAoi(name: string, options: { readonly vendor?: string; readonly description?: string } = {}): string {
  const vendor = options.vendor === undefined ? '' : ` Vendor="${options.vendor}"`
  const description = options.description === undefined ? '' : `<Description><![CDATA[${options.description}]]></Description>`
  return `<EncodedData EncodedType="AddOnInstructionDefinition" Name="${name}" Class="Standard" Revision="1.0"${vendor} EncryptionConfig="9">${description}</EncodedData>`
}

/** One I/O module. */
export function module(
  name: string,
  catalogNumber: string,
  options: {
    readonly parentModule?: string
    readonly slot?: string
    readonly parentPortId?: string
    readonly safety?: boolean
    readonly safetyNetwork?: string
    readonly majorFault?: boolean
    readonly inhibited?: boolean
  } = {},
): string {
  const safety = options.safety === true ? ' SafetyEnabled="true"' : ''
  const network = options.safetyNetwork === undefined ? '' : ` SafetyNetwork="${options.safetyNetwork}"`
  // An empty name means the export omits Name, as it does for drive peripheral modules.
  const nameAttribute = name === '' ? '' : ` Name="${name}"`
  const slot = options.slot === undefined ? '' : `<Ports><Port Id="1" Address="${options.slot}"/></Ports>`
  const open = `<Module${nameAttribute} CatalogNumber="${catalogNumber}" Vendor="1" ProductType="14" ProductCode="0" Major="1" Minor="11" ParentModule="${options.parentModule ?? 'Local'}" ParentModPortId="${options.parentPortId ?? '1'}" Inhibited="${options.inhibited === true ? 'true' : 'false'}" MajorFault="${options.majorFault === true ? 'true' : 'false'}"${safety}${network}`
  return slot === '' ? `${open}/>` : `${open}>${slot}</Module>`
}
