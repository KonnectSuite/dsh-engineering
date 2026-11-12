/** Capability guidance separates offline analysis, SDK builds and live diagnostics. */
import type { SdkStatus } from './studio-sdk.ts'
import type { ProjectSnapshot } from '../session.ts'

/** The SDK opens projects at these revisions. */
const OPEN_MINIMUM = 31
/** Build is a Logix Designer project-revision feature, not an installed-app feature. */
const BUILD_MINIMUM = 37

/** Resolve an installed SDK report against the selected export revision.
 * @param sdk - local dependency observations, without controller contact.
 * @param project - optional selected export.
 * @returns capability availability and concrete workflow steps.
 */
export function engineeringCapabilities(sdk: SdkStatus, project?: ProjectSnapshot): object {
  const revision = project === undefined ? undefined : Number.parseInt(project.softwareRevision, 10)
  // The SDK opens a project with the Logix Designer release matching its revision,
  // so an installed copy of that exact revision is required.
  const matching = revision === undefined || sdk.installed_studio_versions.includes(revision)
  const opening = sdk.available && matching && (revision === undefined || revision >= OPEN_MINIMUM)
  const build = opening && (revision === undefined || revision >= BUILD_MINIMUM)
  const versionAxes = {
    engine_selected_by: 'project_revision',
    open_supported_project_revisions: `>= ${OPEN_MINIMUM}`,
    build_supported_project_revisions: `>= ${BUILD_MINIMUM}`,
    sdk_release: sdk.sdk_release,
    installed_logix_designer_releases: sdk.installed_studio_versions,
    observed_build_refusal: 'Operation not supported on Logix Designer version 36.0',
  }
  return {
    observed_at: new Date().toISOString(), controller_contacted: false,
    project_revision: project?.softwareRevision ?? null, sdk, version_axes: versionAxes,
    capabilities: {
      l5x_analysis: { available: true, tools: ['open_project', 'project_overview', 'list_components', 'get_component', 'search_logic', 'find_references', 'trace_dependencies', 'usage_map', 'resolve_tag', 'run_checks', 'compare_projects', 'document_project', 'l5x_diagram', 'l5x_routine_diagram', 'l5x_rung_preview', 'list_instructions'] },
      parsed_analysis: { available: true, tools: ['resolve_tag', 'usage_map', 'trace_dependencies', 'find_references'], runtime_causality: 'unverified', diagram_execution: 'unsupported' },
      draft_editing: { available: true, tools: ['draft_rung', 'draft_rung_comment', 'draft_st', 'draft_tag', 'draft_tag_description', 'draft_udt_member', 'draft_udt_description', 'draft_routine', 'draft_fbd', 'draft_sfc', 'compose_rung', 'compose_batch', 'draft_validate', 'draft_apply', 'draft_discard', 'draft_list', 'draft_remove_op'], studio_validation: 'optional', validation_note: 'draft_validate and draft_apply need only Node: they check the draft against the parsed export and write a new L5X. A Studio SDK build is an extra confirmation when an SDK happens to be installed, never a precondition for editing.', coordinated_operations: ['replace_rung', 'insert_rung', 'delete_rung', 'replace_st', 'add_routine', 'add_tag', 'set_tag_description', 'add_udt_member', 'set_udt_description', 'set_udt_member_description'] },
      references: { available: false, tools: [], next_step: 'No reference-download tools are installed; use the installed Studio help pages and the project documentation.' },
      acd_export: { available: opening, next_step: opening ? 'Export the selected ACD to a new L5X and open it.' : 'Export an L5X manually in the matching Studio 5000 version; continue offline analysis.' },
      offline_build: { available: build, project_selected: project !== undefined, requires_project_revision: BUILD_MINIMUM, probe_tool: 'verify_offline_l5x with probe=true', next_step: build ? 'Review a full baseline and draft, then verify_offline_l5x or edit_offline_acd.' : `The SDK is an optional extra, not a requirement: hand the new L5X to Studio 5000 for Import + Verify, which is the normal path when no SDK is installed. Build through the SDK is supported only for project revision ${BUILD_MINIMUM}+ because the SDK selects the engine by project revision; probe=true attempts it and reports the SDK error.` },
      live_diagnostics: { available: opening && sdk.live_communications_available === true, tools: ['poll_live_tags', 'start_plc_trend', 'read_live_tag'], next_step: opening && sdk.live_communications_available ? 'Obtain explicit controller IP and use a matching uploaded ACD snapshot.' : 'Continue offline inspection; resolve SDK and FactoryTalk Linx dependencies before live reads.' },
      controller_transfers: { available: opening && sdk.live_communications_available === true, approval: 'per-operation human approval required; call controller_approval_status', download: 'verified artifact and Program mode required' },
    },
    limitation: revision === undefined ? 'Select an export to verify its revision against installed Studio versions.' : !matching ? `Matching Studio ${revision} is not installed; the SDK opens a project with the release matching its revision.` : !sdk.available ? sdk.reason : null,
  }
}
