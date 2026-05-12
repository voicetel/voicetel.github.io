// Render an HTTP response into the response panel using the existing
// .code-block / .data-table / .alert design-system classes. The renderer
// is deliberately string-template-based so the response panel matches
// the visual treatment of the surrounding docs.

function escapeText(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusClass(status) {
	if (status >= 200 && status < 300) return "playground-status playground-status--ok";
	if (status >= 400 && status < 500) return "playground-status playground-status--client-error";
	if (status >= 500) return "playground-status playground-status--server-error";
	return "playground-status";
}

function renderHeaders(headers) {
	const entries = Object.entries(headers || {});
	if (entries.length === 0) return "";
	const rows = entries
		.map(([k, v]) => `<tr><th scope="row">${escapeText(k)}</th><td>${escapeText(v)}</td></tr>`)
		.join("");
	return `
		<details class="playground-headers">
			<summary>Response headers (${entries.length})</summary>
			<table class="data-table">
				<tbody>${rows}</tbody>
			</table>
		</details>
	`;
}

function renderBody(result) {
	if (result.bodyJson !== undefined && result.bodyJson !== null) {
		const pretty = JSON.stringify(result.bodyJson, null, 2);
		return `<pre class="code-block" data-lang="json"><code>${escapeText(pretty)}</code></pre>`;
	}
	if (result.bodyText) {
		return `<pre class="code-block"><code>${escapeText(result.bodyText)}</code></pre>`;
	}
	return `<p class="playground-empty">Empty response body.</p>`;
}

export function renderResponse(target, result) {
	if (result.error) {
		const msg = result.error && result.error.message ? result.error.message : "Network error.";
		target.innerHTML = `
			<div class="alert alert-error" role="alert">
				<strong>Request failed.</strong>
				<p>${escapeText(msg)}</p>
				<p class="playground-hint">If the browser console shows a CORS error, the API at <code>api.voicetel.com</code> has not yet allow-listed <code>https://voicetel.com</code> for cross-origin browser calls. Server-side requests using the same curl snippet will still work.</p>
			</div>
		`;
		return;
	}

	target.innerHTML = `
		<p class="${statusClass(result.status)}">
			<strong>${result.status}</strong> ${escapeText(result.statusText || "")}
			<span class="playground-elapsed">${result.elapsedMs} ms</span>
		</p>
		${renderHeaders(result.headers)}
		${renderBody(result)}
	`;
}

export function renderEmpty(target, message) {
	target.innerHTML = `<p class="playground-empty">${escapeText(message)}</p>`;
}
