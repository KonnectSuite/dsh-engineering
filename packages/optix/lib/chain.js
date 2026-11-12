/** Probe the preview, emulator and OCR chain without a bridge or a harness import. @module dsh-tool-ft-optix/chain */
import { access } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
/** Whether two URLs address the same preview page, the rule the preview tools enforce on tabs. */
export function samePreviewTarget(left, right) {
	return left.origin === right.origin && left.pathname === right.pathname && left.search === right.search;
}
/**
* Whether an OCR executable exists on this machine, given as a path or found through PATH.
* @param executable - Configured executable name or path.
* @returns Whether the file could be opened.
*/
export async function executablePresent(executable) {
	const directories = (process.env.PATH ?? "").split(delimiter).filter((entry) => entry !== "");
	const names = process.platform === "win32" ? [executable, `${executable}.exe`, `${executable}.cmd`] : [executable];
	const candidates = /[\\/]/.test(executable) ? [executable] : directories.flatMap((entry) => names.map((name) => join(entry, name)));
	for (const candidate of candidates) try {
		await access(candidate);
		return true;
	} catch {
		continue;
	}
	return false;
}
/**
* The folder the language check looks in: the row's value, else the installer's own
* tessdata beside the executable, which is where the Windows package puts its data.
* @param ocr - Configured or discovered OCR block.
* @returns The directory to search, or an empty string when there is no executable.
*/
export function tessdataDirectoryFor(ocr) {
	if (typeof ocr.tessdataDirectory === "string" && ocr.tessdataDirectory !== "") return ocr.tessdataDirectory;
	return typeof ocr.executable === "string" && ocr.executable !== "" ? join(dirname(ocr.executable), "tessdata") : "";
}
/**
* Whether the configured OCR language data is installed.
* @param ocr - Configured OCR block.
* @returns Whether the first language's traineddata file exists.
*/
async function languageDataPresent(ocr) {
	const directory = tessdataDirectoryFor(ocr);
	if (directory === "") return false;
	try {
		await access(join(directory, `${ocr.language.split("+")[0]}.traineddata`));
		return true;
	} catch {
		return false;
	}
}
/** The Windows package id the OCR install uses; no Python, no pip, no service. */
export const TESSERACT_PACKAGE_ID = "UB-Mannheim.TesseractOCR";
/**
* Where a Tesseract install lands, so the row can be pointed at it.
* @returns Candidate tesseract.exe paths on this machine's install roots.
*/
export function tesseractCandidates() {
	const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((entry) => typeof entry === "string" && entry !== "");
	return roots.map((root) => join(root, "Tesseract-OCR", "tesseract.exe"));
}
/**
* Resolve a bare command name through PATH to the first file that exists.
* @param name - Command name without an extension.
* @returns The full path, or an empty string when it is not on PATH.
*/
export async function resolveCommand(name) {
	const directories = (process.env.PATH ?? "").split(delimiter).filter((entry) => entry !== "");
	const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd"] : [""];
	for (const directory of directories) for (const suffix of suffixes) {
		const candidate = join(directory, `${name}${suffix}`);
		try {
			await access(candidate);
			return candidate;
		} catch {
			continue;
		}
	}
	return "";
}
/**
* The package-manager command that installs Tesseract on this machine.
* @returns The executable and its arguments, or an empty array where winget is absent.
*/
export async function tesseractInstallCommand() {
	const winget = await resolveCommand("winget");
	return winget === "" ? [] : [winget, "install", "--id", TESSERACT_PACKAGE_ID, "--accept-package-agreements", "--accept-source-agreements"];
}
/**
* Report the OCR install state `optix_ocr` depends on, without running OCR.
* @param ocr - Configured OCR block, or null when OCR is not configured.
* @returns Executable, whether it is installed, and the language-data state.
*/
export async function ocrProbe(ocr) {
	const configured = ocr !== null && ocr !== undefined && ocr.executable !== "";
	const executable = configured ? ocr.executable : "";
	const installed = executable === "" ? false : await executablePresent(executable);
	const tessdataDirectory = configured ? ocr.tessdataDirectory : "";
	const language = configured ? ocr.language : "eng";
	let found = "";
	if (!installed) for (const candidate of tesseractCandidates()) if (await executablePresent(candidate)) {
		found = candidate;
		break;
	}
	const effective = installed ? {
		executable,
		tessdataDirectory,
		language
	} : found === "" ? null : {
		tessdataDirectory: join(dirname(found), "tessdata"),
		language
	};
	const searched = effective === null ? "" : tessdataDirectoryFor(effective);
	return {
		configured,
		executable,
		installed,
		language,
		tessdataDirectory,
		// The folder the language check actually looked in, so an empty row value reads
		// as the installer's own tessdata rather than as nothing checked.
		tessdata: searched,
		traineddata: searched === "" ? false : await languageDataPresent(effective),
		// Where Tesseract is on this machine while the row points somewhere else, so the
		// fix is one config value rather than an install.
		discovered: found,
	};
}
/**
* Name the first unmet link of the preview chain, in the order the tools reach them.
* @param config - Resolved deployment settings.
* @param chain - The probed chain.
* @returns The action that clears the chain, or an empty string when it is ready.
*/
function chainBlocker(config, chain) {
	if (!chain.preview) return "The preview tools are not registered: set preview to true in the Optix row's plugin configuration.";
	if (chain.browser.mode === "launch" && chain.browser.launchable === false) return `No Chromium-family browser is installed where the plugin looks: install Chrome or Edge, or set browserPath to the browser executable.`;
	if (chain.browser.mode === "attach" && !chain.browser.listening) return `No browser answers CDP on ${chain.browser.cdp_url}: set browser to launch so the plugin starts its own browser, or start a Chromium-family browser with --remote-debugging-port=${chain.browser.port} and open ${config.previewUrl} in it.`;
	if (!chain.emulator.listening) return `Nothing serves ${chain.emulator.url}: optix_emulator with action start launches the project's runtime, or run the project in Studio so its Web presentation engine answers that address; if the project has no such engine, optix_action with action ensure_web_engine adds one, then call optix_status again.`;
	if (chain.browser.mode === "attach" && chain.preview_tabs !== 1) return `The preview tools need exactly one open tab at ${chain.emulator.url}, and found ${chain.preview_tabs}.`;
	if (chain.ocr.configured && chain.ocr.installed !== true) return `OCR is configured but ${chain.ocr.executable} was not found: install Tesseract or set ocr.executable to its full path.`;
	if (chain.ocr.configured && chain.ocr.traineddata !== true) return `OCR language data for ${chain.ocr.language} is not in ${chain.ocr.tessdata}: point ocrTessdataDirectory at the folder holding ${chain.ocr.language.split("+")[0]}.traineddata.`;
	return "";
}
/**
 * Where a Chromium-family browser is installed, by Playwright channel name.
 * @param channel - `chrome`, `msedge` or `auto` for either.
 * @returns Candidate executable paths on this machine's Windows install locations.
 */
function browserCandidates(channel) {
	const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((entry) => typeof entry === "string" && entry !== "");
	const vendors = channel === "auto" ? [
		["Google", "Chrome", "Application", "chrome.exe"],
		["Microsoft", "Edge", "Application", "msedge.exe"],
	] : channel === "msedge" ? [["Microsoft", "Edge", "Application", "msedge.exe"]] : [["Google", "Chrome", "Application", "chrome.exe"]];
	return roots.flatMap((root) => vendors.map((vendor) => join(root, ...vendor)));
}
/**
 * Whether the browser the plugin would start is actually on this machine.
 * @param config - Resolved deployment settings.
 * @returns `true`, `false`, or `undefined` where the install cannot be probed.
 */
async function browserLaunchable(config) {
	if (config.browserPath !== undefined && config.browserPath !== "") return await executablePresent(config.browserPath);
	if (process.platform !== "win32") return undefined;
	for (const candidate of browserCandidates(config.browserChannel ?? "auto")) try {
		await access(candidate);
		return true;
	} catch {
		continue;
	}
	return false;
}
/**
* Probe the preview, emulator and OCR chain so a missing link names itself instead of hiding a tool.
* @param config - Resolved deployment settings.
* @param signal - Caller abort signal; optional, so a probe can run outside a tool call.
* @returns One entry per link, with the first unmet link named in `next`.
*/
export async function chainReport(config, signal) {
	// The row always resolves a mode; this fallback only covers a bare probe.
	const mode = config.browser ?? "attach";
	const timeout = AbortSignal.timeout(Math.min(config.requestTimeoutMs ?? 3000, 3000));
	const deadline = signal ? AbortSignal.any([signal, timeout]) : timeout;
	const get = async (href) => {
		try {
			const response = await fetch(href, {
				signal: deadline,
				redirect: "error"
			});
			return {
				answered: true,
				status: response.status,
				text: await response.text().catch(() => "")
			};
		} catch (error) {
			if (signal?.aborted) throw error;
			return {
				answered: false,
				status: 0,
				text: "",
				error: error instanceof Error ? String(error.cause?.code ?? error.cause ?? error.message) : String(error)
			};
		}
	};
	const version = mode === "launch" ? {
		answered: false,
		status: 0,
		text: ""
	} : await get(`${config.cdpUrl}/json/version`);
	const listing = version.status === 200 ? await get(`${config.cdpUrl}/json/list`) : {
		answered: false,
		status: 0,
		text: "[]"
	};
	const emulator = await get(config.previewUrl);
	const target = new URL(config.previewUrl);
	let browser_version = "";
	let preview_tabs = 0;
	if (version.status === 200) try {
		browser_version = String(JSON.parse(version.text).Browser ?? "");
	} catch {
		browser_version = "";
	}
	if (listing.answered && listing.status === 200) try {
		preview_tabs = JSON.parse(listing.text).filter((entry) => entry.type === "page" && entry.url && samePreviewTarget(new URL(entry.url), target)).length;
	} catch {
		preview_tabs = 0;
	}
	const ocr = { configured: config.ocr !== null };
	if (config.ocr) {
		const probe = await ocrProbe(config.ocr);
		ocr.executable = probe.executable;
		ocr.language = probe.language;
		ocr.tessdata = probe.tessdata;
		ocr.installed = probe.installed;
		ocr.traineddata = probe.traineddata;
		if (probe.discovered !== "") ocr.discovered = probe.discovered;
	}
	const chain = {
		preview: config.preview,
		browser: mode === "launch" ? {
			mode,
			channel: config.browserChannel ?? "auto",
			headless: config.browserHeadless === true,
			...config.browserPath ? {
				executable: config.browserPath
			} : {},
			launchable: await browserLaunchable(config)
		} : {
			mode,
			cdp_url: config.cdpUrl,
			port: new URL(config.cdpUrl).port,
			listening: version.status === 200,
			...browser_version ? {
				version: browser_version
			} : {},
			...version.status === 200 ? {} : {
				error: version.error ?? `HTTP ${version.status}`
			}
		},
		emulator: {
			url: config.previewUrl,
			listening: emulator.answered,
			...emulator.answered ? {
				status: emulator.status
			} : {
				error: emulator.error
			}
		},
		preview_tabs,
		preview_input: config.allowPreviewInput,
		ocr
	};
	chain.next = chainBlocker(config, chain);
	return chain;
}
//# sourceMappingURL=chain.js.map
