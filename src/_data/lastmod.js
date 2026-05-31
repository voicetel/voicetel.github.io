import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SRC = resolve(__dirname, "..");
const INCLUDES = resolve(SRC, "_includes");
const DATA_DIR = resolve(SRC, "_data");

// Files under _includes/ whose edits are presentational chrome, not content.
// Excluded from each page's dependency set so a base.njk or nav.njk edit
// does not bump every URL's <lastmod>.
const CHROME_PREFIXES = ["layouts/", "icons/", "partials/nav.njk", "partials/footer.njk"];

// Data files that carry cross-cutting chrome (URLs, nav config, social,
// footer copy). Almost every page references at least one site.* token, so
// auto-detecting site.json as a dep would bump every URL whenever any
// chrome field changes. Content-bearing fields (e.g. site.menuCarousel)
// are only consumed through partials with their own commit history, so
// excluding site.json here loses no real signal.
const CHROME_DATA = new Set(["site"]);

const TEMPLATE_EXT = /\.(njk|md|11ty\.js|html)$/;
const INCLUDE_RE = /\{%-?\s*(?:extends|include|import|from)\s+["']([^"']+)["']/g;

function isChrome(absPath) {
	const rel = relative(INCLUDES, absPath);
	if (rel.startsWith("..")) return false;
	return CHROME_PREFIXES.some((p) => rel === p || rel.startsWith(p));
}

function walkIncludes(absPath, seen = new Set()) {
	if (seen.has(absPath)) return seen;
	seen.add(absPath);
	let body;
	try {
		body = readFileSync(absPath, "utf8");
	} catch {
		return seen;
	}
	INCLUDE_RE.lastIndex = 0;
	let m;
	while ((m = INCLUDE_RE.exec(body))) {
		const target = resolve(INCLUDES, m[1]);
		if (isChrome(target)) continue;
		walkIncludes(target, seen);
	}
	return seen;
}

function dataFileForName(name) {
	for (const ext of [".json", ".js"]) {
		const p = resolve(DATA_DIR, name + ext);
		try {
			statSync(p);
			return p;
		} catch {
			// not present, try next ext
		}
	}
	return null;
}

// Extract just the Nunjucks expression blocks from a template body so that
// data-file basenames mentioned in plain prose (e.g. "Customers are…" in
// legal copy, "Pricing varies…" in a sales page) don't false-positive as
// references to customers.json or pricing.json.
function nunjucksExpressions(body) {
	const out = [];
	const re = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;
	let m;
	while ((m = re.exec(body))) out.push(m[0]);
	return out.join("\n");
}

function collectDataDeps(files) {
	const names = readdirSync(DATA_DIR)
		.filter((f) => /\.(json|js)$/.test(f))
		.map((f) => f.replace(/\.(json|js)$/, ""))
		.filter((n) => !CHROME_DATA.has(n) && n !== "lastmod" && n !== "datepublished");
	const referenced = new Set();
	for (const f of files) {
		let body;
		try {
			body = readFileSync(f, "utf8");
		} catch {
			continue;
		}
		const expressions = nunjucksExpressions(body);
		for (const name of names) {
			if (referenced.has(name)) continue;
			if (new RegExp(`\\b${name}\\b`).test(expressions)) referenced.add(name);
		}
	}
	const out = [];
	for (const name of referenced) {
		const p = dataFileForName(name);
		if (p) out.push(p);
	}
	return out;
}

function listPageFiles(dir, out = []) {
	const SKIP = new Set([
		resolve(SRC, "_includes"),
		resolve(SRC, "_data"),
		resolve(SRC, "assets"),
		resolve(SRC, ".well-known"),
	]);
	if (SKIP.has(dir)) return out;
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) listPageFiles(full, out);
		else if (TEMPLATE_EXT.test(entry.name)) out.push(full);
	}
	return out;
}

function buildGitFileTimeMap() {
	const map = new Map();
	const SENTINEL = "COMMIT:";
	let raw;
	try {
		raw = execSync(`git log --format=${SENTINEL}%cI --name-only --diff-filter=AMR`, {
			cwd: REPO_ROOT,
			encoding: "utf8",
			maxBuffer: 256 * 1024 * 1024,
		});
	} catch {
		return map;
	}
	let currentTime = null;
	for (const line of raw.split("\n")) {
		if (line.startsWith(SENTINEL)) {
			currentTime = line.slice(SENTINEL.length);
			continue;
		}
		if (!line || !currentTime) continue;
		if (!map.has(line)) map.set(line, currentTime);
	}
	return map;
}

function maxIso(times) {
	let best = null;
	for (const t of times) {
		if (!t) continue;
		if (!best || t > best) best = t;
	}
	return best;
}

export default function lastmod() {
	const fileTime = buildGitFileTimeMap();
	const pages = listPageFiles(SRC);
	const result = {};
	for (const page of pages) {
		const includeSet = walkIncludes(page);
		const dataDeps = collectDataDeps(includeSet);
		const all = [...includeSet, ...dataDeps];
		const times = all.map((f) => fileTime.get(relative(REPO_ROOT, f)));
		const best = maxIso(times);
		const inputPath = "./" + relative(REPO_ROOT, page);
		if (best) result[inputPath] = best.slice(0, 10);
	}
	return result;
}
