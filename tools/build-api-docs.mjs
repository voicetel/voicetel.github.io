import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, mkdir } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPECS_DIR = resolve(ROOT, "vendor/api-specs");
const OUT_DIR = resolve(ROOT, "_site/docs/api");

const specs = (await readdir(SPECS_DIR)).filter((f) => f.endsWith(".json")).sort();

if (specs.length === 0) {
	console.error("No specs found in", SPECS_DIR);
	process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

console.log(`Building ${specs.length} API doc pages from ${SPECS_DIR}`);

for (const spec of specs) {
	const name = basename(spec, ".json");
	const pageDir = resolve(OUT_DIR, name);
	await mkdir(pageDir, { recursive: true });
	const outFile = resolve(pageDir, "index.html");
	const specPath = resolve(SPECS_DIR, spec);

	process.stdout.write(`  ${name} `);
	const start = Date.now();
	try {
		await exec("npx", [
			"--no-install",
			"redocly",
			"build-docs",
			specPath,
			"--output",
			outFile,
		]);
		console.log(`(${Date.now() - start}ms)`);
	} catch (err) {
		console.log("FAILED");
		console.error(err.stderr || err.stdout || err.message);
		process.exit(1);
	}
}

console.log(`\nDone. Output at ${OUT_DIR}`);
