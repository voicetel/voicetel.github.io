// What the renderer shows for an update status from the main process
// (lib/app-updater.js): the banner over the app, the line under Settings →
// Updates, and whether "Check for Updates" can be pressed. Pure, so it is
// tested without a DOM.
//
// UMD: window.UpdateBanner in the renderer, a CommonJS module under Node.
(function (factory) {
	const api = factory();
	// Whichever branch the loading runtime doesn't take is excluded from
	// coverage (mirrors lib/renderer-helpers.js's UMD wrapper).
	/* v8 ignore start */
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	}
	if (typeof window !== "undefined") {
		window.UpdateBanner = api;
	}
	/* v8 ignore stop */
})(function () {
	"use strict";

	/**
	 * The banner for a status, or null for none. A downloaded update offers
	 * the restart (during a call it says it waits for the call to end; the
	 * click is refused then too); a newer version this copy cannot install,
	 * or one whose install failed, offers the download page. "Later" hides
	 * the banner for that version.
	 * @param {object|null} status
	 * @param {{inCall?: boolean, dismissedVersion?: string|null}} [context]
	 * @returns {{text: string, action: "install"|"download", actionLabel: string}|null}
	 */
	function bannerFor(status, context) {
		const { inCall = false, dismissedVersion = null } = context || {};
		if (!status || !status.version || status.version === dismissedVersion) {
			return null;
		}
		const name = `VoiceTel ${status.version}`;
		if (status.state === "ready") {
			return {
				text: inCall
					? `${name} is ready. Restart to install it when your call ends.`
					: `${name} is ready to install.`,
				action: "install",
				actionLabel: "Restart Now",
			};
		}
		if (status.state === "available") {
			return {
				text: `${name} is available.`,
				action: "download",
				actionLabel: "Download",
			};
		}
		if (status.state === "error") {
			return {
				text: `${name} could not be installed automatically.`,
				action: "download",
				actionLabel: "Download",
			};
		}
		return null;
	}

	/** The line under Settings → Updates for a status. */
	function settingsLine(status) {
		if (!status) return "";
		const name = status.version ? `VoiceTel ${status.version}` : "";
		switch (status.state) {
			case "disabled":
				return "Automatic updates are off in development builds.";
			case "checking":
				return "Checking for updates…";
			case "up-to-date":
				return "VoiceTel is up to date.";
			case "downloading":
				return status.percent == null
					? `Downloading ${name}…`
					: `Downloading ${name}… ${status.percent}%`;
			case "ready":
				return `${name} is ready. Restart VoiceTel to install it.`;
			case "available":
				return `${name} is available from the download page.`;
			case "error":
				return name
					? `Updating to ${name} failed: ${status.error}`
					: `Update check failed: ${status.error}`;
			default:
				return "";
		}
	}

	/** Whether "Check for Updates" can be pressed. */
	function canCheck(status) {
		return Boolean(
			status &&
			status.state !== "disabled" &&
			status.state !== "checking" &&
			status.state !== "downloading",
		);
	}

	return { bannerFor, settingsLine, canCheck };
});
