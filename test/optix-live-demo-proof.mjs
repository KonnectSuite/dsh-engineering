/**
 * Drive the running demo and capture the proof: rail switching, live values, a command,
 * the dialog and the alarm state. Manual: needs the built project served on 8081.
 */
import { chromium } from "playwright-core";
import { mount } from "./optix-live-scope.mjs";

const PROJECT_ROOT = process.env.OPTIX_PROJECT_ROOT ?? `${process.env.USERPROFILE}\\Desktop\\myWorkspaces\\Optix Demo\\AryaOptixTemplate`;
const SHOTS = `${process.env.TEMP}\\optix-demo-shots`;
import { mkdirSync } from "node:fs";
mkdirSync(SHOTS, { recursive: true });

const h = await mount();
const emulator = await h.run("optix_emulator", { action: "restart", project: PROJECT_ROOT });
console.log("serving", emulator.started?.serving ?? emulator.serving, "pid", emulator.started?.pid ?? emulator.pid);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
await page.goto("http://127.0.0.1:8081/");
await page.waitForTimeout(2600);

const text = async () => (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
const shot = async (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

console.log("overview:", (await text()).slice(0, 260));
await shot("01-overview");

// rail tabs: 220 px strip, 44 px rows starting at y=64
const tabs = { Overview: 86, Line: 130, Alarms: 174, Recipes: 218 };
await page.mouse.click(110, tabs.Line);
await page.waitForTimeout(900);
console.log("line:", (await text()).slice(0, 300));
await shot("02-line");

// START on the Line screen: ControlCard (24,356) + button (16,40) 228x56, screen origin (220,64)
await page.mouse.click(374, 488);
await page.waitForTimeout(1800);
console.log("after start:", (await text()).slice(0, 340));
await shot("03-line-running");

await page.mouse.click(110, tabs.Overview);
await page.waitForTimeout(1200);
console.log("overview running:", (await text()).slice(0, 340));
await shot("04-overview-running");

// alarms tab, inject a jam, acknowledge
await page.mouse.click(110, tabs.Alarms);
await page.waitForTimeout(800);
await shot("05-alarms-idle");
console.log("alarms:", (await text()).slice(0, 340));

await page.mouse.click(110, tabs.Recipes);
await page.waitForTimeout(800);
await shot("06-recipes");
console.log("recipes:", (await text()).slice(0, 300));

console.log("page errors:", errors.slice(0, 3).join(" | ") || "none");
await browser.close();
await h.dispose?.();
