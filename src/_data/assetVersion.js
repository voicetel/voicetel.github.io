// Cache-busting token appended to stylesheet and script URLs (?v=…). GitHub
// Pages serves assets with a ten-minute cache, and several files keep their
// names across redesigns, so without this a returning visitor can load new
// HTML with stale CSS or JS. The short commit hash changes on every deploy.
import { execSync } from "node:child_process";

let version;
try {
	version = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
		.toString()
		.trim();
} catch {
	version = String(Date.now());
}

export default version;
