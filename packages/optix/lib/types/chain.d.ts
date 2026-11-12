/** Probe the preview, emulator and OCR chain without a bridge or a harness import. @module dsh-tool-ft-optix/chain */
/** One deployment setting set the chain probe reads; a subset of the resolved plugin settings. */
export interface ChainSettings {
	preview: boolean;
	browser?: "attach" | "launch";
	browserChannel?: "auto" | "chrome" | "msedge";
	browserPath?: string;
	browserHeadless?: boolean;
	cdpUrl: string;
	previewUrl: string;
	allowPreviewInput: boolean;
	requestTimeoutMs: number;
	ocr: {
		executable: string;
		language: string;
		tessdataDirectory: string;
	} | null;
}
/** The probed state of the preview, emulator and OCR chain. */
export interface ChainReport {
	preview: boolean;
	browser: {
		mode: "attach" | "launch";
		cdp_url?: string;
		port?: string;
		listening?: boolean;
		version?: string;
		error?: string;
		channel?: string;
		headless?: boolean;
		executable?: string;
		launchable?: boolean;
	};
	emulator: {
		url: string;
		listening: boolean;
		status?: number;
		error?: string;
	};
	preview_tabs: number;
	preview_input: boolean;
	ocr: {
		configured: boolean;
		executable?: string;
		language?: string;
		tessdata?: string;
		installed?: boolean;
		traineddata?: boolean;
	};
	/** The first unmet link and the action that clears it, empty when the chain is ready. */
	next: string;
}
/**
* Probe the preview, emulator and OCR chain so a missing link names itself instead of hiding a tool.
* @param config - Resolved deployment settings.
* @param signal - Caller abort signal.
* @returns One entry per link, with the first unmet link named in `next`.
*/
export declare function chainReport(config: ChainSettings, signal: AbortSignal): Promise<ChainReport>;
/**
 * What the configured OCR needs and whether this machine has it, without running a tool.
 * @param ocr - The configured OCR settings, or null when the row names no executable.
 * @returns Whether the executable and its language data are present, and where a Tesseract was found.
 */
export declare function ocrProbe(ocr: ChainSettings["ocr"]): Promise<{
	configured: boolean;
	executable: string;
	language: string;
	tessdata: string;
	installed: boolean;
	traineddata: boolean;
	discovered: string;
}>;
/** The Windows package manager id the bundle installs Tesseract from. */
export declare const TESSERACT_PACKAGE_ID: string;
/**
 * The winget command that would install Tesseract, or an empty array when winget is not on this machine.
 * @returns An executable followed by its arguments, ready to ask the engineer about.
 */
export declare function tesseractInstallCommand(): Promise<string[]>;
//# sourceMappingURL=chain.d.ts.map
