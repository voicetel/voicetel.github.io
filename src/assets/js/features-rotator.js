// Slow cross-fade between the two homepage feature panels (audience
// cards / platform features). Intentionally slower than the menu
// carousel (10s) so the homepage doesn't feel busy — 30 seconds per
// panel. Hover or focus pauses; reduced-motion locks on panel one.
//
// Layout: once JS takes over, panels are absolutely positioned and
// the container height is set to match the active panel — that way
// the shorter panel doesn't leave whitespace below it. The container
// height transitions in lockstep with the opacity cross-fade.

const ROOT = document.querySelector("[data-features-rotator]");
if (ROOT) {
	const panels = Array.from(ROOT.querySelectorAll("[data-rotator-panel]"));
	const ROTATE_MS = 30000;
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

	let current = 0;
	let timer = null;

	function syncHeight() {
		const h = panels[current].offsetHeight;
		if (h > 0) ROOT.style.height = `${h}px`;
	}

	function show(index) {
		current = (index + panels.length) % panels.length;
		panels.forEach((panel, i) => {
			const active = i === current;
			panel.classList.toggle("is-active", active);
			panel.inert = !active;
		});
		syncHeight();
	}

	function start() {
		stop();
		if (reducedMotion.matches) return;
		timer = window.setInterval(() => show(current + 1), ROTATE_MS);
	}

	function stop() {
		if (timer !== null) {
			window.clearInterval(timer);
			timer = null;
		}
	}

	ROOT.addEventListener("mouseenter", stop);
	ROOT.addEventListener("mouseleave", start);
	ROOT.addEventListener("focusin", stop);
	ROOT.addEventListener("focusout", (event) => {
		if (!ROOT.contains(event.relatedTarget)) start();
	});

	reducedMotion.addEventListener("change", () => {
		if (reducedMotion.matches) {
			show(0);
			stop();
		} else {
			start();
		}
	});

	// Hand control to JS layout (panels go absolute, height is managed below).
	ROOT.dataset.rotatorReady = "true";

	// Re-sync container height when fonts load, images load, or the
	// viewport resizes — anything that changes the active panel's
	// rendered height.
	if (typeof ResizeObserver !== "undefined") {
		const ro = new ResizeObserver(() => requestAnimationFrame(syncHeight));
		panels.forEach((panel) => ro.observe(panel));
	}
	window.addEventListener("resize", () => requestAnimationFrame(syncHeight));

	show(0);
	start();
}
