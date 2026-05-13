// VoiceML validator bootstrap. Wires the paste textarea to the validate
// pass and renders status + summary tables. Pure client-side; nothing is
// uploaded.

import { validate, summarize } from "./validate.js";
import { renderStatus, renderSummary } from "./render.js";

const root = document.querySelector("[data-voiceml-validator]");
if (root) boot(root);

function boot(rootEl) {
	const els = {
		input: rootEl.querySelector("[data-validator-input]"),
		validate: rootEl.querySelector("[data-validator-validate]"),
		clear: rootEl.querySelector("[data-validator-clear]"),
		sample: rootEl.querySelector("[data-validator-sample]"),
		status: rootEl.querySelector("[data-validator-status]"),
		summary: rootEl.querySelector("[data-validator-summary]"),
	};

	const run = () => {
		const result = validate(els.input.value);
		renderStatus(els.status, result);
		renderSummary(els.summary, result.wellFormed ? summarize(result.occurrences) : null);
	};

	els.validate.addEventListener("click", run);
	els.input.addEventListener("keydown", (event) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			run();
		}
	});
	els.clear.addEventListener("click", () => {
		els.input.value = "";
		els.input.focus();
		renderStatus(els.status, null);
		renderSummary(els.summary, null);
	});
	if (els.sample) {
		els.sample.addEventListener("click", () => {
			els.input.value = sampleMarkup();
			run();
		});
	}
}

function sampleMarkup() {
	return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
	<Say voice="alice" language="en-US">
		Welcome to VoiceTel.
		<break time="500ms"/>
		<emphasis level="strong">Press one</emphasis> to continue.
	</Say>
	<Gather input="dtmf" numDigits="1" action="/menu" timeout="5">
		<Say>You have ten seconds.</Say>
	</Gather>
	<Dial timeout="30" callerId="+15555550100">
		<Number>+15555550199</Number>
		<Sip>sip:agent@example.com</Sip>
	</Dial>
	<Hangup/>
</Response>`;
}
