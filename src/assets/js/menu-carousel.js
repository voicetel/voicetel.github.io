const ROOT = document.querySelector("[data-menu-carousel]");
if (ROOT) {
	const slides = Array.from(ROOT.querySelectorAll(".menu-carousel-slide"));
	const dots = Array.from(ROOT.querySelectorAll("[data-carousel-dot]"));
	const prev = ROOT.querySelector("[data-carousel-prev]");
	const next = ROOT.querySelector("[data-carousel-next]");
	const pauseBtn = ROOT.querySelector("[data-carousel-pause]");
	const pauseIcon = ROOT.querySelector("[data-pause-icon]");
	const playIcon = ROOT.querySelector("[data-play-icon]");
	const pauseLabel = ROOT.querySelector("[data-pause-label]");

	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const ADVANCE_MS = 10000;

	let current = 0;
	let timer = null;
	let userPaused = false;

	function show(index) {
		current = (index + slides.length) % slides.length;
		slides.forEach((slide, i) => {
			if (i === current) {
				slide.removeAttribute("inert");
			} else {
				slide.setAttribute("inert", "");
			}
		});
		dots.forEach((dot, i) => {
			if (i === current) {
				dot.setAttribute("aria-current", "true");
			} else {
				dot.removeAttribute("aria-current");
			}
		});
	}

	function startTimer() {
		stopTimer();
		if (userPaused || reducedMotion.matches) return;
		timer = window.setInterval(() => show(current + 1), ADVANCE_MS);
	}

	function stopTimer() {
		if (timer !== null) {
			window.clearInterval(timer);
			timer = null;
		}
	}

	function setPaused(paused) {
		userPaused = paused;
		pauseBtn.setAttribute("aria-pressed", String(paused));
		pauseBtn.setAttribute("aria-label", paused ? "Resume auto-advance" : "Pause auto-advance");
		if (pauseLabel) {
			pauseLabel.textContent = paused ? "Resume auto-advance" : "Pause auto-advance";
		}
		if (pauseIcon) pauseIcon.hidden = paused;
		if (playIcon) playIcon.hidden = !paused;
		if (paused) stopTimer();
		else startTimer();
	}

	prev.addEventListener("click", () => {
		show(current - 1);
		startTimer();
	});

	next.addEventListener("click", () => {
		show(current + 1);
		startTimer();
	});

	dots.forEach((dot, i) => {
		dot.addEventListener("click", () => {
			show(i);
			startTimer();
		});
	});

	pauseBtn.addEventListener("click", () => setPaused(!userPaused));

	ROOT.addEventListener("mouseenter", stopTimer);
	ROOT.addEventListener("mouseleave", () => {
		if (!userPaused) startTimer();
	});
	ROOT.addEventListener("focusin", stopTimer);
	ROOT.addEventListener("focusout", (event) => {
		if (!ROOT.contains(event.relatedTarget) && !userPaused) startTimer();
	});

	ROOT.addEventListener("keydown", (event) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			show(current - 1);
			startTimer();
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			show(current + 1);
			startTimer();
		}
	});

	reducedMotion.addEventListener("change", () => {
		if (reducedMotion.matches) stopTimer();
		else startTimer();
	});

	show(0);
	startTimer();
}
