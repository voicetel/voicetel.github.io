#!/usr/bin/env python3
"""
Insert the standard top hero-actions block immediately after the
`<p class="lede">…</p>` paragraph on every page flagged by
audit-page-shapes.py as `missing-top-hero-actions`.

CTA pair defaults to Free trial + Contact us for the troubleshooting /
configuration / info pages this script targets. Pages with different
audience needs are handled separately in tools/fix-bottom-cta-block.py
or by hand.

Run once; idempotent (skips files that already have a top hero-actions
block immediately after the lede).
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

HERO_BLOCK = (
	'<p class="hero-actions">\n'
	'\t<a class="btn btn-primary" href="/signup/">Free trial</a>\n'
	'\t<a class="btn btn-secondary" href="/contact/">Contact us</a>\n'
	'</p>\n'
)

# Find a closing `</p>` that belongs to a `<p class="lede">` open tag,
# allowing nested tags inside the lede paragraph (e.g. <strong>, <a>).
LEDE_RE = re.compile(
	r'(<p class="lede"[^>]*>.*?</p>)\n',
	re.DOTALL,
)


def audit_outliers() -> list[str]:
	"""Re-run the audit script and parse out URLs flagged
	missing-top-hero-actions."""
	result = subprocess.run(
		[sys.executable, str(REPO / 'tools' / 'audit-page-shapes.py')],
		capture_output=True, text=True,
	)
	out = result.stdout
	urls = []
	in_section = False
	for line in out.splitlines():
		if line.startswith('## missing-top-hero-actions'):
			in_section = True
			continue
		if in_section:
			if line.startswith('## '):
				break
			s = line.strip()
			if s.startswith('/'):
				urls.append(s)
	return urls


def url_to_path(url: str) -> Path:
	# /support/voice/sbc/asterisk/ → src/support/voice/sbc/asterisk/index.njk
	return REPO / 'src' / url.strip('/') / 'index.njk' if url != '/' else REPO / 'src' / 'index.njk'


def has_top_hero_actions(body: str) -> bool:
	"""True iff the lede paragraph is immediately followed (ignoring
	whitespace) by a hero-actions block. Distinguishes the top hero-
	actions from the one inside the bottom cta-block."""
	m = re.search(r'<p class="lede"[^>]*>.*?</p>', body, re.DOTALL)
	if not m:
		return False
	after = body[m.end():].lstrip()
	return after.startswith('<p class="hero-actions"')


def fix_one(path: Path) -> str:
	body = path.read_text(encoding='utf-8')
	if has_top_hero_actions(body):
		return 'skip-already-has-top-hero'

	m = LEDE_RE.search(body)
	if not m:
		# Try a tolerant match: lede without trailing newline before next tag.
		m = re.search(r'(<p class="lede"[^>]*>.*?</p>)', body, re.DOTALL)
		if not m:
			return 'skip-no-lede'

	insert_at = m.end()
	new_body = body[:insert_at] + HERO_BLOCK + body[insert_at:]
	# Normalize: exactly one newline between lede `</p>` and the
	# inserted `<p class="hero-actions">`.
	new_body = re.sub(
		r'(<p class="lede"[^>]*>.*?</p>)\n+<p class="hero-actions"',
		r'\1\n<p class="hero-actions"',
		new_body, count=1, flags=re.DOTALL,
	)
	path.write_text(new_body, encoding='utf-8')
	return 'fixed'


def main():
	urls = audit_outliers()
	if not urls:
		print('No missing-top-hero-actions pages reported by audit. Nothing to do.')
		return 0
	print(f'Outliers from audit: {len(urls)}')
	stats = {'fixed': 0, 'skip-no-lede': 0, 'skip-already-has-top-hero': 0}
	for url in urls:
		p = url_to_path(url)
		if not p.exists():
			print(f'  MISSING FILE: {p}')
			continue
		status = fix_one(p)
		stats[status] = stats.get(status, 0) + 1
		print(f'  {status:<28} {url}')
	print()
	for k, v in stats.items():
		print(f'  {k}: {v}')
	return 0


if __name__ == '__main__':
	sys.exit(main())
