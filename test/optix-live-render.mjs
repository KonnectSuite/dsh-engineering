/**
 * Runtime proof for the designed application: open the served page, read its text, click the rail tabs,
 * and screenshot each screen. Direct playwright, because `optix_preview` waits on its own browser tab.
 *
 *   node test/optix-live-render.mjs
 */

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const URL = process.env.OPTIX_PREVIEW_URL || "http://127.0.0.1:8081/";
const OUT = join(process.env.TEMP || root, "optix-live-shots");
const WIDTH = Number(process.env.OPTIX_CANVAS_WIDTH || 1280);
const HEIGHT = Number(process.env.OPTIX_CANVAS_HEIGHT || 800);

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
await page.goto(URL, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500);

const text = async () => ((await page.evaluate(() => document.body?.innerText ?? "")).split("\n").map((line) => line.trim()).filter(Boolean));

const first = await text();
console.log("initial:", first.slice(0, 6).join(" | "));
await page.screenshot({ path: join(OUT, "01-overview.png") });

// The rail is (0,64)-(220,770); tabs are 44 px tall in order Overview, Alarms, Diagnostics.
const tabs = [
	{ label: "Alarms", y: 130 },
	{ label: "Diagnostics", y: 174 },
	{ label: "Overview", y: 86 }
];
let proven = 0;
for (const [index, tab] of tabs.entries()) {
	await page.mouse.click(110, tab.y);
	await page.waitForTimeout(900);
	const lines = await text();
	const heading = lines[0] ?? "";
	const ok = heading.toUpperCase().includes(tab.label.toUpperCase());
	console.log(`click ${tab.label} at y=${tab.y} -> heading "${heading}" ${ok ? "OK" : "MISS"}`);
	if (ok) proven += 1;
	await page.screenshot({ path: join(OUT, `0${index + 2}-${tab.label.toLowerCase()}.png`) });
}

// The confirm dialog: the Reset button lives at the bottom of the Alarms screen's card area.
await page.mouse.click(110, 130);
await page.waitForTimeout(700);
const buttons = await page.evaluate(() =>
	Array.from(document.querySelectorAll("[class]"))
		.filter((element) => (element.textContent ?? "").trim() === "Reset the line")
		.slice(0, 1)
		.map((element) => {
			const box = element.getBoundingClientRect();
			return { x: box.left + box.width / 2, y: box.top + box.height / 2, tag: element.tagName };
		})
);
console.log("reset button:", JSON.stringify(buttons));

await browser.close();
console.log(`rendered ${tabs.length} screens, ${proven} clicked tabs proved, shots in ${OUT}`);
if (proven < 2) process.exitCode = 1;
