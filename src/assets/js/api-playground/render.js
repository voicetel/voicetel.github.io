// Operation form generator. Renders one labeled input per OpenAPI
// parameter (path / query / header), plus a JSON body editor for
// operations that declare a requestBody. The body is pre-filled with
// the spec example when one exists and otherwise starts empty.

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

function pickBodyExample(requestBody) {
	if (!requestBody || !requestBody.content) return null;
	const json = requestBody.content["application/json"];
	if (!json) return null;
	if (json.example !== undefined) return json.example;
	if (json.examples) {
		const first = Object.values(json.examples)[0];
		if (first && first.value !== undefined) return first.value;
	}
	if (json.schema && json.schema.example !== undefined) return json.schema.example;
	return null;
}

function bodyContentType(requestBody) {
	if (!requestBody || !requestBody.content) return null;
	const types = Object.keys(requestBody.content);
	if (types.includes("application/json")) return "application/json";
	return types[0] || null;
}

function renderBody(op) {
	if (!op.requestBody) return "";
	const contentType = bodyContentType(op.requestBody);
	const example = pickBodyExample(op.requestBody);
	const prefill = example === null ? "" : JSON.stringify(example, null, 2);
	const required = op.requestBody.required ? " (required)" : "";
	const id = `pg-body-${op.operationId}`;
	const isJson = contentType === "application/json";
	const note = isJson
		? `Content-Type: <code>application/json</code>`
		: `Content-Type: <code>${escapeText(contentType || "application/octet-stream")}</code>`;
	return `
		<div class="playground-body">
			<label for="${id}">Request body${required}</label>
			<p class="form-note">${note}</p>
			<textarea id="${id}" data-param-in="body" rows="10" spellcheck="false" autocomplete="off">${escapeText(prefill)}</textarea>
		</div>
	`.trim();
}

export function renderOperationForm(op) {
	const params = op.parameters || [];
	const paramsHtml =
		params.length === 0
			? ""
			: `<div class="form-grid playground-form-grid">${params.map((p) => renderField(op, p)).join("")}</div>`;
	const bodyHtml = renderBody(op);
	if (!paramsHtml && !bodyHtml) {
		return `<p class="playground-empty">This operation takes no parameters. Press Send to run it.</p>`;
	}
	return `${paramsHtml}${bodyHtml}`;
}

export function readFormValues(formEl) {
	const values = { path: {}, query: {}, header: {}, body: "" };
	const fields = formEl.querySelectorAll("[data-param-name], [data-param-in='body']");
	fields.forEach((field) => {
		const where = field.dataset.paramIn;
		const value = field.value;
		if (where === "body") {
			values.body = value || "";
			return;
		}
		const name = field.dataset.paramName;
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
