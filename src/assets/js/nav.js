const toggle = document.querySelector("[data-nav-toggle]");
const menu = document.querySelector("[data-nav-menu]");

if (toggle && menu) {
	toggle.addEventListener("click", () => {
		const open = menu.dataset.open === "true";
		menu.dataset.open = String(!open);
		toggle.setAttribute("aria-expanded", String(!open));
	});

	menu.addEventListener("click", (event) => {
		if (event.target instanceof HTMLAnchorElement) {
			menu.dataset.open = "false";
			toggle.setAttribute("aria-expanded", "false");
		}
	});
}
