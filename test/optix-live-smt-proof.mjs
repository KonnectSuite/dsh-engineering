/**
 * Drive the running ARYA-SMT-1 demo and capture the proof: eight screens, live values,
 * the operator commands, the two dialogs. Manual: needs the built project served on 8081.
 */
import { chromium } from "playwright-core";
import { mount } from "./optix-live-scope.mjs";
import { mkdirSync } from "node:fs";

const PROJECT_ROOT = process.env.OPTIX_PROJECT_ROOT ?? `${process.env.USERPROFILE}\\Desktop\\myWorkspaces\\Optix Demo\\AryaOptixTemplate`;
const SHOTS = `${process.env.TEMP}\\optix-smt-shots`;
mkdirSync(SHOTS, { recursive: true });

const h = await mount();
const emulator = await h.run("optix_emulator", { action: "restart", project: PROJECT_ROOT });
console.log("serving", emulator.started?.serving ?? emulator.serving, "pid", emulator.started?.pid ?? emulator.pid);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
await page.goto("http://127.0.0.1:8081/");
await page.waitForTimeout(3000);

const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
const shot = async (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
async function clickText(label, exact = true) {
  const point = await page.evaluate(({ label, exact }) => {
    const nodes = [...document.querySelectorAll("div,span,button,input,label")];
    const hits = nodes.filter((n) => {
      const t = (n.innerText ?? n.value ?? "").trim();
      return exact ? t === label : t.includes(label);
    });
    const target = hits.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height)[0];
    if (!target) return null;
    const r = target.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: target.tagName };
  }, { label, exact });
  if (!point) { console.log("no element for", label); return false; }
  await page.mouse.click(point.x, point.y);
  return true;
}

console.log("dashboard:", (await text()).slice(0, 300));
await shot("01-dashboard");

const tabs = ["Dashboard", "Line", "Alarms", "Trends", "Analytics", "Programs", "Diagnostics", "Settings"];
for (const [i, tab] of tabs.entries()) {
  await clickText(tab);
  await page.waitForTimeout(700);
  console.log(tab + ":", (await text()).slice(0, 200));
  await shot(String(i + 1).padStart(2, "0") + "-" + tab.toLowerCase());
}

// Line screen: run the machine
await clickText("START LINE");
await page.waitForTimeout(1500);
const running = await text();
console.log("after START:", running.slice(0, 240));
await shot("10-line-running");
await clickText("STOP LINE");
await page.waitForTimeout(1200);
console.log("after STOP:", (await text()).slice(0, 200));

// Alarms screen: inject a fault and acknowledge
await clickText("Alarms");
await page.waitForTimeout(700);
await clickText("SIMULATE FAULT");
await page.waitForTimeout(1500);
console.log("alarms after fault:", (await text()).slice(0, 320));
await shot("11-alarms-faulted");
await clickText("ACKNOWLEDGE ALL");
await page.waitForTimeout(1200);
console.log("after ack:", (await text()).slice(0, 280));
await shot("12-alarms-acked");

// Reset counters dialog: open, cancel, open, confirm
await clickText("Line");
await page.waitForTimeout(600);
await clickText("RESET COUNTERS");
await page.waitForTimeout(900);
const dialogText = await text();
console.log("dialog:", dialogText.slice(0, 300));
await shot("13-reset-dialog");
await clickText("KEEP RUNNING");
await page.waitForTimeout(900);
console.log("after cancel:", (await text()).slice(0, 200));
await clickText("RESET COUNTERS");
await page.waitForTimeout(900);
await clickText("RESET COUNTERS");
await page.waitForTimeout(1400);
console.log("after confirm:", (await text()).slice(0, 260));
await shot("14-reset-confirmed");

// Emergency stop dialog
await clickText("EMERGENCY STOP");
await page.waitForTimeout(900);
console.log("estop dialog:", (await text()).slice(0, 260));
await shot("15-estop-dialog");
await clickText("CANCEL");
await page.waitForTimeout(700);
console.log("estop cancelled:", (await text()).slice(0, 180));

// programs
await clickText("Programs");
await page.waitForTimeout(700);
await clickText("PCB-200", false);
await page.waitForTimeout(1200);
console.log("programs:", (await text()).slice(0, 280));
await shot("16-programs");

console.log("page errors:", errors.slice(0, 4).join(" | ") || "none");
await browser.close();
await h.dispose?.();