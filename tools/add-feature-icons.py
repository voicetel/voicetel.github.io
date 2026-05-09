#!/usr/bin/env python3
"""Walks src/ and inserts a `<span class="feature-icon">{% icon "..." %}</span>`
at the top of every `<li class="feature">` block that doesn't already have one.
The icon name is inferred from the card's <h3> heading via a keyword map.

One-shot tool. After running, the .njk files are authoritative — edit them in
place. Re-running is idempotent (skips cards that already have an icon).
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")

# Ordered: longer / more specific phrases first.
KEYWORD_ICONS = [
	(r"stir\s*/\s*shaken|attestation|verified|signed", "shield-check"),
	(r"voiceml|voice markup|call control|xml-based", "code-slash"),
	(r"webhook|callback", "arrow-right-circle"),
	(r"media vendor|speech|stt|tts|bring your own|transcribe|recording", "plug"),
	(r"sip\b|trunk", "hdd-stack"),
	(r"sdn|appliance|tunnel|firewall", "plug"),
	(r"compatibility|matrix|verb-by-verb|parity", "list-check"),
	(r"calculator|cost|estimate|math", "calculator"),
	(r"faq|question|help", "question-circle"),
	(r"pricing|rate|wholesale|economic|bill|published", "tag"),
	(r"documentation|reference|guide|playbook", "book"),
	(r"uptime|availability|performance|resilien", "activity"),
	(r"open[- ]source|github|license|repository|repo", "github"),
	(r"migrat", "arrow-right-circle"),
	(r"pop|geographic|network|infrastructure|carrier interconnect", "geo-alt"),
	(r"operator|support|noc|escalation", "headset"),
	(r"contact|email|inquiry", "envelope"),
	(r"messaging|sms|mms|a2p|10dlc", "chat-text"),
	(r"caller|cnam|caller-id|caller id", "person-vcard"),
	(r"carrier lookup|lrn|mnp|carrier-of-record", "broadcast-pin"),
	(r"e911|emergency", "shield-check"),
	(r"number|did|toll-free|local", "hash"),
	(r"phone application|softphone|voiptel phone|web.+desktop|mobile", "phone-vibrate"),
	(r"hosted pbx|pbx|extension|attendant|voicemail|ring group", "diagram-3"),
	(r"voice|origination|termination|outbound|inbound", "telephone"),
	(r"rest|api|programmatic", "gear"),
	(r"information|about|history|company", "info-circle"),
	(r"legal|privacy|terms|aup", "shield-check"),
	(r"sign up|create account", "person-plus"),
	(r"sign in|log in|portal", "box-arrow-in-right"),
]


def pick_icon(title):
	t = title.lower()
	for pattern, icon in KEYWORD_ICONS:
		if re.search(pattern, t):
			return icon
	return "info-circle"  # generic fallback


# Match a feature <li> block and capture its inner content.
FEATURE_RE = re.compile(
	r'(<li\s+class="feature">)\s*(<h3>(.*?)</h3>)',
	re.DOTALL,
)


def insert_icons(text):
	def replace(m):
		opening = m.group(1)
		h3_tag = m.group(2)
		title = m.group(3)
		icon = pick_icon(title)
		# Skip if an icon span already exists in the next ~200 chars
		# (idempotency check based on the surrounding text)
		return (
			opening
			+ f'\n\t\t\t<span class="feature-icon" aria-hidden="true">{{% icon "{icon}" %}}</span>\n\t\t\t'
			+ h3_tag
		)

	# Idempotency: skip if file already has feature-icon spans inside its features
	if "feature-icon" in text and "<li class=\"feature\">" in text:
		# Check if all feature li already have icons (heuristic: count matches)
		# Simple safe approach: only add to li that don't have an icon span
		return _add_only_to_iconless(text)
	return FEATURE_RE.sub(replace, text)


# Per-li precise insertion: only add icon to <li class="feature"> blocks that
# don't already have a <span class="feature-icon">.
LI_RE = re.compile(r'<li\s+class="feature">(.*?)</li>', re.DOTALL)
H3_RE = re.compile(r'<h3>(.*?)</h3>', re.DOTALL)


def _add_only_to_iconless(text):
	def replace(m):
		body = m.group(1)
		if "feature-icon" in body:
			return m.group(0)  # already has icon, keep
		title_match = H3_RE.search(body)
		if not title_match:
			return m.group(0)
		title = title_match.group(1)
		icon = pick_icon(title)
		new_body = (
			f'\n\t\t\t<span class="feature-icon" aria-hidden="true">{{% icon "{icon}" %}}</span>'
			+ body
		)
		return f'<li class="feature">{new_body}</li>'

	return LI_RE.sub(replace, text)


def main():
	updated = 0
	for root, _dirs, files in os.walk(SRC):
		for fname in files:
			if not fname.endswith(".njk"):
				continue
			path = os.path.join(root, fname)
			with open(path) as f:
				text = f.read()
			if 'class="feature"' not in text:
				continue
			new_text = insert_icons(text)
			if new_text != text:
				with open(path, "w") as f:
					f.write(new_text)
				updated += 1
				print(f"Updated {os.path.relpath(path, ROOT)}")
	print(f"\n{updated} files updated.")


if __name__ == "__main__":
	main()
