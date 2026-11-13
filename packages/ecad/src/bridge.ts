/**
 * The AryaCAD Electrical bridge as this row sees it.
 *
 * The bridge is not this row's: the owner mounts an `@deepseek-ai/dsh-mcp-client`
 * entry in their own profile pointing at `OpenCADStudio.exe --mcp`, and the host
 * registers that server's tools as `mcp__<serverName>__<tool>`. This module only
 * reports what the composition shows, so a caller learns from `ecad_capabilities`
 * whether authoring and PDF plotting are available before it promises either.
 *
 * Nothing here starts, resolves or ships the vendor application: AryaCAD
 * Electrical is GPL-3.0 and stays a user-installed program.
 *
 * @module dsh-engineering-ecad/bridge
 */

/** The MCP serverName expected when the row is configured with no other. */
export const DEFAULT_BRIDGE_SERVER = 'ocs'

/** The bridge tool a caller must reach first, whatever the server is named. */
export const BRIDGE_ENTRY_TOOL = 'ocs_sessions'

/** One bridge as the row sees it: the configured name and a live lookup. */
export interface CadBridge {
  /** The configured MCP `serverName`. */
  readonly serverName: string
  /** The bridge tool names registered in this composition right now. */
  visibleTools(): readonly string[]
}

/** The bridge section `ecad_capabilities` returns. */
export interface BridgeReport {
  /** The `serverName` this row was configured to look for. */
  serverName: string
  /** The public name of the session-discovery tool of that server. */
  entryTool: string
  /** True when at least one tool of that server is registered. */
  mounted: boolean
  /** The registered tool names of that server, sorted. */
  tools: readonly string[]
  /** What to do when the bridge is not visible. */
  hint: string
}

/**
 * The prefix every tool of one MCP server carries.
 *
 * @param serverName - the configured server name.
 */
export function bridgePrefix(serverName: string): string {
  return `mcp__${serverName}__`
}

/**
 * Report the bridge state from a registry read.
 *
 * @param bridge - the configured bridge, or none when the row was built without one.
 */
export function bridgeReport(bridge: CadBridge | undefined): BridgeReport {
  const serverName = bridge?.serverName ?? DEFAULT_BRIDGE_SERVER
  const prefix = bridgePrefix(serverName)
  const tools = [...(bridge?.visibleTools() ?? [])].sort()
  return {
    serverName,
    entryTool: `${prefix}${BRIDGE_ENTRY_TOOL}`,
    mounted: tools.length > 0,
    tools,
    hint: tools.length > 0
      ? 'Authoring, plotting and the electrical netlist run through those tools; start with the entry tool, then read its capabilities.'
      : `No tool of MCP server ${JSON.stringify(serverName)} is registered in this composition. The owner mounts the bridge in their own profile (see docs/aryacad-bridge.md); this row never starts the CAD application. A bridge configured but still discovering tools also reads as not mounted, so call ${prefix}${BRIDGE_ENTRY_TOOL} to confirm before concluding.`
  }
}
