#!/usr/bin/env node
/**
 * Regenerate the packaged starters' manifests.
 *
 * A starter is a project tree plus a manifest that describes it: every file with its size, its
 * SHA-256 and whether it is text, then a `contentHash` over the whole list. `optix_template` reads
 * the manifest before anything is copied, so a manifest that no longer matches the tree describes a
 * starter that no longer exists.
 *
 * Usage:
 *   node scripts/gen-optix-template.mjs           rewrite every starter manifest
 *   node scripts/gen-optix-template.mjs --check   exit 1 when a manifest is stale, write nothing
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ROOT = new URL("../packages/optix/templates/", import.meta.url);
const check = process.argv.includes("--check");

/** @param {Buffer} buffer - File bytes. */
function isText(buffer) {
	if (buffer.includes(0)) return false;
	return !buffer.toString("utf8").includes("\uFFFD");
}

/** @param {string} templateRoot - Starter folder. */
async function describe(templateRoot) {
	const project = join(templateRoot, "project");
	/** @type {{path: string, size: number, sha256: string, text: boolean}[]} */
	const files = [];
	async function walk(dir) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			const data = await readFile(full);
			files.push({
				path: relative(project, full).split(sep).join("/"),
				size: data.length,
				sha256: createHash("sha256").update(data).digest("hex"),
				text: isText(data)
			});
		}
	}
	await walk(project);
	files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
	const contentHash = createHash("sha256")
		.update(files.map(file => `${file.path}\n${file.sha256}\n`).join(""))
		.digest("hex");
	return { files, contentHash, fileCount: files.length, totalBytes: files.reduce((total, file) => total + file.size, 0) };
}

const entries = await readdir(ROOT, { withFileTypes: true });
let stale = 0;
for (const entry of entries) {
	if (!entry.isDirectory()) continue;
	const templateRoot = join(ROOT.pathname.replace(/^\/(?=[A-Za-z]:)/u, ""), entry.name);
	const manifestPath = join(templateRoot, "manifest.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	const described = await describe(templateRoot);
	const sameFiles = JSON.stringify(manifest.files) === JSON.stringify(described.files);
	const sameTotals = manifest.fileCount === described.fileCount
		&& manifest.totalBytes === described.totalBytes
		&& manifest.contentHash === described.contentHash;
	if (sameFiles && sameTotals) {
		console.log(`${entry.name}: up to date (${described.fileCount} files, ${described.totalBytes} bytes)`);
		continue;
	}
	stale += 1;
	if (check) {
		console.error(`${entry.name}: manifest is stale (${manifest.fileCount} -> ${described.fileCount} files, ${manifest.totalBytes} -> ${described.totalBytes} bytes)`);
		continue;
	}
	const next = { ...manifest, ...described };
	await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	console.log(`${entry.name}: rewritten (${described.fileCount} files, ${described.totalBytes} bytes, ${described.contentHash.slice(0, 12)})`);
}
if (check && stale > 0) process.exit(1);
