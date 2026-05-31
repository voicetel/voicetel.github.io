#!/usr/bin/env python3
"""
Append a contextual bottom `cta-block` aside to the 8 outliers from
audit-page-shapes.py that are missing one. Headlines are hand-written
per page (the CTA framing is editorial judgment, not boilerplate).
Buttons default to Contact us + How to open a ticket — the standard
pair for support pages where the next user action is opening a ticket.
"""

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Per-page bottom-CTA content. Each entry: (slug, heading, paragraph).
# slug is used to derive aria-labelledby id.
CTAS = {
	'/support/messaging/': (
		'msg-cta',
		"Don't see the topic you need?",
		'The messaging support tree is growing — if your scenario is not covered here, open a ticket with the campaign use case, the brand and campaign IDs, and any sample messages you plan to send.',
	),
	'/support/messaging/checklist/': (
		'checklist-cta',
		'Stuck on a checklist item?',
		'If something in this list does not map cleanly to your campaign — sample messages, opt-in copy, brand verification — open a ticket and we will walk through it with you before you submit.',
	),
	'/support/messaging/operating-rules/': (
		'rules-cta',
		'Have a borderline case?',
		'Operating rules cover the common path; the edges (mixed-use campaigns, multi-tenant senders, lookup-heavy traffic) take a conversation. Open a ticket with the specifics and we will tell you what the carriers will accept.',
	),
	'/support/messaging/qa/': (
		'qa-cta',
		'Want a second opinion before you submit?',
		'A short ticket beats a campaign rejection. Send the brand, the use case, and a few sample messages, and we will tell you whether the carriers will accept it as-is.',
	),
	'/support/messaging/templates/': (
		'templates-cta',
		'Need a template reviewed?',
		'If you have a draft template that you want vetted before it goes into the campaign application, paste it into a ticket along with the brand and use case. Faster than waiting for a rejection.',
	),
	'/support/messaging/themes/': (
		'themes-cta',
		'Not sure which theme your campaign fits?',
		'Theme classification is the first thing carriers look at on a campaign application. If it is ambiguous, open a ticket with the brand and a one-paragraph description of what the campaign actually does.',
	),
	'/support/voice/pbx/': (
		'pbx-cta',
		"Don't see your PBX?",
		'Tell us the make, model, and firmware version — VoiceTel engineering can write up the configuration steps and add them to the public reference.',
	),
	'/support/voice/sbc/': (
		'sbc-cta',
		"Don't see your SBC?",
		'Tell us the make, model, and firmware version, and any non-default codec or transport requirements. We can write up the configuration and add it to the public reference.',
	),
}

# Pages where top hero-actions is also missing (no top CTA block at all).
NEEDS_TOP_HERO_TOO = {
	'/support/messaging/',
	'/support/messaging/operating-rules/',
	'/support/messaging/qa/',
	'/support/messaging/themes/',
	'/support/voice/pbx/',
	'/support/voice/sbc/',
}
# Note: /support/messaging/checklist/ already has top hero-actions per
# earlier inspection; the audit only flags it for missing-cta-block.

TOP_HERO_BLOCK = (
	'<p class="hero-actions">\n'
	'\t<a class="btn btn-primary" href="/signup/">Free trial</a>\n'
	'\t<a class="btn btn-secondary" href="/contact/">Contact us</a>\n'
	'</p>\n'
)


def cta_block(slug: str, heading: str, paragraph: str) -> str:
	return (
		f'\n<aside class="cta-block" aria-labelledby="{slug}-heading">\n'
		f'\t<h2 id="{slug}-heading">{heading}</h2>\n'
		f'\t<p>{paragraph}</p>\n'
		f'\t<p class="hero-actions">\n'
		f'\t\t<a class="btn btn-primary" href="/contact/">Contact us</a>\n'
		f'\t\t<a class="btn btn-secondary" href="/support/opening-a-ticket/">How to open a ticket</a>\n'
		f'\t</p>\n'
		f'</aside>\n'
	)


def url_to_path(url: str) -> Path:
	return REPO / 'src' / url.strip('/') / 'index.njk'


def add_top_hero_after_lede(body: str) -> str:
	"""Insert top hero-actions immediately after the lede if missing."""
	# Already there?
	m = re.search(r'<p class="lede"[^>]*>.*?</p>', body, re.DOTALL)
	if not m:
		return body
	after = body[m.end():].lstrip()
	if after.startswith('<p class="hero-actions"'):
		return body
	# Insert.
	return body[:m.end()] + '\n' + TOP_HERO_BLOCK + body[m.end():].lstrip('\n')


def append_cta_block(body: str, slug: str, heading: str, paragraph: str) -> str:
	# Already there?
	if 'class="cta-block"' in body:
		return body
	# Append to the very end, before any trailing newline.
	block = cta_block(slug, heading, paragraph)
	if body.endswith('\n'):
		return body[:-1] + block
	return body + block


def main():
	stats = {'fixed-cta': 0, 'fixed-top-hero': 0, 'skip': 0}
	for url, (slug, heading, paragraph) in CTAS.items():
		path = url_to_path(url)
		if not path.exists():
			print(f'  MISSING: {path}')
			continue
		body = path.read_text(encoding='utf-8')
		original = body
		if url in NEEDS_TOP_HERO_TOO:
			body = add_top_hero_after_lede(body)
			if body != original:
				stats['fixed-top-hero'] += 1
		body_before_cta = body
		body = append_cta_block(body, slug, heading, paragraph)
		if body != body_before_cta:
			stats['fixed-cta'] += 1
		if body == original:
			print(f'  no-op            {url}')
			stats['skip'] += 1
		else:
			path.write_text(body, encoding='utf-8')
			print(f'  updated          {url}')
	print()
	for k, v in stats.items():
		print(f'  {k}: {v}')


if __name__ == '__main__':
	main()
