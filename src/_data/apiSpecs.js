// Source of truth for /docs/api/ URLs. Reads vendor/api-specs/*.json at
// build time and exposes { name, version, majorMinor, urlPath, title } per
// spec. Both the Redoc build script (tools/build-api-docs.mjs) and the
// Eleventy templates read the same shape, so URL changes happen here only.

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SPECS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../vendor/api-specs");

function majorMinor(version) {
	const m = String(version || "")
		.replace(/^v/i, "")
		.match(/^(\d+)\.(\d+)/);
	return m ? `v${m[1]}.${m[2]}` : null;
}

const files = readdirSync(SPECS_DIR)
	.filter((f) => f.endsWith(".json"))
	.sort();

const specs = {};
for (const file of files) {
	const name = basename(file, ".json");
	const spec = JSON.parse(readFileSync(resolve(SPECS_DIR, file), "utf8"));
	const version = spec.info?.version || "";
	const mm = majorMinor(version);
	if (!mm) {
		throw new Error(`apiSpecs: cannot derive majorMinor from version "${version}" for ${file}`);
	}
	// A spec whose filename matches its major.minor (e.g. v2.2.json at v2.2.0) is
	// the consolidated reference for that release and renders at /docs/api/{mm}/
	// directly. Per-resource specs keep the /docs/api/{mm}/{name}/ shape.
	const isConsolidated = name === mm;
	specs[name] = {
		name,
		version,
		majorMinor: mm,
		urlPath: isConsolidated ? `/docs/api/${mm}/` : `/docs/api/${mm}/${name}/`,
		title: spec.info?.title || name,
		consolidated: isConsolidated,
	};
}

export default specs;
