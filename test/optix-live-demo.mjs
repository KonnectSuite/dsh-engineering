/**
 * Build the self-contained manufacturing demo on the live bridge.
 *
 * The app is a mid-size bottle filling line: a C# Runtime NetLogic plays the PLC
 * (simulation, alarm state, counters) and the Optix UI is the HMI. Every node the
 * logic writes is named here, once, so the two halves cannot drift.
 *
 * Manual harness, like `test/optix-live-showcase.mjs`: it needs a running Studio
 * with the bridge started and a blank project, and it writes to that project.
 *
 *   node test/optix-live-demo.mjs base|model|screens|shell|dialogs|assets|logic|status|all
 */

import { readFileSync, writeFileSync } from "node:fs";
import { mount } from "./optix-live-scope.mjs";

const PROJECT = process.env.OPTIX_PROJECT ?? "AryaOptixTemplate";
const BRIDGE = process.env.OPTIX_BRIDGE_URL ?? "http://127.0.0.1:8768";
const ROOT = process.env.OPTIX_PROJECT_ROOT ?? `${process.env.USERPROFILE}\\Desktop\\myWorkspaces\\Optix Demo\\${PROJECT}`;
const W = 1280;
const H = 800;
const HEADER = 64;
const FOOTER = 30;
const RAIL = 220;
const CW = W - RAIL; // screen canvas width
const CH = H - HEADER - FOOTER; // screen canvas height

const teal = "#0B3E5C";
const accent = "#0FAFFF";
const ink = "#1F2933";
const mute = "#5B6B7A";
const line = "#B3B3B3";
const surface = "#FFFFFF";
const page = "#F2F4F7";
const okGreen = "#30A46C";
const badRed = "#E5484D";
const amber = "#F5A524";

const h = await mount();
const log = (...a) => console.log(...a);

/** Run one tool and throw on refusal. */
async function call(name, args) {
	const result = await h.run(name, args);
	if (result && result.error) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
	return result;
}

/** Apply a batch of authoring ops, naming the first refused op. */
async function edit(ops, label) {
	if (ops.length === 0) return { applied: 0 };
	// The bridge tool refuses a batch over settings.maxBatchOps (40 by default), so apply in
	// ordered chunks: a later chunk may safely reference a node an earlier chunk created.
	let applied = 0;
	for (let index = 0; index < ops.length; index += 35) {
		const chunk = ops.slice(index, index + 35);
		const result = await call("optix_edit", { project: PROJECT, ops: chunk, dry_run: false });
		if (result.status !== "completed" && result.status !== "applied") {
			throw new Error(`${label} [${index}]: ${JSON.stringify(result).slice(0, 900)}`);
		}
		applied += result.applied ?? chunk.length;
	}
	log(`  ${label}: ${applied} ops`);
	return { applied };
}

const set = (path, name, value) => ({ op: "set_property", path, name, value: String(value) });
const box = (path, left, top, width, height) => [
	set(path, "LeftMargin", left),
	set(path, "TopMargin", top),
	set(path, "Width", width),
	set(path, "Height", height)
];
const widget = (screen, name, type) => ({ op: "create_widget", screen, name, widget_type: type });

function surfaceOps(parent, name, left, top, width, height, { fill = surface, border = line, radius = 8, thickness = 1 } = {}) {
	const path = `${parent}/${name}`;
	return [
		widget(parent, name, "Rectangle"),
		...box(path, left, top, width, height),
		set(path, "FillColor", fill),
		set(path, "BorderColor", border),
		set(path, "BorderThickness", thickness),
		set(path, "CornerRadius", radius)
	];
}

function textOps(parent, name, value, left, top, width, { size = 14, colour = ink, weight = "400", height = 22, align = 0 } = {}) {
	const path = `${parent}/${name}`;
	const ops = [
		widget(parent, name, "Label"),
		...box(path, left, top, width, height),
		set(path, "Text", value),
		set(path, "FontSize", size),
		set(path, "TextColor", colour),
		set(path, "FontWeight", weight),
		set(path, "WordWrap", 0)
	];
	if (align !== 0) ops.push(set(path, "TextHorizontalAlignment", align));
	return ops;
}

function lampOps(parent, name, left, top, { size = 14, fill = badRed } = {}) {
	const path = `${parent}/${name}`;
	return [
		widget(parent, name, "Ellipse"),
		...box(path, left, top, size, size),
		set(path, "FillColor", fill),
		set(path, "BorderColor", fill)
	];
}

/** A titled card with its own child coordinate space. */
function cardOps(parent, name, left, top, width, height) {
	return surfaceOps(parent, name, left, top, width, height);
}

/** Build a screen node as a ScreenType (the only spelling ChangePanel and the rail accept). */
async function ensureScreen(name) {
	const ui = await call("optix_read", { project: PROJECT, request: { action: "map", path: "UI/Screens", depth: 1, mode: "overview" } });
	const names = (ui.response?.map?.children ?? ui.response?.children ?? []).map((c) => c.name ?? c.browse_name);
	if (names.includes(name)) return;
	await edit([{ op: "create_type", parent: "UI/Screens", name, base_type: "Screen" }], `screen ${name}`);
}

// ---------------------------------------------------------------- base ----

async function base() {
	log("base: window, engines, stylesheet");
	let sheetPath = "UI/Components/StyleSheets/FriendlyLight";
	const existing = await call("optix_read", { project: PROJECT, request: { action: "map", path: "UI/Components/StyleSheets", depth: 1, mode: "detail" } }).catch(() => void 0);
	const present = (existing?.response?.map?.children ?? []).find((c) => /^FriendlyLight/.test(c.name ?? c.browse_name ?? ""));
	if (present) {
		sheetPath = `UI/Components/StyleSheets/${present.name ?? present.browse_name}`;
		log(`  stylesheet already imported: ${sheetPath}`);
	} else {
		const imported = await call("optix_library", { project: PROJECT, action: "import", library: "StyleSheets", item: "FriendlyLight" });
		log(`  stylesheet: ${imported.status} -> ${imported.imported?.dest ?? "?"}/${imported.imported?.name ?? "?"}`);
		sheetPath = `${imported.imported?.dest ?? "UI/Components/StyleSheets"}/${imported.imported?.name ?? "FriendlyLight"}`;
	}
	const ops = [
		set("UI/MainWindow", "Width", W),
		set("UI/MainWindow", "Height", H),
		set("UI/MainWindow", "X", 0),
		set("UI/MainWindow", "Y", 0),
		set("UI/MainWindow", "Caption", "FLEXO-1 · Bottle Filling Line"),
		set("UI/MainWindow", "FullScreen", 0),
		set("UI/NativePresentationEngine/StartWindow", "Value", "UI/MainWindow"),
		set("UI/WebPresentationEngine/StartWindow", "Value", "UI/MainWindow"),
		set("UI/NativePresentationEngine/StyleSheet", "Value", sheetPath),
		set("UI/WebPresentationEngine/StyleSheet", "Value", sheetPath)
	];
	await edit(ops, "base");
	log(`  engines bound to ${sheetPath}`);
}

// --------------------------------------------------------------- model ----

const VARS = [
	["Boolean", "CmdStart"], ["Boolean", "CmdStop"], ["Boolean", "CmdReset"], ["Boolean", "CmdAck"],
	["Boolean", "SimJam"], ["Boolean", "GuardOpen"],
	["Boolean", "LineRunning"], ["Boolean", "Faulted"], ["Boolean", "ConvRunning"], ["Boolean", "FillerRunning"], ["Boolean", "CapperRunning"],
	["Boolean", "Alarm1Active"], ["Boolean", "Alarm2Active"], ["Boolean", "Alarm3Active"], ["Boolean", "Alarm4Active"],
	["Int32", "State"], ["Int32", "Recipe"], ["Int32", "BottlesFilled"], ["Int32", "BottlesRejected"], ["Int32", "ActiveAlarms"],
	["Float", "SpeedSetpoint", "analog"], ["Float", "SpeedActual"], ["Float", "FillLevel"], ["Float", "Torque"], ["Float", "OEE"], ["Float", "CycleTime"], ["Float", "Uptime"]
];

async function model() {
	log("model: tag table under Model/Line");
	const existing = await call("optix_read", { project: PROJECT, request: { action: "map", path: "Model", depth: 1, mode: "overview" } });
	const names = (existing.response?.map?.children ?? []).map((c) => c.name ?? c.browse_name);
	const ops = [];
	if (!names.includes("Line")) ops.push({ op: "create_folder", parent: "Model", name: "Line" });
	await edit(ops, "model folder");
	const ops2 = VARS.map(([datatype, name, kind]) => ({
		op: "create_variable",
		parent: "Model/Line",
		name,
		datatype,
		...(kind === "analog" ? { kind: "analog", units: "bpm", range: [0, 120] } : {})
	}));
	await edit(ops2, "model variables");
}

// -------------------------------------------------------------- screens ----

const SCREENS = ["Overview", "Line", "Alarms", "Recipes"];

async function screens() {
	for (const name of SCREENS) await ensureScreen(name);
	log("screens: authoring content");

	// ---- Overview
	const OV = "UI/Screens/Overview";
	let ov = [
		...textOps(OV, "Title", "PRODUCTION OVERVIEW", 24, 16, 640, { size: 22, weight: "700" }),
		...textOps(OV, "Subtitle", "FLEXO-1 · bottling line 1 · shift A", 24, 44, 640, { size: 13, colour: mute })
	];
	const kpis = [
		["Kpi1", "BOTTLES FILLED", "0", "bottles"],
		["Kpi2", "LINE OEE", "0.0", "%"],
		["Kpi3", "REJECTS", "0", "bottles"],
		["Kpi4", "CYCLE TIME", "0.0", "s"]
	];
	kpis.forEach(([id, title, value, unit], index) => {
		const left = 24 + index * 258;
		ov.push(...cardOps(OV, `${id}Card`, left, 76, 234, 108));
		ov.push(...textOps(`${OV}/${id}Card`, `${id}Title`, title, 16, 12, 202, { size: 11, colour: mute, weight: "600" }));
		ov.push(...textOps(`${OV}/${id}Card`, `${id}Value`, value, 16, 36, 202, { size: 34, weight: "700" }));
		ov.push(...textOps(`${OV}/${id}Card`, `${id}Unit`, unit, 16, 78, 202, { size: 12, colour: mute }));
	});
	// line status card
	ov.push(...cardOps(OV, "StatusCard", 24, 200, 512, 280));
	ov.push(...textOps(`${OV}/StatusCard`, "StatusTitle", "LINE STATUS", 16, 12, 480, { size: 11, colour: mute, weight: "600" }));
	ov.push(...lampOps(`${OV}/StatusCard`, "StateLamp", 16, 38, { size: 16, fill: mute }));
	ov.push(...textOps(`${OV}/StatusCard`, "StateValue", "IDLE", 40, 34, 240, { size: 20, weight: "700" }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat1", "Speed", 16, 74, 120, { size: 12, colour: mute }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat1Value", "0.0 bpm", 140, 74, 180, { size: 13, weight: "600" }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat2", "Fill level", 16, 100, 120, { size: 12, colour: mute }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat2Value", "0.0 %", 140, 100, 180, { size: 13, weight: "600" }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat3", "Torque", 16, 126, 120, { size: 12, colour: mute }));
	ov.push(...textOps(`${OV}/StatusCard`, "Stat3Value", "0.0 Nm", 140, 126, 180, { size: 13, weight: "600" }));
	ov.push(...surfaceOps(`${OV}/StatusCard`, "BarTrack", 16, 166, 460, 18, { fill: "#E4E8EC", border: "#E4E8EC", radius: 4 }));
	ov.push(...surfaceOps(`${OV}/StatusCard`, "BarFill", 16, 166, 0, 18, { fill: accent, border: accent, radius: 4 }));
	ov.push(...textOps(`${OV}/StatusCard`, "BarLabel", "0 / 240 bottles this shift", 16, 194, 460, { size: 12, colour: mute }));
	ov.push(...textOps(`${OV}/StatusCard`, "UptimeLabel", "Uptime 00:00", 16, 236, 460, { size: 12, colour: mute }));
	// recent alarms card
	ov.push(...cardOps(OV, "AlarmCard", 556, 200, 480, 280));
	ov.push(...textOps(`${OV}/AlarmCard`, "AlarmTitle", "RECENT ALARMS", 16, 12, 448, { size: 11, colour: mute, weight: "600" }));
	for (let index = 1; index <= 4; index += 1) {
		const top = 34 + (index - 1) * 58;
		ov.push(...surfaceOps(`${OV}/AlarmCard`, `AlarmRow${index}`, 16, top, 448, 48, { fill: "#FFFFFF", border: "#E4E8EC", radius: 6 }));
		ov.push(...lampOps(`${OV}/AlarmCard/AlarmRow${index}`, "Lamp", 12, 16, { size: 12, fill: line }));
		ov.push(...textOps(`${OV}/AlarmCard/AlarmRow${index}`, "Name", "No active alarm", 34, 8, 300, { size: 13, weight: "600" }));
		ov.push(...textOps(`${OV}/AlarmCard/AlarmRow${index}`, "When", "—", 34, 26, 300, { size: 11, colour: mute }));
	}
	// chart card
	ov.push(...cardOps(OV, "ChartCard", 24, 500, 1012, 182));
	ov.push(...textOps(`${OV}/ChartCard`, "ChartTitle", "BOTTLES PER MINUTE · LAST 5 MINUTES", 16, 12, 600, { size: 11, colour: mute, weight: "600" }));
	const chartLeft = 40;
	const chartBottom = 150;
	const chartMax = 96;
	for (let index = 1; index <= 5; index += 1) {
		const left = chartLeft + (index - 1) * 190;
		ov.push(...surfaceOps(`${OV}/ChartCard`, `Bar${index}`, left, chartBottom - 6, 120, 6, { fill: accent, border: accent, radius: 3 }));
		ov.push(...textOps(`${OV}/ChartCard`, `BarValue${index}`, "0", left, chartBottom - 26, 120, { size: 11, colour: mute, weight: "600", align: 1 }));
		ov.push(...textOps(`${OV}/ChartCard`, `BarLabel${index}`, `-${5 - index}m`, left, chartBottom + 8, 120, { size: 11, colour: mute, align: 1 }));
	}
	await edit(ov, "Overview");

	// ---- Line
	const LN = "UI/Screens/Line";
	let ln = [
		...textOps(LN, "Title", "FILLING LINE 1", 24, 16, 640, { size: 22, weight: "700" }),
		...textOps(LN, "Subtitle", "infeed · filler · capper · outfeed", 24, 44, 640, { size: 13, colour: mute }),
		...cardOps(LN, "MimicCard", 24, 76, 1012, 262),
		...textOps(`${LN}/MimicCard`, "MimicTitle", "LINE MIMIC", 16, 10, 400, { size: 11, colour: mute, weight: "600" })
	];
	const stations = [
		["Station1", "INFEED"],
		["Station2", "FILLER"],
		["Station3", "CAPPER"],
		["Station4", "OUTFEED"]
	];
	stations.forEach(([id, title], index) => {
		const left = 16 + index * 248;
		ln.push(...textOps(`${LN}/MimicCard`, `${id}Label`, title, left, 36, 220, { size: 12, colour: mute, weight: "600" }));
		ln.push(...lampOps(`${LN}/MimicCard`, `${id}Lamp`, left, 60, { size: 14, fill: line }));
		ln.push(...textOps(`${LN}/MimicCard`, `${id}State`, "STOPPED", left + 22, 56, 180, { size: 13, weight: "600" }));
	});
	// mimic drawing hole
	ln.push(...surfaceOps(`${LN}/MimicCard`, "MimicSlot", 16, 94, 980, 150, { fill: "#F7F9FA", border: "#E4E8EC", radius: 6 }));
	// controls
	ln.push(...surfaceOps(LN, "ControlCard", 24, 356, 512, 320));
	ln.push(...textOps(`${LN}/ControlCard`, "ControlTitle", "OPERATOR CONTROL", 16, 12, 480, { size: 11, colour: mute, weight: "600" }));
	const buttons = [
		["BtnStart", "START", teal, 16, 40],
		["BtnStop", "STOP", badRed, 268, 40],
		["BtnReset", "RESET COUNTERS", "#44546A", 16, 112],
		["BtnAck", "ACKNOWLEDGE", amber, 268, 112]
	];
	for (const [id, label, colour, left, top] of buttons) {
		ln.push(widget(`${LN}/ControlCard`, id, "Button"), ...box(`${LN}/ControlCard/${id}`, left, top, 228, 56));
		ln.push(set(`${LN}/ControlCard/${id}`, "Text", label), set(`${LN}/ControlCard/${id}`, "BackgroundColor", colour), set(`${LN}/ControlCard/${id}`, "TextColor", "#FFFFFF"), set(`${LN}/ControlCard/${id}`, "FontSize", 14));
	}
	ln.push(...textOps(`${LN}/ControlCard`, "Hint", "Commands write the tag table in Model/Line; the runtime logic owns the machine.", 16, 192, 480, { size: 12, colour: mute }));
	// recipe column
	ln.push(...cardOps(LN, "RecipeCard", 556, 356, 480, 320));
	ln.push(...textOps(`${LN}/RecipeCard`, "RecipeTitle", "RECIPE SELECTION", 16, 12, 448, { size: 11, colour: mute, weight: "600" }));
	const recipes = [
		["Recipe1", "250 ml"],
		["Recipe2", "500 ml"],
		["Recipe3", "1 L"]
	];
	recipes.forEach(([id, title], index) => {
		const top = 40 + index * 64;
		ln.push(widget(`${LN}/RecipeCard`, id, "Button"), ...box(`${LN}/RecipeCard/${id}`, 16, top, 448, 52));
		ln.push(set(`${LN}/RecipeCard/${id}`, "Text", title), set(`${LN}/RecipeCard/${id}`, "BackgroundColor", "#E4E8EC"), set(`${LN}/RecipeCard/${id}`, "TextColor", ink), set(`${LN}/RecipeCard/${id}`, "FontSize", 14));
	});
	ln.push(...textOps(`${LN}/RecipeCard`, "Current", "Active recipe: 500 ml", 16, 236, 448, { size: 13, weight: "600" }));
	await edit(ln, "Line");

	// ---- Alarms
	const AL = "UI/Screens/Alarms";
	let al = [
		...textOps(AL, "Title", "ALARMS", 24, 16, 640, { size: 22, weight: "700" }),
		...textOps(AL, "Subtitle", "latched until acknowledged and the condition clears", 24, 44, 700, { size: 13, colour: mute })
	];
	al.push(...textOps(AL, "ActiveCount", "0 ACTIVE", 860, 20, 176, { size: 14, weight: "700", colour: badRed, align: 1 }));
	for (let index = 1; index <= 5; index += 1) {
		const top = 76 + (index - 1) * 76;
		const row = `${AL}/Row${index}`;
		al.push(...surfaceOps(AL, `Row${index}`, 24, top, 1012, 64));
		al.push(...lampOps(row, "Lamp", 14, 24, { size: 14, fill: line }));
		al.push(...textOps(row, "Name", "—", 38, 10, 640, { size: 14, weight: "600" }));
		al.push(...textOps(row, "Detail", "—", 38, 32, 640, { size: 11, colour: mute }));
		al.push(...textOps(row, "State", "CLEARED", 700, 10, 140, { size: 12, weight: "700", colour: mute }));
		al.push(...textOps(row, "When", "—", 700, 32, 140, { size: 11, colour: mute }));
	}
	al.push(widget(AL, "BtnAckAll", "Button"), ...box(`${AL}/BtnAckAll`, 24, 466, 240, 52));
	al.push(set(`${AL}/BtnAckAll`, "Text", "ACKNOWLEDGE ALL"), set(`${AL}/BtnAckAll`, "BackgroundColor", amber), set(`${AL}/BtnAckAll`, "TextColor", "#FFFFFF"), set(`${AL}/BtnAckAll`, "FontSize", 13));
	al.push(...textOps(AL, "Note", "The four conditions are simulated by the runtime logic: guard open, high torque, low fill, conveyor jam.", 24, 530, 1012, { size: 12, colour: mute }));
	await edit(al, "Alarms");

	// ---- Recipes
	const RC = "UI/Screens/Recipes";
	let rc = [
		...textOps(RC, "Title", "RECIPES", 24, 16, 640, { size: 22, weight: "700" }),
		...textOps(RC, "Subtitle", "fill volume, fill time and target torque per product", 24, 44, 700, { size: 13, colour: mute })
	];
	const cards = [
		["Card1", "250 ml", "Fill 3.0 s · torque 1.2 Nm · 60 bpm"],
		["Card2", "500 ml", "Fill 4.5 s · torque 1.8 Nm · 48 bpm"],
		["Card3", "1 L", "Fill 6.0 s · torque 2.4 Nm · 36 bpm"]
	];
	cards.forEach(([id, title, detail], index) => {
		const left = 24 + index * 340;
		const card = `${RC}/${id}`;
		rc.push(...cardOps(RC, id, left, 76, 320, 190));
		rc.push(...textOps(card, "Name", title, 16, 12, 288, { size: 18, weight: "700" }));
		rc.push(...textOps(card, "Detail", detail, 16, 44, 288, { size: 12, colour: mute }));
		rc.push(widget(card, "Select", "Button"), ...box(`${card}/Select`, 16, 128, 288, 46));
		rc.push(set(`${card}/Select`, "Text", "SELECT RECIPE"), set(`${card}/Select`, "BackgroundColor", teal), set(`${card}/Select`, "TextColor", "#FFFFFF"), set(`${card}/Select`, "FontSize", 13));
	});
	rc.push(...cardOps(RC, "Current", 24, 286, 1012, 120));
	rc.push(...textOps(`${RC}/Current`, "CurrentTitle", "ACTIVE RECIPE", 16, 12, 500, { size: 11, colour: mute, weight: "600" }));
	rc.push(...textOps(`${RC}/Current`, "CurrentValue", "500 ml", 16, 34, 500, { size: 24, weight: "700" }));
	rc.push(...textOps(`${RC}/Current`, "CurrentDetail", "Fill 4.5 s · target torque 1.8 Nm · 48 bpm", 16, 72, 960, { size: 13, colour: mute }));
	await edit(rc, "Recipes");
}

// ---------------------------------------------------------------- shell ----

async function shell() {
	log("shell: header, rail, footer");
	const result = await call("optix_ui", {
		project: PROJECT,
		action: "shell",
		mode: "apply",
		screens: SCREENS.map((name) => `UI/Screens/${name}`)
	});
	if (result.status !== "applied") throw new Error(`shell: ${JSON.stringify(result).slice(0, 800)}`);
	log(`  shell: ${result.applied} ops, phases ${JSON.stringify(result.phases)}`);
	await edit([
		set("UI/MainWindow/ShellHeaderTitle", "Text", "Bottle Filling Line"),
		set("UI/MainWindow/ShellHeaderChip", "Text", "RUNNING"),
		set("UI/MainWindow/ShellFooterStatus", "Text", "Comm. Driver - simulator connected")
	], "shell text");
}

// -------------------------------------------------------------- dialogs ----

async function dialogs() {
	log("dialogs: reset confirm and recipe apply");
	const reset = await call("optix_ui", {
		project: PROJECT,
		action: "dialog",
		mode: "apply",
		name: "ConfirmReset",
		kind: "confirm",
		destructive: true,
		title: "Reset the shift counters?",
		message: "Filled and rejected counts return to zero. The line keeps its current recipe.",
		confirmLabel: "Reset counters",
		cancelLabel: "Keep running",
		trigger_screen: "UI/Screens/Line",
		trigger_name: "BtnConfirmReset"
	});
	log(`  ConfirmReset: ${reset.status} ${reset.applied ?? 0} ops`);
	const recipe = await call("optix_ui", {
		project: PROJECT,
		action: "dialog",
		mode: "apply",
		name: "ConfirmRecipe",
		kind: "confirm",
		title: "Apply recipe 1 L?",
		message: "The filler changes to 1 L: longer fill time and a higher target torque.",
		confirmLabel: "Apply recipe",
		cancelLabel: "Cancel",
		trigger_screen: "UI/Screens/Recipes",
		trigger_name: "BtnConfirmRecipe"
	});
	log(`  ConfirmRecipe: ${recipe.status} ${recipe.applied ?? 0} ops`);
}

// --------------------------------------------------------------- assets ----

const MIMIC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="980" height="150" viewBox="0 0 980 150">
  <rect id="frame" x="0" y="0" width="980" height="150" fill="#F7F9FA"/>
  <rect id="conveyor" x="40" y="96" width="900" height="18" rx="6" fill="#9AA7B4"/>
  <rect id="infeed" x="40" y="58" width="150" height="40" rx="6" fill="#DCE3EA" stroke="#B3B3B3" stroke-width="1"/>
  <rect id="filler" x="240" y="40" width="170" height="58" rx="8" fill="#DCE3EA" stroke="#B3B3B3" stroke-width="1"/>
  <rect id="fillerHead" x="300" y="14" width="50" height="28" rx="6" fill="#0B3E5C"/>
  <rect id="capper" x="470" y="44" width="150" height="54" rx="8" fill="#DCE3EA" stroke="#B3B3B3" stroke-width="1"/>
  <rect id="capperHead" x="520" y="18" width="50" height="28" rx="6" fill="#0B3E5C"/>
  <rect id="outfeed" x="680" y="58" width="150" height="40" rx="6" fill="#DCE3EA" stroke="#B3B3B3" stroke-width="1"/>
  <rect id="bottle1" x="190" y="76" width="22" height="24" rx="4" fill="#0FAFFF"/>
  <rect id="bottle2" x="420" y="76" width="22" height="24" rx="4" fill="#0FAFFF"/>
  <rect id="bottle3" x="640" y="76" width="22" height="24" rx="4" fill="#0FAFFF"/>
  <rect id="rejectBin" x="860" y="76" width="60" height="42" rx="6" fill="#F3D9DA" stroke="#E5484D" stroke-width="1"/>
  <text id="brand" x="40" y="24" font-family="Arial" font-size="13" fill="#5B6B7A">FLEXO-1 · INFEED → FILLER → CAPPER → OUTFEED</text>
</svg>`;

async function assets() {
	log("assets: process drawing");
	const added = await call("optix_svg", {
		project: PROJECT,
		action: "add",
		inline: MIMIC_SVG,
		screen: "UI/Screens/Line/MimicCard",
		name: "LineMimic",
		box: { left: 16, top: 94, width: 980, height: 150 }
	});
	log(`  svg: ${JSON.stringify(added).slice(0, 240)}`);
	for (const [id, variable] of [["filler", "FillerRunning"], ["capper", "CapperRunning"], ["conveyor", "ConvRunning"]]) {
		const bound = await call("optix_svg", {
			project: PROJECT,
			action: "bind",
			node: "UI/Screens/Line/MimicCard/LineMimic",
			id,
			property: "Color",
			bool_colours: { on: okGreen, off: "#9AA7B4" },
			source_path: `Model/Line/${variable}`
		});
		log(`  bind ${id} <- ${variable}: ${bound.bound === false ? "no" : "yes"}`);
	}
}

// ---------------------------------------------------------------- logic ----

async function logic() {
	log("logic: runtime NetLogic inside the window");
	const code = readFileSync(new URL("./optix-live-demo-logic.cs", import.meta.url), "utf8");
	const result = await call("optix_script", { project: PROJECT, action: "add", name: "LineLogic", kind: "runtime", parent: "UI/MainWindow", code });
	log(`  script: ${JSON.stringify(result).slice(0, 320)}`);
	const build = await call("optix_script", { project: PROJECT, action: "build", name: "LineLogic" });
	log(`  build: ${JSON.stringify(build).slice(0, 320)}`);
}

// ---------------------------------------------------------------- wire ----

async function wire() {
	log("wire: operator buttons and dialog confirms");
	const ops = [
		{ op: "wire_event", path: "UI/Screens/Line/ControlCard/BtnStart", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/CmdStart", value: "True" },
		{ op: "wire_event", path: "UI/Screens/Line/ControlCard/BtnStop", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/CmdStop", value: "True" },
		{ op: "wire_event", path: "UI/Screens/Line/ControlCard/BtnAck", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/CmdAck", value: "True" },
		{ op: "wire_event", path: "UI/Screens/Line/ControlCard/BtnReset", event_type: "MouseClickEvent", command: "OpenDialog", args: "Dialog=UI/Dialogs/ConfirmReset;AliasNode=;ParentItem=" },
		{ op: "wire_event", path: "UI/Screens/Recipes/Card1/Select", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/Recipe", value: "0" },
		{ op: "wire_event", path: "UI/Screens/Recipes/Card2/Select", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/Recipe", value: "1" },
		{ op: "wire_event", path: "UI/Screens/Recipes/Card3/Select", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/Recipe", value: "2" },
		{ op: "wire_event", path: "UI/Screens/Alarms/BtnAckAll", event_type: "MouseClickEvent", command: "SetVariable", variable: "Model/Line/CmdAck", value: "True" },
		{ op: "wire_event", path: "UI/Dialogs/ConfirmReset/DlgConfirm", event_type: "MouseClickEvent", method_path: "UI/MainWindow/LineLogic/OnConfirmReset" },
		{ op: "wire_event", path: "UI/Dialogs/ConfirmRecipe/DlgConfirm", event_type: "MouseClickEvent", method_path: "UI/MainWindow/LineLogic/OnConfirmRecipe" }
	];
	// Alarm-screen jam injector, so the demo can raise a condition on demand.
	ops.push({ op: "create_widget", screen: "UI/Screens/Alarms", name: "BtnJam", widget_type: "Button" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "LeftMargin", value: "280" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "TopMargin", value: "466" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "Width", value: "240" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "Height", value: "52" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "Text", value: "SIMULATE JAM" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "BackgroundColor", value: "#44546A" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "TextColor", value: "#FFFFFF" });
	ops.push({ op: "set_property", path: "UI/Screens/Alarms/BtnJam", name: "FontSize", value: "13" });
	ops.push({ op: "wire_event", path: "UI/Screens/Alarms/BtnJam", event_type: "MouseClickEvent", command: "ToggleVariable", variable: "Model/Line/SimJam" });
	await edit(ops, "wire");
}

// --------------------------------------------------------------- status ----

async function status() {
	const map = await call("optix_read", { project: PROJECT, request: { action: "map", path: "", depth: 2, mode: "overview" } });
	const children = (map.response?.map?.children ?? []).map((c) => `${c.name ?? c.browse_name}`);
	log(`root: ${children.join(", ")}`);
	const review = await call("optix_ui", { project: PROJECT, action: "review", screen: "UI/Screens/Overview" });
	log(`review Overview: ${review.score} ${review.grade} must_fix=${review.must_fix?.length ?? 0}`);
}

const stage = process.argv[2] ?? "all";
if (stage === "base" || stage === "all") await base();
if (stage === "model" || stage === "all") await model();
if (stage === "screens" || stage === "all") await screens();
if (stage === "shell" || stage === "all") await shell();
if (stage === "dialogs" || stage === "all") await dialogs();
if (stage === "assets" || stage === "all") await assets();
if (stage === "logic") await logic();
if (stage === "wire") await wire();
if (stage === "status" || stage === "all") await status();
await h.dispose?.();
writeFileSync(new URL("../.tmp-demo-last.json", import.meta.url), JSON.stringify({ project: PROJECT, root: ROOT, at: new Date().toISOString() }));
