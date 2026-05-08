import { readdir, readFile } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "src");

async function walk(dir, results = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name.startsWith("_")) continue;
			await walk(full, results);
		} else if (entry.name.endsWith(".njk") || entry.name.endsWith(".md")) {
			results.push(full);
		}
	}
	return results;
}

function parseFrontMatter(text) {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return {};
	const fm = {};
	for (const line of m[1].split("\n")) {
		const k = line.match(/^([A-Za-z0-9_]+):\s*"?(.*?)"?\s*$/);
		if (k) fm[k[1]] = k[2];
	}
	return fm;
}

function urlForFile(file, fm) {
	if (fm.permalink) return fm.permalink;
	const rel = relative(SRC, file);
	if (rel === "index.njk") return "/";
	if (rel === "404.njk") return "/404.html";
	if (rel.endsWith("/index.njk")) return "/" + rel.slice(0, -"index.njk".length);
	if (rel.endsWith(".njk")) return "/" + rel.slice(0, -".njk".length) + "/";
	return "/" + rel;
}

const files = (await walk(SRC)).sort();

console.log("# VoiceTel Site Pages");
console.log();
console.log(
	"Generated " +
		new Date().toISOString().slice(0, 10) +
		". Pages emitted from `src/` to `_site/`. Navigation references in `src/_data/site.json`."
);
console.log();
console.log("| URL | Title | Description | Source file |");
console.log("| --- | ----- | ----------- | ----------- |");

for (const file of files) {
	const text = await readFile(file, "utf8");
	const fm = parseFrontMatter(text);
	const url = urlForFile(file, fm);
	const rel = relative(ROOT, file);
	const title = fm.title || "—";
	const desc = (fm.description || "—").replaceAll("|", "\\|");
	console.log(`| \`${url}\` | ${title} | ${desc} | \`${rel}\` |`);
}

console.log();
console.log(
	"Plus 11 Redoc-rendered API doc pages under `/docs/api/{spec}/` from `vendor/api-specs/{spec}.json`."
);
