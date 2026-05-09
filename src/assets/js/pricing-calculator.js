// Pricing calculator: spreadsheet-style. Reads each row's volume input,
// looks up the discounted rate (sampled curve or stepped tiers), computes
// the row total, and updates the grand total + 80% minimum. Pure client-side.
//
// Pooled services: rows sharing a `data-pool` value have their volumes
// summed; the pool total drives a single shared rate that's applied to
// every pooled row.

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

const INTEGER_FORMAT = new Intl.NumberFormat("en-US");

function parseVolumeRaw(value) {
	return Math.max(0, parseInt(String(value || "").replace(/[^0-9]/g, ""), 10) || 0);
}

function formatVolume(n) {
	return INTEGER_FORMAT.format(n);
}

function formatRate(rate) {
	if (rate < 1) return "$" + rate.toFixed(4);
	return CURRENCY_FORMAT.format(rate);
}

function discountForVolume(tiers, volume) {
	let discount = 0;
	for (const tier of tiers) {
		if (volume >= tier.min) discount = tier.discount;
	}
	return discount;
}

function rateFromCurve(curve, volume) {
	if (volume <= curve[0][0]) return curve[0][1];
	const last = curve[curve.length - 1];
	if (volume >= last[0]) return last[1];
	for (let i = 0; i < curve.length - 1; i++) {
		const [v1, r1] = curve[i];
		const [v2, r2] = curve[i + 1];
		if (volume >= v1 && volume <= v2) {
			const t = (volume - v1) / (v2 - v1);
			return r1 + (r2 - r1) * t;
		}
	}
	return last[1];
}

function formatSavings(amount) {
	if (amount <= 0) return "—";
	return CURRENCY_FORMAT.format(amount);
}

function readVolume(row) {
	const input = row.querySelector("[data-volume]");
	return parseVolumeRaw(input && input.value);
}

function getRateForVolume(row, volume) {
	const baseRate = parseFloat(row.dataset.baseRate);
	if (row.dataset.curve) {
		const curve = JSON.parse(row.dataset.curve);
		const effectiveRate = rateFromCurve(curve, volume);
		const discount = baseRate > 0 ? (1 - effectiveRate / baseRate) * 100 : 0;
		return { effectiveRate, discount };
	}
	const tiers = JSON.parse(row.dataset.tiers || "[]");
	const discount = discountForVolume(tiers, volume);
	return { effectiveRate: baseRate * (1 - discount / 100), discount };
}

function updateRowDisplay(row, volume, effectiveRate, discount) {
	const baseRate = parseFloat(row.dataset.baseRate);
	const rowTotal = effectiveRate * volume;
	const savings = (baseRate - effectiveRate) * volume;
	const rateCell = row.querySelector("[data-rate]");
	const totalCell = row.querySelector("[data-row-total]");
	const discountCell = row.querySelector("[data-discount]");

	if (rateCell) rateCell.textContent = effectiveRate === 0 ? "Free" : formatRate(effectiveRate);
	if (totalCell) totalCell.textContent = CURRENCY_FORMAT.format(rowTotal);
	if (discountCell) {
		discountCell.textContent = formatSavings(savings);
		discountCell.classList.toggle("pricing-calc__discount--active", savings > 0);
	}
	return { rowTotal, savings, discount };
}

function recalcAll(table) {
	const rows = Array.from(table.querySelectorAll("tr[data-service]"));

	// Snapshot volumes so bundle-free checks don't depend on iteration order.
	const volumeByServiceId = new Map();
	for (const row of rows) {
		volumeByServiceId.set(row.dataset.serviceId, readVolume(row));
	}

	const pools = new Map();
	for (const row of rows) {
		const id = row.dataset.pool;
		if (!id) continue;
		if (!pools.has(id)) pools.set(id, []);
		pools.get(id).push(row);
	}
	const sharedRates = new Map();
	for (const [id, members] of pools) {
		const totalVol = members.reduce((s, r) => s + readVolume(r), 0);
		sharedRates.set(id, getRateForVolume(members[0], totalVol));
	}

	let grandTotal = 0;
	let anyDiscount = false;
	for (const row of rows) {
		const volume = readVolume(row);

		// Bundle-free override: if any peer in `bundledFree` has volume > 0, this
		// service is free. Bundled "discounts" don't trigger the minimum-row.
		let rateInfo = null;
		let isBundled = false;
		if (row.dataset.bundledFree) {
			const bundleIds = JSON.parse(row.dataset.bundledFree);
			const bundleActive = bundleIds.some((id) => (volumeByServiceId.get(id) || 0) > 0);
			if (bundleActive) {
				const baseRate = parseFloat(row.dataset.baseRate);
				rateInfo = { effectiveRate: 0, discount: baseRate > 0 ? 100 : 0 };
				isBundled = true;
			}
		}

		if (!rateInfo) {
			const id = row.dataset.pool;
			rateInfo =
				id && sharedRates.has(id) ? sharedRates.get(id) : getRateForVolume(row, volume);
		}

		const result = updateRowDisplay(row, volume, rateInfo.effectiveRate, rateInfo.discount);
		if (result.discount > 0 && !isBundled) anyDiscount = true;
		grandTotal += result.rowTotal;
	}

	const grandTotalCell = table.querySelector("[data-grand-total]");
	if (grandTotalCell) grandTotalCell.textContent = CURRENCY_FORMAT.format(grandTotal);

	// Minimum-commitment row only applies when at least one service is discounted.
	const minimumPercent = parseFloat(table.dataset.minimumPercent || "80") / 100;
	const minimumRow = table.querySelector("tr.pricing-calc__minimum");
	const grandMinimumCell = table.querySelector("[data-grand-minimum]");
	if (minimumRow) {
		minimumRow.classList.toggle("is-hidden", !anyDiscount);
	}
	if (grandMinimumCell) {
		grandMinimumCell.textContent = anyDiscount
			? CURRENCY_FORMAT.format(grandTotal * minimumPercent)
			: "—";
	}
}

function generateQuoteId() {
	const d = new Date();
	const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
	const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
	return `VTQ-${ymd}-${rand}`;
}

function preparePrintFields(customerName) {
	const dateField = document.querySelector("[data-print-date]");
	if (dateField) {
		const today = new Date();
		dateField.textContent = today.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
		dateField.setAttribute("datetime", today.toISOString().slice(0, 10));
	}
	const idField = document.querySelector("[data-quote-id]");
	if (idField) {
		idField.textContent = generateQuoteId();
	}
	const billTo = document.querySelector("[data-bill-to-section]");
	const nameField = document.querySelector("[data-customer-name]");
	const trimmed = (customerName || "").trim();
	if (nameField && billTo) {
		if (trimmed) {
			nameField.textContent = trimmed;
			billTo.classList.add("is-shown");
		} else {
			nameField.textContent = "";
			billTo.classList.remove("is-shown");
		}
	}
}

const printBtns = document.querySelectorAll("[data-print-quote]");
const dialog = document.querySelector("[data-quote-dialog]");
const dialogForm = document.querySelector("[data-quote-form]");
const dialogCancel = document.querySelector("[data-quote-cancel]");
const customerInput = document.querySelector("[data-customer-input]");

printBtns.forEach((btn) => {
	btn.addEventListener("click", () => {
		if (dialog && typeof dialog.showModal === "function") {
			if (customerInput) customerInput.value = "";
			dialog.showModal();
			if (customerInput) customerInput.focus();
		} else {
			preparePrintFields("");
			window.print();
		}
	});
});

if (dialogForm) {
	dialogForm.addEventListener("submit", (event) => {
		event.preventDefault();
		const name = customerInput ? customerInput.value : "";
		dialog.close("submit");
		// Defer until dialog has fully closed so the print preview captures the
		// quote document, not the dialog overlay.
		setTimeout(() => {
			preparePrintFields(name);
			window.print();
		}, 50);
	});
}

if (dialogCancel) {
	dialogCancel.addEventListener("click", () => {
		dialog.close("cancel");
	});
}

document.querySelectorAll("table[data-pricing-calculator]").forEach((table) => {
	// Format any default volumes already in the DOM with thousands separators.
	table.querySelectorAll("input[data-volume]").forEach((input) => {
		input.value = formatVolume(parseVolumeRaw(input.value));
	});

	recalcAll(table);

	table.addEventListener("input", (event) => {
		if (event.target.matches("input[data-volume]")) {
			recalcAll(table);
		}
	});

	// Strip commas while editing so typing stays smooth, restore on blur.
	table.addEventListener("focusin", (event) => {
		if (event.target.matches("input[data-volume]")) {
			const v = parseVolumeRaw(event.target.value);
			event.target.value = v > 0 ? String(v) : "";
		}
	});

	table.addEventListener("focusout", (event) => {
		if (event.target.matches("input[data-volume]")) {
			event.target.value = formatVolume(parseVolumeRaw(event.target.value));
			recalcAll(table);
		}
	});

	table.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && event.target.matches("input[data-volume]")) {
			event.preventDefault();
			const inputs = Array.from(table.querySelectorAll("input[data-volume]"));
			const idx = inputs.indexOf(event.target);
			if (idx >= 0 && idx < inputs.length - 1) {
				inputs[idx + 1].focus();
				inputs[idx + 1].select();
			}
		}
	});
});
