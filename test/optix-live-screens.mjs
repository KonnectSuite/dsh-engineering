/**
 * Rebuild the three designed screens as ScreenType nodes (the container type ChangePanel accepts) and
 * author the kit blueprints into them. The bridge's `model/object?type=Screen` makes a plain Screen
 * object, which the runtime refuses with "NewPanel argument is not a Container type".
 *
 *   node test/optix-live-screens.mjs
 */

import { mount } from "./optix-live-scope.mjs";

const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const WINDOW = "UI/MainWindow";
const CONTENT = `${WINDOW}/ShellContent`;

const get = async (route) => (await fetch(`${BRIDGE}${route}`)).json();
const post = async (route, query = "", body) =>
	(await fetch(`${BRIDGE}${route}${query ? `?${query}` : ""}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body ?? {})
	})).json();
const children = async (path) => (await get(`/bridge/nodes?path=${encodeURIComponent(path)}`)).children ?? [];
const exists = async (path) => {
	const parent = path.slice(0, path.lastIndexOf("/"));
	const name = path.slice(path.lastIndexOf("/") + 1);
	return (await children(parent)).some((child) => child.browse_name === name);
};
const remove = async (path) => post(`/bridge/node/delete`, `path=${encodeURIComponent(path)}`);

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
			{
				title: "ACTIVE",
				rows: [
					{ label: "High temperature", value: "225 °C", kind: "lamp", on: true },
					{ label: "Belt slip", value: "", kind: "lamp", on: false }
				]
			},
			{
				title: "COUNTERS",
				rows: [
					{ label: "Acknowledged", value: "18", kind: "bar", percent: 72 },
					{ label: "Unacknowledged", value: "2", kind: "bar", percent: 8 }
				]
			}
		],
		status: { text: "2 alarms need acknowledgement", ok: false }
	},
	Diagnostics: {
		title: "LINE 1 · DIAGNOSTICS",
		subtitle: "controller and network",
		cards: [
			{
				title: "CONTROLLER",
				rows: [
					{ label: "CPU load", value: "31 %", kind: "bar", percent: 31 },
					{ label: "Task scan", value: "4 ms", kind: "value" }
				]
			},
			{
				title: "NETWORK",
				rows: [
					{ label: "Ethernet", value: "up", kind: "lamp", on: true },
					{ label: "MQTT broker", value: "up", kind: "lamp", on: true }
				]
			}
		],
		status: { text: "all links healthy", ok: true }
	}
};

const handle = await mount();
const run = (tool, args) => handle.run(tool, args);
const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`);

// The three screens must be the container type the runtime mounts: a ScreenType node, not a Screen object.
for (const name of Object.keys(BLUEPRINTS)) {
	const path = `UI/Screens/${name}`;
	if (await exists(path)) {
		const reply = await remove(path);
		line(`delete ${name}`, reply.ok ? "ok" : JSON.stringify(reply).slice(0, 120));
	}
}

for (const name of Object.keys(BLUEPRINTS)) {
	const type = await post("/bridge/model/type", `name=${name}&parent=UI/Screens&base=Screen&force=1`);
	const path = `UI/Screens/${name}`;
	const ok = await exists(path);
	line(`type ${name}`, `${type.ok ? "ok" : JSON.stringify(type).slice(0, 100)} exists=${ok}`);
	if (!ok) process.exitCode = 1;
}

for (const [name, blueprint] of Object.entries(BLUEPRINTS)) {
	const reply = await run("optix_ui", {
		action: "screen",
		mode: "apply",
		project: PROJECT,
		screen: `UI/Screens/${name}`,
		width: 1060,
		height: 706,
		chrome: "none",
		blueprint
	});
	line(`screen ${name}`, `${reply.status} ops=${reply.op_count ?? reply.applied ?? "?"} ${(reply.pages ?? []).length}`);
	if (reply.status !== "applied") line("  refused", JSON.stringify(reply.validation ?? reply).slice(0, 300));
}

for (const [index, name] of Object.keys(BLUEPRINTS).entries()) {
	const reply = await post(
		"/bridge/node/property",
		`path=${encodeURIComponent(`${WINDOW}/ShellRail/Panels/RailItem${index + 1}/Panel`)}&name=Value`,
		{ value: `UI/Screens/${name}` }
	);
	line(`rail ${index + 1}`, `${reply.ok ? "ok" : JSON.stringify(reply).slice(0, 100)} ${reply.value ?? ""}`);
}

const content = await post("/bridge/node/property", `path=${encodeURIComponent(`${CONTENT}/Panel`)}&name=Value`, {
	value: "UI/Screens/Overview"
});
line("content panel", `${content.ok ? "ok" : JSON.stringify(content).slice(0, 100)} ${content.value ?? ""}`);

for (const path of ["UI/Screens/DshOverview", "UI/Screens/DshOverviewType"]) {
	if (await exists(path)) await remove(path);
}
line("screens", (await children("UI/Screens")).map((child) => `${child.browse_name}[${child.dotnet_type}]`).join(", "));
console.log("screens rebuilt as ScreenType - Save (Ctrl+S) + Build (Ctrl+Shift+B), then run the render proof");
