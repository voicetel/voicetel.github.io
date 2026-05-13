// curl snippet generator. The Authorization header always uses the
// literal string `YOUR_API_KEY` — the stored key is never substituted
// into the preview output, so the copy-to-clipboard button always
// copies a safe-to-share snippet.

import { composeUrl } from "./request.js";

const KEY_PLACEHOLDER = "YOUR_API_KEY";

function shellQuote(value) {
	return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function hasContentTypeHeader(headerValues) {
	if (!headerValues) return false;
	return Object.keys(headerValues).some((k) => k.toLowerCase() === "content-type");
}

export function renderCurl(serverUrl, op, values) {
	let url;
	try {
		url = composeUrl(serverUrl, op, values);
	} catch {
		url = `${serverUrl}${op.path}`;
	}
	const lines = [
		`curl -X ${op.method.toUpperCase()} ${shellQuote(url)}`,
		`  -H 'Authorization: Bearer ${KEY_PLACEHOLDER}'`,
		`  -H 'Accept: application/json'`,
	];
	for (const [name, value] of Object.entries(values.header || {})) {
		if (value !== undefined && value !== null && value !== "") {
			lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`);
		}
	}
	const hasBody = typeof values.body === "string" && values.body.trim() !== "";
	if (hasBody) {
		if (!hasContentTypeHeader(values.header)) {
			lines.push(`  -H 'Content-Type: application/json'`);
		}
		lines.push(`  --data-raw ${shellQuote(values.body)}`);
	}
	return lines.join(" \\\n");
}
