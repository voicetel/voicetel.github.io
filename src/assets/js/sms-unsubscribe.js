// SMS unsubscribe form: posts phone number to the portal endpoint to
// opt the number out of all VoiceTel SMS programs.
// Without JS the form submits as a plain POST; the browser navigates to the
// endpoint and shows the raw response — degraded but functional.

const unsubForm = document.getElementById("sms-unsubscribe-form");
if (unsubForm) {
	const unsubResult = document.getElementById("sms-unsub-result");

	unsubForm.addEventListener("submit", async (event) => {
		event.preventDefault();

		if (!unsubForm.reportValidity()) return;

		const submitBtn = unsubForm.querySelector('button[type="submit"]');
		const originalLabel = submitBtn.textContent;
		submitBtn.disabled = true;
		submitBtn.textContent = "Unsubscribing…";

		try {
			const body = new URLSearchParams(new FormData(unsubForm));

			const response = await fetch(unsubForm.action, {
				method: "POST",
				body,
				headers: { Accept: "application/json" },
			});

			if (!response.ok) {
				throw new Error(`Server responded ${response.status}`);
			}

			unsubForm.hidden = true;
			unsubResult.hidden = false;
			unsubResult.scrollIntoView({ behavior: "smooth", block: "center" });
		} catch (error) {
			submitBtn.disabled = false;
			submitBtn.textContent = originalLabel;
			showUnsubError(error.message);
		}
	});

	function showUnsubError(reason) {
		let err = unsubForm.querySelector(".form-error");
		if (!err) {
			err = document.createElement("p");
			err.className = "form-error";
			err.setAttribute("role", "alert");
			unsubForm.insertBefore(err, unsubForm.firstChild);
		}
		err.replaceChildren();
		err.appendChild(
			document.createTextNode("We couldn't complete the unsubscribe right now. Please try again, reply STOP to any VoiceTel message, or ")
		);
		const link = document.createElement("a");
		link.href = unsubForm.dataset.fallbackUrl;
		link.textContent = "contact us";
		err.appendChild(link);
		err.appendChild(document.createTextNode(`. (${reason})`));
	}
}
