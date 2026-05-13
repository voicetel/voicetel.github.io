// Mini playground for the /v2.{1,2}/account/apikey endpoint — the
// bootstrap call that exchanges username + password for the API key
// that authorizes every other request.
//
// The endpoint URL is read from the root element's data-endpoint
// attribute so this same module drives both the v2.1 and v2.2
// credentials pages. Response shape differs between versions: v2.1
// returns { apikey } at the top level, v2.2 returns { data: { apikey } }.
// We extract from whichever path is populated.
//
// The retrieved key IS displayed on the page — that's the whole point
// of this widget. It's only ever the customer's own key, fetched with
// their own credentials, on demand. The page-level playground at
// /docs/api/v2.2/playground/ keeps its own stored key sealed; this
// page is the opposite end of the lifecycle.

const roots = document.querySelectorAll("[data-credentials-bootstrap]");
roots.forEach(boot);

function boot(rootEl) {
	const endpoint = rootEl.dataset.endpoint;
	if (!endpoint) return;
	const form = rootEl.querySelector("[data-creds-form]");
	const result = rootEl.querySelector("[data-creds-result]");
	const submit = rootEl.querySelector("[data-creds-submit]");
	if (!form || !result || !submit) return;

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		const username = form.querySelector("[name=username]").value;
		const password = form.querySelector("[name=password]").value;
		const usernameInt = Number(username);
		if (!Number.isInteger(usernameInt) || usernameInt <= 0) {
			renderError(result, "Username must be a positive integer.");
			return;
		}
		if (password === "") {
			renderError(result, "Password is required.");
			return;
		}

		submit.disabled = true;
		submit.dataset.label = submit.textContent;
		submit.textContent = "Requesting…";
		renderPending(result);

		const t0 = performance.now();
		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({ username: usernameInt, password }),
			});
			const elapsedMs = Math.round(performance.now() - t0);
			const text = await response.text();
			let data = null;
			try {
				data = text ? JSON.parse(text) : null;
			} catch {
				data = null;
			}

			if (!response.ok) {
				renderError(
					result,
					`Server returned ${response.status} ${response.statusText}.`,
					text,
					elapsedMs
				);
				return;
			}

			const apikey = extractKey(data);
			if (!apikey) {
				renderError(result, "Response did not include an API key.", text, elapsedMs);
				return;
			}
			renderKey(result, apikey, elapsedMs);
			form.querySelector("[name=password]").value = "";
		} catch (err) {
			renderError(
				result,
				"Network error — could not reach the API server.",
				err.message || ""
			);
		} finally {
			submit.disabled = false;
			submit.textContent = submit.dataset.label || "Get API key";
		}
	});

	result.addEventListener("click", async (event) => {
		const btn = event.target.closest("[data-creds-copy]");
		if (!btn) return;
		const text = btn.dataset.value || "";
		try {
			await navigator.clipboard.writeText(text);
			btn.textContent = "Copied";
			setTimeout(() => {
				btn.textContent = "Copy";
			}, 1200);
		} catch {
			btn.textContent = "Copy failed";
		}
	});
}

function extractKey(data) {
	if (!data || typeof data !== "object") return null;
	if (typeof data.apikey === "string" && data.apikey !== "") return data.apikey;
	if (data.data && typeof data.data.apikey === "string" && data.data.apikey !== "")
		return data.data.apikey;
	return null;
}

function renderPending(target) {
	target.innerHTML = `<div class="alert alert-info" role="status"><strong>Contacting the API…</strong></div>`;
}

function renderError(target, message, detail, elapsedMs) {
	const elapsed =
		elapsedMs !== undefined ? ` <span class="form-note">(${elapsedMs} ms)</span>` : "";
	const detailHtml = detail ? `<pre class="code-block"><code>${escape(detail)}</code></pre>` : "";
	target.innerHTML = `
		<div class="alert alert-error" role="alert">
			<strong>Could not retrieve key.</strong>${elapsed}
			<p>${escape(message)}</p>
		</div>
		${detailHtml}
	`;
}

function renderKey(target, apikey, elapsedMs) {
	const chunks = chunk(apikey, 8).join(" ");
	target.innerHTML = `
		<div class="alert alert-success" role="status">
			<strong>API key retrieved.</strong> <span class="form-note">(${elapsedMs} ms)</span>
			<p>Save it somewhere secure. Treat it like a password — anyone holding it can act on the account.</p>
		</div>
		<div class="creds-key-card">
			<div class="creds-key-card__label">Your API key</div>
			<code class="creds-key-card__value" title="${escape(apikey)}">${escape(chunks)}</code>
			<div class="creds-key-card__actions">
				<button type="button" class="btn btn-primary btn-sm" data-creds-copy data-value="${escape(apikey)}">Copy</button>
			</div>
		</div>
	`;
}

function chunk(s, size) {
	const out = [];
	for (let i = 0; i < s.length; i += size) {
		out.push(s.slice(i, i + size));
	}
	return out;
}

function escape(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
