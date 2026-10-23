/**
 * The project listing — the controller summary one call returns.
 *
 * The summary is the entry point a caller uses before deciding what to ask
 * next, so it carries the counts and the names rather than the entries: a
 * project with hundreds of tags and types still answers in one small value.
 */

import type { L5xDocument, L5xProjectSummary } from './types.ts'

/**
 * Summarize a parsed project.
 *
 * @param document - The parsed document.
 * @returns The listing, with counts and names rather than the entries themselves.
 */
export function loadProject(document: L5xDocument): L5xProjectSummary {
  const udts = document.udts.map(udt => udt.name)
  const aois = document.aois.map(aoi => aoi.name)
  return {
    controller: document.controller.name,
    processorType: document.controller.processorType,
    description: document.controller.description,
    firmware: `${document.controller.majorRev}.${document.controller.minorRev}`,
    programs: document.programs,
    tasks: document.tasks,
    udtCount: udts.length,
    udts,
    aoiCount: aois.length,
    aois,
    moduleCount: document.modules.length,
    tagCount: document.tags.length,
  }
}
