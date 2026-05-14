// Animate the "Real Volume" savings counter on the intro carousel
// slide. The cycle is synced to the menu carousel's slide duration
// (10s, matching ADVANCE_MS in menu-carousel.js): the counter ramps
// from 0 → 90 → 30 across the slide's visible window and resets to 0
// each time the intro slide becomes active again. Respects
// prefers-reduced-motion (renders a static −30).

const el = document.querySelector("[data-savings-counter]");
if (el) {
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

	// Phases span the 10s carousel slide window. Ramp up 0→90 over the
	// first 6 s, snap back to 30 by 8.5 s, hold for the last 1.5 s
	// before the carousel rotates away.
	const PHASES = [
		{ t: 0, v: 0 },
		{ t: 6000, v: 90 },
		{ t: 8500, v: 30 },
		{ t: 10000, v: 30 },
	];
	const PERIOD = PHASES[PHASES.length - 1].t;
	const slide = el.closest("[data-slide-index]");

	let start = performance.now();
	let running = false;

	function render(v) {
		el.textContent = `−${Math.round(v)}`;
	}

	function tick() {
		if (!running) return;
		if (reducedMotion.matches) {
			render(30);
			return;
		}
		const t = Math.min(performance.now() - start, PERIOD);
		let v = PHASES[0].v;
		for (let i = 0; i < PHASES.length - 1; i++) {
			const a = PHASES[i];
			const b = PHASES[i + 1];
			if (t >= a.t && t < b.t) {
				const progress = (t - a.t) / (b.t - a.t);
				v = a.v + (b.v - a.v) * progress;
				break;
			}
		}
		if (t >= PERIOD - 1) v = PHASES[PHASES.length - 1].v;
		render(v);
		requestAnimationFrame(tick);
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

	// Sync to the slide becoming active (intro slide loses its [inert]
	// attribute when the carousel rotates back to it). If no slide
	// wrapper is found (unlikely), fall back to a free-running loop.
	if (slide) {
		if (!slide.hasAttribute("inert")) play();
		const observer = new MutationObserver(() => {
			if (slide.hasAttribute("inert")) pause();
			else play();
		});
		observer.observe(slide, { attributes: true, attributeFilter: ["inert"] });
	} else {
		play();
	}

	reducedMotion.addEventListener("change", () => {
		if (reducedMotion.matches) {
			pause();
			render(30);
		} else if (slide && !slide.hasAttribute("inert")) {
			play();
		}
	});
}
