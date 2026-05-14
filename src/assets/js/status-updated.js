const node = document.querySelector("[data-status-updated]");
if (node) {
	const now = new Date();
	const iso = now.toISOString().slice(0, 10);
	const human = new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(now);
	node.setAttribute("datetime", iso);
	node.textContent = human;
}
