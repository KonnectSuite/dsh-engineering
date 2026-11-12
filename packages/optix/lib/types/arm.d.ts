/** Arm an existing Optix project with the shipped Studio bridge. @module dsh-tool-ft-optix/arm */
/** What one bridge-arm call found, wrote, and still cannot do. */
export interface ArmReport {
	project: string;
	target: string;
	/** The NetSolution project Studio would compile the bridge into. */
	net_solution: string;
	/** Version the shipped bridge declares. */
	bridge_version: string;
	bridge_sha256: string;
	/** Whether the project already holds a bridge file. */
	installed: boolean;
	installed_version: string;
	installed_sha256: string;
	/** The project already holds exactly what this bundle ships. */
	up_to_date: boolean;
	/** True only when this call wrote the file. */
	armed: boolean;
	/** Where the previous file was copied, empty when there was nothing to keep. */
	backup: string;
	/** The Studio steps no tool can take, stated every time. */
	next: string;
}
/**
 * The bridge version a source file declares, or an empty string when it is not the bridge.
 * @param text - C# source.
 * @returns The declared `BridgeVersion`, or an empty string.
 */
export declare function bridgeVersion(text: string): string;
/**
 * Report, and on confirmation write, the bridge an existing project needs.
 * @param project - Directory holding the `.optix` file and `ProjectFiles`.
 * @param shipped - The bridge source this bundle ships.
 * @param confirm - `false` reports the plan; `true` writes it after a backup.
 * @returns What is there now, what was written, and the one human step that remains.
 */
export declare function armBridge(project: string, shipped: string, confirm: boolean): Promise<ArmReport>;
//# sourceMappingURL=arm.d.ts.map
