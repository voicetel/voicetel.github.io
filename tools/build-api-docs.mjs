import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPECS_DIR = resolve(ROOT, "vendor/api-specs");
const OUT_DIR = resolve(ROOT, "_site/docs/api");
const SITE_URL = "https://voicetel.com";
const SITE_BRAND = "VoiceTel";
const OG_IMAGE = `${SITE_URL}/assets/img/og-default.png`;

function escapeAttr(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function injectSeoMeta(html, { title, description, canonicalUrl }) {
	const t = escapeAttr(title);
	const d = escapeAttr(description);
	const u = escapeAttr(canonicalUrl);
	const tags = [
		`<meta name="description" content="${d}">`,
		`<link rel="canonical" href="${u}">`,
		`<meta property="og:title" content="${t}">`,
		`<meta property="og:description" content="${d}">`,
		`<meta property="og:url" content="${u}">`,
		`<meta property="og:image" content="${OG_IMAGE}">`,
		`<meta property="og:image:width" content="1200">`,
		`<meta property="og:image:height" content="630">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:site_name" content="${SITE_BRAND}">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${t}">`,
		`<meta name="twitter:description" content="${d}">`,
		`<meta name="twitter:image" content="${OG_IMAGE}">`,
	].join("\n  ");
	return html.replace("</title>", `</title>\n  ${tags}`);
}

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
		const isConsolidated = name === mm;
		const urlPath = isConsolidated ? `/docs/api/${mm}/` : `/docs/api/${mm}/${name}/`;
		const title = `${parsed.info?.title || name} — ${SITE_BRAND}`;
		const description = (
			parsed.info?.description ||
			`${parsed.info?.title || name} reference for the VoiceTel REST API.`
		)
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 280);
		const html = await readFile(outFile, "utf8");
		const patched = injectSeoMeta(html, {
			title,
			description,
			canonicalUrl: `${SITE_URL}${urlPath}`,
		});
		await writeFile(outFile, patched);
		console.log(`(${Date.now() - start}ms)`);
	} catch (err) {
		console.log("FAILED");
		console.error(err.stderr || err.stdout || err.message);
		process.exit(1);
	}
}

console.log(`\nDone. Output at ${OUT_DIR}`);
