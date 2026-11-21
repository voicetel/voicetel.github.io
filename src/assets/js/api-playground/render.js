// Operation form generator. Renders one labeled input per OpenAPI
// parameter (path / query / header), plus a JSON body editor for
// operations that declare a requestBody. The body is pre-filled with
// the spec example when one exists; otherwise it falls back to a
// schema-walked sample (resolving $refs) so the customer sees a stub
// matching the shape of the request body, the way Redoc does.
// multipart/form-data bodies render one field per schema property
// instead, with file inputs for binary properties.

import { resolveRef, sampleForRequestBody } from "./schema-sample.js";

export const MULTIPART = "multipart/form-data";

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

export function bodyContentType(requestBody) {
	if (!requestBody || !requestBody.content) return null;
	const types = Object.keys(requestBody.content);
	if (types.includes("application/json")) return "application/json";
	if (types.includes(MULTIPART)) return MULTIPART;
	return types[0] || null;
}

function deref(spec, schema) {
	if (schema && schema.$ref) return resolveRef(spec, schema.$ref) || {};
	return schema || {};
}

function isBinary(schema) {
	return schema.type === "string" && schema.format === "binary";
}

function fileExample(prop) {
	const example = Array.isArray(prop.example) ? prop.example[0] : prop.example;
	return typeof example === "string" && example ? example : "document.pdf";
}

function multipartFields(op, spec) {
	const media = op.requestBody.content[MULTIPART];
	const schema = deref(spec, media.schema);
	const required = new Set(schema.required || []);
	const encoding = media.encoding || {};
	return Object.entries(schema.properties || {}).map(([name, raw]) => {
		const prop = deref(spec, raw);
		const isArray = prop.type === "array";
		const item = isArray ? deref(spec, prop.items) : prop;
		return {
			name,
			in: "form",
			required: required.has(name),
			description: prop.description || "",
			schema: isArray && !isBinary(item) ? item : prop,
			file: isBinary(item),
			multiple: isArray,
			accept: (encoding[name] && encoding[name].contentType) || "",
			example: fileExample(prop),
		};
	});
}

function renderFileField(op, field) {
	const id = paramId(op, field);
	const accept = field.accept ? ` accept="${escapeAttr(field.accept.replace(/\s+/g, ""))}"` : "";
	return `
		<div class="form-row playground-field">
			<label for="${id}">${escapeText(paramLabelText(field))}</label>
			<input id="${id}" name="${escapeAttr(field.name)}" type="file" data-param-in="form" data-param-name="${escapeAttr(field.name)}" data-file="${escapeAttr(field.example)}"${field.multiple ? " multiple" : ""}${field.required ? " required" : ""}${accept}>
			${field.description ? `<p class="form-note">${escapeText(field.description)}</p>` : ""}
		</div>
	`.trim();
}

function renderMultipartBody(op, spec) {
	const required = op.requestBody.required ? " (required)" : "";
	const fields = multipartFields(op, spec)
		.map((f) => (f.file ? renderFileField(op, f) : renderField(op, f)))
		.join("");
	return `
		<fieldset class="playground-body playground-body--multipart">
			<legend>Request body${required}</legend>
			<p class="form-note">Content-Type: <code>${MULTIPART}</code>. Files are sent from this browser straight to the API.</p>
			<div class="form-grid playground-form-grid">${fields}</div>
		</fieldset>
	`.trim();
}

function renderBody(op, spec) {
	if (!op.requestBody) return "";
	const contentType = bodyContentType(op.requestBody);
	if (contentType === MULTIPART) return renderMultipartBody(op, spec);
	const sample = sampleForRequestBody(op.requestBody, spec);
	const prefill = sample === null ? "" : JSON.stringify(sample, null, 2);
	const required = op.requestBody.required ? " (required)" : "";
	const id = `pg-body-${op.operationId}`;
	const isJson = contentType === "application/json";
	const note = isJson
		? `Content-Type: <code>application/json</code>`
		: `Content-Type: <code>${escapeText(contentType || "application/octet-stream")}</code>`;
	const rows = Math.min(24, Math.max(6, prefill.split("\n").length + 1));
	return `
		<div class="playground-body">
			<label for="${id}">Request body${required}</label>
			<p class="form-note">${note}</p>
			<textarea id="${id}" data-param-in="body" rows="${rows}" spellcheck="false" autocomplete="off">${escapeText(prefill)}</textarea>
		</div>
	`.trim();
}

export function renderOperationForm(op, spec) {
	const params = op.parameters || [];
	const paramsHtml =
		params.length === 0
			? ""
			: `<div class="form-grid playground-form-grid">${params.map((p) => renderField(op, p)).join("")}</div>`;
	const bodyHtml = renderBody(op, spec);
	if (!paramsHtml && !bodyHtml) {
		return `<p class="playground-empty">This operation takes no parameters. Press Send to run it.</p>`;
	}
	return `${paramsHtml}${bodyHtml}`;
}

export function readFormValues(formEl) {
	const values = {
		path: {},
		query: {},
		header: {},
		body: "",
		form: {},
		files: {},
		fileExamples: {},
	};
	const fields = formEl.querySelectorAll("[data-param-name], [data-param-in='body']");
	fields.forEach((field) => {
		const where = field.dataset.paramIn;
		const value = field.value;
		if (where === "body") {
			values.body = value || "";
			return;
		}
		const name = field.dataset.paramName;
		if (field.hasAttribute("data-file")) {
			if (field.files && field.files.length) values.files[name] = Array.from(field.files);
			else values.fileExamples[name] = field.dataset.file;
			return;
		}
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
