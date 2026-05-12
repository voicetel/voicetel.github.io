import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPECS_DIR = resolve(ROOT, "vendor/api-specs");
const OUT_DIR = resolve(ROOT, "_site/docs/api");

function majorMinor(version) {
	const m = String(version || "")
		.replace(/^v/i, "")
		.match(/^(\d+)\.(\d+)/);
	return m ? `v${m[1]}.${m[2]}` : null;
}

const specs = (await readdir(SPECS_DIR)).filter((f) => f.endsWith(".json")).sort();

if (specs.length === 0) {
	console.error("No specs found in", SPECS_DIR);
	process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`Building ${specs.length} API doc pages from ${SPECS_DIR}`);

for (const spec of specs) {
	const name = basename(spec, ".json");
	const specPath = resolve(SPECS_DIR, spec);
	const parsed = JSON.parse(await readFile(specPath, "utf8"));
	const mm = majorMinor(parsed.info?.version);
	if (!mm) {
		console.log(
			`  ${name} FAILED: cannot derive majorMinor from version "${parsed.info?.version}"`
		);
		process.exit(1);
	}
	// Consolidated release spec (filename matches major.minor) renders at
	// /docs/api/{mm}/index.html with no name subdirectory.
	const pageDir = name === mm ? resolve(OUT_DIR, mm) : resolve(OUT_DIR, mm, name);
	await mkdir(pageDir, { recursive: true });
	const outFile = resolve(pageDir, "index.html");

	process.stdout.write(`  ${name === mm ? mm : `${mm}/${name}`} `);
	const start = Date.now();
	try {
		await exec("npx", ["--no-install", "redocly", "build-docs", specPath, "--output", outFile]);
		console.log(`(${Date.now() - start}ms)`);
	} catch (err) {
		console.log("FAILED");
		console.error(err.stderr || err.stdout || err.message);
		process.exit(1);
	}
}

console.log(`\nDone. Output at ${OUT_DIR}`);
