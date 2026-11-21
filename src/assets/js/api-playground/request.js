// Compose URL + headers from an OpenAPI operation and a values object,
// then run the fetch with Authorization injected at send-time.

import { authorize } from "./key-store.js";
import { MULTIPART, bodyContentType } from "./render.js";

const FILE_EXTENSIONS = { "application/pdf": "pdf" };

function substitutePath(template, pathValues) {
	return template.replace(/\{([^}]+)\}/g, (_, name) => {
		const v = pathValues[name];
		if (v === undefined || v === null || v === "") {
			throw new Error(`Missing required path parameter: ${name}`);
		}
		return encodeURIComponent(v);
	});
}

function appendQuery(url, queryValues) {
	const entries = Object.entries(queryValues || {}).filter(
		([, v]) => v !== undefined && v !== null && v !== ""
	);
	if (entries.length === 0) return url;
	const usp = new URLSearchParams();
	for (const [k, v] of entries) usp.append(k, v);
	return `${url}?${usp.toString()}`;
}

export function isMultipart(op) {
	return bodyContentType(op.requestBody) === MULTIPART;
}

// Media types of the operation's 2xx responses. JSON stays acceptable at a
// lower weight so error bodies still negotiate on binary endpoints.
export function acceptFor(op) {
	const types = new Set();
	for (const [code, response] of Object.entries(op.responses || {})) {
		if (!code.startsWith("2") || !response || !response.content) continue;
		Object.keys(response.content).forEach((t) => types.add(t));
	}
	types.delete("application/json");
	if (types.size === 0) return "application/json";
	return `${Array.from(types).join(", ")}, application/json;q=0.9`;
}

function buildFormData(values) {
	const data = new FormData();
	for (const [name, value] of Object.entries(values.form || {})) data.append(name, value);
	for (const [name, files] of Object.entries(values.files || {})) {
		for (const file of files) data.append(name, file, file.name);
	}
	return data;
}

function isTextual(contentType) {
	const type = contentType.split(";")[0].trim().toLowerCase();
	return (
		type === "" ||
		type.startsWith("text/") ||
		type.endsWith("json") ||
		type.endsWith("xml") ||
		type.endsWith("javascript")
	);
}

// Content-Disposition is only readable when the API exposes it to CORS;
// otherwise the name is derived from the media type.
function downloadName(headers, contentType) {
	const disposition = headers["content-disposition"] || "";
	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	if (match) {
		let name = match[1];
		try {
			name = decodeURIComponent(name);
		} catch {
			// A literal "%" in a plain filename is not an escape sequence.
		}
		return name.replace(/[\\/]/g, "_");
	}
	const type = contentType.split(";")[0].trim().toLowerCase();
	return `response.${FILE_EXTENSIONS[type] || "bin"}`;
}

export function composeUrl(serverUrl, op, values) {
	const path = substitutePath(op.path, values.path || {});
	return appendQuery(`${serverUrl}${path}`, values.query || {});
}

export async function sendRequest(serverUrl, op, values) {
	const url = composeUrl(serverUrl, op, values);
	const baseHeaders = new Headers({ Accept: acceptFor(op) });
	for (const [name, value] of Object.entries(values.header || {})) {
		if (value !== undefined && value !== null && value !== "") baseHeaders.set(name, value);
	}
	const multipart = isMultipart(op);
	const hasBody = !multipart && typeof values.body === "string" && values.body.trim() !== "";
	if (hasBody && !baseHeaders.has("Content-Type")) {
		baseHeaders.set("Content-Type", "application/json");
	}
	// fetch sets the multipart Content-Type itself so the boundary matches.
	if (multipart) baseHeaders.delete("Content-Type");

	const init = await authorize({ method: op.method.toUpperCase(), headers: baseHeaders });
	if (multipart) init.body = buildFormData(values);
	else if (hasBody) init.body = values.body;
	const t0 = performance.now();
	let response;
	let error = null;
	try {
		response = await fetch(url, init);
	} catch (err) {
		error = err;
	}
	const elapsedMs = Math.round(performance.now() - t0);

	if (error) {
		return { url, error, elapsedMs };
	}

	const headers = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});
	const contentType = response.headers.get("content-type") || "";
	if (!isTextual(contentType)) {
		const blob = await response.blob();
		return {
			url,
			status: response.status,
			statusText: response.statusText,
			headers,
			bodyBlob: blob,
			bodyType: contentType,
			bodyName: downloadName(headers, contentType),
			elapsedMs,
		};
	}

	const text = await response.text();
	let parsed = null;
	try {
		parsed = text ? JSON.parse(text) : null;
	} catch {
		parsed = null;
	}

	return {
		url,
		status: response.status,
		statusText: response.statusText,
		headers,
		bodyText: text,
		bodyJson: parsed,
		elapsedMs,
	};
}
