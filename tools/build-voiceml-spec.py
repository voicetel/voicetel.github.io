#!/usr/bin/env python3
"""Convert callBroadcast.yml to vendor/api-specs/voiceml.json with VoiceTel
branding, single voiceml.voicetel.com server, and tag groups so the Redoc
render gets a sensible sidebar instead of a flat path list.

Default source is the sibling callBroadcast checkout
(`../callBroadcast/internal/httpapi/openapi/callbroadcast.yml`); pass an
alternate path as the first arg to override.
"""
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = ROOT.parent / "callBroadcast" / "internal" / "httpapi" / "openapi" / "callbroadcast.yml"
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
OUT = ROOT / "vendor" / "api-specs" / "voiceml.json"


SID_LITERAL = re.compile(r"\b(AC|CA|CF|SK|SR|MZ|RT|RE|MM|SM|IM|MG|HX|PN|TR|US|RM|TJ|HR)[0-9a-f]{32}\b")


def rewrite_branding(value):
	"""Recursively rewrite callBroadcast / east-1 references in any string
	node. Also masks Twilio-shaped SID example literals so GitHub's secret
	scanner doesn't flag them as real credentials — the regex matches a
	2-letter prefix followed by exactly 32 hex chars (the canonical Twilio
	SID format) and replaces the hex tail with 32 x's. Schema patterns like
	`^AC[0-9a-f]{32}$` aren't matched (the `^` and `$` block the word
	boundary), so format documentation stays intact."""
	if isinstance(value, str):
		# Trademark: callBroadcast → VoiceML (preserve case neighbouring text)
		value = re.sub(r"callBroadcast", "VoiceML", value)
		value = re.sub(r"callbroadcast", "voiceml", value)
		# Single canonical host
		value = value.replace("east-1.us.voiceml.voicetel.com", "voiceml.voicetel.com")
		# Upstream substitutes the base URL at request time. For static rendering
		# we want the canonical public host baked in.
		value = value.replace("__CB_BASE_URL__", "https://voiceml.voicetel.com")
		# License URL pointed at an internal repo; redirect to the public legal page
		value = re.sub(
			r"https?://github\.com/voicetel/[A-Za-z0-9_-]+/blob/[^/]+/LICENSE",
			"https://voicetel.com/legal/",
			value,
		)
		# Mask SID example literals
		value = SID_LITERAL.sub(lambda m: m.group(1) + "x" * 32, value)
		# Trademark: TwiML must not ship on the public site (CLAUDE.md §3). Wire field
		# names such as Twiml are dict keys and are not walked as values here.
		value = re.sub(r"TwiML's", "voice markup's", value)
		value = re.sub(r"TwiML", "voice markup", value)
		# PCI / PCI-DSS references must not appear on the public site — they imply
		# a compliance posture we do not certify externally. Strip leading PCI from
		# upstream phrases like "PCI Pay session" so they render as "Pay session".
		value = re.sub(r"\s*\(PCI[- ]DSS[^)]*\)", "", value)
		value = re.sub(r"\bPCI[- ]DSS\b", "", value)
		value = re.sub(r"\bPCI Pay\b", "Pay", value)
		value = re.sub(r"\bPCI\b", "", value)
		# Payment-runtime internals (vendor names, internal flag/column names) are
		# also not public. Replace the specific "Account is not pay_enabled or has
		# no stripe_secret_key" 403 description shape with a customer-friendly
		# equivalent; remaining bare tokens get stripped after.
		value = re.sub(
			r"Account is not pay_enabled or has no stripe_secret_key\.?",
			"Account is not enabled for card capture. Contact support to turn it on.",
			value,
		)
		value = re.sub(r"\bstripe_secret_key\b", "card capture credentials", value)
		value = re.sub(r"\bpay_enabled\b", "card capture enabled", value)
		value = re.sub(r"\bStripe\b", "the card-capture provider", value)
		value = re.sub(r" {2,}", " ", value)
		return value
	if isinstance(value, dict):
		return {k: rewrite_branding(v) for k, v in value.items()}
	if isinstance(value, list):
		return [rewrite_branding(v) for v in value]
	return value


# Tag rules: applied in order, first match wins. Patterns match the path
# template (with the AccountSid prefix stripped for readability).
TAG_RULES = [
	(re.compile(r"^/Calls/\{[^}]+\}/Recordings"), "Calls / Recordings"),
	(re.compile(r"^/Calls/\{[^}]+\}/Streams"), "Calls / Streams"),
	(re.compile(r"^/Calls/\{[^}]+\}/Siprec"), "Calls / Siprec"),
	(re.compile(r"^/Calls/\{[^}]+\}/Transcriptions"), "Calls / Transcriptions"),
	(re.compile(r"^/Calls/\{[^}]+\}/Events"), "Calls / Events"),
	(re.compile(r"^/Calls/\{[^}]+\}/Notifications"), "Calls / Notifications"),
	(re.compile(r"^/Calls/\{[^}]+\}/Payments"), "Calls / Payments"),
	(re.compile(r"^/Calls/\{[^}]+\}/UserDefinedMessages"), "Calls / UserDefinedMessages"),
	(re.compile(r"^/Calls"), "Calls"),
	(re.compile(r"^/Conferences/\{[^}]+\}/Participants"), "Conferences / Participants"),
	(re.compile(r"^/Conferences/\{[^}]+\}/Recordings"), "Conferences / Recordings"),
	(re.compile(r"^/Conferences"), "Conferences"),
	(re.compile(r"^/Queues/\{[^}]+\}/Members"), "Queues / Members"),
	(re.compile(r"^/Queues"), "Queues"),
	(re.compile(r"^/Applications"), "Applications"),
	(re.compile(r"^/IncomingPhoneNumbers"), "IncomingPhoneNumbers"),
	(re.compile(r"^/Messages"), "Messages"),
	(re.compile(r"^/Notifications"), "Notifications"),
	(re.compile(r"^/Recordings"), "Recordings"),
	(re.compile(r"^/SIP/Domains/\{[^}]+\}/Auth/Calls/CredentialListMappings"), "SIP / Auth / Calls / CredentialListMappings"),
	(re.compile(r"^/SIP/Domains/\{[^}]+\}/Auth/Calls/IpAccessControlListMappings"), "SIP / Auth / Calls / IpAccessControlListMappings"),
	(re.compile(r"^/SIP/Domains/\{[^}]+\}/Auth/Registrations/CredentialListMappings"), "SIP / Auth / Registrations / CredentialListMappings"),
	(re.compile(r"^/SIP/Domains/\{[^}]+\}/CredentialListMappings"), "SIP / Domains / CredentialListMappings"),
	(re.compile(r"^/SIP/Domains/\{[^}]+\}/IpAccessControlListMappings"), "SIP / Domains / IpAccessControlListMappings"),
	(re.compile(r"^/SIP/Domains"), "SIP / Domains"),
	(re.compile(r"^/SIP/CredentialLists/\{[^}]+\}/Credentials"), "SIP / CredentialLists / Credentials"),
	(re.compile(r"^/SIP/CredentialLists"), "SIP / CredentialLists"),
	(re.compile(r"^/SIP/IpAccessControlLists/\{[^}]+\}/IpAddresses"), "SIP / IpAccessControlLists / IpAddresses"),
	(re.compile(r"^/SIP/IpAccessControlLists"), "SIP / IpAccessControlLists"),
	(re.compile(r"^/v2/SipDomains"), "SIP / Domains / InboundProcessingRegion"),
]

# Paths NOT under /AccountSid/ — diagnostics / service introspection.
DIAG_PATHS = {"/health", "/openapi.yaml", "/openapi.yml", "/openapi.json"}

# x-tagGroups for Redoc's left-rail grouping. Order matters — controls reading
# order of the rendered docs.
TAG_GROUPS = [
	{"name": "Voice — calls", "tags": ["Calls", "Calls / Recordings", "Calls / Streams", "Calls / Siprec", "Calls / Transcriptions"]},
	{"name": "Voice — call telemetry", "tags": ["Calls / Events", "Calls / Notifications", "Calls / Payments", "Calls / UserDefinedMessages"]},
	{"name": "Conferences", "tags": ["Conferences", "Conferences / Participants", "Conferences / Recordings"]},
	{"name": "Queues", "tags": ["Queues", "Queues / Members"]},
	{"name": "Applications", "tags": ["Applications"]},
	{"name": "Numbers", "tags": ["IncomingPhoneNumbers"]},
	{"name": "Messaging", "tags": ["Messages"]},
	{"name": "Account telemetry", "tags": ["Notifications"]},
	{"name": "SIP trunking", "tags": [
		"SIP / Domains",
		"SIP / Domains / InboundProcessingRegion",
		"SIP / Domains / CredentialListMappings",
		"SIP / Domains / IpAccessControlListMappings",
		"SIP / Auth / Calls / CredentialListMappings",
		"SIP / Auth / Calls / IpAccessControlListMappings",
		"SIP / Auth / Registrations / CredentialListMappings",
		"SIP / CredentialLists",
		"SIP / CredentialLists / Credentials",
		"SIP / IpAccessControlLists",
		"SIP / IpAccessControlLists / IpAddresses",
	]},
	{"name": "Recordings (top-level)", "tags": ["Recordings"]},
	{"name": "Diagnostics", "tags": ["Diagnostics"]},
]


# Per-operation overrides for endpoints whose upstream prose either leaks
# internal runtime details (payment connector vendor names, internal flag
# names) or describes behavior that has since changed in the runtime but
# is not yet refreshed in the upstream YAML. Each entry can override
# `summary`, `description`, or both. Keyed by (path, method).
OPERATION_OVERRIDES = {
	("/2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Payments.json", "post"): {
		"description":
			"Initiates a `<Pay>` session against the live call leg. Every `<Pay>` "
			"attribute is accepted and validated. The card-capture runtime is "
			"enabled per account — contact support to turn it on. `IdempotencyKey` "
			"is accepted and persisted for diagnostic visibility.",
	},
	("/2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Payments/{Sid}.json", "post"): {
		"description":
			"Updates a `<Pay>` session against the live call leg. The card-capture "
			"runtime is enabled per account — contact support to turn it on.",
	},
	("/2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Siprec/{Sid}.json", "post"): {
		"summary": "Stop a SIPREC session",
		"description":
			"Stops the SIPREC session on the SRS (`Status=stopped`) and clears "
			"VoiceML's session-tracking entry. Idempotent against an "
			"already-stopped session.",
	},
}


def tag_for_path(path):
	"""Return the tag name for an OpenAPI path. Strip the /AccountSid/ prefix
	so the rule patterns can be terse."""
	if path in DIAG_PATHS:
		return "Diagnostics"
	# Strip /2010-04-01/Accounts/{AccountSid}
	m = re.match(r"^/[^/]+/Accounts/\{[^}]+\}(/.*)$", path)
	tail = m.group(1) if m else path
	for pattern, tag in TAG_RULES:
		if pattern.match(tail):
			return tag
	return "Other"


def main():
	with open(SOURCE) as f:
		spec = yaml.safe_load(f)

	# Brand sweep
	spec = rewrite_branding(spec)

	# Title + product name
	spec["info"]["title"] = "VoiceML — Twilio-compatible REST API"
	spec["info"]["contact"]["name"] = "VoiceTel"

	# Single canonical server
	spec["servers"] = [{
		"url": "https://voiceml.voicetel.com",
		"description": "VoiceTel VoiceML compatibility surface",
	}]

	# Apply tags + per-endpoint description overrides
	tags_seen = set()
	paths = spec.get("paths", {})
	for path, path_item in paths.items():
		tag = tag_for_path(path)
		tags_seen.add(tag)
		for method, op in path_item.items():
			if method not in ("get", "post", "put", "delete", "patch", "options", "head"):
				continue
			op["tags"] = [tag]
			override = OPERATION_OVERRIDES.get((path, method))
			if override:
				for k, v in override.items():
					op[k] = v

	# Declare the tags at root level so Redoc renders them in the sidebar
	spec["tags"] = [{"name": t} for t in sorted(tags_seen)]

	# x-tagGroups for the high-level outline
	spec["x-tagGroups"] = [
		{"name": g["name"], "tags": [t for t in g["tags"] if t in tags_seen]}
		for g in TAG_GROUPS
	]

	# Write JSON (existing build-api-docs.mjs filters for .json)
	OUT.parent.mkdir(parents=True, exist_ok=True)
	with open(OUT, "w") as f:
		json.dump(spec, f, indent=2, ensure_ascii=False)
	print(f"Wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes)")
	print(f"Tags: {sorted(tags_seen)}")


if __name__ == "__main__":
	main()
