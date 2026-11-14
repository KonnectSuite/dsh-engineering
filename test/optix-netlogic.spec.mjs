import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	MARKER,
	NETLOGIC_RULES,
	TEMPLATES,
	buildNetSolution,
	checkName,
	findCsproj,
	findProjectRoot,
	netSolutionDir,
	parseClass,
	readNetLogic,
	removeNetLogicFile,
	reviewNetLogic,
	templateCode,
	writeNetLogic
} from "../packages/optix/lib/netlogic.js";

const plugin = readFileSync(new URL("../packages/optix/lib/index.js", import.meta.url), "utf8");

/** A throwaway project root with the two files the NetLogic tools read. */
async function scratch() {
	const root = await mkdtemp(join(tmpdir(), "optix-netlogic-"));
	const netSolution = join(root, "ProjectFiles", "NetSolution");
	await rm(netSolution, { recursive: true, force: true });
	await writeFile(join(root, "Demo.optix"), "Name: Demo\nNodes:\n- File: Nodes/UI/UI.yaml\n");
	await (await import("node:fs/promises")).mkdir(netSolution, { recursive: true });
	await writeFile(join(netSolution, "Demo.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk\"></Project>");
	return root;
}

test("a design template is a BaseNetLogic class with one exported method and the marker comment", () => {
	const code = templateCode({ name: "ProjectInfo", kind: "design", template: "blank" });
	assert.equal(code.split("\n")[0].startsWith(MARKER), true);
	assert.match(code, /public class ProjectInfo : BaseNetLogic/u);
	assert.match(code, /\[ExportMethod\]/u);
	assert.match(code, /public void Ping\(\)/u);
	assert.doesNotMatch(code, /PeriodicTask/u);
});

test("a runtime periodic template owns a PeriodicTask and stops it", () => {
	const code = templateCode({ name: "LineClock", kind: "runtime", template: "periodic" });
	assert.match(code, /public class LineClock : BaseNetLogic/u);
	assert.match(code, /new PeriodicTask\(Tick, 1000, LogicObject\)/u);
	assert.match(code, /task\.Start\(\)/u);
	assert.match(code, /task\.Dispose\(\)/u);
	assert.match(code, /using FTOptix\.HMIProject;/u);
	assert.doesNotMatch(code, /\[ExportMethod\]/u);
});

test("a runtime blank template has Start and Stop and no schedule", () => {
	const code = templateCode({ name: "Latch", kind: "runtime", template: "blank" });
	assert.match(code, /public override void Start\(\)/u);
	assert.match(code, /public override void Stop\(\)/u);
	assert.doesNotMatch(code, /PeriodicTask/u);
});

test("parseClass reads the class, the base type and the exported methods", () => {
	const parsed = parseClass(templateCode({ name: "ProjectInfo", kind: "design", template: "blank" }));
	assert.equal(parsed.className, "ProjectInfo");
	assert.equal(parsed.baseClass, "BaseNetLogic");
	assert.equal(parsed.kind, "design");
	assert.equal(parsed.hasStart, false);
	assert.deepEqual(parsed.exportMethods, ["Ping"]);
	assert.ok(parsed.lines > 5);
});

test("a class name has to be a C# identifier", () => {
	assert.equal(checkName("LineSimulator"), "LineSimulator");
	for (const bad of ["1Line", "line-sim", "", "a b", "x".repeat(65)]) {
		assert.throws(() => checkName(bad), /class name/u);
	}
});

test("the root carries the project file and the NetSolution folder the class lives in", async () => {
	const root = await scratch();
	try {
		const resolved = await findProjectRoot("Demo", root);
		assert.equal(resolved.root, root);
		assert.equal(resolved.optixFile, join(root, "Demo.optix"));
		assert.equal(netSolutionDir(root), join(root, "ProjectFiles", "NetSolution"));
		assert.equal(await findCsproj(root), join(root, "ProjectFiles", "NetSolution", "Demo.csproj"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("writing a class refuses empty code and a class name that is not the node name", async () => {
	const root = await scratch();
	try {
		await assert.rejects(() => writeNetLogic(root, "Probe", "   "), /code is empty/u);
		await assert.rejects(
			() => writeNetLogic(root, "Probe", templateCode({ name: "Other", kind: "design", template: "blank" })),
			/must match/u
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("a write is guarded by the hash the caller read, so a concurrent edit is not lost", async () => {
	const root = await scratch();
	try {
		const first = await writeNetLogic(root, "Probe", templateCode({ name: "Probe", kind: "design", template: "blank" }));
		await assert.rejects(
			() => writeNetLogic(root, "Probe", templateCode({ name: "Probe", kind: "design", template: "blank" }), { expectSha256: "0".repeat(64) }),
			/sha256|changed|hash/u
		);
		const read = await readNetLogic(root, "Probe");
		assert.equal(read.sha256, first.sha256);
		assert.equal(read.className, "Probe");
		const second = await writeNetLogic(root, "Probe", `${read.code}\n// touched\n`, { expectSha256: first.sha256 });
		assert.notEqual(second.sha256, first.sha256);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("removing a class that is already gone reports that it removed nothing", async () => {
	const root = await scratch();
	try {
		const missing = await removeNetLogicFile(root, "NeverThere");
		assert.equal(missing.removed, false);
		assert.match(missing.file, /NeverThere\.cs$/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the build reports a project path even when it cannot compile", async () => {
	const root = await scratch();
	try {
		const result = await buildNetSolution(root, { timeoutMs: 120_000 });
		assert.equal(typeof result.project, "string");
		assert.equal(typeof result.ok, "boolean");
		assert.ok(Array.isArray(result.errors));
		assert.ok(Array.isArray(result.warnings));
		assert.equal(typeof result.locked, "boolean");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("the tool exposes list read add edit delete build and run, and gates the writes", () => {
	assert.match(plugin, /name: "optix_script"/u);
	for (const action of ["list", "read", "add", "edit", "delete", "build", "run"]) {
		assert.match(plugin, new RegExp(`"${action}"`, "u"));
	}
	assert.match(plugin, /if \(action === "add" \|\| action === "edit" \|\| action === "delete"\) allowWrite\(true\);/u);
	assert.match(plugin, /action === "run" && settings\.allowInvoke !== true/u);
	assert.match(plugin, /not written by this tool \(no marker comment\)/u);
	assert.match(plugin, /lives inside an imported library composite/u);
	assert.match(plugin, /import \{[^}]*findNetLogicNode[^}]*\} from "\.\/netlogic\.js";/u);
});

test("a class that Studio has not loaded is reported as such, not as a broken method", () => {
	assert.match(plugin, /status: "not-loaded"/u);
	assert.match(plugin, /loaded NetLogic assembly predates it/u);
});

test("an observer template subscribes in Start and unsubscribes in Stop", () => {
	const code = templateCode({ name: "Watcher", kind: "runtime", template: "observer" });
	assert.match(code, /watched\.VariableChange \+= OnValueChange;/u);
	assert.match(code, /watched\.VariableChange -= OnValueChange;/u);
	assert.match(code, /private void OnValueChange\(object sender, VariableChangeEventArgs e\)/u);
	assert.match(code, /try\s*\{/u);
	assert.doesNotMatch(code, /PeriodicTask/u);
});

test("a template has to be one this tool knows, and a design class cannot start background work", () => {
	assert.deepEqual(TEMPLATES, ["blank", "periodic", "observer"]);
	assert.throws(() => templateCode({ name: "Probe", kind: "runtime", template: "timers" }), /template must be one of/u);
	assert.throws(() => templateCode({ name: "Probe", kind: "design", template: "periodic" }), /design-time NetLogic/u);
	assert.throws(() => templateCode({ name: "Probe", kind: "design", template: "observer" }), /design-time NetLogic/u);
});

test("the safe periodic template passes the review", () => {
	const review = reviewNetLogic(templateCode({ name: "LineClock", kind: "runtime", template: "periodic" }), { name: "LineClock", kind: "runtime" });
	assert.equal(review.verdict, "clean");
	assert.equal(review.counts.critical, 0);
	assert.equal(review.counts.warning, 0);
	assert.deepEqual(review.findings.map((finding) => finding.rule), ["OPTIX-NL-12"]);
	assert.match(review.findings[0].fix, /constant|LogicObject|Owner/u);
});

test("the review names every practice the runtime punishes", () => {
	const code = `using System;
using FTOptix.NetLogic;
using UAManagedCore;
public class BadLogic : BaseNetLogic
{
    private PeriodicTask task;
    public override void Start()
    {
        task = new PeriodicTask(Tick, 500, LogicObject);
        task.Start();
    }
    private void Tick()
    {
        Thread.Sleep(100);
        var v = Project.Current.GetVariable("Model/x");
        v.Value = 1;
    }
    private void OnChange(object s, VariableChangeEventArgs e) { try { } catch { } }
    public void Subscribe() { Project.Current.GetVariable("Model/x").VariableChange += OnChange; }
}
`;
	const review = reviewNetLogic(code, { name: "WrongName", kind: "runtime" });
	assert.equal(review.verdict, "block");
	assert.equal(review.counts.critical, 3);
	assert.equal(review.counts.warning, 4);
	const rules = review.findings.map((finding) => finding.rule);
	for (const rule of ["OPTIX-NL-03", "OPTIX-NL-04", "OPTIX-NL-05", "OPTIX-NL-06", "OPTIX-NL-07", "OPTIX-NL-08", "OPTIX-NL-10", "OPTIX-NL-11", "OPTIX-NL-12"]) {
		assert.ok(rules.includes(rule), `${rule} should fire`);
	}
	for (const finding of review.findings) {
		assert.equal(typeof finding.line, "number");
		assert.ok(finding.line >= 1);
		assert.match(finding.fix, /\w/u);
		assert.match(finding.source, /^[a-z-]+$/u);
	}
});

test("a warning alone is review, not block, and a design class is judged by its own rules", () => {
	const code = `using System;
using UAManagedCore;
using FTOptix.NetLogic;
public class Ticker : BaseNetLogic
{
    private PeriodicTask task;
    public override void Start()
    {
        Log.Info("Ticker", "starting");
        task = new PeriodicTask(Tick, 1000, LogicObject);
        task.Start();
    }
    public override void Stop()
    {
        if (task != null) { task.Dispose(); task = null; }
    }
    private void Tick()
    {
        Log.Info("Ticker", "tick");
    }
}
`;
	const review = reviewNetLogic(code, { name: "Ticker", kind: "runtime" });
	assert.equal(review.verdict, "review");
	assert.deepEqual(review.findings.map((finding) => finding.rule), ["OPTIX-NL-04"]);
	const design = reviewNetLogic(
		`using System;
using UAManagedCore;
using FTOptix.NetLogic;
public class Helper : BaseNetLogic
{
    [ExportMethod]
    public void Run()
    {
        var task = new System.Threading.Tasks.Task(() => Log.Info("Helper", "ran"));
        task.Start();
    }
}
`,
		{ name: "Helper", kind: "design" }
	);
	assert.ok(design.findings.some((finding) => finding.rule === "OPTIX-NL-09"));
});

test("every review rule names its severity, fix and cheat-sheet page", () => {
	const ids = Object.keys(NETLOGIC_RULES);
	assert.equal(ids.length, 10);
	for (const id of ids) {
		assert.match(id, /^OPTIX-NL-\d{2}$/u);
		const rule = NETLOGIC_RULES[id];
		assert.ok(["critical", "warning", "info"].includes(rule.severity), `${id} severity`);
		assert.match(rule.title, /\w/u);
		assert.match(rule.fix, /\w/u);
		assert.match(rule.source, /^[a-z][a-z-]+$/u);
	}
});

test("the tool reviews code on the write path, and refuses a block unless forced", () => {
	assert.match(plugin, /"list", "read", "review", "add", "edit", "delete", "build", "run"/u);
	assert.match(plugin, /reviewNetLogic\(/u);
	assert.match(plugin, /refusing \$\{wanted\} - the review rates this code block/u);
	assert.match(plugin, /pass force:true to write it anyway/u);
	assert.match(plugin, /args\.lint === false \? void 0 : reviewNetLogic/u);
	assert.match(plugin, /if \(action === "review"\)/u);
	assert.match(plugin, /TEMPLATES\.includes\(template\)/u);
});
