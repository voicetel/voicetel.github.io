const showcase = document.querySelector("[data-landing-showcase]");

if (showcase) {
	const tablist = showcase.querySelector("[data-landing-tabs]");
	const tabs = [...showcase.querySelectorAll("[data-landing-tab]")];
	const panels = [...showcase.querySelectorAll("[data-landing-panel]")];

	function selectTab(index) {
		tabs.forEach((tab, position) => {
			const selected = position === index;
			tab.setAttribute("aria-selected", String(selected));
			tab.tabIndex = selected ? 0 : -1;
			panels[position].hidden = !selected;
		});
	}

	tablist.setAttribute("role", "tablist");
	tablist.setAttribute("aria-label", "Platform capabilities");
	tabs.forEach((tab, index) => {
		const panel = panels[index];
		tab.setAttribute("role", "tab");
		tab.setAttribute("aria-controls", panel.id);
		panel.setAttribute("role", "tabpanel");
		panel.setAttribute("aria-labelledby", tab.id);
		panel.tabIndex = 0;
		tab.addEventListener("click", () => selectTab(index));
		tab.addEventListener("keydown", (event) => {
			let next;
			switch (event.key) {
				case "ArrowRight":
					next = (index + 1) % tabs.length;
					break;
				case "ArrowLeft":
					next = (index - 1 + tabs.length) % tabs.length;
					break;
				case "Home":
					next = 0;
					break;
				case "End":
					next = tabs.length - 1;
					break;
				default:
					return;
			}
			event.preventDefault();
			selectTab(next);
			tabs[next].focus();
		});
	});
	selectTab(0);
	tablist.hidden = false;
}
