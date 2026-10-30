/**
 * Tools that reach the installed ME engine.
 *
 * These are the only entry points that talk to Studio's world: listing the
 * applications it knows and exporting one to a folder. Both are read-only with
 * respect to the project.
 *
 * @module dsh-engineering-ftview/vendor-tools
 */

import { existsSync } from 'node:fs'
import { EngineeringError, object, optionalString, requiredString, string, success, tool, type Coverage, type FsService, type ToolDefinition } from './core.ts'
import { exportApplication, listApplications } from './vendor.ts'
import type { ViewSession } from './session.ts'

/**
 * Open a fresh export for authoring, tolerating an open failure.
 *
 * Export is the step before authoring, so a failed open must not fail the
 * export itself; the result then points at `ftview_open` instead.
 */
async function openExport(session: ViewSession | undefined, root: string, exec: Parameters<ToolDefinition["execute"]>[1]): Promise<string | undefined> {
  if (session === undefined) return undefined
  try {
    const opened = await session.open(root, exec)
    return opened.id
  } catch {
    return undefined
  }
}

/** What a vendor call cannot prove. */
const VENDOR_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'the exported XML is a snapshot of the saved application, not of a running terminal',
    'display compile and download to a PanelView terminal',
    'Studio import behaviour',
  ],
}

/**
 * The vendor tools.
 *
 * @param fs - Filesystem provider used to resolve the destination folder.
 * @param session - When supplied, a fresh export is opened for authoring in the same call,
 *   because the next step is always to look at what was exported.
 * @returns Tool definitions.
 */
export function vendorTools(fs: FsService, session?: ViewSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'ftview_apps',
      description: 'List the FactoryTalk View ME applications installed on this host, through the vendor export server. Requires FactoryTalk View ME on the machine.',
      parameters: object({
        filter: string('Case-insensitive substring matched against the application name.'),
      }, []),
      async run(args) {
        const filter = (optionalString(args, 'filter') ?? '').toLowerCase()
        const listed = await listApplications()
        if (listed.error !== undefined) {
          throw new EngineeringError('VENDOR_UNAVAILABLE', listed.error, 'Install FactoryTalk View ME Studio on this host, or work from an existing export folder.')
        }
        const apps = (listed.value ?? []).filter(app => filter === '' || app.name.toLowerCase().includes(filter))
        return success(
          `${apps.length} ME application(s)${filter === '' ? '' : ` matching ${JSON.stringify(filter)}`} on this host.`,
          { total: apps.length, apps },
          [{ tool: 'ftview_export', args: { application: apps[0]?.name ?? 'NAME', output_root: 'C:/Exports/NAME' }, why: 'Export one application to a folder this surface can read.' }],
          VENDOR_COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_export',
      description: 'Export one installed ME application (displays and global objects) to a NEW folder through the vendor export server. If the project store holds a user-exported Alarms.xml or tag CSV, copy it as a snapshot and report its age and whether it is fresh, stale or missing; such files are not part of a normal application. When an asset is stale or missing the result points at ftview_studio_export_prepare and ftview_studio_export_accept. The application is not modified.',
      parameters: object({
        application: string('Application name as ftview_apps lists it.'),
        output_root: string('New folder for the export. It must not exist.'),
      }, ['application', 'output_root']),
      async run(args, exec) {
        const application = requiredString(args, 'application')
        const requested = requiredString(args, 'output_root')
        const destination = await fs.resolve(requested, {
          ...(exec.cwd === undefined ? {} : { cwd: exec.cwd }),
          ...(exec.signal === undefined ? {} : { signal: exec.signal }),
        })
        if (existsSync(destination)) {
          throw new EngineeringError('OUTPUT_EXISTS', `A file or folder already exists at ${requested}.`, 'Pass a new output_root; export never merges into an existing folder.')
        }
        const exported = await exportApplication(application, destination)
        if (exported.error !== undefined) {
          throw new EngineeringError('VENDOR_EXPORT_FAILED', exported.error, 'Close Studio if it has the application open, then retry with a new output_root; the export server sometimes needs a second attempt after a previous call.')
        }
        const files = exported.value?.files ?? []
        const warnings = exported.value?.warnings ?? []
        const assets = exported.value?.assets ?? { tags: 'missing', alarms: 'missing' }
        const displays = files.filter(file => /^Displays\/.+\.xml$/iu.test(file) && !/batchimport/iu.test(file))
        const manifests = files.filter(file => /batchimport/iu.test(file))
        const alarms = files.filter(file => /^Alarms\//iu.test(file))
        const tags = files.filter(file => /^Tags\/.+\.csv$/iu.test(file))
        const opened = await openExport(session, destination, exec)
        return success(
          `Exported ${application}: ${files.length} file(s), ${displays.length} display(s)${alarms.length === 0 ? ', no alarms' : ', alarms'}${tags.length === 0 ? ', no tags CSV' : ', tags CSV'}${manifests.length === 0 ? '' : `, ${manifests.length} import manifest(s)`}${warnings.length === 0 ? '' : `; ${warnings.length} warning(s)`}${opened === undefined ? '' : `; opened as ${opened}`}.`,
          { application, output_root: destination, ...(opened === undefined ? {} : { view_id: opened }), files, display_count: displays.length, alarms, tags, manifests, warnings, assets },
          [
            ...(opened === undefined
              ? [{ tool: 'ftview_open', args: { root: destination }, why: 'Open the fresh export and author against it.' }]
              : [{ tool: 'ftview_list', args: { view_id: opened, kind: 'display' }, why: 'The fresh export is already open; list its displays and start authoring.' }]),
            ...(assets.tags === 'fresh' ? [] : [{ tool: 'ftview_studio_export_prepare', args: { application, kind: 'tags' }, why: assets.tags === 'missing' ? 'This export has no tag CSV; prepare a fresh tag export before binding tags.' : 'The tag CSV is older than the application database; refresh it before binding tags.' }]),
            ...(assets.alarms === 'fresh' ? [] : [{ tool: 'ftview_studio_export_prepare', args: { application, kind: 'alarms' }, why: assets.alarms === 'missing' ? 'This export has no alarm XML; prepare an alarm export before reviewing alarms.' : 'The alarm XML is older than the application database; refresh it before reviewing alarms.' }]),
          ],
          VENDOR_COVERAGE,
        )
      },
    }),
  ]
}
