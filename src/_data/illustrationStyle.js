// The landing illustrations ship as standalone SVG files, which cannot see the
// page's stylesheets. Each file embeds the :root design tokens plus the rules
// in landing-illustrations.css at build time so it stays on-brand.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CSS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/css");

function read(name) {
	return readFileSync(resolve(CSS_DIR, name), "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/\s+/g, " ")
		.trim();
}

const tokens = read("tokens.css").match(/:root\s*\{([^}]*)\}/);
if (!tokens) {
	throw new Error("illustrationStyle: no :root block found in tokens.css");
}

export default `svg { ${tokens[1].trim()} } ${read("landing-illustrations.css")}`;
