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
 * @returns Tool definitions.
 */
export function vendorTools(fs: FsService): readonly ToolDefinition[] {
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
      description: 'Export one installed ME application (displays, global objects, tags) to a NEW folder through the vendor export server. The application is not modified.',
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
          throw new EngineeringError('VENDOR_EXPORT_FAILED', exported.error, 'Check that the application is not open in Studio, then retry with a new output_root.')
        }
        const files = exported.value?.files ?? []
        const warnings = exported.value?.warnings ?? []
        const displays = files.filter(file => /^Displays\/.+\.xml$/iu.test(file) && !/batchimport/iu.test(file))
        const manifests = files.filter(file => /batchimport/iu.test(file))
        const alarms = files.filter(file => /^Alarms\//iu.test(file))
        const tags = files.filter(file => /^Tags\/.+\.csv$/iu.test(file))
        return success(
          `Exported ${application}: ${files.length} file(s), ${displays.length} display(s)${alarms.length === 0 ? ', no alarms' : ', alarms'}${tags.length === 0 ? ', no tags CSV' : ', tags CSV'}${manifests.length === 0 ? '' : `, ${manifests.length} import manifest(s)`}${warnings.length === 0 ? '' : `; ${warnings.length} warning(s)`}.`,
          { application, output_root: destination, files, display_count: displays.length, alarms, tags, manifests, warnings },
          [{ tool: 'ftview_open', args: { root: destination }, why: 'Open the fresh export and author against it.' }],
          VENDOR_COVERAGE,
        )
      },
    }),
  ]
}
