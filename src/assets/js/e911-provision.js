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

	async function verifyKey() {
		const values = { path: {}, query: {}, header: {} };
		const result = await sendRequest(API_BASE, makeOp("get", "/v2.2/e911"), values);
		if (result.error) throw result.error;
		if (result.status === 401 || result.status === 403) {
			const json = result.bodyJson;
			const msg = json?.error?.message || json?.message || `API returned ${result.status}`;
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

	function esc(str) {
		return String(str || "")
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function formatDn(dn) {
		const d = String(dn || "");
		const digits = d.replace(/\D/g, "");
		const ten = digits.length === 11 ? digits.slice(1) : digits;
		if (ten.length === 10) {
			return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
		}
		return d;
	}

	async function loadRecords() {
		clearError("records");
		const container = app.querySelector("[data-records-table]");

		try {
			const json = await verifyKey();
			const records = json?.data?.records || [];

			if (records.length === 0) {
				container.innerHTML = '<p class="text-muted">No E911 records on this account.</p>';
				return;
			}

			const rows = records
				.map(
					(r) => `<tr>
					<td>${esc(formatDn(r.dn))}</td>
					<td>${esc(r.callername)}</td>
					<td>${esc(r.address1)}${r.address2 ? ", " + esc(r.address2) : ""}</td>
					<td>${esc(r.city)}, ${esc(r.state)} ${esc(r.zip)}</td>
					<td class="e911-actions-cell">
						<button type="button" class="btn btn-secondary btn--sm" data-edit-dn="${esc(r.dn)}" data-edit-name="${esc(r.callername)}">Edit</button>
						<button type="button" class="btn btn-warning btn--sm" data-delete-dn="${esc(r.dn)}">Delete</button>
					</td>
				</tr>`
				)
				.join("");

			container.innerHTML = `<table class="data-table">
				<thead>
					<tr>
						<th scope="col">Number</th>
						<th scope="col">Caller name</th>
						<th scope="col">Address</th>
						<th scope="col">City / State</th>
						<th scope="col">Actions</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>`;
		} catch (err) {
			container.innerHTML = "";
			showError("records", `Failed to load records: ${err.message}`);
		}
	}

	// Records table: edit and delete actions
	app.querySelector("[data-records-table]").addEventListener("click", async (e) => {
		const editBtn = e.target.closest("[data-edit-dn]");
		const deleteBtn = e.target.closest("[data-delete-dn]");

		if (editBtn) {
			const dn = editBtn.dataset.editDn;
			const name = editBtn.dataset.editName;
			document.getElementById("e911-dn").value = dn.replace(/^1/, "");
			document.getElementById("e911-callername").value = name;
			showStep("address");
		}

		if (deleteBtn) {
			const dn = deleteBtn.dataset.deleteDn;
			const stripped = dn.replace(/^1/, "");
			if (!window.confirm(`Remove E911 record for ${formatDn(dn)}?`)) return;

			deleteBtn.disabled = true;
			deleteBtn.textContent = "Deleting…";
			try {
				await apiCall("delete", `/v2.2/e911/${stripped}`);
				await loadRecords();
			} catch (err) {
				showError("records", `Delete failed: ${err.message}`);
				deleteBtn.disabled = false;
				deleteBtn.textContent = "Delete";
			}
		}
	});

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
			await loadRecords();
			showStep("records");
		} catch (err) {
			showError("key", `Key verification failed: ${err.message}`);
		}
	});

	// Step 2: Records → add new (two-step) or quick provision (single-step)
	app.querySelector('[data-action="add-new"]').addEventListener("click", () => {
		document.getElementById("e911-dn").value = "";
		document.getElementById("e911-callername").value = "";
		showStep("address");
	});

	app.querySelector('[data-action="quick-provision"]').addEventListener("click", () => {
		app.querySelector('[data-form="quick"]').reset();
		showStep("quick");
	});

	// Quick provision form (POST /v2.2/e911 — validate + provision in one step)
	const quickForm = app.querySelector('[data-form="quick"]');
	quickForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		clearError("quick");

		const body = {
			dn: document.getElementById("e911-quick-dn").value.trim(),
			callername: document.getElementById("e911-quick-callername").value.trim(),
			address1: document.getElementById("e911-quick-address1").value.trim(),
			address2: document.getElementById("e911-quick-address2").value.trim(),
			city: document.getElementById("e911-quick-city").value.trim(),
			state: document.getElementById("e911-quick-state").value.trim().toUpperCase(),
			zip: document.getElementById("e911-quick-zip").value.trim(),
		};

		try {
			const json = await apiCall("post", "/v2.2/e911", body);
			const record = json?.data?.record ?? body;
			fillCard(app.querySelector("[data-result-record]"), record);
			showStep("result");
		} catch (err) {
			showError("quick", `Provisioning failed: ${err.message}`);
		}
	});

	// Step 3: Validate address (two-step flow)
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

	// Step 4: Confirm → provision
	app.querySelector('[data-action="accept-address"]').addEventListener("click", () =>
		showStep("provision")
	);

	// Step 5: Provision
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

	// Step 6: Result actions
	app.querySelector('[data-action="back-to-records"]').addEventListener("click", async () => {
		await loadRecords();
		showStep("records");
	});

	app.querySelector('[data-action="add-another"]').addEventListener("click", () => {
		document.getElementById("e911-dn").value = "";
		document.getElementById("e911-callername").value = "";
		addrForm.reset();
		showStep("address");
	});

	// Back buttons
	for (const btn of app.querySelectorAll("[data-back]")) {
		btn.addEventListener("click", async () => {
			if (btn.dataset.back === "records") {
				await loadRecords();
			}
			showStep(btn.dataset.back);
		});
	}
}

function isApex() {
	return (
		location.hostname === APEX_HOST ||
		location.hostname === "localhost" ||
		location.hostname === "127.0.0.1"
	);
}
