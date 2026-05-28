/* Generic copy-to-clipboard for static doc pages.
 *
 * Wire up: <button data-copy-source="<element-id>">Copy</button>
 * The referenced element's textContent is copied verbatim.
 */

const RESET_MS = 1200;

function setupCopyButtons() {
	const buttons = document.querySelectorAll("[data-copy-source]");
	for (const button of buttons) {
		const originalLabel = button.textContent;
		let resetTimer = null;
		button.addEventListener("click", async () => {
			const sourceId = button.getAttribute("data-copy-source");
			const source = sourceId ? document.getElementById(sourceId) : null;
			if (!source) return;
			try {
				await navigator.clipboard.writeText(source.textContent);
				button.textContent = "Copied";
			} catch {
				button.textContent = "Copy failed";
			}
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = setTimeout(() => {
				button.textContent = originalLabel;
			}, RESET_MS);
		});
	}
}

setupCopyButtons();
