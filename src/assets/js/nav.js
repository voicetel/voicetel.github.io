const toggle = document.querySelector("[data-nav-toggle]");
const menu = document.querySelector("[data-nav-menu]");

if (toggle && menu) {
	toggle.addEventListener("click", () => {
		const open = menu.dataset.open === "true";
		menu.dataset.open = String(!open);
		toggle.setAttribute("aria-expanded", String(!open));
	});
}

const dropdowns = Array.from(document.querySelectorAll("[data-nav-dropdown]"));
let openDropdown = null;

function closeDropdown(item) {
	if (!item) return;
	const trigger = item.querySelector("[data-nav-trigger]");
	const panel = item.querySelector(".nav-dropdown");
	if (trigger) trigger.setAttribute("aria-expanded", "false");
	if (panel) panel.hidden = true;
	item.dataset.open = "false";
	if (openDropdown === item) openDropdown = null;
}

function openDropdownItem(item) {
	if (openDropdown && openDropdown !== item) closeDropdown(openDropdown);
	const trigger = item.querySelector("[data-nav-trigger]");
	const panel = item.querySelector(".nav-dropdown");
	if (trigger) trigger.setAttribute("aria-expanded", "true");
	if (panel) panel.hidden = false;
	item.dataset.open = "true";
	openDropdown = item;

	// Re-anchor right if the panel would overflow the viewport.
	if (panel) {
		item.dataset.overflowRight = "false";
		const rect = panel.getBoundingClientRect();
		const margin = 24;
		if (rect.right > window.innerWidth - margin) {
			item.dataset.overflowRight = "true";
		}
	}
}

dropdowns.forEach((item) => {
	const trigger = item.querySelector("[data-nav-trigger]");
	if (!trigger) return;

	trigger.addEventListener("click", () => {
		const isOpen = item.dataset.open === "true";
		if (isOpen) closeDropdown(item);
		else openDropdownItem(item);
	});

	trigger.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeDropdown(item);
			trigger.focus();
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			openDropdownItem(item);
			const firstLink = item.querySelector(".nav-dropdown-link");
			if (firstLink) firstLink.focus();
		}
	});
});

document.addEventListener("click", (event) => {
	if (!openDropdown) return;
	if (!openDropdown.contains(event.target)) closeDropdown(openDropdown);
});

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && openDropdown) {
		const trigger = openDropdown.querySelector("[data-nav-trigger]");
		closeDropdown(openDropdown);
		if (trigger) trigger.focus();
	}
});

dropdowns.forEach((item) => {
	const links = Array.from(item.querySelectorAll(".nav-dropdown-link"));
	links.forEach((link, index) => {
		link.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				const next = links[(index + 1) % links.length];
				next.focus();
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				const prev = links[(index - 1 + links.length) % links.length];
				prev.focus();
			} else if (event.key === "Escape") {
				const trigger = item.querySelector("[data-nav-trigger]");
				closeDropdown(item);
				if (trigger) trigger.focus();
			}
		});
	});
});
