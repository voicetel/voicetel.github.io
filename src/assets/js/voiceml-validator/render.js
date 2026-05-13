// Render validator output: status banner, error list, summary tables.

export function renderStatus(target, result) {
	if (!result) {
		target.innerHTML = "";
		return;
	}
	if (result.errors.length === 0) {
		target.innerHTML = `
			<div class="alert alert-success" role="status">
				<strong>VoiceML is valid.</strong>
				<p>Document is well-formed and every element matches the schema.</p>
			</div>
		`;
	} else {
		const wf = result.wellFormed ? "Schema check failed" : "Not well-formed XML";
		target.innerHTML = `
			<div class="alert alert-error" role="alert">
				<strong>${wf}.</strong>
				<ul class="validator-errors">
					${result.errors.map((e) => `<li>${escapeText(e.message)}</li>`).join("")}
				</ul>
			</div>
		`;
	}
}

export function renderSummary(target, summary) {
	if (!summary) {
		target.innerHTML = "";
		return;
	}
	const parts = [];
	parts.push(renderGroup("Verbs", summary.verbs));
	parts.push(renderGroup("Nouns", summary.nouns));
	if (summary.ssml.length > 0) {
		parts.push(renderGroup("SSML", summary.ssml));
	}
	if (summary.unknown.length > 0) {
		parts.push(renderGroup("Unknown elements", summary.unknown, true));
	}
	target.innerHTML = parts.filter(Boolean).join("");
}

function renderGroup(title, entries, isUnknown = false) {
	if (entries.length === 0) {
		return `
			<section class="validator-group">
				<h3>${escapeText(title)}</h3>
				<p class="form-note">None used.</p>
			</section>
		`;
	}
	const rows = entries
		.map((entry) => {
			const parents = entry.parents.length
				? entry.parents
						.map(
							(p) =>
								`<code>${escapeText(p.name)}</code>${p.count > 1 ? `×${p.count}` : ""}`
						)
						.join(", ")
				: '<span class="form-note">—</span>';
			const cls = isUnknown ? "validator-row validator-row--unknown" : "validator-row";
			return `
				<tr class="${cls}">
					<td><code>${escapeText(entry.name)}</code></td>
					<td class="validator-count">${entry.count}</td>
					<td>${parents}</td>
				</tr>
			`;
		})
		.join("");
	return `
		<section class="validator-group">
			<h3>${escapeText(title)}</h3>
			<table class="data-table validator-table">
				<thead>
					<tr>
						<th>Element</th>
						<th class="validator-count">Count</th>
						<th>Inside</th>
					</tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</section>
	`;
}

function escapeText(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
