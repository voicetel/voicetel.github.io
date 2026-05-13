// Validate pasted VoiceML markup against the schema. Two passes:
//
//   1. DOMParser well-formed check. The browser surfaces parse errors
//      inside a <parsererror> element instead of throwing, so we sniff
//      for it and pull the human-readable message out.
//   2. Schema walk. Confirm the root is <Response>, every element is a
//      known tag, and every child is in its parent's allowedChildren
//      set. Records each element occurrence with its parent so the
//      summary can show "Number appeared inside Dial 3 times".

import { ROOT, lookup, knownElements } from "./schema.js";

export function validate(xmlText) {
	const result = {
		wellFormed: false,
		valid: false,
		errors: [],
		warnings: [],
		occurrences: [],
		rootName: null,
	};

	const trimmed = String(xmlText || "").trim();
	if (trimmed === "") {
		result.errors.push({ message: "Nothing to validate — paste some VoiceML markup first." });
		return result;
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(trimmed, "application/xml");
	const parseError = doc.querySelector("parsererror");
	if (parseError) {
		result.errors.push({
			message:
				parseError.textContent.replace(/\s+/g, " ").trim() || "XML is not well-formed.",
		});
		return result;
	}
	result.wellFormed = true;

	const root = doc.documentElement;
	if (!root) {
		result.errors.push({ message: "Document has no root element." });
		return result;
	}
	result.rootName = root.tagName;

	if (root.tagName !== ROOT) {
		result.errors.push({
			message: `Root element must be <${ROOT}>, found <${root.tagName}>.`,
		});
	}

	const known = knownElements();
	walk(root, null, result, known);

	result.valid = result.errors.length === 0;
	return result;
}

function walk(el, parentName, result, known) {
	const name = el.tagName;
	const def = lookup(name);

	result.occurrences.push({ name, parent: parentName, kind: def ? def.kind : "unknown" });

	if (!def) {
		result.errors.push({
			message: `Unknown element <${name}>${parentName ? ` (inside <${parentName}>)` : ""}.`,
		});
	} else if (parentName) {
		const parentDef = lookup(parentName);
		if (parentDef && parentDef.children && !parentDef.children.includes(name)) {
			result.errors.push({
				message: `<${name}> is not a valid child of <${parentName}>.`,
			});
		}
	}

	for (const child of el.children) {
		walk(child, name, result, known);
	}
}

export function summarize(occurrences) {
	const verbs = new Map();
	const nouns = new Map();
	const ssml = new Map();
	const unknown = new Map();

	for (const occ of occurrences) {
		if (occ.name === "Response") continue;
		const bucket =
			occ.kind === "verb"
				? verbs
				: occ.kind === "ssml"
					? ssml
					: occ.kind === "noun"
						? nouns
						: unknown;
		const key = occ.name;
		const existing = bucket.get(key) || { name: key, count: 0, parents: new Map() };
		existing.count += 1;
		if (occ.parent) {
			existing.parents.set(occ.parent, (existing.parents.get(occ.parent) || 0) + 1);
		}
		bucket.set(key, existing);
	}

	return {
		verbs: sortByCount(verbs),
		nouns: sortByCount(nouns),
		ssml: sortByCount(ssml),
		unknown: sortByCount(unknown),
	};
}

function sortByCount(map) {
	return Array.from(map.values())
		.map((entry) => ({
			...entry,
			parents: Array.from(entry.parents.entries()).map(([name, count]) => ({ name, count })),
		}))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
