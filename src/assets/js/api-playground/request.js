// Compose URL + headers from an OpenAPI operation and a values object,
// then run the fetch with Authorization injected at send-time.

import { authorize } from "./key-store.js";

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

export function composeUrl(serverUrl, op, values) {
	const path = substitutePath(op.path, values.path || {});
	return appendQuery(`${serverUrl}${path}`, values.query || {});
}

export async function sendRequest(serverUrl, op, values) {
	const url = composeUrl(serverUrl, op, values);
	const baseHeaders = new Headers({ Accept: "application/json" });
	for (const [name, value] of Object.entries(values.header || {})) {
		if (value !== undefined && value !== null && value !== "") baseHeaders.set(name, value);
	}

	const init = await authorize({ method: op.method.toUpperCase(), headers: baseHeaders });
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
