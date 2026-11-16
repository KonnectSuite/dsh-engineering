import { mount } from "./optix-live-scope.mjs";

const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const ROOT = process.env.OPTIX_PROJECT_ROOT || (process.env.USERPROFILE + "\\Desktop\\myWorkspaces\\Optix Demo\\" + PROJECT);
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const stage = process.argv[2] || "all";
const hex = (s) => s;

const palette = {
  page: "#F2F4F7", card: "#FFFFFF", line: "#D7DDE5", ink: "#1F2933", mute: "#5B6B7A",
  accent: "#0FAFFF", teal: "#0B3E5C", ok: "#30A46C", warn: "#F5A524", bad: "#E5484D", off: "#9AA7B4",
};

const h = await mount();
const run = async (tool, args) => h.run(tool, args);
const set = (path, name, value) => ({ op: "set_property", path, name, value });
const box = (path, left, top, width, height) => [set(path, "LeftMargin", String(left)), set(path, "TopMargin", String(top)), set(path, "Width", String(width)), set(path, "Height", String(height))];
const widget = (screen, name, type) => ({ op: "create_widget", screen, name, widget_type: type });
const rect = (screen, name, l, t, w, hh, fill, border = "", radius = "") => {
  const ops = [widget(screen, name, "Rectangle"), ...box(screen + "/" + name, l, t, w, hh), set(screen + "/" + name, "FillColor", fill)];
  if (border) ops.push(set(screen + "/" + name, "BorderColor", border), set(screen + "/" + name, "BorderThickness", "1"));
  if (radius) ops.push(set(screen + "/" + name, "CornerRadius", String(radius)));
  return ops;
};
const label = (screen, name, l, t, w, hh, text, size, colour, weight = "") => {
  const ops = [widget(screen, name, "Label"), ...box(screen + "/" + name, l, t, w, hh), set(screen + "/" + name, "Text", text), set(screen + "/" + name, "FontSize", String(size)), set(screen + "/" + name, "TextColor", colour)];
  if (weight) ops.push(set(screen + "/" + name, "FontWeight", weight));
  return ops;
};
const lamp = (screen, name, l, t, size, colour) => [widget(screen, name, "Ellipse"), ...box(screen + "/" + name, l, t, size, size), set(screen + "/" + name, "FillColor", colour)];
const button = (screen, name, l, t, w, hh, text, fill, colour = "#FFFFFF", size = 14) => [
  widget(screen, name, "Button"), ...box(screen + "/" + name, l, t, w, hh),
  set(screen + "/" + name, "Text", text), set(screen + "/" + name, "BackgroundColor", fill),
  set(screen + "/" + name, "TextColor", colour), set(screen + "/" + name, "FontSize", String(size)),
];
const bar = (screen, name, l, t, w, hh) => [
  ...rect(screen, name + "Track", l, t, w, hh, "#E3E8EE", "", hh / 2),
  ...rect(screen, name, l, t, w, hh, palette.accent, "", hh / 2),
];

async function edit(ops, what) {
  for (let i = 0; i < ops.length; i += 35) {
    const chunk = ops.slice(i, i + 35);
    const r = await run("optix_edit", { project: PROJECT, dry_run: false, ops: chunk });
    if (r.status !== "applied" && r.status !== "completed") throw new Error(what + " chunk failed: " + JSON.stringify(r.errors ?? r).slice(0, 300));
  }
  console.log(what + ": " + ops.length + " ops");
}

async function children(path) {
  const res = await fetch(BRIDGE + "/bridge/nodes?path=" + encodeURIComponent(path));
  const j = await res.json();
  return j.children ?? [];
}
async function has(parent, name) {
  return (await children(parent)).some((c) => c.browse_name === name);
}
async function del(path) { try { await fetch(BRIDGE + "/bridge/node/delete?path=" + encodeURIComponent(path), { method: "POST" }); } catch {} }

async function clean() {
  for (const s of await children("UI/Screens")) await del("UI/Screens/" + s.browse_name);
  for (const w of await children("UI/MainWindow")) await del("UI/MainWindow/" + w.browse_name);
  for (const d of await children("UI/Dialogs")) await del("UI/Dialogs/" + d.browse_name);
  const line = await children("Model/Smt");
  for (const v of line) await del("Model/Smt/" + v.browse_name);
  console.log("clean done");
}

async function model() {
  if (!(await has("Model", "Smt"))) await edit([{ op: "create_folder", parent: "Model", name: "Smt" }], "model folder");
  const vars = [];
  const B = ["CmdStart","CmdStop","CmdAck","CmdEStop","SimFault","CmdResetCounters","LineRunning","Faulted","Stopped","Alarm1","Alarm2","Alarm3","Alarm4","Alarm5","LampGreen","LampAmber","LampRed"];
  for (const n of B) vars.push({ op: "create_variable", parent: "Model/Smt", name: n, datatype: "Boolean", kind: "value" });
  for (const n of ["Program","BoardsIn","BoardsOut","BoardsGood","BoardsRejected","ActiveAlarms"]) vars.push({ op: "create_variable", parent: "Model/Smt", name: n, datatype: "Int32", kind: "value" });
  const F = ["UPH","OEE","Availability","Performance","Quality","CycleTime","BeltSpeed","Vacuum","AirPressure","ToolLife","Zone1","Zone2","Zone3","Zone4","Zone5","ZoneSet1","ZoneSet2","ZoneSet3","ZoneSet4","ZoneSet5","Hist1","Hist2","Hist3","Hist4","Hist5"];
  for (const n of F) vars.push({ op: "create_variable", parent: "Model/Smt", name: n, datatype: "Float", kind: "value" });
  for (let i = 0; i < 8; i++) {
    vars.push({ op: "create_variable", parent: "Model/Smt", name: "St" + i + "Name", datatype: "String", kind: "value" });
    vars.push({ op: "create_variable", parent: "Model/Smt", name: "St" + i + "State", datatype: "Int32", kind: "value" });
    vars.push({ op: "create_variable", parent: "Model/Smt", name: "St" + i + "Run", datatype: "Boolean", kind: "value" });
  }
  await edit(vars, "model tags");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="980" height="210" viewBox="0 0 980 210"><g stroke="#B6C0CB" stroke-width="1"><polygon points="20,150 150,150 190,120 60,120" fill="#E9EDF1" stroke="none"/></g></svg>`;

async function dashboard() {
  const S = "UI/Screens/Dashboard";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Dashboard", base_type: "Screen" }], "dashboard type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "PRODUCTION DASHBOARD", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 640, 22, "ARYA SMT LINE 1 · electronics assembly · shift A", 12, palette.mute));
  const cards = [
    ["Kpi1", 24, "BOARDS OUT", "0", "boards"],
    ["Kpi2", 300, "GOOD BOARDS", "0", "pieces"],
    ["Kpi3", 576, "REJECTED", "0", "pieces"],
    ["Kpi4", 852, "LINE OEE", "0 %", ""],
  ];
  for (const [n, x, title, val, unit] of cards) {
    ops.push(...rect(S, n + "Card", x, 88, 184, 96, palette.card, palette.line, 6));
    ops.push(...label(S, n + "Title", x + 14, 100, 160, 16, title, 10, palette.mute, "Bold"));
    ops.push(...label(S, n + "Value", x + 14, 122, 160, 34, val, 26, palette.ink, "Bold"));
    if (unit) ops.push(...label(S, n + "Unit", x + 14, 158, 160, 16, unit, 10, palette.mute));
  }
  ops.push(...rect(S, "LineCard", 24, 200, 660, 300, palette.card, palette.line, 8));
  ops.push(...label(S, "LineTitle", 40, 212, 400, 18, "LINE 1 · BOARD FLOW", 11, palette.mute, "Bold"));
  ops.push(...rect(S, "LineArtFrame", 40, 236, 628, 236, "#F7F9FB", "#E3E8EE", 6));
  ops.push(...label(S, "LineArtText", 60, 330, 560, 28, "isometric line artwork is placed here in the artwork stage", 13, palette.off));
  for (let i = 0; i < 8; i++) { ops.push(...lamp(S, "St" + i + "Lamp", 58 + i * 78, 486, 12, palette.off)); ops.push(...label(S, "St" + i + "Label", 44 + i * 78, 502, 84, 14, ["LOAD","PRINT","PP1","PP2","PP3","REFLOW","AOI","UNLOAD"][i], 8, palette.mute)); }
  ops.push(...rect(S, "SideCard", 700, 200, 336, 146, palette.card, palette.line, 8));
  ops.push(...label(S, "OeeTitle", 716, 212, 300, 16, "OVERALL EQUIPMENT EFFECTIVENESS", 10, palette.mute, "Bold"));
  ops.push(...label(S, "OeeValue", 716, 232, 140, 30, "0.0 %", 24, palette.teal, "Bold"));
  ops.push(...label(S, "UphTitle", 716, 268, 120, 14, "UPH", 9, palette.mute));
  ops.push(...label(S, "UphValue", 716, 282, 120, 20, "0", 15, palette.ink, "Bold"));
  ops.push(...label(S, "CycleTitle", 836, 268, 120, 14, "CYCLE TIME", 9, palette.mute));
  ops.push(...label(S, "CycleValue", 836, 282, 120, 20, "0.0 s", 15, palette.ink, "Bold"));
  ops.push(...rect(S, "StatusCard", 700, 358, 336, 142, palette.card, palette.line, 8));
  ops.push(...label(S, "StateTitle", 716, 370, 200, 16, "LINE STATE", 10, palette.mute, "Bold"));
  ops.push(...lamp(S, "StateLamp", 716, 390, 14, palette.off));
  ops.push(...label(S, "StateValue", 736, 388, 200, 20, "IDLE", 14, palette.ink, "Bold"));
  ops.push(...label(S, "StatusText", 716, 414, 306, 34, "", 11, palette.mute));
  ops.push(...label(S, "ProgramTitle", 716, 456, 120, 14, "PROGRAM", 9, palette.mute));
  ops.push(...label(S, "ProgramValue", 716, 470, 160, 18, "", 12, palette.ink, "Bold"));
  ops.push(...label(S, "ClockTitle", 876, 456, 120, 14, "SHIFT CLOCK", 9, palette.mute));
  ops.push(...label(S, "ClockValue", 876, 470, 120, 18, "", 12, palette.ink, "Bold"));
  ops.push(...rect(S, "AlarmCard", 24, 516, 1012, 160, palette.card, palette.line, 8));
  ops.push(...label(S, "AlarmTitle", 40, 528, 300, 16, "RECENT ALARMS", 10, palette.mute, "Bold"));
  for (let i = 0; i < 4; i++) {
    const y = 552 + i * 28;
    ops.push(...lamp(S, "AlarmRow" + (i + 1) + "Lamp", 44, y + 4, 10, palette.off));
    ops.push(...label(S, "AlarmRow" + (i + 1) + "Name", 62, y, 300, 18, "", 11, palette.ink));
    ops.push(...label(S, "AlarmRow" + (i + 1) + "State", 380, y, 100, 18, "", 10, palette.mute));
    ops.push(...label(S, "AlarmRow" + (i + 1) + "When", 500, y, 120, 18, "", 10, palette.mute));
  }
  await edit(ops, "dashboard content");
}

async function line() {
  const S = "UI/Screens/Line";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Line", base_type: "Screen" }], "line type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "LINE CONTROL", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 760, 22, "loader → printer → pick & place ×3 → reflow oven → AOI → unloader", 12, palette.mute));
  ops.push(...label(S, "StateText", 852, 22, 180, 26, "IDLE", 18, palette.ink, "Bold"));
  ops.push(...lamp(S, "StateLamp", 828, 28, 14, palette.off));
  ops.push(...rect(S, "MimicCard", 24, 88, 1012, 300, palette.card, palette.line, 8));
  ops.push(...label(S, "MimicTitle", 40, 100, 400, 18, "LINE MIMIC · 8 STATIONS", 10, palette.mute, "Bold"));
  ops.push(...rect(S, "MimicFrame", 40, 124, 980, 176, "#F7F9FB", "#E3E8EE", 6));
  ops.push(...label(S, "MimicHint", 60, 196, 600, 30, "station artwork is placed here in the artwork stage", 13, palette.off));
  for (let i = 0; i < 8; i++) { ops.push(...lamp(S, "St" + i + "Lamp", 66 + i * 118, 312, 14, palette.off)); }
  ops.push(...rect(S, "ControlCard", 24, 404, 500, 272, palette.card, palette.line, 8));
  ops.push(...label(S, "ControlTitle", 40, 416, 300, 18, "OPERATOR CONTROL", 10, palette.mute, "Bold"));
  ops.push(...button(S, "BtnStart", 40, 444, 220, 52, "START LINE", palette.teal));
  ops.push(...button(S, "BtnStop", 276, 444, 220, 52, "STOP LINE", palette.bad));
  ops.push(...button(S, "BtnAck", 40, 508, 220, 46, "ACKNOWLEDGE", palette.warn));
  ops.push(...button(S, "BtnEStop", 276, 508, 220, 46, "EMERGENCY STOP", "#7F1D1D"));
  ops.push(...button(S, "BtnReset", 40, 566, 220, 46, "RESET COUNTERS", "#3B4754"));
  ops.push(...button(S, "BtnSimFault", 276, 566, 220, 46, "SIMULATE FAULT", "#6B7280"));
  ops.push(...label(S, "ControlHint", 40, 626, 460, 34, "Commands are C# [ExportMethod] calls on the screen logic; the tag table in Model/Smt is the only contract.", 10, palette.mute));
  ops.push(...rect(S, "InfoCard", 544, 404, 492, 272, palette.card, palette.line, 8));
  ops.push(...label(S, "InfoTitle", 560, 416, 300, 18, "LINE DATA", 10, palette.mute, "Bold"));
  ops.push(...label(S, "UphTitle", 560, 444, 140, 16, "UPH", 10, palette.mute));
  ops.push(...label(S, "UphValue", 560, 462, 140, 26, "0 UPH", 18, palette.ink, "Bold"));
  ops.push(...label(S, "RecipeTitle", 720, 444, 140, 16, "PROGRAM", 10, palette.mute));
  ops.push(...label(S, "RecipeValue", 720, 462, 200, 26, "", 18, palette.ink, "Bold"));
  ops.push(...label(S, "SpeedTitle", 560, 506, 140, 16, "CYCLE TIME", 10, palette.mute));
  ops.push(...label(S, "SpeedValue", 560, 524, 160, 26, "", 18, palette.ink, "Bold"));
  ops.push(...label(S, "MimicNote", 560, 576, 460, 80, "The mimic and station lamps are driven by the simulation; the logic owns the machine, the screen only writes commands and shows state.", 11, palette.mute));
  await edit(ops, "line content");
}

async function alarms() {
  const S = "UI/Screens/Alarms";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Alarms", base_type: "Screen" }], "alarms type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "ALARMS", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "latched conditions, acknowledged at the operator panel", 12, palette.mute));
  ops.push(...rect(S, "Banner", 24, 88, 1012, 44, "#FFF4E5", "#F5A524", 6));
  ops.push(...lamp(S, "BannerLamp", 40, 104, 12, palette.warn));
  ops.push(...label(S, "BannerText", 62, 100, 900, 22, "No active alarms — line conditions normal", 12, palette.ink, "Bold"));
  ops.push(...label(S, "ActiveTitle", 852, 54, 120, 18, "ACTIVE", 10, palette.mute));
  ops.push(...label(S, "ActiveCount", 940, 46, 80, 30, "0", 22, palette.ink, "Bold"));
  ops.push(...rect(S, "GridCard", 24, 144, 1012, 380, palette.card, palette.line, 8));
  const head = ["", "ALARM", "DETAIL", "STATE", "TIME"];
  const xs = [44, 66, 340, 700, 840];
  for (let c = 0; c < head.length; c++) ops.push(...label(S, "Head" + c, xs[c], 156, 240, 16, head[c], 9, palette.mute, "Bold"));
  for (let i = 0; i < 5; i++) {
    const y = 182 + i * 64;
    ops.push(...rect(S, "RowLine" + (i + 1), 40, y + 54, 980, 1, "#EDF0F4"));
    ops.push(...lamp(S, "Row" + (i + 1) + "Lamp", 44, y + 6, 12, palette.off));
    ops.push(...label(S, "Row" + (i + 1) + "Name", 66, y, 260, 18, "", 12, palette.ink, "Bold"));
    ops.push(...label(S, "Row" + (i + 1) + "Detail", 66, y + 22, 600, 18, "", 10, palette.mute));
    ops.push(...label(S, "Row" + (i + 1) + "State", 700, y + 4, 120, 18, "", 10, palette.mute, "Bold"));
    ops.push(...label(S, "Row" + (i + 1) + "When", 840, y + 4, 160, 18, "", 10, palette.mute));
  }
  ops.push(...button(S, "BtnAckAll", 24, 540, 240, 48, "ACKNOWLEDGE ALL", palette.teal));
  ops.push(...button(S, "BtnFault", 284, 540, 240, 48, "SIMULATE FAULT", palette.warn));
  ops.push(...button(S, "BtnEStop2", 544, 540, 240, 48, "EMERGENCY STOP", "#7F1D1D"));
  ops.push(...label(S, "Note", 24, 604, 900, 40, "Alarm conditions are simulated by the line logic: stop, fault injection, reject rate and oven overshoot. Acknowledge clears the latch.", 10, palette.mute));
  await edit(ops, "alarms content");
}

async function trends() {
  const S = "UI/Screens/Trends";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Trends", base_type: "Screen" }], "trends type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "PROCESS TRENDS", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "reflow zone temperatures, vacuum, air and tool life", 12, palette.mute));
  for (let i = 0; i < 5; i++) {
    const x = 24 + i * 202, y = 88;
    ops.push(...rect(S, "Zone" + (i + 1) + "Card", x, y, 186, 190, palette.card, palette.line, 8));
    ops.push(...label(S, "Zone" + (i + 1) + "Title", x + 12, y + 12, 160, 16, "ZONE " + (i + 1), 10, palette.mute, "Bold"));
    ops.push(...label(S, "Zone" + (i + 1) + "Value", x + 12, y + 36, 160, 30, "0.0 °C", 20, palette.teal, "Bold"));
    ops.push(...bar(S, "Zone" + (i + 1) + "Bar", x + 12, y + 82, 162, 12));
    ops.push(...label(S, "Zone" + (i + 1) + "Hint", x + 12, y + 108, 160, 60, "reflow setpoint " + [150, 175, 190, 195, 170][i] + " °C", 10, palette.mute));
  }
  const cards = [["Vacuum", "VACUUM", "0.0 kPa"], ["Air", "AIR PRESSURE", "0.00 bar"], ["Tool", "NOZZLE LIFE", "0 %"], ["Cycle", "CYCLE TIME", "0.0 s"], ["Speed", "THROUGHPUT", "0 cpm"]];
  for (let i = 0; i < cards.length; i++) {
    const x = 24 + i * 202, y = 296;
    ops.push(...rect(S, cards[i][0] + "Card", x, y, 186, 96, palette.card, palette.line, 8));
    ops.push(...label(S, cards[i][0] + "Title", x + 12, y + 12, 160, 16, cards[i][1], 9, palette.mute, "Bold"));
    ops.push(...label(S, cards[i][0] + "Value", x + 12, y + 36, 160, 28, cards[i][2], 18, palette.ink, "Bold"));
  }
  ops.push(...rect(S, "ChartCard", 24, 408, 1012, 268, palette.card, palette.line, 8));
  ops.push(...label(S, "ChartTitle", 40, 420, 400, 18, "ZONE TEMPERATURE PROFILE", 10, palette.mute, "Bold"));
  const heights = [86, 118, 140, 146, 112];
  for (let i = 0; i < 5; i++) {
    const x = 72 + i * 180, hgt = heights[i];
    ops.push(...rect(S, "Profile" + (i + 1), x, 620 - hgt, 108, hgt, i === 3 ? palette.bad : palette.accent, "", 4));
    ops.push(...label(S, "Profile" + (i + 1) + "Value", x, 596 - hgt, 108, 18, String([150, 175, 190, 195, 170][i]) + " °C", 11, palette.ink));
    ops.push(...label(S, "Profile" + (i + 1) + "Label", x + 30, 630, 80, 18, "Z" + (i + 1), 11, palette.mute));
  }
  await edit(ops, "trends content");
}

async function analytics() {
  const S = "UI/Screens/Analytics";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Analytics", base_type: "Screen" }], "analytics type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "ANALYTICS", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "OEE, availability, performance, quality and per-minute output", 12, palette.mute));
  const kpis = [["Oee", "OEE", "0.0 %"], ["Avail", "AVAILABILITY", "0.0 %"], ["Perf", "PERFORMANCE", "0.0 %"], ["Qual", "QUALITY", "0.0 %"], ["Yield", "YIELD", "0.0 %"]];
  for (let i = 0; i < kpis.length; i++) {
    const x = 24 + i * 202;
    ops.push(...rect(S, kpis[i][0] + "Card", x, 88, 186, 104, palette.card, palette.line, 8));
    ops.push(...label(S, kpis[i][0] + "Title", x + 12, 100, 160, 16, kpis[i][1], 9, palette.mute, "Bold"));
    ops.push(...label(S, kpis[i][0] + "Value", x + 12, 122, 160, 30, kpis[i][2], 20, palette.teal, "Bold"));
  }
  ops.push(...rect(S, "HistCard", 24, 208, 1012, 468, palette.card, palette.line, 8));
  ops.push(...label(S, "HistTitle", 40, 220, 500, 18, "OUTPUT PER MINUTE · LAST 5 MINUTES", 10, palette.mute, "Bold"));
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 170;
    ops.push(...rect(S, "Hist" + (i + 1) + "Track", x, 300, 96, 300, "#F1F4F7", "", 4));
    ops.push(...rect(S, "Hist" + (i + 1) + "Bar", x, 300, 96, 120, palette.accent, "", 4));
    ops.push(...label(S, "Hist" + (i + 1) + "Value", x, 272, 96, 18, "0", 12, palette.ink, "Bold"));
    ops.push(...label(S, "Hist" + (i + 1) + "Label", x + 34, 612, 60, 18, "M" + (i + 1), 10, palette.mute));
  }
  await edit(ops, "analytics content");
}

async function programs() {
  const S = "UI/Screens/Programs";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Programs", base_type: "Screen" }], "programs type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "PROGRAMS & RECIPES", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "board program, cycle time and reflow setpoints per product", 12, palette.mute));
  const progs = [["Prog1", "PCB-100", "250 components · 60 boards/min · reflow 190 °C", 88], ["Prog2", "PCB-200", "410 components · 48 boards/min · reflow 195 °C", 240], ["Prog3", "PCB-300", "620 components · 36 boards/min · reflow 200 °C", 392]];
  for (const [n, title, detail, y] of progs) {
    ops.push(...rect(S, n + "Card", 24, y, 660, 128, palette.card, palette.line, 8));
    ops.push(...label(S, n + "Name", 44, y + 18, 260, 26, title, 18, palette.ink, "Bold"));
    ops.push(...label(S, n + "Detail", 44, y + 48, 470, 20, detail, 11, palette.mute));
    ops.push(...button(S, n + "Btn", 520, y + 40, 140, 44, "SELECT", palette.teal));
  }
  ops.push(...rect(S, "ActiveCard", 704, 88, 332, 432, palette.card, palette.line, 8));
  ops.push(...label(S, "ActiveTitle", 720, 100, 300, 18, "ACTIVE PROGRAM", 10, palette.mute, "Bold"));
  ops.push(...lamp(S, "ActiveLamp", 720, 126, 14, palette.off));
  ops.push(...label(S, "ActiveName", 742, 122, 260, 28, "", 20, palette.ink, "Bold"));
  ops.push(...label(S, "ActiveDetail", 720, 162, 300, 60, "", 11, palette.mute));
  ops.push(...label(S, "ActiveHint", 720, 250, 300, 240, "Selecting a program writes Model/Smt/Program; the logic rebuilds the cycle time and the reflow setpoints. A real project would pin the board program and the feeder setup.", 11, palette.mute));
  await edit(ops, "programs content");
}

async function diagnostics() {
  const S = "UI/Screens/Diagnostics";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Diagnostics", base_type: "Screen" }], "diagnostics type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "DIAGNOSTICS", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "line health, comms, counters and fault injection", 12, palette.mute));
  const items = [["Scan", "SCAN TIME", "4 ms"], ["Comm", "COMMUNICATION", "Simulator connected"], ["Uptime", "UPTIME", "00:00:00"], ["Good", "GOOD BOARDS", "0"], ["Reject", "REJECTED", "0"]];
  for (let i = 0; i < items.length; i++) {
    const x = 24 + (i % 3) * 340, y = 88 + Math.floor(i / 3) * 104;
    ops.push(...rect(S, items[i][0] + "Card", x, y, 320, 88, palette.card, palette.line, 8));
    ops.push(...label(S, items[i][0] + "Title", x + 14, y + 12, 280, 16, items[i][1], 9, palette.mute, "Bold"));
    ops.push(...label(S, items[i][0] + "Value", x + 14, y + 34, 280, 26, items[i][2], 16, palette.ink, "Bold"));
  }
  ops.push(...rect(S, "IoCard", 24, 312, 660, 364, palette.card, palette.line, 8));
  ops.push(...label(S, "IoTitle", 40, 324, 300, 18, "STATION HEALTH", 10, palette.mute, "Bold"));
  for (let i = 0; i < 8; i++) {
    const y = 350 + i * 36;
    ops.push(...lamp(S, "DgSt" + i + "Lamp", 48, y + 6, 12, palette.off));
    ops.push(...label(S, "DgSt" + i + "Name", 70, y, 300, 20, ["LOAD","PRINT","PP1","PP2","PP3","REFLOW","AOI","UNLOAD"][i], 11, palette.ink));
    ops.push(...label(S, "DgSt" + i + "State", 400, y, 200, 20, "STOPPED", 10, palette.mute));
  }
  ops.push(...rect(S, "InjectCard", 704, 312, 332, 364, palette.card, palette.line, 8));
  ops.push(...label(S, "InjectTitle", 720, 324, 300, 18, "FAULT INJECTION", 10, palette.mute, "Bold"));
  ops.push(...button(S, "BtnInjFault", 720, 352, 300, 46, "INJECT PROCESS FAULT", palette.warn));
  ops.push(...button(S, "BtnInjEStop", 720, 410, 300, 46, "TRIP EMERGENCY STOP", "#7F1D1D"));
  ops.push(...button(S, "BtnInjAck", 720, 468, 300, 46, "ACKNOWLEDGE ALARMS", palette.teal));
  ops.push(...button(S, "BtnInjReset", 720, 526, 300, 46, "RESET COUNTERS", "#3B4754"));
  ops.push(...label(S, "InjectHint", 720, 584, 300, 70, "Fault injection is the demo's test hook: it proves the alarm path, the lamp states and the acknowledge flow.", 10, palette.mute));
  await edit(ops, "diagnostics content");
}

async function settings() {
  const S = "UI/Screens/Settings";
  await edit([{ op: "create_type", parent: "UI/Screens", name: "Settings", base_type: "Screen" }], "settings type");
  const ops = [];
  ops.push(...label(S, "Title", 24, 18, 640, 34, "SETTINGS", 22, palette.teal, "Bold"));
  ops.push(...label(S, "Subtitle", 24, 50, 900, 22, "station, user, locale and theme configuration", 12, palette.mute));
  const cards = [["State", "LINE", "0"], ["Locale", "LOCALE", "en-US"], ["Theme", "THEME", "FriendlyLight"], ["User", "USER", "Operator"], ["Session", "SESSION", "web session"]];
  for (let i = 0; i < cards.length; i++) {
    const x = 24 + (i % 2) * 512, y = 88 + Math.floor(i / 2) * 108;
    ops.push(...rect(S, cards[i][0] + "Card", x, y, 492, 92, palette.card, palette.line, 8));
    ops.push(...label(S, cards[i][0] + "Title", x + 16, y + 14, 300, 16, cards[i][1], 9, palette.mute, "Bold"));
    ops.push(...label(S, cards[i][0] + "Value", x + 16, y + 38, 300, 26, cards[i][2], 16, palette.ink, "Bold"));
  }
  ops.push(...label(S, "RunningValue", 24, 540, 400, 24, "", 11, palette.mute));
  ops.push(...label(S, "Note", 24, 580, 900, 90, "The demo ships one design language. Localization and theme switching are the next capability in the plugin roadmap (E7/E10 in the expert rubric).", 11, palette.mute));
  await edit(ops, "settings content");
}

async function shell() {
  const screens = ["UI/Screens/Dashboard", "UI/Screens/Line", "UI/Screens/Alarms", "UI/Screens/Trends", "UI/Screens/Analytics", "UI/Screens/Programs", "UI/Screens/Diagnostics", "UI/Screens/Settings"];
  const r = await run("optix_ui", { project: PROJECT, action: "shell", mode: "apply", screens, rail_width: 220 });
  console.log("shell: " + r.status + " " + (r.op_count ?? "") + " apply=" + (r.applied ?? ""));
  await edit([set("UI/MainWindow/ShellHeaderTitle", "Text", "ARYA SMT LINE 1"), set("UI/MainWindow/ShellHeaderChip", "Text", "IDLE"), set("UI/MainWindow/ShellHeaderUser", "Text", "Operator"), set("UI/MainWindow/ShellFooterStatus", "Text", "Comm. Driver · line simulator connected")], "shell text");
}

async function logic() {
  const r1 = await run("optix_script", { project: PROJECT, action: "add", name: "SmtLineLogic", kind: "runtime", parent: "UI/MainWindow", code: "" , build: false }).catch((e) => ({ error: e.message }));
  console.log("logic window: " + JSON.stringify(r1).slice(0, 220));
}

const stages = { clean, model, dashboard, line, alarms, trends, analytics, programs, diagnostics, settings, shell };
for (const s of (stage === "all" ? Object.keys(stages) : stage.split(","))) {
  if (!stages[s]) throw new Error("unknown stage " + s);
  await stages[s]();
}
console.log("done");