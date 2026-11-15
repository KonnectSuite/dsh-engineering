/**
 * Full designed application on a blank project, in one pass:
 * screens (as ScreenType, the container type the runtime mounts) → theme → shell → panel pointers →
 * dialog → review. Then Save/Build in Studio and run `node test/optix-live-render.mjs`.
 *
 *   node test/optix-live-build.mjs
 */

import { mount } from "./optix-live-scope.mjs";

const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const WINDOW = "UI/MainWindow";
const NAMES = ["Overview", "Alarms", "Diagnostics"];
const line = (label, value) => console.log(`${label.padEnd(20)} ${value}`);

const get = async (route) => (await fetch(`${BRIDGE}${route}`)).json();
const post = async (route, query = "", body) =>
	(await fetch(`${BRIDGE}${route}${query ? `?${query}` : ""}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();
const children = async (path) => (await get(`/bridge/nodes?path=${encodeURIComponent(path)}`)).children ?? [];
const exists = async (path) => (await children(path.slice(0, path.lastIndexOf("/")))).some((child) => child.browse_name === path.slice(path.lastIndexOf("/") + 1));

const BLUEPRINTS = {
	Overview: {
		title: "LINE 1 · OVERVIEW",
		subtitle: "cutter and stacker",
		chips: ["Cycle started", "Shift A"],
		kpis: [
			{ label: "Belt speed", value: "0", unit: "m/min" },
			{ label: "Stack count", value: "0", unit: "" }
		],
		chart: { title: "REFLOW OVEN · Temperature", values: [98, 181, 225, 161, 99], labels: ["1", "2", "3", "4", "5"], unit: "°C", threshold: 2 },
		messages: [{ title: "Maintenance reminder", body: "Conveyor 1 - belt maintenance in 2 days" }],
		status: { text: "Comm. Driver - communication established", ok: true }
	},
	Alarms: {
		title: "LINE 1 · ALARMS",
		subtitle: "active and recent",
		chips: ["2 active"],
		cards: [
			{ title: "ACTIVE", rows: [{ label: "High temperature", value: "225 °C", kind: "lamp", on: true }, { label: "Belt slip", value: "", kind: "lamp", on: false }] },
			{ title: "COUNTERS", rows: [{ label: "Acknowledged", value: "18", kind: "bar", percent: 72 }, { label: "Unacknowledged", value: "2", kind: "bar", percent: 8 }] }
		],
		status: { text: "2 alarms need acknowledgement", ok: false }
	},
	Diagnostics: {
		title: "LINE 1 · DIAGNOSTICS",
		subtitle: "controller and network",
		cards: [
			{ title: "CONTROLLER", rows: [{ label: "CPU load", value: "31 %", kind: "bar", percent: 31 }, { label: "Task scan", value: "4 ms", kind: "value" }] },
			{ title: "NETWORK", rows: [{ label: "Ethernet", value: "up", kind: "lamp", on: true }, { label: "MQTT broker", value: "up", kind: "lamp", on: true }] }
		],
		status: { text: "all links healthy", ok: true }
	}
};

const handle = await mount();
const run = (tool, args) => handle.run(tool, args);

// 1. Screens as ScreenType nodes — the type the runtime accepts as a container.
for (const name of NAMES) {
	if (!(await exists(`UI/Screens/${name}`))) {
		const reply = await post("/bridge/model/type", `name=${name}&parent=UI/Screens&base=Screen`);
		line(`type ${name}`, reply.ok ? "ok" : JSON.stringify(reply).slice(0, 120));
	}
}

// 2. Kit content into each screen.
for (const [name, blueprint] of Object.entries(BLUEPRINTS)) {
	const reply = await run("optix_ui", { action: "screen", mode: "apply", project: PROJECT, screen: `UI/Screens/${name}`, width: 1060, height: 706, chrome: "none", blueprint });
	line(`screen ${name}`, `${reply.status} applied=${reply.applied ?? reply.op_count ?? "?"}`);
}

// 3. Design language on both engines.
const theme = await run("optix_ui", { action: "theme", mode: "apply", project: PROJECT, language: "modern" });
line("theme", `${theme.status} applied=${theme.applied} styles=${theme.counts?.styles}`);

// 4. Window shell with a rail of the three screens.
const shell = await run("optix_ui", { action: "shell", mode: "apply", project: PROJECT, screens: NAMES.map((name) => `UI/Screens/${name}`) });
line("shell", `${shell.status} applied=${shell.applied} buttons=${(shell.buttons ?? []).length}`);

// 5. Panel pointers: validated writes on each pointer's own Value child. The native navigation panel is the
// content host, so the items are the only pointers (there is no separate loader to point at a screen).
const ops = [];
NAMES.forEach((name, index) => {
	ops.push({ op: "set_property", path: `${WINDOW}/ShellRail/Panels/RailItem${index + 1}/Panel`, name: "Value", value: `UI/Screens/${name}` });
});
const pointers = await run("optix_edit", { project: PROJECT, ops, dry_run: false });
line("pointers", `${pointers.status} applied=${pointers.applied}`);
for (const row of pointers.results ?? []) line("  " + row.path.split("/").slice(-2).join("/"), row.ok ? String(row.value ?? "ok").slice(0, 40) : JSON.stringify(row).slice(0, 120));

// 6. A confirm dialog on the Alarms screen.
const dialog = await run("optix_ui", {
	action: "dialog",
	mode: "apply",
	project: PROJECT,
	name: "ConfirmResetLine",
	kind: "confirm",
	destructive: true,
	title: "Reset the line?",
	trigger_screen: "UI/Screens/Alarms",
	trigger_name: "BtnResetLine"
});
line("dialog", `${dialog.status} applied=${dialog.applied}`);

// 7. Grade the drawings.
for (const name of NAMES) {
	const review = await run("optix_ui", { action: "review", project: PROJECT, screen: `UI/Screens/${name}` });
	line(`review ${name}`, `${review.status} score=${review.score} grade=${review.grade} must_fix=${(review.must_fix ?? []).map((entry) => entry.rule).join(",") || "none"}`);
}

line("screens", (await children("UI/Screens")).map((child) => `${child.browse_name}[${child.dotnet_type}]`).join(", "));
console.log("built - now Save (Ctrl+S) + Build (Ctrl+Shift+B) in Studio, then node test/optix-live-render.mjs");
