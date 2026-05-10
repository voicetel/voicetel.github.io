// Signup form: posts name + email to portal /signup.php and renders the
// returned credentials in a styled result panel. Mirrors the legacy
// /signup.html jQuery dialog (validation rules + endpoint + JSON shape)
// using vanilla JS and the marketing-site form pattern. Without JS the
// form submits as a plain POST; the browser will navigate to /signup.php
// and show the raw JSON response — degraded but functional.

const form = document.getElementById("signup-form");
if (form) {
	const result = document.getElementById("signup-result");
	const nameField = document.getElementById("signup-name");
	const emailField = document.getElementById("signup-email");
	const kycDialog = document.querySelector("[data-signup-dialog]");
	const kycConfirmForm = document.querySelector("[data-signup-confirm-form]");
	const kycCancelBtn = document.querySelector("[data-signup-cancel]");
	let kycAcknowledged = false;

	form.addEventListener("submit", async (event) => {
		event.preventDefault();

		// Native HTML5 constraints already covered required/minlength/pattern/email.
		// Trigger the browser's reportValidity here for a consistent UX.
		if (!form.reportValidity()) return;

		// Gate submission behind a one-time KYC acknowledgement so visitors who
		// can't complete verification don't generate dead accounts.
		if (!kycAcknowledged && kycDialog && typeof kycDialog.showModal === "function") {
			kycDialog.showModal();
			return;
		}

		await submitSignup();
	});

	if (kycConfirmForm) {
		kycConfirmForm.addEventListener("submit", (event) => {
			event.preventDefault();
			kycDialog.close("confirm");
			kycAcknowledged = true;
			// Defer the resubmit so the dialog has a chance to fully close
			// before we kick off the network request.
			setTimeout(() => form.requestSubmit(), 0);
		});
	}

	if (kycCancelBtn) {
		kycCancelBtn.addEventListener("click", () => {
			kycDialog.close("cancel");
		});
	}

	async function submitSignup() {
		const submitBtn = form.querySelector('button[type="submit"]');
		const originalLabel = submitBtn.textContent;
		submitBtn.disabled = true;
		submitBtn.textContent = "Creating account…";

		try {
			// Use FormData so the cf-turnstile-response hidden input that Turnstile
			// injects on widget completion is included alongside name/email.
			const body = new URLSearchParams(new FormData(form));

			const response = await fetch(form.action, {
				method: "POST",
				body,
				headers: { Accept: "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Server responded ${response.status}`);
			}

			const data = await response.json();
			renderResult(data);
		} catch (error) {
			submitBtn.disabled = false;
			submitBtn.textContent = originalLabel;
			showError(error.message);
		}
	}

	function renderResult(data) {
		const dl = result.querySelector(".signup-credentials");
		dl.innerHTML = "";
		const fields = [
			["Name", nameField.value.trim()],
			["Email", emailField.value.trim()],
		];
		if (data.username) fields.push(["Username", data.username]);
		if (data.password) fields.push(["Password", data.password]);
		for (const [label, value] of fields) {
			const dt = document.createElement("dt");
			dt.textContent = label;
			const dd = document.createElement("dd");
			dd.textContent = value;
			dl.appendChild(dt);
			dl.appendChild(dd);
		}
		form.hidden = true;
		result.hidden = false;
		result.scrollIntoView({ behavior: "smooth", block: "center" });
	}

	function showError(reason) {
		let err = form.querySelector(".form-error");
		if (!err) {
			err = document.createElement("p");
			err.className = "form-error";
			err.setAttribute("role", "alert");
			form.insertBefore(err, form.firstChild);
		}
		err.replaceChildren();
		err.appendChild(
			document.createTextNode("We couldn't complete signup right now. Please try again or ")
		);
		const link = document.createElement("a");
		link.href = form.dataset.fallbackUrl;
		link.textContent = "try here";
		err.appendChild(link);
		err.appendChild(document.createTextNode(`. (${reason})`));
	}
}
