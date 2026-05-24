/**
 * E911 provisioning wizard — stepped form that calls the VoiceTel v2.2 E911 API.
 * API key is held in memory only; never persisted.
 */

const API_BASE = "https://api.voicetel.com";

const app = document.getElementById("e911-provision-app");
if (app) init();

function init() {
	const state = { apiKey: null, addressId: null, validated: null };

	// Step navigation
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

	async function apiCall(method, path, body) {
		const opts = {
			method,
			headers: {
				Authorization: `Bearer ${state.apiKey}`,
				"Content-Type": "application/json",
			},
		};
		if (body) opts.body = JSON.stringify(body);

		const res = await fetch(`${API_BASE}${path}`, opts);
		const json = await res.json().catch(() => null);

		if (!res.ok) {
			const raw = json?.data?.message || json?.message || json?.data?.error || json?.error;
			const msg =
				typeof raw === "string"
					? raw
					: raw
						? JSON.stringify(raw)
						: `API returned ${res.status}`;
			throw new Error(msg);
		}
		return json;
	}

	function fillCard(container, data) {
		for (const dd of container.querySelectorAll("[data-val]")) {
			const key = dd.dataset.val;
			dd.textContent = data[key] ?? "";
		}
	}

	// Step 1: Verify API key
	const keyForm = app.querySelector('[data-form="key"]');
	keyForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		clearError("key");
		const input = document.getElementById("e911-api-key");
		const key = input.value.trim();
		if (!key) return;

		try {
			state.apiKey = key;
			await apiCall("GET", "/v2.2/e911");
			input.value = "";
			showStep("address");
		} catch (err) {
			state.apiKey = null;
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
			const json = await apiCall("POST", "/v2.2/e911/validations", body);
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
			const json = await apiCall("PUT", `/v2.2/e911/${dn}`, body);
			const record = json?.data?.record ?? {
				dn,
				callername,
				...state.validated,
			};
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
		state.apiKey = null;
		state.addressId = null;
		state.validated = null;
		for (const f of app.querySelectorAll("form")) f.reset();
		showStep("key");
	});

	// Back buttons
	for (const btn of app.querySelectorAll("[data-back]")) {
		btn.addEventListener("click", () => showStep(btn.dataset.back));
	}
}
