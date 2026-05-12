// v2.2 API playground bootstrap.
//
// Phase 1: GET-only, single page at /docs/api/v2.2/playground/. Loads the
// v2.2 spec at runtime, lets the customer pick an operation, fills in
// path parameters, sets/replaces/removes their encrypted API key, and
// sends real requests against api.voicetel.com.

import * as keyStore from "./key-store.js";
import { renderOperationForm, readFormValues } from "./render.js";
import { sendRequest } from "./request.js";
import { renderResponse, renderEmpty } from "./response.js";
import { renderCurl } from "./code-preview.js";

const APEX_HOST = "voicetel.com";
const DEFAULT_SPEC_URL = "/api-specs/v2.2.json";

const root = document.querySelector("[data-api-playground]");
if (root) boot(root);

async function boot(rootEl) {
	if (!isApex()) {
		renderUnsupported(rootEl, "apex");
		return;
	}
	if (!window.indexedDB || !window.crypto || !window.crypto.subtle) {
		renderUnsupported(rootEl, "crypto");
		return;
	}

	const specUrl = rootEl.dataset.specUrl || DEFAULT_SPEC_URL;
	let spec;
	try {
		spec = await fetch(specUrl, { cache: "no-cache" }).then((r) => r.json());
	} catch (err) {
		rootEl.innerHTML = `<div class="alert alert-error" role="alert"><strong>Failed to load API spec.</strong><p>${escapeText(err.message || String(err))}</p></div>`;
		return;
	}

	const state = {
		spec,
		serverUrl:
			(spec.servers && spec.servers[0] && spec.servers[0].url) || "https://api.voicetel.com",
		operations: extractOperations(spec, { method: "get" }),
		currentOp: null,
		els: {
			keyStatus: rootEl.querySelector("[data-key-status]"),
			keyActions: rootEl.querySelector("[data-key-actions]"),
			keyForm: rootEl.querySelector("[data-key-form]"),
			picker: rootEl.querySelector("[data-op-picker]"),
			opTitle: rootEl.querySelector("[data-op-title]"),
			opMeta: rootEl.querySelector("[data-op-meta]"),
			opSummary: rootEl.querySelector("[data-op-summary]"),
			form: rootEl.querySelector("[data-op-form]"),
			send: rootEl.querySelector("[data-op-send]"),
			response: rootEl.querySelector("[data-op-response]"),
			curl: rootEl.querySelector("[data-op-curl]"),
			copy: rootEl.querySelector("[data-op-copy]"),
		},
	};

	renderOpPicker(state);
	await renderKeyPanel(state);
	wireKeyActions(state);
	selectFromHash(state);
	window.addEventListener("hashchange", () => selectFromHash(state));
}

function isApex() {
	return (
		location.hostname === APEX_HOST ||
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1"
	);
}

function renderUnsupported(rootEl, reason) {
	const msgByReason = {
		apex: "The API playground only runs on https://voicetel.com. You're viewing it from a different host.",
		crypto: "This browser does not support the Web Crypto APIs required to store your API key securely.",
	};
	rootEl.innerHTML = `
		<div class="alert alert-warning" role="alert">
			<strong>Playground unavailable.</strong>
			<p>${escapeText(msgByReason[reason] || "Unsupported environment.")}</p>
		</div>
	`;
}

function extractOperations(spec, { method } = {}) {
	const ops = [];
	for (const [path, methods] of Object.entries(spec.paths || {})) {
		for (const [m, op] of Object.entries(methods)) {
			if (method && m !== method) continue;
			ops.push({
				method: m,
				path,
				operationId: op.operationId || `${m}-${path}`,
				summary: op.summary || "",
				description: op.description || "",
				tags: op.tags || ["Other"],
				parameters: op.parameters || [],
			});
		}
	}
	return ops;
}

function groupByTag(operations) {
	const groups = new Map();
	for (const op of operations) {
		const tag = (op.tags && op.tags[0]) || "Other";
		if (!groups.has(tag)) groups.set(tag, []);
		groups.get(tag).push(op);
	}
	return groups;
}

function renderOpPicker(state) {
	const groups = groupByTag(state.operations);
	const html = Array.from(groups.entries())
		.map(([tag, ops]) => {
			const items = ops
				.map(
					(op) =>
						`<li><button type="button" class="playground-op-btn" data-op-id="${escapeAttr(op.operationId)}"><span class="playground-op-method">${op.method.toUpperCase()}</span> <span class="playground-op-summary">${escapeText(op.summary || op.operationId)}</span></button></li>`
				)
				.join("");
			return `
				<section class="playground-op-group">
					<h3>${escapeText(tag)}</h3>
					<ul>${items}</ul>
				</section>
			`;
		})
		.join("");
	state.els.picker.innerHTML = html;
	state.els.picker.addEventListener("click", (event) => {
		const btn = event.target.closest("[data-op-id]");
		if (!btn) return;
		location.hash = `op=${btn.dataset.opId}`;
	});
}

function selectFromHash(state) {
	const match = /op=([^&]+)/.exec(location.hash);
	const targetId = match
		? decodeURIComponent(match[1])
		: state.operations[0] && state.operations[0].operationId;
	const op = state.operations.find((o) => o.operationId === targetId);
	if (op) selectOp(state, op);
}

function selectOp(state, op) {
	state.currentOp = op;

	state.els.picker.querySelectorAll("[data-op-id]").forEach((btn) => {
		btn.classList.toggle("is-active", btn.dataset.opId === op.operationId);
	});

	state.els.opTitle.textContent = op.summary || op.operationId;
	state.els.opMeta.innerHTML = `<code>${op.method.toUpperCase()}</code> <code>${escapeText(op.path)}</code>`;
	state.els.opSummary.textContent = op.description || "";
	state.els.form.innerHTML = renderOperationForm(op);
	renderEmpty(state.els.response, "Press Send to run this request.");
	updateCurl(state);

	state.els.form.addEventListener("input", () => updateCurl(state));
}

function updateCurl(state) {
	if (!state.currentOp) return;
	const values = readFormValues(state.els.form);
	state.els.curl.textContent = renderCurl(state.serverUrl, state.currentOp, values);
}

async function renderKeyPanel(state) {
	const status = await keyStore.getStatus();
	if (status.set) {
		state.els.keyStatus.innerHTML = `<span class="playground-key-state playground-key-state--set">API key set</span> <span class="playground-key-meta">on this device${status.createdAt ? ` · ${formatRelative(status.createdAt)}` : ""}</span>`;
		state.els.keyActions.innerHTML = `
			<button type="button" class="btn btn-secondary" data-key-replace>Replace key</button>
			<button type="button" class="btn btn-warning" data-key-remove>Remove key</button>
		`;
		state.els.send.disabled = false;
	} else {
		state.els.keyStatus.innerHTML = `<span class="playground-key-state playground-key-state--unset">No API key set</span> <span class="playground-key-meta">set a key to send requests from this browser</span>`;
		state.els.keyActions.innerHTML = `
			<button type="button" class="btn btn-primary" data-key-set>Set API key</button>
		`;
		state.els.send.disabled = true;
	}
}

function wireKeyActions(state) {
	state.els.keyActions.addEventListener("click", async (event) => {
		const t = event.target;
		if (t.matches("[data-key-set]") || t.matches("[data-key-replace]")) {
			openKeyForm(state, t.matches("[data-key-replace]"));
		} else if (t.matches("[data-key-remove]")) {
			await confirmRemove(state);
		}
	});

	state.els.keyForm.addEventListener("submit", async (event) => {
		event.preventDefault();
		const input = state.els.keyForm.querySelector("[data-key-input]");
		const error = state.els.keyForm.querySelector("[data-key-error]");
		const value = input.value;
		error.textContent = "";
		try {
			await keyStore.setKey(value);
		} catch (err) {
			error.textContent = err.message || "Could not store the key.";
			return;
		}
		input.value = "";
		closeKeyForm(state);
		await renderKeyPanel(state);
	});

	state.els.keyForm.querySelector("[data-key-cancel]").addEventListener("click", () => {
		state.els.keyForm.querySelector("[data-key-input]").value = "";
		closeKeyForm(state);
	});

	state.els.send.addEventListener("click", async () => {
		if (!state.currentOp) return;
		const values = readFormValues(state.els.form);
		renderEmpty(state.els.response, "Sending…");
		state.els.send.disabled = true;
		try {
			const result = await sendRequest(state.serverUrl, state.currentOp, values);
			renderResponse(state.els.response, result);
		} catch (err) {
			renderResponse(state.els.response, { error: err });
		} finally {
			state.els.send.disabled = false;
		}
	});

	state.els.copy.addEventListener("click", async () => {
		const text = state.els.curl.textContent;
		try {
			await navigator.clipboard.writeText(text);
			state.els.copy.textContent = "Copied";
			setTimeout(() => {
				state.els.copy.textContent = "Copy";
			}, 1200);
		} catch {
			state.els.copy.textContent = "Copy failed";
		}
	});
}

function openKeyForm(state, isReplace) {
	state.els.keyForm.hidden = false;
	state.els.keyForm.querySelector("[data-key-form-title]").textContent = isReplace
		? "Replace API key"
		: "Set API key";
	const input = state.els.keyForm.querySelector("[data-key-input]");
	input.value = "";
	input.focus();
}

function closeKeyForm(state) {
	state.els.keyForm.hidden = true;
}

async function confirmRemove(state) {
	if (!window.confirm("Remove the stored API key from this device?")) return;
	await keyStore.removeKey({ wipeDevice: false });
	await renderKeyPanel(state);
}

function formatRelative(timestamp) {
	const diff = Date.now() - timestamp;
	const minutes = Math.round(diff / 60000);
	if (minutes < 1) return "moments ago";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hr ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}

function escapeText(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value) {
	return escapeText(value).replace(/"/g, "&quot;");
}
