// Operation form generator. Phase 1 is GET-only across the v2.2 surface
// and every parameter in the current v2.2 GET set is a path parameter, so
// the form is a simple labeled-input list. The renderer is still written
// against the general OpenAPI parameter object so query/header params
// will pick up the same affordances when Phase 2 adds non-GET ops.

function paramId(op, param) {
	return `pg-${op.operationId}-${param.in}-${param.name}`;
}

function paramLabelText(param) {
	const tag = param.required ? " (required)" : "";
	return `${param.name}${tag}`;
}

function paramHelp(param) {
	const schema = param.schema || {};
	const bits = [];
	if (schema.type) bits.push(schema.type);
	if (schema.format) bits.push(schema.format);
	if (schema.example !== undefined) bits.push(`e.g. ${schema.example}`);
	if (param.description) bits.push(param.description);
	return bits.join(" · ");
}

function inputTypeFor(schema = {}) {
	if (schema.type === "integer" || schema.type === "number") return "number";
	return "text";
}

function exampleValueFor(param) {
	const schema = param.schema || {};
	if (schema.example !== undefined) return String(schema.example);
	if (Array.isArray(schema.enum) && schema.enum.length) return String(schema.enum[0]);
	return "";
}

function renderEnumSelect(op, param) {
	const id = paramId(op, param);
	const options = param.schema.enum
		.map((v) => `<option value="${escapeAttr(v)}">${escapeText(v)}</option>`)
		.join("");
	return `<select id="${id}" name="${escapeAttr(param.name)}" data-param-in="${param.in}" data-param-name="${escapeAttr(param.name)}"${param.required ? " required" : ""}>${options}</select>`;
}

function renderInput(op, param) {
	const id = paramId(op, param);
	const schema = param.schema || {};
	const type = inputTypeFor(schema);
	const placeholder = exampleValueFor(param);
	return `<input id="${id}" name="${escapeAttr(param.name)}" type="${type}" data-param-in="${param.in}" data-param-name="${escapeAttr(param.name)}"${param.required ? " required" : ""}${placeholder ? ` placeholder="${escapeAttr(placeholder)}"` : ""} autocomplete="off" spellcheck="false">`;
}

function renderField(op, param) {
	const id = paramId(op, param);
	const control =
		param.schema && Array.isArray(param.schema.enum) && param.schema.enum.length
			? renderEnumSelect(op, param)
			: renderInput(op, param);
	const help = paramHelp(param);
	return `
		<div class="form-row playground-field">
			<label for="${id}">${escapeText(paramLabelText(param))}</label>
			${control}
			${help ? `<p class="form-note">${escapeText(help)}</p>` : ""}
		</div>
	`.trim();
}

export function renderOperationForm(op) {
	const params = op.parameters || [];
	if (params.length === 0) {
		return `<p class="playground-empty">This operation takes no parameters. Press Send to run it.</p>`;
	}
	return `<div class="form-grid playground-form-grid">${params.map((p) => renderField(op, p)).join("")}</div>`;
}

export function readFormValues(formEl) {
	const values = { path: {}, query: {}, header: {} };
	const fields = formEl.querySelectorAll("[data-param-name]");
	fields.forEach((field) => {
		const where = field.dataset.paramIn;
		const name = field.dataset.paramName;
		const value = field.value;
		if (value === undefined || value === null || value === "") return;
		if (!values[where]) values[where] = {};
		values[where][name] = value;
	});
	return values;
}

function escapeText(value) {
	return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value) {
	return escapeText(value).replace(/"/g, "&quot;");
}
