#!/usr/bin/env python3
"""
Audit every Eleventy page against the page-shape rules in
`directives/design-system.md § 4`. Classifies each page by archetype
based on URL path, then checks the required shell elements for that
archetype. Reports outliers grouped by gap type.

Run via:    npm run audit:pages
Direct:     python3 tools/audit-page-shapes.py
"""

import re
import sys
from pathlib import Path
from typing import Iterable, NamedTuple

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src"

# --- Archetype classification by URL prefix --------------------------------

# Form pages: form is the action; no hero-actions / no cta-block.
FORM_PREFIXES = ("/signup/", "/login/", "/contact/")

# Tool pages: interactive surfaces; the tool is the action.
TOOL_PREFIXES = (
	"/voiceml/calculator/",
	"/voiceml/validator/",
	"/docs/api/v2.1/credentials/",
	"/docs/api/v2.2/credentials/",
	"/docs/api/v2.2/playground/",
	"/docs/api/v7.8/csp/playground/",
)

# Legal/dense-prose pages.
LEGAL_PREFIXES = ("/legal/",)

# Listing/index pages.
LISTING_PREFIXES = ("/changelog/", "/sitemap/")

# Homepage uses a custom hero.
CUSTOM_PREFIXES = ("/",)

# Everything else is one of: content-article, category-landing,
# marketing-landing. Distinguishing those three precisely needs body
# inspection (e.g. presence of features-grid), but they share the same
# shell requirements — so we lump them under "content".

ARCHETYPE_RULES = {
	"form":    {"hero_actions_top": False, "cta_block": False},
	"tool":    {"hero_actions_top": False, "cta_block": False},
	"legal":   {"hero_actions_top": False, "cta_block": False},
	"listing": {"hero_actions_top": False, "cta_block": False},
	"custom":  {"hero_actions_top": False, "cta_block": False},
	"content": {"hero_actions_top": True,  "cta_block": True},
}


def classify(url: str) -> str:
	if url == "/":
		return "custom"
	for p in FORM_PREFIXES:
		if url == p or url.startswith(p):
			return "form"
	for p in TOOL_PREFIXES:
		if url == p or url.startswith(p):
			return "tool"
	for p in LEGAL_PREFIXES:
		if url == p or url.startswith(p):
			return "legal"
	for p in LISTING_PREFIXES:
		if url == p or url.startswith(p):
			return "listing"
	return "content"


# --- Shell-element extraction ---------------------------------------------

class PageReport(NamedTuple):
	path: Path
	url: str
	archetype: str
	eyebrow: int
	lede: int
	hero_actions: int
	cta_block: int
	h1_with_period: bool
	gaps: list

EYEBROW_RE = re.compile(r'class="eyebrow"')
LEDE_RE = re.compile(r'class="lede"')
HERO_RE = re.compile(r'class="hero-actions"')
CTA_BLOCK_RE = re.compile(r'class="cta-block"')
H1_PERIOD_RE = re.compile(r'<h1[^>]*>.*?\.</h1>', re.DOTALL)


def url_for(path: Path) -> str:
	rel = path.parent.relative_to(SRC)
	if str(rel) == ".":
		return "/"
	return "/" + str(rel).replace("\\", "/") + "/"


def audit_page(path: Path) -> PageReport:
	body = path.read_text(encoding="utf-8")
	url = url_for(path)
	arch = classify(url)
	report = PageReport(
		path=path,
		url=url,
		archetype=arch,
		eyebrow=len(EYEBROW_RE.findall(body)),
		lede=len(LEDE_RE.findall(body)),
		hero_actions=len(HERO_RE.findall(body)),
		cta_block=len(CTA_BLOCK_RE.findall(body)),
		h1_with_period=bool(H1_PERIOD_RE.search(body)),
		gaps=[],
	)
	rules = ARCHETYPE_RULES[arch]
	gaps = []
	# Universal checks (skip homepage which is custom).
	if arch != "custom":
		if report.eyebrow < 1:
			gaps.append("missing-eyebrow")
		if not report.h1_with_period:
			gaps.append("h1-not-sentence-case-period")
		if report.lede < 1 and arch != "form":
			gaps.append("missing-lede")
	# Archetype-specific.
	if rules["hero_actions_top"] and report.hero_actions < 2:
		# Need at least 2 hero-actions: one top + one inside the cta-block.
		gaps.append("missing-top-hero-actions")
	if rules["cta_block"] and report.cta_block < 1:
		gaps.append("missing-cta-block")
	return report._replace(gaps=gaps)


def main(argv: Iterable[str]) -> int:
	pages = sorted(
		p for p in SRC.rglob("index.njk")
		if "_includes" not in p.parts and "_data" not in p.parts
	)
	reports = [audit_page(p) for p in pages]
	bad = [r for r in reports if r.gaps]
	# By archetype + gap-type summary
	by_arch = {}
	for r in reports:
		by_arch.setdefault(r.archetype, {"count": 0, "with_gaps": 0})
		by_arch[r.archetype]["count"] += 1
		if r.gaps:
			by_arch[r.archetype]["with_gaps"] += 1
	# Print summary
	print(f"Audited {len(reports)} pages.\n")
	print("By archetype:")
	for arch in ("content", "form", "tool", "legal", "listing", "custom"):
		if arch not in by_arch:
			continue
		c = by_arch[arch]
		print(f"  {arch:<10} {c['count']:>3} pages   {c['with_gaps']:>3} with gaps")
	# Detailed outliers
	if not bad:
		print("\nNo outliers. Site is shape-compliant.")
		return 0
	print(f"\n{len(bad)} outliers:\n")
	# Group by gap key
	by_gap = {}
	for r in bad:
		for g in r.gaps:
			by_gap.setdefault(g, []).append(r)
	for gap, items in sorted(by_gap.items()):
		print(f"## {gap}  ({len(items)} pages)")
		for r in items:
			print(f"    {r.url}")
		print()
	return 1


if __name__ == "__main__":
	sys.exit(main(sys.argv[1:]))
