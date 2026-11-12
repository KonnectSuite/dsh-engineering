/**
* Type surface of the Optix runtime launcher.
* @module
*/
/** Where and what the emulator leg holds right now. */
export interface EmulatorReport {
	/** Runtime executable this machine was found to hold, newest version last. */
	runtime_path: string;
	/** How many runtime installs were discovered. */
	discovered: number;
	/** The `.optix` file the runtime would load. */
	project_file: string;
	/** Whether a runtime this plugin started is still running. */
	running: boolean;
	/** Pids this plugin started and has not stopped. */
	pids: number[];
	/** Preview address probed. */
	url: string;
	/** Whether that address answered. */
	serving: boolean;
	/** HTTP status, 0 when nothing answered. */
	status: number;
	/** What to do next, when nothing answers. */
	next?: string;
}
/** Result of starting a runtime. */
export interface EmulatorStartReport {
	/** Runtime executable that was launched. */
	runtime_path: string;
	/** Project file handed to it. */
	project_file: string;
	/** Process id of the launched runtime. */
	pid: number;
	/** Whether a process was actually created. */
	started: boolean;
	/** What to read afterwards. */
	next: string;
}
/** Result of stopping a runtime. */
export interface EmulatorStopReport {
	/** Whether a tracked process was ended. */
	stopped: boolean;
	/** Process id involved. */
	pid: number;
	/** Why nothing was ended. */
	reason?: string;
}
/** Candidate Studio install roots on this machine. */
export declare function studioRoots(): string[];
/** Every `FTOptixRuntime.exe` this machine holds. */
export declare function runtimeCandidates(): Promise<string[]>;
/** The `.optix` file inside a project folder, or an empty string. */
export declare function projectFile(project: string): Promise<string>;
/** Read the emulator leg. */
export declare function emulatorStatus(input: {
	project: string;
	previewUrl: string;
}, signal?: AbortSignal): Promise<EmulatorReport>;
/** Start the runtime for a project. */
export declare function startEmulator(input: {
	project: string;
	runtime?: string;
}): Promise<EmulatorStartReport>;
/** Stop a runtime this plugin started. */
export declare function stopEmulator(input: {
	project: string;
	project_file: string;
}): Promise<EmulatorStopReport>;
