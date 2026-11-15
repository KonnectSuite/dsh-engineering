import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ASSET_DIR, ICON_BOX, assetNames, assetPath, iconSvg, mimicSvg, removeAsset, shellIcons, writeAssets } from "../packages/optix/lib/assets.js";

const clean = (root) => rm(root, { recursive: true, force: true });

test("every icon is SVG 1.2 Tiny, in a 24px box, with hex fills and no currentColor left", () => {
	const files = assetNames();
	assert.ok(files.includes("home.svg"));
	assert.ok(files.includes("conveyor.svg"));
	for (const file of files.filter((name) => !name.startsWith("conveyor") && !name.startsWith("tank"))) {
		const svg = iconSvg(file.replace(/\.svg$/u, ""), { colour: "#0FAFFF" });
		assert.match(svg, /version="1\.2"/u);
		assert.match(svg, /baseProfile="tiny"/u);
		assert.match(svg, /viewBox="0 0 24 24"/u);
		assert.equal(svg.includes("currentColor"), false, `${file} still carries currentColor`);
		for (const colour of svg.matchAll(/(?:fill|stroke)="([^"]+)"/gu)) {
			if (colour[1] === "none") continue;
			assert.match(colour[1], /^#[0-9A-Fa-f]{3,8}$/u, `${file} has a paint that is not hex: ${colour[1]}`);
		}
	}
	assert.equal(ICON_BOX, 24);
});

test("iconSvg substitutes the theme colour and refuses a colour that is not #RRGGBB", () => {
	const svg = iconSvg("alarms", { colour: "#E5484D" });
	assert.ok(svg.includes("#E5484D"));
	assert.throws(() => iconSvg("alarms", { colour: "red" }), (error) => error.message.startsWith("asset_bad_colour:"));
	assert.throws(() => iconSvg("nope"), (error) => error.message.includes("asset_unknown"));
	assert.equal(shellIcons().includes("home"), true);
	assert.equal(assetPath("home"), "%PROJECTDIR%/imgs/home.svg");
	assert.equal(assetPath("home.svg"), "%PROJECTDIR%/imgs/home.svg");
});

test("the process drawings carry ids so optix_svg can drive a part", () => {
	const conveyor = mimicSvg("conveyor");
	for (const id of ["Frame", "Belt", "Roller1", "Workpiece", "Stack"]) assert.ok(conveyor.includes(`id="${id}"`), `conveyor has no ${id}`);
	const tank = mimicSvg("tank");
	for (const id of ["Tank", "Level", "Valve"]) assert.ok(tank.includes(`id="${id}"`), `tank has no ${id}`);
	assert.throws(() => mimicSvg("rocket"), (error) => error.message.includes("asset_unknown"));
});

test("writeAssets writes under ProjectFiles/imgs and a dry run writes nothing", async () => {
	const root = await mkdtemp(join(tmpdir(), "dsh-assets-"));
	try {
		const dry = await writeAssets(root, { dryRun: true, only: ["home", "alarms"] });
		assert.equal(dry.count, 2);
		assert.equal(dry.written, 0);
		await assert.rejects(stat(join(root, ASSET_DIR)), (error) => error.code === "ENOENT");
		const written = await writeAssets(root, { only: ["home"], colour: "#0B3E5C" });
		assert.equal(written.written, 1);
		assert.equal(written.dir_relative, ASSET_DIR);
		const text = await readFile(join(root, ASSET_DIR, "home.svg"), "utf8");
		assert.ok(text.includes("#0B3E5C"));
		const removed = await removeAsset(root, "home.svg");
		assert.equal(removed.removed, join(ASSET_DIR, "home.svg"));
		await assert.rejects(stat(join(root, ASSET_DIR, "home.svg")), (error) => error.code === "ENOENT");
	} finally {
		await clean(root);
	}
});

test("writeAssets keeps the whole set in one folder when asked for everything", async () => {
	const root = await mkdtemp(join(tmpdir(), "dsh-assets-all-"));
	try {
		const written = await writeAssets(root);
		assert.equal(written.count, assetNames().length);
		assert.equal(written.files.length, written.count);
		assert.ok(written.files.every((file) => file.startsWith(ASSET_DIR)));
	} finally {
		await clean(root);
	}
});
