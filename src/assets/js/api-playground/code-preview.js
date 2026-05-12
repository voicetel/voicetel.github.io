// curl snippet generator. Phase 1 emits curl only. The Authorization
// header always uses the literal string `YOUR_API_KEY` — the stored key
// is never substituted into the preview output, so the copy-to-clipboard
// button always copies a safe-to-share snippet.

import { composeUrl } from "./request.js";

const KEY_PLACEHOLDER = "YOUR_API_KEY";

function shellQuote(value) {
	return `'${String(value).replace(/'/g, "'\\''")}'`;
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
	return lines.join(" \\\n");
}
