/**
 * The `mwi-session` entry: project discovery and IDE lifecycle.
 *
 * The row registers on Windows only; the IDE is a Windows application and the
 * bridge cannot exist elsewhere.
 *
 * @module dsh-engineering-mwi
 */

import type { PluginContext } from './core/tool.ts'
import { sessionTools } from './tools/session.ts'

/** Plugin name in a composition. */
export const name = 'mwi-session'

/** Services this plugin cannot register without. */
export const inject = ['tools'] as const

/**
 * Register the session tools.
 *
 * @param ctx - Plugin context with the tool registry.
 */
export function apply(ctx: PluginContext): void {
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(`mwi-session: skipped because this host is ${process.platform}; MotionWorks IEC requires Windows.`)
    } catch {
      // A logger that refuses must not turn an unsupported host into a crash.
    }
    return
  }
  for (const definition of sessionTools()) ctx.tools.register(definition)
}

export { sessionTools } from './tools/session.ts'
export { PowerShellSessionRuntime, runtimeFor } from './session/service.ts'
export {
  MWI_KNOWN_VERSIONS,
  MWI_LATEST_KNOWN_VERSION,
  MWI_PRODUCT,
  MWI_VERSION_LINE,
  MWI_VERSION_TABLE,
  MwiEngineHost,
  MwiHostAdapter,
  createStubEngine,
  mwiProbeStub,
  normalizeMwiVersion,
  probeMwiHost,
  type EngineLike,
  type MwiCapability,
  type MwiCapabilityAnswer,
  type MwiKnownVersion,
  type MwiProbe,
  type MwiProbeDeps,
  type MwiProbeLocation,
  type MwiUninstallEntry,
  type MwiVersionInfo,
  type StubEngineHandler,
} from './core/host.ts'
export {
  HELP_TREE_ENV,
  HELP_TREE_FORMAT,
  helpTreeRootFromEnv,
  probeHelpTree,
  readHelpTopic,
  searchHelpTopics,
  writeHelpTree,
  type HelpSearchResult,
  type HelpTopic,
  type HelpTopicDocument,
  type HelpTopicMatch,
  type HelpTreeProbe,
} from './read/help-tree.ts'
export { GET_KINDS, LIST_KINDS, ReadService, type CodeMatch, type ListRow, type ReadEngine } from './read/service.ts'
export { readTools, type ReadFactory } from './tools/read.ts'
export { verifyTools, type VerifyRuntimeFactory } from './tools/verify.ts'
