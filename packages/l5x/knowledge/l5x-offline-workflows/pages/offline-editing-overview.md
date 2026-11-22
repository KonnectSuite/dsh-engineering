The L5X tools work on an exported L5X file, not on the online controller. What they can do offline:

- open and inspect an export (l5x_open_project, l5x_project_overview, l5x_list_components, l5x_get_component),
- find logic and tags (l5x_search_logic, l5x_find_references, l5x_trace_dependencies, l5x_resolve_tag, l5x_usage_map),
- compose and stage a change (l5x_draft_rung, l5x_compose_rung, l5x_compose_batch, l5x_draft_validate),
- apply a validated draft to ONE new L5X file beside the source (l5x_draft_apply),
- compare two exports by engineering component (l5x_compare_projects),
- run evidence-backed checks (l5x_run_checks),
- write a documentation bundle (l5x_document_project),
- describe instructions and search help (l5x_list_instructions, l5x_docs).

What they cannot do offline:

- import the edited file into Studio or download it to a controller. l5x_draft_apply writes a new file; importing it is a Studio step.
- prove that a message path, a drive connection or an I/O module connection actually exists. Those are recorded as unverified coverage items.
- change safety logic state on a live controller. Safety findings must be resolved before a draft is applied, and writes to a live controller are out of scope for offline tools.

The rule of thumb: offline the tools can prove what the file says and what the editor would refuse; they cannot prove what the plant does. Say so in the answer - the review evidence already distinguishes the two.
