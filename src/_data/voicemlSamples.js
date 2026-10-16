// Call-flow documents for the VoiceML example walkthroughs, keyed by sample
// directory, then by file name without its extension:
// voicemlSamples["widgets-pbx"].main. They are Liquid templates, so they are
// kept out of the Nunjucks tree and shown verbatim, with the dashboard host
// filled in from site.json.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(DATA_DIR, "../_includes/samples");
const site = JSON.parse(readFileSync(resolve(DATA_DIR, "site.json"), "utf8"));

function loadDir(dir) {
	const docs = {};
	for (const file of readdirSync(resolve(SAMPLES_DIR, dir))) {
		if (!file.endsWith(".xml")) continue;
		const text = readFileSync(resolve(SAMPLES_DIR, dir, file), "utf8");
		docs[file.slice(0, -4)] = text
			.replaceAll("%DASHBOARD_URL%", site.voicemlDashboardUrl)
			.trimEnd();
	}
	return docs;
}

const samples = {};
for (const entry of readdirSync(SAMPLES_DIR, { withFileTypes: true })) {
	if (entry.isDirectory()) samples[entry.name] = loadDir(entry.name);
}

export default samples;
