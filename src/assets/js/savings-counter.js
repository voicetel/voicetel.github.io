// Animate the "Real Volume Discount" counter on the homepage Overview
// tab. Each time the panel is shown the counter ramps 0 → 90 over 6 s,
// settles back to 30 by 8.5 s, and holds there. The static markup
// already reads 30, so no-JS and prefers-reduced-motion visitors see
// the final value without motion.

const el = document.querySelector("[data-savings-counter]");
if (el) {
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

	const PHASES = [
		{ t: 0, v: 0 },
		{ t: 6000, v: 90 },
		{ t: 8500, v: 30 },
	];
	const PERIOD = PHASES[PHASES.length - 1].t;
	const panel = el.closest("[data-landing-panel]");

	let start = performance.now();
	let running = false;

	function render(v) {
		el.textContent = String(Math.round(v));
	}

	function tick() {
		if (!running) return;
		if (reducedMotion.matches) {
			running = false;
			render(30);
			return;
		}
		const t = Math.min(performance.now() - start, PERIOD);
		let v = PHASES[PHASES.length - 1].v;
		for (let i = 0; i < PHASES.length - 1; i++) {
			const a = PHASES[i];
			const b = PHASES[i + 1];
			if (t >= a.t && t < b.t) {
				const progress = (t - a.t) / (b.t - a.t);
				v = a.v + (b.v - a.v) * progress;
				break;
			}
		}
		render(v);
		if (t < PERIOD) requestAnimationFrame(tick);
		else running = false;
	}

	function play() {
		start = performance.now();
		if (!running) {
			running = true;
			tick();
		}
	}

	function pause() {
		running = false;
	}

	// The tab script toggles [hidden] on each panel; replay whenever the
	// Overview panel is revealed again.
	if (panel) {
		if (!panel.hidden) play();
		const observer = new MutationObserver(() => {
			if (panel.hidden) pause();
			else play();
		});
		observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
	}

	reducedMotion.addEventListener("change", () => {
		if (reducedMotion.matches) {
			pause();
			render(30);
		}
	});
}
