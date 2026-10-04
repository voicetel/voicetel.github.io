// Pure, side-effect-free helpers extracted from index.html so the renderer's
// core SIP logic (transport config, mute toggle, hangup sequencing, and the
// stable Contact identity) can be unit tested without an Electron/DOM/SIP
// runtime. Mirrors the voiceml-phone-desktop lib/renderer-helpers.js so the two
// desktops stay symmetric; this carrier build omits the tenant-provisioning /
// domain-derivation helpers (it registers to a fixed carrier endpoint).
//
// UMD: in the renderer this loads as a plain <script> and assigns
// window.RendererHelpers; under Node/Vitest it is a CommonJS module. The inline
// renderer delegates to these so there is a single source of truth (no drift).
(function (factory) {
	const api = factory();
	// Environment detection: one of these branches is unreachable in whichever
	// runtime loads the file (Node/Vitest reaches CommonJS; the browser <script>
	// reaches window), so it is excluded from coverage. The behavior is still
	// asserted by the "UMD wrapper" test.
	/* v8 ignore start */
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	if (typeof window !== "undefined") {
		window.RendererHelpers = api;
	}
	/* v8 ignore stop */
})(function () {
	"use strict";

	// Fixed Contact host (TEST-NET-1, RFC 5737 — never routable). sip.js 0.15's
	// hackIpInContact:true randomizes 192.0.2.<1-254> on every UA rebuild; pinning
	// it (with a stable contactName) keeps the Contact URI byte-identical so a
	// re-register refreshes ONE usrloc binding instead of orphaning the old one.
	const STABLE_CONTACT_HOST = "192.0.2.1";
	// A persisted Contact user-part is a 6-32 char lowercase-alphanumeric token.
	const CONTACT_USER_PATTERN = /^[a-z0-9]{6,32}$/;

	// SIP.js 0.15 recognizes maxReconnectionAttempts / reconnectionTimeout /
	// keepAliveInterval. The pre-fix wsServer* names were silently ignored, so
	// the socket never auto-reconnected (defaults: 3 attempts, keepalive off);
	// these are the working names. Values match the device-verified mobile twin.
	function buildTransportOptions(server) {
		return {
			wsServers: [server],
			traceSip: true,
			maxReconnectionAttempts: 15,
			reconnectionTimeout: 4,
			keepAliveInterval: 30,
		};
	}

	// Compute + apply a mute toggle against an RTCPeerConnection. Flips the mute
	// state first, then sets each audio sender's track.enabled to its opposite
	// (enabled when NOT muted). Guards a missing peer connection so the mute
	// button can never throw. Returns { changed, muted }: changed=false means
	// there was no peer connection and the caller should leave its state alone.
	function applyMuteToggle(pc, wasMuted) {
		if (!pc || typeof pc.getSenders !== "function") {
			return { changed: false, muted: wasMuted };
		}
		const nowMuted = !wasMuted;
		pc.getSenders().forEach((sender) => {
			if (sender.track && sender.track.kind === "audio") {
				sender.track.enabled = !nowMuted;
			}
		});
		return { changed: true, muted: nowMuted };
	}

	// State-aware hangup sequencing. terminate() is direction/state-aware in
	// sip.js 0.15 (BYE when established, CANCEL/reject before answer). The old
	// `hasAnswer ? bye() : cancel()` called caller-side cancel() on an answered
	// inbound session, which throws and aborts the hangup. On failure fall back
	// to bye(), and if that also throws, run onTeardown() so the UI is never
	// stuck on a dead call. Returns which path was taken.
	function runHangup(session, handlers) {
		const h = handlers || {};
		const logFn = typeof h.log === "function" ? h.log : function () {};
		if (!session) {
			logFn("⚠️ No currentSession to hang up");
			return "none";
		}
		try {
			session.terminate();
			logFn("SIP termination sent (BYE/CANCEL per state)");
			return "terminate";
		} catch (e) {
			logFn(`terminate() failed: ${e.message}; trying bye()`);
			try {
				session.bye();
				logFn("SIP BYE sent (fallback)");
				return "bye";
			} catch (e2) {
				logFn(`bye() failed too: ${e2.message}; local teardown`);
				if (typeof h.onTeardown === "function") h.onTeardown();
				return "teardown";
			}
		}
	}

	// A 12-char lowercase-alphanumeric token for the Contact user-part. Prefers
	// the Web Crypto RNG; falls back to Math.random (this is an identifier, not a
	// secret). Ported from the device-verified mobile twin (generateContactToken).
	function generateContactToken() {
		const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
		const len = 12;
		const rng =
			globalThis.crypto &&
			typeof globalThis.crypto.getRandomValues === "function"
				? globalThis.crypto
				: null;
		let out = "";
		if (rng) {
			const buf = new Uint8Array(len);
			rng.getRandomValues(buf);
			for (let i = 0; i < len; i++) {
				out += alphabet[buf[i] % alphabet.length];
			}
		} else {
			for (let i = 0; i < len; i++) {
				out += alphabet[Math.floor(Math.random() * alphabet.length)];
			}
		}
		return out;
	}

	function isValidContactUser(user) {
		return typeof user === "string" && CONTACT_USER_PATTERN.test(user);
	}

	// Decide the stable Contact user-part from a (possibly missing/invalid) stored
	// value: reuse a valid persisted token byte-identically (persist:false), else
	// mint a new one to persist (persist:true).
	function chooseContactUser(stored) {
		if (isValidContactUser(stored)) {
			return { user: stored, persist: false };
		}
		return { user: generateContactToken(), persist: true };
	}

	// Resolve the Contact user-part AFTER the async read has completed, given
	// whatever is currently memoized.
	//
	// The warm-up (getStableContactUser) awaits localforage, and the synchronous
	// accessor can mint DURING that await — loadConfig schedules an auto-register
	// on a 500 ms timer before the warm-up is awaited, so a slow read loses the
	// race. A token minted that way is already in the Contact URI of a REGISTER on
	// the wire, and the registrar holds a binding for it. It therefore wins over
	// anything the read returned: adopting it keeps the live binding, whereas
	// overwriting the memo with the stored value would strand that binding and
	// leak one usrloc entry per occurrence — the precise failure the stable
	// Contact mechanism exists to prevent.
	//
	// persist:true on the adopt path re-asserts the write, because the sync
	// accessor's own write may have been issued before the read resolved.
	function resolveContactUser({ memo, stored } = {}) {
		if (isValidContactUser(memo)) {
			return { user: memo, persist: true, adopted: true };
		}
		return { ...chooseContactUser(stored), adopted: false };
	}

	// --- Hold / resume (D-2 / mobile call-controls.js) ----------------------
	// sip.js 0.15.11 hold()/unhold() return undefined and drive the outcome off
	// reinviteAccepted/reinviteFailed events, so the renderer keeps an in-flight
	// latch. These pure helpers hold the decision logic; the renderer owns the
	// sip.js calls, timers, and DOM.

	// Decide whether a hold/resume tap should proceed. A re-INVITE already in
	// flight (ours via holdInFlight, or a session-timer refresh via
	// pendingReinvite) must be ignored — sip.js would warn-and-drop a second
	// sendReinvite and desync state. Otherwise proceed toward the opposite state.
	function planHoldToggle(state) {
		const s = state || {};
		if (s.holdInFlight || s.pendingReinvite) {
			return { proceed: false, reason: "in-flight", desiredHold: !!s.isOnHold };
		}
		return { proceed: true, reason: null, desiredHold: !s.isOnHold };
	}

	// Reconcile the optimistic hold state once sip.js settles the re-INVITE:
	// success keeps the desired state, failure reverts to its opposite.
	function resolveHoldSettle(desiredHold, success) {
		return success ? !!desiredHold : !desiredHold;
	}

	// Apply the hold state to an RTCPeerConnection's audio senders. While held the
	// mic track is disabled regardless of mute; when resumed it follows mute.
	// Guards a missing peer connection (returns changed:false), like applyMuteToggle.
	function applyHoldToSenders(pc, onHold, muted) {
		if (!pc || typeof pc.getSenders !== "function") {
			return { changed: false };
		}
		pc.getSenders().forEach((sender) => {
			if (sender.track && sender.track.kind === "audio") {
				sender.track.enabled = onHold ? false : !muted;
			}
		});
		return { changed: true };
	}

	// --- Blind transfer (D-2 / mobile call-controls.js) ---------------------

	// Strip a raw transfer-target input to digits only; null if there are none
	// (cancelled prompt or non-numeric entry). Mirrors the mobile handling.
	function normalizeTransferTarget(raw) {
		if (raw == null) return null;
		const digits = String(raw).replace(/\D/g, "");
		return digits.length ? digits : null;
	}

	// Build the REFER target URI from a digit string and the SIP domain. VoiceTel
	// is a fixed-carrier endpoint, so the domain is SIP_DOMAIN (same as makeCall).
	function buildTransferUri(number, domain) {
		return `sip:${number}@${domain}`;
	}

	// Only a call we ANSWERED (incoming) may be blind-transferred; a call we
	// originated is not a supported REFER source. Mirrors the mobile guard.
	function canTransfer(hasCall, callDirection) {
		return !!hasCall && callDirection === "incoming";
	}

	// --- Dial-as-you-type formatting (D-3 / mobile helpers.js) --------------
	// NANP grouping for <=10 subscriber digits ("(555) 123-4567", optional
	// "1 "/"+1 " country-code prefix); passes feature/SIP codes (* # letters @)
	// and non-NANP international (+digits) through untouched. Display only —
	// makeCall() strips non-digits before dialing.
	//
	// This desktop port drops two sub-branches that are provably unreachable in
	// the mobile original: the leading "1 " prefix in the >10-digit path (cc is
	// always false there, since cc only sets after trimming 11->10 digits), and
	// the bare "+" prefix in the grouped path (hasPlus && !cc already returned
	// above). Output is byte-identical to the mobile twin.
	function formatDialAsYouType(raw) {
		const s = raw == null ? "" : String(raw);
		if (s === "") return "";
		if (/[*#a-zA-Z@]/.test(s)) return s;
		const hasPlus = s.trim().startsWith("+");
		let d = s.replace(/\D/g, "");
		if (!d) return hasPlus ? "+" : "";
		let cc = false;
		if (d.length === 11 && d[0] === "1") {
			cc = true;
			d = d.slice(1);
		}
		// International (+, non-NANP): keep +digits without NANP grouping.
		if (hasPlus && !cc) return "+" + d;
		// More than 10 subscriber digits (and not 1+10 NANP): leave the digits.
		if (d.length > 10) return d;
		let grouped;
		if (d.length <= 3) grouped = d;
		else if (d.length <= 6) grouped = `(${d.slice(0, 3)}) ${d.slice(3)}`;
		else grouped = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
		const prefix = cc ? (hasPlus ? "+1 " : "1 ") : "";
		return prefix + grouped;
	}

	// --- Audio: mic refresh (D-4 / mobile audio.js) -------------------------

	// Find the first audio RTCRtpSender on a peer connection (the live outbound
	// mic track), or null. refreshMicrophoneTrack() uses it to replaceTrack().
	// Guards a missing / getSenders-less pc, like applyMuteToggle.
	function selectAudioSender(pc) {
		if (!pc || typeof pc.getSenders !== "function") return null;
		const senders = pc.getSenders();
		for (const sender of senders) {
			if (sender.track && sender.track.kind === "audio") return sender;
		}
		return null;
	}

	// getUserMedia constraints for a refreshed mic capture: voice audio with the
	// standard WebRTC processing (echo cancellation / noise suppression / AGC),
	// no video. Matches the mobile twin.
	function micCaptureConstraints() {
		return {
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
			video: false,
		};
	}

	// --- Theme / appearance (D-5 / mobile theme.js) -------------------------

	// Normalize an appearance preference to one of "system" | "light" | "dark";
	// any unrecognized value (including null/undefined) falls back to "system".
	// "system" leaves data-theme off so the prefers-color-scheme media query
	// follows the OS; "light"/"dark" set data-theme on <html> to override it.
	function normalizeThemePref(pref) {
		return pref === "light" || pref === "dark" ? pref : "system";
	}

	// --- Security / validation helpers (D-7 / mobile) -----------------------

	// Escape HTML metacharacters so untrusted values (contact names, phone
	// types/numbers) can be safely interpolated into innerHTML. Mirrors mobile
	// escapeContactHtml (11917cf: "stop address-book values executing as script").
	// & must be replaced first so the others are not double-escaped.
	function escapeHtml(s) {
		return String(s == null ? "" : s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	// Sanitize a calling display name before it goes into SIP headers (From /
	// P-Asserted-Identity). Strips control chars, double-quote and backslash
	// (which break the quoted name-addr and allow CRLF header injection),
	// collapses whitespace, trims, and caps at 64 chars. Mirrors mobile
	// sanitizeCallingName.
	function sanitizeCallingName(raw) {
		if (!raw || typeof raw !== "string") return "";
		// eslint-disable-next-line no-control-regex
		const stripped = raw.replace(/[\u0000-\u001f\u007f"\\]/g, "");
		return stripped.replace(/\s+/g, " ").trim().slice(0, 64);
	}

	// Password policy: exactly 10 alphanumerics (the carrier SIP password shape).
	// Advisory only — the server is the authority — so callers warn, not block.
	function isValidPassword(password) {
		return !!password && /^[A-Za-z0-9]{10}$/.test(password);
	}

	// Redact a token for logging: never emit the value. Mirrors mobile redactToken.
	function redactToken(value) {
		if (!value || typeof value !== "string") return "[none]";
		if (value.length <= 8) return "***";
		return `${value.slice(0, 6)}…[${value.length} chars]`;
	}

	// In-call Dialpad button (mobile 3.8.4 parity, ported 2026-08-19): the
	// button sits in the in-call control grid and toggles the DTMF keypad. It
	// is shown only while a call is up with the call panel showing; its label
	// names the action the tap will take ("Dialpad" opens, "Hide Dialpad"
	// closes). Outside a call it is hidden and reset to "Dialpad".
	function inCallDialpadButtonState(state) {
		const inCall = !!(state && state.inCall);
		const padUp = !!(state && state.padUp);
		return {
			visible: inCall,
			label: inCall && padUp ? "Hide Dialpad" : "Dialpad",
		};
	}

	return {
		inCallDialpadButtonState,
		STABLE_CONTACT_HOST,
		buildTransportOptions,
		applyMuteToggle,
		runHangup,
		generateContactToken,
		isValidContactUser,
		chooseContactUser,
		resolveContactUser,
		planHoldToggle,
		resolveHoldSettle,
		applyHoldToSenders,
		normalizeTransferTarget,
		buildTransferUri,
		canTransfer,
		formatDialAsYouType,
		selectAudioSender,
		micCaptureConstraints,
		normalizeThemePref,
		escapeHtml,
		sanitizeCallingName,
		isValidPassword,
		redactToken,
	};
});
