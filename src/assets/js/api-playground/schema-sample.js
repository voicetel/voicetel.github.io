// Schema-walking sample generator. Builds a JSON-serializable stub that
// matches an OpenAPI 3.x schema, resolving #/components/schemas/... refs
// and handling allOf/oneOf/anyOf composition, enums, defaults, arrays,
// and common string formats. Cycle-safe via path-based ref tracking
// (refs that appear as ancestors on the current branch return null
// instead of recursing forever).
//
// Explicit `example` / `examples` win at every level — the walker only
// fabricates a value when the spec hasn't already provided one.

const MAX_DEPTH = 12;

function resolveRef(spec, ref) {
	if (!ref || !ref.startsWith("#/")) return null;
	const parts = ref.slice(2).split("/");
	let node = spec;
	for (const p of parts) {
		if (!node || typeof node !== "object") return null;
		node = node[p];
	}
	return node || null;
}

function exampleForFormat(format) {
	switch (format) {
		case "date-time":
			return "2026-01-01T00:00:00Z";
		case "date":
			return "2026-01-01";
		case "time":
			return "00:00:00";
		case "uuid":
			return "00000000-0000-0000-0000-000000000000";
		case "email":
			return "user@example.com";
		case "uri":
		case "url":
			return "https://example.com/";
		case "hostname":
			return "example.com";
		case "ipv4":
			return "192.0.2.1";
		case "ipv6":
			return "2001:db8::1";
		case "binary":
		case "byte":
			return "";
		case "password":
			return "";
		default:
			return "";
	}
}

function sampleScalar(schema) {
	if (schema.type === "string") return exampleForFormat(schema.format);
	if (schema.type === "integer" || schema.type === "number") {
		if (typeof schema.minimum === "number") return schema.minimum;
		if (typeof schema.maximum === "number" && schema.maximum < 0) return schema.maximum;
		return 0;
	}
	if (schema.type === "boolean") return false;
	if (schema.type === "null") return null;
	return null;
}

export function sampleForSchema(schema, spec, depth = 0, refsOnPath = new Set()) {
	if (depth > MAX_DEPTH) return null;
	if (!schema || typeof schema !== "object") return null;

	if (schema.$ref) {
		if (refsOnPath.has(schema.$ref)) return null;
		const target = resolveRef(spec, schema.$ref);
		if (!target) return null;
		const next = new Set(refsOnPath);
		next.add(schema.$ref);
		return sampleForSchema(target, spec, depth + 1, next);
	}

	if (schema.example !== undefined) return schema.example;
	if (schema.default !== undefined) return schema.default;
	if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

	if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
		const out = {};
		for (const sub of schema.allOf) {
			const part = sampleForSchema(sub, spec, depth + 1, refsOnPath);
			if (part && typeof part === "object" && !Array.isArray(part)) {
				Object.assign(out, part);
			}
		}
		return Object.keys(out).length > 0 ? out : null;
	}
	if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
		return sampleForSchema(schema.oneOf[0], spec, depth + 1, refsOnPath);
	}
	if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
		return sampleForSchema(schema.anyOf[0], spec, depth + 1, refsOnPath);
	}

	if (schema.type === "array" || schema.items) {
		const item = sampleForSchema(schema.items || {}, spec, depth + 1, refsOnPath);
		return item === null ? [] : [item];
	}

	if (schema.type === "object" || schema.properties) {
		const out = {};
		const props = schema.properties || {};
		for (const [name, sub] of Object.entries(props)) {
			if (sub && sub.readOnly) continue;
			const value = sampleForSchema(sub, spec, depth + 1, refsOnPath);
			if (value !== null || (sub && (sub.nullable || sub.type === "null"))) {
				out[name] = value;
			}
		}
		return out;
	}

	return sampleScalar(schema);
}

export function sampleForRequestBody(requestBody, spec) {
	if (!requestBody || !requestBody.content) return null;
	const json = requestBody.content["application/json"];
	if (!json) return null;

	if (json.example !== undefined) return json.example;
	if (json.examples) {
		const first = Object.values(json.examples)[0];
		if (first && first.value !== undefined) return first.value;
	}
	if (json.schema) return sampleForSchema(json.schema, spec);
	return null;
}
