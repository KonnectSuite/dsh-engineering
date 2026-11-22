An ACD file cannot be read offline by this bundle. When Studio 5000 and its SDK are installed on the host, the studio tools can export one:

1. l5x_studio_sdk_status confirms the SDK is reachable and names its version.
2. l5x_studio_capabilities lists what this build can ask the SDK to do.
3. l5x_export_acd_to_l5x exports the ACD to an L5X file.
4. l5x_verify_offline_l5x re-checks the exported L5X and returns a verification id.
5. l5x_build_acd_from_draft asks the SDK to build an ACD from the draft, for the review loop.

The verification id matters: l5x_download_project requires a verification from l5x_verify_offline_l5x, so an unverified draft cannot be pushed online by accident.

Without the SDK: studio_* tools answer that Studio is not installed or the SDK is unavailable. The offline path still starts from an L5X export produced on another machine - the tools never guess an ACD's contents from its name or size.
