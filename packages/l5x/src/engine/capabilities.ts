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
      l5x_analysis: { available: true, tools: ['l5x_open_project', 'l5x_project_overview', 'l5x_list_components', 'l5x_get_component', 'l5x_search_logic', 'l5x_find_references', 'l5x_trace_dependencies', 'l5x_usage_map', 'l5x_resolve_tag', 'l5x_run_checks', 'l5x_compare_projects', 'l5x_document_project', 'l5x_diagram', 'l5x_routine_diagram', 'l5x_rung_preview', 'l5x_list_instructions'] },
      parsed_analysis: { available: true, tools: ['l5x_resolve_tag', 'l5x_usage_map', 'l5x_trace_dependencies', 'l5x_find_references'], runtime_causality: 'unverified', diagram_execution: 'unsupported' },
      draft_editing: { available: true, tools: ['l5x_draft_rung', 'l5x_draft_rung_comment', 'l5x_draft_st', 'l5x_draft_tag', 'l5x_draft_tag_description', 'l5x_draft_udt_member', 'l5x_draft_udt_description', 'l5x_draft_routine', 'l5x_draft_fbd', 'l5x_draft_sfc', 'l5x_compose_rung', 'l5x_compose_batch', 'l5x_draft_validate', 'l5x_draft_apply', 'l5x_draft_discard', 'l5x_draft_list', 'l5x_draft_remove_op'], studio_validation: 'optional', validation_note: 'l5x_draft_validate and l5x_draft_apply need only Node: they check the draft against the parsed export and write a new L5X. A Studio SDK build is an extra confirmation when an SDK happens to be installed, never a precondition for editing.', coordinated_operations: ['replace_rung', 'insert_rung', 'delete_rung', 'replace_st', 'add_routine', 'add_tag', 'set_tag_description', 'add_udt_member', 'set_udt_description', 'set_udt_member_description'] },
      references: { available: false, tools: [], next_step: 'No reference-download tools are installed; use the installed Studio help pages and the project documentation.' },
      acd_export: { available: opening, next_step: opening ? 'Export the selected ACD to a new L5X and open it.' : 'Export an L5X manually in the matching Studio 5000 version; continue offline analysis.' },
      offline_build: { available: build, project_selected: project !== undefined, requires_project_revision: BUILD_MINIMUM, probe_tool: 'l5x_verify_offline_l5x with probe=true', next_step: build ? 'Review a full baseline and draft, then l5x_verify_offline_l5x or edit_offline_acd.' : `The SDK is an optional extra, not a requirement: hand the new L5X to Studio 5000 for Import + Verify, which is the normal path when no SDK is installed. Build through the SDK is supported only for project revision ${BUILD_MINIMUM}+ because the SDK selects the engine by project revision; probe=true attempts it and reports the SDK error.` },
      live_diagnostics: { available: opening && sdk.live_communications_available === true, tools: ['l5x_poll_live_tags', 'l5x_start_plc_trend', 'l5x_read_live_tag'], next_step: opening && sdk.live_communications_available ? 'Obtain explicit controller IP and use a matching uploaded ACD snapshot.' : 'Continue offline inspection; resolve SDK and FactoryTalk Linx dependencies before live reads.' },
      controller_transfers: { available: opening && sdk.live_communications_available === true, approval: 'per-operation human approval required; call l5x_controller_approval_status', download: 'verified artifact and Program mode required' },
    },
    limitation: revision === undefined ? 'Select an export to verify its revision against installed Studio versions.' : !matching ? `Matching Studio ${revision} is not installed; the SDK opens a project with the release matching its revision.` : !sdk.available ? sdk.reason : null,
  }
}
