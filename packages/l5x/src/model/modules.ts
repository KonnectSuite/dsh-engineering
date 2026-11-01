/**
 * I/O module reader.
 *
 * A module's slot is its first port's `Address`: that is what the export writes
 * for a chassis-mounted module, and it is the value an operator reads off the
 * chassis. A module the controller does not own directly names its parent
 * instead, and an empty parent means the controller itself.
 */

import type { L5xDocument, L5xModule } from './types.ts'
import { controllerElementOf } from './parse.ts'
import { descriptionOf } from './module.ts'
import { elementChildren, firstChild, optionalAttribute, type XmlElement } from './xml.ts'

/**
 * List the controller's I/O modules.
 *
 * @param document - The parsed project.
 * @returns One entry per module, in written order.
 */
export function listModules(document: L5xDocument): readonly L5xModule[] {
  return buildModules(controllerElementOf(document))
}

/**
 * Read every I/O module of a controller.
 *
 * @param controller - The controller element.
 * @returns The modules, in written order.
 */
export function buildModules(controller: XmlElement): readonly L5xModule[] {
  const modules = firstChild(controller, 'Modules')
  if (modules === undefined) return []
  return elementChildren(modules, 'Module').map(parseModule)
}

/**
 * One module entry.
 *
 * @param module - The `<Module>` element.
 * @returns The module entry.
 */
function parseModule(module: XmlElement): L5xModule {
  const entry: {
    name: string
    catalogNumber: string
    parentModule: string
    description?: string
    slot?: string
    inhibited?: boolean
    majorFault?: boolean
    safetyEnabled?: boolean
    safetyNetwork?: string
    unnamed?: boolean
  } = {
    name: optionalAttribute(module, 'Name', ''),
    catalogNumber: optionalAttribute(module, 'CatalogNumber', ''),
    parentModule: optionalAttribute(module, 'ParentModule', ''),
  }
  const description = descriptionOf(module)
  if (description !== '') entry.description = description
  const ports = firstChild(module, 'Ports')
  const port = ports === undefined ? undefined : firstChild(ports, 'Port')
  if (port !== undefined) entry.slot = optionalAttribute(port, 'Address', '')
  // A child module can be written without Name - drive peripheral modules are. parent:slot is how
  // Studio identifies it on screen, and an empty name cannot be listed, read or compared.
  if (entry.name === '') {
    entry.unnamed = true
    entry.name = `${entry.parentModule}:${entry.slot ?? '?'}`
  }
  if (module.attrs['Inhibited'] === 'true') entry.inhibited = true
  if (module.attrs['MajorFault'] === 'true') entry.majorFault = true
  if (module.attrs['SafetyEnabled'] === 'true') entry.safetyEnabled = true
  const safetyNetwork = module.attrs['SafetyNetwork']
  if (safetyNetwork !== undefined) entry.safetyNetwork = safetyNetwork
  return entry
}
