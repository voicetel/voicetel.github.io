// Call-flow documents for the widgets.com PBX walkthrough. They are Liquid
// templates, so they are kept out of the Nunjucks tree and shown verbatim,
// with the dashboard host filled in from site.json.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATA_DIR = dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = resolve(DATA_DIR, "../_includes/samples/widgets-pbx");
const site = JSON.parse(readFileSync(resolve(DATA_DIR, "site.json"), "utf8"));

function load(name) {
	const text = readFileSync(resolve(SAMPLES_DIR, name), "utf8");
	return text.replaceAll("%DASHBOARD_URL%", site.voicemlDashboardUrl).trimEnd();
}

export default {
	main: load("main.xml"),
	goodbye: load("goodbye.xml"),
};
