/**
 * The parsed-document seam: parse a Studio 5000 `.l5x` export, then read it.
 *
 * A consumer parses once and asks as many questions as it needs, because every
 * read is pure over the parsed document and none of them touches XML again. The
 * XML layer and the readers stay behind this module: a consumer names a
 * document, a scope, or a pattern, never an element.
 */

export { L5xParseError } from './errors.ts'

export type {
  L5xAoiDefinition,
  L5xAoiInfo,
  L5xAoiLocalTag,
  L5xAoiParameter,
  L5xAlarm,
  L5xControllerSummary,
  L5xDocument,
  L5xDiagramNode,
  L5xModule,
  L5xProgram,
  L5xProjectSummary,
  L5xRoutine,
  L5xRoutineBody,
  L5xRoutineInfo,
  L5xRung,
  L5xSymbolReference,
  L5xSymbolUsage,
  L5xTag,
  L5xTask,
  L5xUdt,
  L5xUdtMember,
} from './types.ts'

export { controllerElementOf, loadL5x } from './parse.ts'
export { loadProject } from './project.ts'
export { getAoi, getAois, listAois } from './aois.ts'
export { getRoutine, listRoutines } from './routines.ts'
export { findTag, listTags } from './tags.ts'
export { getUdt, listUdtNames } from './udts.ts'
export { listModules } from './modules.ts'
export { searchLogic } from './xref.ts'

/** The literal a health check returns. */
export const PING_RESULT = 'pong'
