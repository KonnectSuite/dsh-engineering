/**
 * Save an Optix project the only way Windows allows: send Studio its own Ctrl+S and wait for the
 * design model on disk to move.
 *
 * Why this exists: every other authoring tool in this plugin edits the design model, and nothing is
 * live in the runtime until Studio writes `Nodes/**` and rebuilds the .NET solution. Studio exposes
 * no save API that a NetLogic bridge can call, so the save is a keystroke - and a keystroke only
 * lands when the Studio window owns the foreground. This module performs that whole dance in one
 * call and proves the write happened instead of reporting "sent".
 *
 * It never edits a file, never starts or stops a process, and never returns ok on a keystroke alone:
 * `ok` is true only when a file under `Nodes/` or `ProjectFiles/NetSolution/bin` is newer than the
 * snapshot taken before the first keystroke.
 */
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Folders whose newest write is the proof that Studio saved. */
const WATCHED = ["Nodes", join("ProjectFiles", "NetSolution", "bin")];

/** How long one keystroke may take, including the foreground dance. */
const KEYSTROKE_TIMEOUT_MS = 20_000;

/** Pause between a keystroke and the mtime probe; Studio writes asynchronously. */
const SETTLE_MS = 2_500;

/**
 * Run a PowerShell snippet and return its stdout.
 *
 * PowerShell is the only way to reach user32 from here, and the snippets below are fixed strings -
 * no caller input is interpolated into them.
 * @param script - The snippet.
 * @param timeoutMs - Budget; the child is killed when it expires.
 * @returns Stdout text, or "" when the snippet failed or timed out.
 */
async function powershell(script, timeoutMs) {
	if (process.platform !== "win32") return "";
	return await new Promise((resolve) => {
		let settled = false;
		const done = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true
		});
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {}
			done("");
		}, timeoutMs);
		const chunks = [];
		child.stdout?.on("data", (chunk) => chunks.push(chunk));
		child.on("error", () => {
			clearTimeout(timer);
			done("");
		});
		child.on("close", () => {
			clearTimeout(timer);
			done(Buffer.concat(chunks).toString("utf8"));
		});
	});
}

/**
 * The Studio window that owns a project, as Windows sees it.
 *
 * A process can own several windows; the one with a non-zero MainWindowHandle is the frame the
 * operator sees, and it is the only handle worth raising.
 * @returns `{ pid, hwnd, title }`, or null when Studio is not running.
 */
export async function studioWindow() {
	const script = [
		"Add-Type -Namespace SaveNg -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool IsWindowVisible(System.IntPtr h); [DllImport(\"user32.dll\", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);'",
		"$p = Get-Process FTOptixStudio -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1",
		"if (-not $p) { 'null'; exit }",
		"$sb = New-Object System.Text.StringBuilder 512",
		"[void][SaveNg.Win]::GetWindowText($p.MainWindowHandle, $sb, 512)",
		"@{ pid = $p.Id; hwnd = [int64]$p.MainWindowHandle; title = $sb.ToString() } | ConvertTo-Json -Compress"
	].join("; ");
	const out = (await powershell(script, 15_000)).trim();
	if (out === "" || out === "null") return null;
	try {
		const row = JSON.parse(out);
		const pid = Number(row?.pid ?? 0);
		const hwnd = Number(row?.hwnd ?? 0);
		if (pid <= 0 || hwnd <= 0) return null;
		return { pid, hwnd, title: typeof row?.title === "string" ? row.title : "" };
	} catch {
		return null;
	}
}

/**
 * Raise the Studio window and press Ctrl+S.
 *
 * The foreground lock is the whole difficulty: a plain SetForegroundWindow is refused while another
 * process owns the foreground, and the documented workaround is to attach to the foreground thread's
 * input queue first. Measured on this machine, that sequence is what moves the foreground; a
 * SendKeys afterwards then reaches Studio instead of whichever window held the foreground.
 * @param hwnd - Studio's main window handle.
 * @returns `{ foreground, title, sent }` describing what Windows actually did.
 */
export async function pressSave(hwnd) {
	if (process.platform !== "win32") return { foreground: false, title: "", sent: false };
	if (!Number.isInteger(hwnd) || hwnd <= 0) return { foreground: false, title: "", sent: false };
	const script = [
		"Add-Type -AssemblyName System.Windows.Forms",
		"Add-Type -Namespace SaveNg -Name Api -MemberDefinition '[DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint p); [DllImport(\"user32.dll\")] public static extern bool AttachThreadInput(uint a, uint b, bool attach); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport(\"user32.dll\")] public static extern bool BringWindowToTop(System.IntPtr h); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(System.IntPtr h, int c); [DllImport(\"user32.dll\")] public static extern bool SetActiveWindow(System.IntPtr h); [DllImport(\"user32.dll\")] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n); [DllImport(\"user32.dll\")] public static extern uint GetCurrentThreadId();'",
		`$hwnd = [System.IntPtr]${hwnd}`,
		"$fg = [SaveNg.Api]::GetForegroundWindow()",
		"$fgPid = 0",
		"[void][SaveNg.Api]::GetWindowThreadProcessId($fg, [ref]$fgPid)",
		"[void][SaveNg.Api]::AttachThreadInput([SaveNg.Api]::GetCurrentThreadId(), $fgPid, $true)",
		"[void][SaveNg.Api]::ShowWindow($hwnd, 9)",
		"[void][SaveNg.Api]::BringWindowToTop($hwnd)",
		"[void][SaveNg.Api]::SetForegroundWindow($hwnd)",
		"[void][SaveNg.Api]::SetActiveWindow($hwnd)",
		"[void][SaveNg.Api]::AttachThreadInput([SaveNg.Api]::GetCurrentThreadId(), $fgPid, $false)",
		"Start-Sleep -Milliseconds 250",
		"$foreground = ([SaveNg.Api]::GetForegroundWindow() -eq $hwnd)",
		"$sb = New-Object System.Text.StringBuilder 512",
		"[void][SaveNg.Api]::GetWindowText([SaveNg.Api]::GetForegroundWindow(), $sb, 512)",
		"$sent = $false",
		"if ($foreground) { [System.Windows.Forms.SendKeys]::SendWait('^s'); $sent = $true }",
		"@{ foreground = $foreground; title = $sb.ToString(); sent = $sent } | ConvertTo-Json -Compress"
	].join("; ");
	const out = (await powershell(script, KEYSTROKE_TIMEOUT_MS)).trim();
	if (out === "") return { foreground: false, title: "", sent: false };
	try {
		const row = JSON.parse(out);
		return {
			foreground: row?.foreground === true,
			title: typeof row?.title === "string" ? row.title : "",
			sent: row?.sent === true
		};
	} catch {
		return { foreground: false, title: "", sent: false };
	}
}

/**
 * The newest modification time under one folder, in milliseconds.
 *
 * Directories are skipped: what proves a save is a file Studio rewrote, and a touched directory
 * timestamp would let a failed save look successful.
 * @param root - Absolute folder.
 * @param limit - How deep to walk; the project keeps Nodes/ shallow.
 * @returns Newest mtime in ms, or 0 when nothing was readable.
 */
async function newestWrite(root, limit = 6) {
	let newest = 0;
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) {
			if (limit > 1) newest = Math.max(newest, await newestWrite(full, limit - 1));
			continue;
		}
		try {
			const info = await stat(full);
			if (info.mtimeMs > newest) newest = info.mtimeMs;
		} catch {}
	}
	return newest;
}

/**
 * The newest write across every folder a save is expected to touch.
 * @param projectRoot - Absolute project folder.
 * @returns Newest mtime in ms, or 0 when the project folders are unreadable.
 */
export async function saveStamp(projectRoot) {
	let newest = 0;
	for (const rel of WATCHED) newest = Math.max(newest, await newestWrite(join(projectRoot, rel)));
	return newest;
}

/**
 * Save the project, retrying until the design model on disk actually moves.
 *
 * Every attempt is a foreground raise plus Ctrl+S, followed by a settle pause and an mtime probe.
 * The result names which file moved, how many keystrokes it took and how long it took, so a caller
 * can tell "saved" from "the keystroke went nowhere".
 * @param options - `{ projectRoot, timeoutMs?, intervalMs?, signal? }`.
 * @returns A JSON-safe report; `ok` is true only when a watched file became newer.
 */
export async function saveProject(options) {
	const projectRoot = typeof options?.projectRoot === "string" ? options.projectRoot : "";
	if (projectRoot === "") {
		return {
			ok: false,
			error: "no_project",
			message: "No project folder to save - open a project first, or pass project=<folder>."
		};
	}
	if (process.platform !== "win32") {
		return {
			ok: false,
			error: "unsupported_platform",
			message: "Saving needs Windows: it raises the Studio window and sends Ctrl+S."
		};
	}
	const window = await studioWindow();
	if (!window) {
		return {
			ok: false,
			error: "studio_not_running",
			message: "FactoryTalk Optix Studio is not running with a visible window, so there is nothing to save."
		};
	}
	const before = await saveStamp(projectRoot);
	const started = Date.now();
	const timeoutMs = Math.min(Math.max(Number(options?.timeoutMs ?? 60_000), 5_000), 600_000);
	const intervalMs = Math.min(Math.max(Number(options?.intervalMs ?? 4_000), 1_000), 30_000);
	const attempts = [];
	let last = null;
	while (Date.now() - started < timeoutMs) {
		last = await pressSave(window.hwnd);
		attempts.push({
			at_ms: Date.now() - started,
			foreground: last.foreground,
			sent: last.sent,
			title: last.title
		});
		if (!last.foreground) {
			// The raise can be refused; try again rather than reporting a keystroke that never happened.
			await new Promise((resolve) => setTimeout(resolve, 750));
			continue;
		}
		await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
		const after = await saveStamp(projectRoot);
		if (after > before) {
			return {
				ok: true,
				method: "keystroke:ctrl+s",
				project: projectRoot,
				studio_pid: window.pid,
				saved_at: new Date(after).toISOString(),
				attempts: attempts.length,
				latency_s: Number(((Date.now() - started) / 1000).toFixed(2)),
				keystrokes_sent: attempts.filter((row) => row.sent).length,
				foreground_confirmed: attempts.filter((row) => row.foreground).length,
				next: "Studio rebuilds the .NET solution on save; a NetLogic or bridge change also needs a Studio restart before the new class answers."
			};
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	const undelivered = attempts.filter((row) => !row.foreground).length;
	return {
		ok: false,
		error: undelivered === attempts.length ? "foreground_refused" : "no_write",
		message:
			undelivered === attempts.length
				? "The Studio window never took the foreground, so no keystroke was sent; another window is holding it (a Windows prompt, a browser, this GUI)."
				: "Ctrl+S was delivered and the foreground was Studio, but nothing under Nodes/ moved; Studio may be showing a modal dialog.",
		project: projectRoot,
		studio_pid: window.pid,
		window_title: window.title || last?.title || "",
		attempts: attempts.length,
		latency_s: Number(((Date.now() - started) / 1000).toFixed(2)),
		keystrokes_sent: attempts.filter((row) => row.sent).length,
		foreground_confirmed: attempts.filter((row) => row.foreground).length,
		last_attempt: attempts[attempts.length - 1] ?? null
	};
}
