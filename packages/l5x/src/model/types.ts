/**
 * The parsed-document seam: what a Studio 5000 `.l5x` export becomes once it is
 * parsed, and what reading it yields.
 *
 * Types only — parsing, the read functions, and their errors live beside this
 * file. A document is lossless JSON with no XML nodes in it: an SDK caller, a
 * Remote caller, and an in-process reader all see the same vocabulary, and no
 * payload carries raw XML. Absent means absent: an entry omits a field the
 * export did not supply rather than filling it with a placeholder, because the
 * reference server's JSON omits it too.
 */

/** One controller-scoped or program-scoped tag. */
export interface L5xTag {
  /** Tag name as declared. */
  readonly name: string
  /** Declared data type, e.g. `BOOL`, `DINT`, `Motor_UDT`. */
  readonly dataType: string
  /** Owning scope: the literal `controller`, or the declaring program's name. */
  readonly scope: string
  /** Description, from the `Description` attribute or the child element. */
  readonly description?: string
  /** Radix the export declares, when it declares one. */
  readonly radix?: string
  /** Present and true only when the export marks the tag `Constant="true"`. */
  readonly constant?: boolean
  /** External-access setting, when the export declares one. */
  readonly externalAccess?: string
  /** Declared tag type as written, e.g. Base, Alias, Produced, Consumed. */
  readonly tagType?: string
  /** For a consumed tag, the producer controller named in ConsumeInfo. */
  readonly consumerOf?: string
  /** For a consumed tag, the remote tag name in ConsumeInfo. */
  readonly remoteTag?: string
  /** For an alias tag, the tag or member it points at. */
  readonly aliasFor?: string
  /** For a produced tag, how many consumers the export declares. */
  readonly produceCount?: number
  /** For a produced tag, whether unicast is permitted. */
  readonly produceUnicast?: boolean
  /** Array dimensions, when the export declares a Dimensions attribute. */
  readonly dimensions?: readonly number[]
}

/** One member of a user-defined type. */
export interface L5xUdtMember {
  /** Member name. */
  readonly name: string
  /** Declared data type. */
  readonly dataType: string
  /** Array length, present only when the member declares a non-zero dimension. */
  readonly dimension?: number
  /** Description, when the member has one. */
  readonly description?: string
  /** Radix the export declares, when it declares one. */
  readonly radix?: string
  /** Backing member a BIT member addresses, when the export declares one. */
  readonly target?: string
  /** Bit position inside the backing member, when the export declares one. */
  readonly bitNumber?: number
}

/** One user-defined type, with the members that are not hidden. */
export interface L5xUdt {
  /** Type name. */
  readonly name: string
  /** Description, empty string when the type has none. */
  readonly description: string
  /** Visible members in declaration order. */
  readonly members: readonly L5xUdtMember[]
}

/** One parameter of an add-on instruction. */
export interface L5xAoiParameter {
  /** Parameter name. */
  readonly name: string
  /** Declared data type. */
  readonly dataType: string
  /** `Input`, `Output`, `InOut`, or whatever usage the export declares. */
  readonly usage: string
  /** Description, when the parameter has one. */
  readonly description?: string
  /** Present and true only when the export marks the parameter `Required="true"`. */
  readonly required?: boolean
  /** Declared tag type as written, e.g. Base or Alias. */
  readonly tagType?: string
  /** For an alias parameter, the tag or member it points at. */
  readonly aliasFor?: string
  /** Present and false only when the export marks the parameter `Visible="false"`. */
  readonly visible?: boolean
}

/** One local tag declared inside an add-on instruction. */
export interface L5xAoiLocalTag {
  /** Local tag name. */
  readonly name: string
  /** Declared data type. */
  readonly dataType: string
  /** Description, when the local tag has one. */
  readonly description?: string
}

/** One ladder rung. */
export interface L5xRung {
  /** Rung number as the export's `Number` attribute states it. */
  readonly number: number
  /** Rung comment, when the export carries one. */
  readonly comment?: string
  /** The rung as compact NeutralText, e.g. `XIC(Motor_Start)OTE(Motor_Run);`. */
  readonly text: string
}

/** Routine body: language-specific, and the discriminant is the routine's `type`. */
export type L5xRoutineBody =
  /** Ladder body: one entry per rung, in the export's order. */
  | { readonly type: 'RLL'; readonly rungs: readonly L5xRung[] }
  /** Structured Text body, exactly the routine's lines joined with `\n`. */
  | { readonly type: 'ST'; readonly code: string }
  /** Function Block diagram nodes and connections; execution semantics remain partial. */
  | { readonly type: 'FBD'; readonly nodes: readonly L5xDiagramNode[] }
  /** Sequential Function Chart elements and connections; execution semantics remain partial. */
  | { readonly type: 'SFC'; readonly nodes: readonly L5xDiagramNode[] }
  /** Any other language the port does not decompose; the note names it. */
  | { readonly type: 'other'; readonly note: string }

export interface L5xDiagramNode {
  readonly kind: string
  readonly sheet: number
  readonly id?: string
  readonly operand?: string
  readonly fromId?: string
  readonly toId?: string
  /** Connector name on an ICon/OCon, which pairs the two across a routine. */
  readonly name?: string
  readonly text?: string
}

/** One routine as a listing entry: enough to choose it, not its logic. */
export interface L5xRoutineInfo {
  /** Program the routine belongs to. */
  readonly program: string
  /** Routine name. */
  readonly name: string
  /** Language code as written, e.g. `RLL`, `ST`, `FBD`. */
  readonly type: string
  /** Description, empty string when the routine has none. */
  readonly description: string
  /** Ladder rungs in the routine; present only for `RLL`. */
  readonly rungCount?: number
  /** Structured Text lines in the routine; present only for `ST`. */
  readonly lineCount?: number
}

/** One routine with its body. */
export interface L5xRoutine {
  /** Program the routine belongs to. */
  readonly program: string
  /** Routine name. */
  readonly name: string
  /** Language code as written. */
  readonly type: string
  /** Description, empty string when the routine has none. */
  readonly description: string
  /** The decoded body. */
  readonly body: L5xRoutineBody
}

/** One add-on instruction as a listing entry. */
export interface L5xAoiInfo {
  /** Instruction name. */
  readonly name: string
  /** Description, empty string when it has none. */
  readonly description: string
  /** Revision the export declares, empty string when it declares none. */
  readonly revision: string
  /** Present and true only when the export declares the instruction `Class="Safety"`. */
  readonly safety?: boolean
}

/** One add-on instruction with its interface and internal logic. */
export interface L5xAoiDefinition extends L5xAoiInfo {
  /** Vendor the export declares, empty string when it declares none. */
  readonly vendor: string
  /** Parameters in declaration order. */
  readonly parameters: readonly L5xAoiParameter[]
  /** Local tags in declaration order. */
  readonly localTags: readonly L5xAoiLocalTag[]
  /** Internal routines in declaration order. */
  readonly routines: readonly L5xRoutine[]
}

/** One program's summary. */
export interface L5xProgram {
  /** Program name. */
  readonly name: string
  /** True when the program declares Class="Safety". */
  readonly safety: boolean
  /** Name of the program's main routine, empty string when the export omits it. */
  readonly mainRoutine: string
  /** Description, empty string when the program has none. */
  readonly description: string
}

/** One task's scheduling summary. */
export interface L5xTask {
  /** Task name. */
  readonly name: string
  /** Task type as written, e.g. `CONTINUOUS`, `PERIODIC`, `EVENT`. */
  readonly type: string
  /** Period, empty string when the export declares none. */
  readonly rate: string
  /** Priority as written, empty string when the export declares none. */
  readonly priority: string
  /** Description, empty string when the task has none. */
  readonly description: string
  /** Names of the programs the task schedules, in the export's order. */
  readonly programs: readonly string[]
  /** True when the task declares Class="Safety" (a GuardLogix safety task). */
  readonly safety: boolean
}

/** One I/O module. */
export interface L5xModule {
  /** Module name. */
  readonly name: string
  /** Catalog number, empty string when the export declares none. */
  readonly catalogNumber: string
  /** Parent module name, empty string for a module the controller owns directly. */
  readonly parentModule: string
  /** Description, when the module has one. */
  readonly description?: string
  /** First port's `Address`, which is the slot for a chassis module. */
  readonly slot?: string
  /** Present and true only when the export marks the module `Inhibited="true"`. */
  readonly inhibited?: boolean
  /** Present and true only when the export records the module with `MajorFault="true"`. */
  readonly majorFault?: boolean
  /** Present and true only when the module declares `SafetyEnabled="true"`. */
  readonly safetyEnabled?: boolean
  /** Safety network number the module declares, when it declares one. */
  readonly safetyNetwork?: string
}

/** Alarm metadata found in an export; trigger semantics are not inferred. */
export interface L5xAlarm {
  readonly name: string
  readonly kind: string
  readonly description: string
}

/** The controller-level summary a project listing reports. */
export interface L5xControllerSummary {
  /** Controller name as the export declares it. */
  readonly name: string
  /** Processor type as the export declares it, e.g. `1756-L83E`. */
  readonly processorType: string
  /** Description, empty string when the controller has none. */
  readonly description: string
  /** Major revision as written, empty string when the export omits it. */
  readonly majorRev: string
  /** Minor revision as written, empty string when the export omits it. */
  readonly minorRev: string
  /** Project serial number the export declares, when it declares one. */
  readonly projectSerialNumber?: string
  /** Communication path saved in the export, when it declares one. */
  readonly commPath?: string
}

/**
 * A parsed `.l5x` document.
 *
 * Reading it is pure: the same text always yields the same entries, so a caller
 * may parse once and run every read against the result.
 */
export interface L5xDocument {
  /** Controller metadata. */
  readonly controller: L5xControllerSummary
  /** Programs in the export's order. */
  readonly programs: readonly L5xProgram[]
  /** Tasks in the export's order. */
  readonly tasks: readonly L5xTask[]
  /** Ladder and Structured Text routines of every program, in export order. */
  readonly routines: readonly L5xRoutine[]
  /** Controller-scoped tags first, then each program's, in export order. */
  readonly tags: readonly L5xTag[]
  /** User-defined types in the export's order. */
  readonly udts: readonly L5xUdt[]
  /** Add-on instruction definitions in the export's order. */
  readonly aois: readonly L5xAoiDefinition[]
  /** I/O modules in the export's order. */
  readonly modules: readonly L5xModule[]
  /** Alarm declarations recognized structurally in the export. */
  readonly alarms: readonly L5xAlarm[]
  /** Names of data types the vendor owns (Family other than NoFamily), which cannot be edited. */
  readonly vendorTypes: readonly string[]
  /** Routines whose bodies are encrypted in the export, so they cannot be read or changed. */
  readonly protectedRoutines: readonly { readonly program: string; readonly name: string }[]
}

/** One place a symbol appears. */
export interface L5xSymbolReference {
  /** Program holding the reference; absent when the reference is inside an AOI. */
  readonly program?: string
  /** Add-on instruction holding the reference; absent for a program routine. */
  readonly aoi?: string
  /** Routine holding the reference. */
  readonly routine: string
  /** Rung number, for a ladder reference. */
  readonly rung?: number
  /** Line number, for a Structured Text reference. */
  readonly line?: number
  /** The rung text or source line the symbol was found in. */
  readonly context: string
}

/** One symbol and every place it appears. */
export interface L5xSymbolUsage {
  /** The symbol as it was written, including any dotted member path. */
  readonly symbol: string
  /** The references, in the order the routines were scanned. */
  readonly references: readonly L5xSymbolReference[]
}

/** What a project listing reports. */
export interface L5xProjectSummary {
  /** Controller name. */
  readonly controller: string
  /** Processor type, e.g. `1756-L83E`. */
  readonly processorType: string
  /** Description, empty string when the controller has none. */
  readonly description: string
  /** Firmware as `major.minor`, empty when the export declares no revision. */
  readonly firmware: string
  /** Programs, in written order. */
  readonly programs: readonly L5xProgram[]
  /** Tasks, in written order. */
  readonly tasks: readonly L5xTask[]
  /** How many user-defined types the project defines. */
  readonly udtCount: number
  /** Those type names, in written order. */
  readonly udts: readonly string[]
  /** How many add-on instructions the project defines. */
  readonly aoiCount: number
  /** Those instruction names, in written order. */
  readonly aois: readonly string[]
  /** How many I/O modules the controller owns. */
  readonly moduleCount: number
  /** How many tags exist across every scope. */
  readonly tagCount: number
}
