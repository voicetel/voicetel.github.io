// SMS opt-in form: posts name, phone, and consent to the portal endpoint.
// Without JS the form submits as a plain POST; the browser navigates to the
// endpoint and shows the raw response — degraded but functional.

const optinForm = document.getElementById("sms-optin-form");
if (optinForm) {
	const optinResult = document.getElementById("sms-optin-result");

	optinForm.addEventListener("submit", async (event) => {
		event.preventDefault();

		if (!optinForm.reportValidity()) return;

		const submitBtn = optinForm.querySelector('button[type="submit"]');
		const originalLabel = submitBtn.textContent;
		submitBtn.disabled = true;
		submitBtn.textContent = "Submitting…";

		try {
			const body = new URLSearchParams(new FormData(optinForm));

			const response = await fetch(optinForm.action, {
				method: "POST",
				body,
				headers: { Accept: "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Server responded ${response.status}`);
			}

			optinForm.hidden = true;
			optinResult.hidden = false;
			optinResult.scrollIntoView({ behavior: "smooth", block: "center" });
		} catch (error) {
			submitBtn.disabled = false;
			submitBtn.textContent = originalLabel;
			showOptinError(error.message);
		}
	});

	function showOptinError(reason) {
		let err = optinForm.querySelector(".form-error");
		if (!err) {
			err = document.createElement("p");
			err.className = "form-error";
			err.setAttribute("role", "alert");
			optinForm.insertBefore(err, optinForm.firstChild);
		}
		err.replaceChildren();
		err.appendChild(
			document.createTextNode("We couldn't complete the opt-in right now. Please try again or ")
		);
		const link = document.createElement("a");
		link.href = optinForm.dataset.fallbackUrl;
		link.textContent = "contact us";
		err.appendChild(link);
		err.appendChild(document.createTextNode(`. (${reason})`));
	}
}
