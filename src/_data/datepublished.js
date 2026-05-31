import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SRC = resolve(__dirname, "..");

const TEMPLATE_EXT = /\.(njk|md|11ty\.js|html)$/;

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

// One git log pass, oldest-first. First time a path appears with status A/C/R
// is its add (or import-by-rename) commit, which is what we want for
// schema.org datePublished.
function buildGitFileAddTimeMap() {
	const map = new Map();
	const SENTINEL = "COMMIT:";
	let raw;
	try {
		raw = execSync(`git log --reverse --format=${SENTINEL}%cI --name-status`, {
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
		const parts = line.split("\t");
		const status = parts[0] || "";
		let path = null;
		if (status.startsWith("R") || status.startsWith("C")) {
			path = parts[2];
		} else if (status.startsWith("A") || status.startsWith("M")) {
			path = parts[1];
		}
		if (path && !map.has(path)) map.set(path, currentTime);
	}
	return map;
}

export default function datepublished() {
	const addTimeMap = buildGitFileAddTimeMap();
	const result = {};
	for (const file of listPageFiles(SRC)) {
		const rel = relative(REPO_ROOT, file);
		const time = addTimeMap.get(rel);
		if (time) result["./" + rel] = time.slice(0, 10);
	}
	return result;
}
