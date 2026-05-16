// FAQ interactions: live search/filter, scrollspy on the category rail,
// and "scroll to + open" when a permalink anchor lands the page on a
// specific question. All progressive — the FAQ works without JS.

const items = Array.from(document.querySelectorAll(".faq-item"));
const sections = Array.from(document.querySelectorAll(".faq-block"));
const searchInput = document.querySelector("[data-faq-search]");
const statusEl = document.querySelector("[data-faq-status]");
const emptyEl = document.querySelector("[data-faq-empty]");
const clearBtn = document.querySelector("[data-faq-clear]");
const navLinks = Array.from(document.querySelectorAll("[data-faq-nav]"));

// Cache lowercased text content per item so we don't re-read the DOM on every keystroke.
const itemText = new Map();
items.forEach((item) => {
	itemText.set(item, (item.textContent || "").toLowerCase());
});

function applyFilter(query) {
	const q = query.trim().toLowerCase();
	let visibleCount = 0;

	items.forEach((item) => {
		const matches = !q || itemText.get(item).includes(q);
		item.hidden = !matches;
		if (matches) visibleCount++;
		// Auto-open matching items during a search; close everything when cleared.
		if (q) {
			item.open = matches;
		} else {
			item.open = false;
		}
	});

	sections.forEach((section) => {
		const visibleItems = section.querySelectorAll(".faq-item:not([hidden])");
		section.hidden = visibleItems.length === 0;
	});

	if (statusEl) {
		statusEl.textContent = q
			? `${visibleCount} question${visibleCount === 1 ? "" : "s"} match`
			: "";
	}
	if (emptyEl) {
		emptyEl.hidden = !(q && visibleCount === 0);
	}
}

if (searchInput) {
	searchInput.addEventListener("input", (event) => applyFilter(event.target.value));
}

if (clearBtn && searchInput) {
	clearBtn.addEventListener("click", () => {
		searchInput.value = "";
		applyFilter("");
		searchInput.focus();
	});
}

// Scrollspy: highlight the category rail link for whichever section is in view.
if (navLinks.length && "IntersectionObserver" in window) {
	const observer = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				const targetHref = "#" + entry.target.id;
				navLinks.forEach((link) => {
					link.classList.toggle("is-active", link.getAttribute("href") === targetHref);
				});
			});
		},
		{ rootMargin: "-20% 0px -65% 0px" }
	);
	sections.forEach((section) => observer.observe(section));
}

// If the URL lands on a #q-... permalink, open that <details> so the user
// sees the answer immediately.
function openHashTarget() {
	if (!location.hash) return;
	// Only handle FAQ permalinks (#q-…); other hashes (e.g. the playground's
	// #op=…) aren't valid CSS selectors and throw on querySelector.
	if (!/^#q-[A-Za-z0-9_-]+$/.test(location.hash)) return;
	const target = document.querySelector(location.hash);
	if (target && target.matches(".faq-item")) {
		target.open = true;
		// Native scroll-to-anchor already happened; nudge into view in case the
		// sticky header overlapped.
		target.scrollIntoView({ block: "start", behavior: "smooth" });
	}
}
window.addEventListener("hashchange", openHashTarget);
openHashTarget();
