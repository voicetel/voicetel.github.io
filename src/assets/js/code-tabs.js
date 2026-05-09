// ARIA tablist for code-sample tabs.
// Pages remain usable without JS: when JS is off, all panels render
// stacked and the tab strip is hidden via CSS scoped to html.js.

document.documentElement.classList.add("js");

document.querySelectorAll("[data-tabs]").forEach((group) => {
	const tabs = Array.from(group.querySelectorAll('[role="tab"]'));
	const panels = Array.from(group.querySelectorAll('[role="tabpanel"]'));

	panels.forEach((panel, i) => {
		if (i !== 0) panel.hidden = true;
	});

	function activate(index, focusTab) {
		tabs.forEach((tab, i) => {
			const active = i === index;
			tab.setAttribute("aria-selected", active ? "true" : "false");
			tab.tabIndex = active ? 0 : -1;
			if (active && focusTab) tab.focus();
		});
		panels.forEach((panel, i) => {
			panel.hidden = i !== index;
		});
	}

	tabs.forEach((tab, i) => {
		tab.addEventListener("click", () => activate(i, false));
		tab.addEventListener("keydown", (event) => {
			let next = null;
			if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
			else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = tabs.length - 1;
			if (next !== null) {
				event.preventDefault();
				activate(next, true);
			}
		});
	});
});
