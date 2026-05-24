import * as keyStore from "./api-playground/key-store.js";
import { sendRequest } from "./api-playground/request.js";

const API_BASE = "https://api.voicetel.com";
const APEX_HOST = "voicetel.com";

const app = document.getElementById("e911-provision-app");
if (app) boot();

async function boot() {
	if (!isApex()) return;
	if (!window.indexedDB || !window.crypto || !window.crypto.subtle) return;

	const state = { addressId: null, validated: null };

	await renderKeyStep();

	async function renderKeyStep() {
		const status = await keyStore.getStatus();
		const step = app.querySelector('[data-step="key"]');
		const info = step.querySelector("[data-key-info]");
		const form = step.querySelector('[data-form="key"]');

		if (status.set) {
			info.innerHTML =
				'<p class="playground-key-state playground-key-state--set">API key set on this device.</p>';
			form.querySelector("[data-key-input]").placeholder = "Paste to replace";
			form.querySelector("[data-key-submit]").textContent = "Continue";
		} else {
			info.innerHTML = "";
			form.querySelector("[data-key-submit]").textContent = "Save and continue";
		}
	}

	function makeOp(method, path) {
		return {
			method,
			path,
			operationId: `${method}-${path}`,
			parameters: [],
			requestBody: null,
		};
	}

	async function apiCall(method, path, body) {
		const values = { path: {}, query: {}, header: {} };
		if (body) values.body = JSON.stringify(body);
		const result = await sendRequest(API_BASE, makeOp(method, path), values);

		if (result.error) throw result.error;
		if (result.status >= 400) {
			const json = result.bodyJson;
			const msg =
				json?.data?.message ||
				json?.message ||
				json?.error?.message ||
				(typeof json?.error === "string" ? json.error : null) ||
				`API returned ${result.status}`;
			throw new Error(msg);
		}
		return result.bodyJson;
	}

	function showStep(name) {
		for (const el of app.querySelectorAll("[data-step]")) {
			el.hidden = el.dataset.step !== name;
		}
	}

	function showError(scope, msg) {
		const el = app.querySelector(`[data-error="${scope}"]`);
		if (el) {
			el.textContent = msg;
			el.hidden = false;
		}
	}

	function clearError(scope) {
		const el = app.querySelector(`[data-error="${scope}"]`);
		if (el) {
			el.textContent = "";
			el.hidden = true;
		}
	}

	function fillCard(container, data) {
		for (const dd of container.querySelectorAll("[data-val]")) {
			dd.textContent = data[dd.dataset.val] ?? "";
		}
	}

	async function verifyKey() {
		const values = { path: {}, query: {}, header: {} };
		const result = await sendRequest(API_BASE, makeOp("get", "/v2.2/e911"), values);
		if (result.error) throw result.error;
		if (result.status === 401 || result.status === 403) {
			const json = result.bodyJson;
			const msg = json?.error?.message || json?.message || `API returned ${result.status}`;
			throw new Error(msg);
		}
	}

	// Step 1: API key
	const keyForm = app.querySelector('[data-form="key"]');
	keyForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		clearError("key");
		const input = keyForm.querySelector("[data-key-input]");
		const value = input.value.trim();

		try {
			if (value) {
				await keyStore.setKey(value);
				input.value = "";
			}
			if (!(await keyStore.hasKey())) {
				showError("key", "Enter your API key to continue.");
				return;
			}
			await verifyKey();
			showStep("address");
		} catch (err) {
			showError("key", `Key verification failed: ${err.message}`);
		}
	});

	// Step 2: Validate address
	const addrForm = app.querySelector('[data-form="address"]');
	addrForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		clearError("address");

		const body = {
			address1: document.getElementById("e911-address1").value.trim(),
			address2: document.getElementById("e911-address2").value.trim(),
			city: document.getElementById("e911-city").value.trim(),
			state: document.getElementById("e911-state").value.trim().toUpperCase(),
			zip: document.getElementById("e911-zip").value.trim(),
		};

		try {
			const json = await apiCall("post", "/v2.2/e911/validations", body);
			const addr = json?.data?.address;
			if (!addr?.addressid) throw new Error("No address ID returned");
			state.addressId = addr.addressid;
			state.validated = addr;
			fillCard(app.querySelector("[data-validated-address]"), addr);
			showStep("confirm");
		} catch (err) {
			showError("address", `Address validation failed: ${err.message}`);
		}
	});

	// Step 3: Confirm → provision
	app.querySelector('[data-action="accept-address"]').addEventListener("click", () =>
		showStep("provision")
	);

	// Step 4: Provision
	const provForm = app.querySelector('[data-form="provision"]');
	provForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		clearError("provision");

		const dn = document.getElementById("e911-dn").value.trim();
		const callername = document.getElementById("e911-callername").value.trim();
		const body = { addressid: state.addressId, callername };

		try {
			const json = await apiCall("put", `/v2.2/e911/${dn}`, body);
			const record = json?.data?.record ?? { dn, callername, ...state.validated };
			fillCard(app.querySelector("[data-result-record]"), record);
			showStep("result");
		} catch (err) {
			showError("provision", `Provisioning failed: ${err.message}`);
		}
	});

	// Step 5: Actions
	app.querySelector('[data-action="provision-another"]').addEventListener("click", () => {
		provForm.reset();
		showStep("provision");
	});

	app.querySelector('[data-action="start-over"]').addEventListener("click", () => {
		state.addressId = null;
		state.validated = null;
		for (const f of app.querySelectorAll("form")) f.reset();
		renderKeyStep().then(() => showStep("key"));
	});

	// Back buttons
	for (const btn of app.querySelectorAll("[data-back]")) {
		btn.addEventListener("click", () => showStep(btn.dataset.back));
	}
}

function isApex() {
	return (
		location.hostname === APEX_HOST ||
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1"
	);
}
