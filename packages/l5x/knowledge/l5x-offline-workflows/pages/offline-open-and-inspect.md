The first call on any export is l5x_open_project. It reads the file once, parses it, and returns the project handle plus a structure summary. Every other tool reads that handle, so opening the same file twice is wasted work.

    l5x_open_project {path: "C:/exports/line3.L5X"}

Then inspect:

- l5x_project_overview: controller, tasks, programs, component counts and the limits that apply.
- l5x_list_components: the document's components, one row each, with type and name.
- l5x_get_component: one component's full structure, for the routine or tag you are about to edit.

The opened snapshot records the export's software revision and verification state. Read them: an untested_revision project is still readable, but the review evidence should say the release has not been measured.

If the file is an ACD rather than an L5X, it must be exported first. The studio tools do this when the SDK is available (l5x_export_acd_to_l5x); without Studio, the answer is that an ACD cannot be read offline and the work must start from an L5X export.
