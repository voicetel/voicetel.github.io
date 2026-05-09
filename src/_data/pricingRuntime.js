// Build-time transform of pricing.json. Any service that has a
// `discountFormula` block is converted to a sampled (volume, rate) lookup
// curve before reaching the template. This keeps the underlying formula
// (minVolume / maxVolume / minRate / exponent) out of the rendered HTML —
// a casual source-viewer sees an array of points, not the floor or the
// curve shape.
//
// Determined viewers can still input large volumes in the calculator and
// observe the resulting rate; full opacity is impossible for any
// client-side calculator. The goal here is "not legible at a glance," not
// cryptographic.
//
// To opt any service into the curve mechanism, add a `discountFormula`
// block to it in pricing.json. Existing tier-based services keep their
// `discountTiers` and pass through unchanged.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(__dirname, "pricing.json"), "utf8"));

// Sample t-values within [minVolume, maxVolume]. Mapping `t` → volume
// adapts the sample density to each service's own volume range, so DID
// curves (max ~10k) and minute curves (max ~5M) both get evenly-spaced
// samples without needing service-specific hardcoded volumes.
const T_SAMPLES = [0, 0.005, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.85, 0.95, 1.0];

function sampleCurve(formula, baseRate) {
	if (formula.type !== "powerCurve") return null;
	const { minVolume, maxVolume, minRate, exponent } = formula;
	const range = baseRate - minRate;
	const samples = [[0, baseRate]];
	for (const t of T_SAMPLES) {
		const v = Math.round(minVolume + t * (maxVolume - minVolume));
		const rate = baseRate - range * Math.pow(t, exponent);
		samples.push([v, Math.round(rate * 1e6) / 1e6]);
	}
	// Extend the floor past maxVolume so high inputs interpolate to the cap.
	samples.push([maxVolume * 2, minRate]);
	return samples;
}

function transformService(service) {
	if (!service.discountFormula) return service;
	const curve = sampleCurve(service.discountFormula, service.baseRate);
	if (!curve) return service;
	// Strip discountFormula from the served data; ship the lookup curve instead.
	// eslint-disable-next-line no-unused-vars
	const { discountFormula, ...rest } = service;
	return { ...rest, _curve: curve };
}

export default {
	...raw,
	groups: raw.groups.map((group) => ({
		...group,
		services: group.services.map(transformService),
	})),
};
