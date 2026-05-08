#!/usr/bin/env python3
"""One-shot generator that rewrites src/*.njk pages from
directives/marketing-copy-source.json. Each output is a self-contained
Nunjucks file using the existing component classes (.hero, .container,
.btn, .features-grid, .cta-block, .faq-item, etc). Skips the homepage
(handcrafted) and the 404 (already minimal).

After running once, each page is the authoritative source. The JSON in
/directives/ is reference material only.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
JSON_PATH = os.path.join(ROOT, "directives", "marketing-copy-source.json")
SKIP_URLS = {"/", "/404.html"}

# Section types that are author/developer guidance, not user-facing copy.
# These exist in marketingCopy as direction to whoever's writing the page; they
# must not render onto the site.
NOTE_TYPES = {
	"tone",
	"copy-rules",
	"copy-policy",
	"comparison-policy",
	"comparison-rules",
	"non-hallucination-policy",
	"trademark-policy",
}


def parse_front_matter(text):
	m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
	if not m:
		return {}, text
	fm = {}
	for line in m.group(1).split("\n"):
		kv = re.match(r'^(\w+):\s*"?(.*?)"?\s*$', line)
		if kv:
			fm[kv.group(1)] = kv.group(2)
	return fm, text[m.end():]


def file_url(path, fm):
	if fm.get("permalink"):
		return fm["permalink"]
	rel = os.path.relpath(path, SRC)
	if rel == "index.njk":
		return "/"
	if rel == "404.njk":
		return "/404.html"
	if rel.endswith("/index.njk"):
		return "/" + rel[: -len("/index.njk")] + "/"
	if rel.endswith(".njk"):
		return "/" + rel[: -len(".njk")] + "/"
	return None


def strip_brand(title):
	return re.sub(r"\s*[—-]\s*VoiceTel\s*$", "", title).strip()


def yaml_escape(s):
	return s.replace("\\", "\\\\").replace('"', '\\"')


_AMP = re.compile(r"&(?!#?\w+;)")


def html_safe(s):
	"""Escape stray & in text content. Leaves existing entities and HTML tags
	(which use <>, not &) alone, so structured copy with inline <a> tags still
	works."""
	if s is None:
		return ""
	return _AMP.sub("&amp;", s)


def render_hero(s):
	out = []
	if s.get("eyebrow"):
		out.append(f'<p class="eyebrow">{html_safe(s["eyebrow"])}</p>')
	if s.get("headline"):
		out.append(f'<h1>{html_safe(s["headline"])}</h1>')
	if s.get("lede"):
		out.append(f'<p class="lede">{html_safe(s["lede"])}</p>')
	if s.get("primaryCta") or s.get("secondaryCta"):
		out.append('<p class="hero-actions">')
		if s.get("primaryCta"):
			pc = s["primaryCta"]
			out.append(f'\t<a class="btn btn-primary" href="{pc["href"]}">{pc["label"]}</a>')
		if s.get("secondaryCta"):
			sc = s["secondaryCta"]
			out.append(f'\t<a class="btn btn-secondary" href="{sc["href"]}">{sc["label"]}</a>')
		out.append("</p>")
	return "\n".join(out)


def render_cta(s):
	out = ['<aside class="cta-block">']
	if html_safe(s.get("heading") or s.get("title")):
		out.append(f'\t<h2>{html_safe(s.get("heading") or s.get("title"))}</h2>')
	if s.get("copy"):
		out.append(f'\t<p>{html_safe(s["copy"])}</p>')
	if s.get("primaryCta") or s.get("secondaryCta"):
		out.append('\t<p class="hero-actions">')
		if s.get("primaryCta"):
			pc = s["primaryCta"]
			out.append(f'\t\t<a class="btn btn-primary" href="{pc["href"]}">{pc["label"]}</a>')
		if s.get("secondaryCta"):
			sc = s["secondaryCta"]
			out.append(f'\t\t<a class="btn btn-secondary" href="{sc["href"]}">{sc["label"]}</a>')
		out.append("\t</p>")
	out.append("</aside>")
	return "\n".join(out)


def render_caveat(s):
	out = ['<aside class="caveat-block">']
	if s.get("heading"):
		out.append(f'\t<h3>{html_safe(s["heading"])}</h3>')
	if s.get("copy"):
		out.append(f'\t<p>{html_safe(s["copy"])}</p>')
	out.append("</aside>")
	return "\n".join(out)


def render_feature_grid(s):
	out = ['<section class="section-block">']
	if s.get("heading"):
		out.append(f'\t<h2>{html_safe(s["heading"])}</h2>')
	if s.get("items"):
		out.append('\t<ul class="features-grid">')
		for item in s["items"]:
			out.append('\t\t<li class="feature">')
			if item.get("title"):
				out.append(f'\t\t\t<h3>{html_safe(item["title"])}</h3>')
			if item.get("copy"):
				out.append(f'\t\t\t<p>{html_safe(item["copy"])}</p>')
			out.append("\t\t</li>")
		out.append("\t</ul>")
	out.append("</section>")
	return "\n".join(out)


def render_faq(s):
	out = ['<section class="section-block faq-block">']
	if s.get("heading"):
		out.append(f'\t<h2>{html_safe(s["heading"])}</h2>')
	for faq in s.get("faqs", []):
		out.append('\t<details class="faq-item">')
		out.append(f'\t\t<summary>{html_safe(faq["question"])}</summary>')
		out.append(f'\t\t<p>{html_safe(faq["answer"])}</p>')
		out.append("\t</details>")
	for cat in s.get("categories", []):
		label = cat.get("label") or cat.get("title", "")
		copy = cat.get("copy", "")
		joiner = " — " if copy else ""
		out.append(f'\t<p><strong>{label}</strong>{joiner}{copy}</p>')
	out.append("</section>")
	return "\n".join(out)


def render_code(s):
	out = ['<section class="section-block code-block-section">']
	if s.get("heading"):
		out.append(f'\t<h2>{html_safe(s["heading"])}</h2>')
	if s.get("copy"):
		out.append(f'\t<p>{html_safe(s["copy"])}</p>')
	if s.get("sample"):
		escaped = s["sample"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
		out.append(f'\t<pre class="code-block"><code>{escaped}</code></pre>')
	out.append("</section>")
	return "\n".join(out)


def render_generic(s):
	t = s.get("type", "")
	out = [f'<section class="section-block" data-section-type="{t}">']
	if html_safe(s.get("heading") or s.get("title")):
		out.append(f'\t<h2>{html_safe(s.get("heading") or s.get("title"))}</h2>')
	if s.get("copy"):
		out.append(f'\t<p>{html_safe(s["copy"])}</p>')
	if s.get("lede"):
		out.append(f'\t<p class="lede">{html_safe(s["lede"])}</p>')
	if s.get("items"):
		out.append("\t<ul>")
		for item in s["items"]:
			label = item.get("title", "")
			copy = item.get("copy", "")
			parts = []
			if label:
				parts.append(f"<strong>{label}</strong>")
				if copy:
					parts.append(" — ")
			if copy:
				parts.append(copy)
			out.append(f'\t\t<li>{"".join(parts)}</li>')
		out.append("\t</ul>")
	for faq in s.get("faqs", []):
		out.append('\t<details class="faq-item">')
		out.append(f'\t\t<summary>{html_safe(faq["question"])}</summary>')
		out.append(f'\t\t<p>{html_safe(faq["answer"])}</p>')
		out.append("\t</details>")
	out.append("</section>")
	return "\n".join(out)


RENDERERS = {
	"hero": None,  # handled separately
	"cta": render_cta,
	"caveat": render_caveat,
	"feature-grid": render_feature_grid,
	"product-grid": render_feature_grid,
	"docs-grid": render_feature_grid,
	"use-cases": render_feature_grid,
	"proof": render_feature_grid,
	"proof-strip": render_feature_grid,
	"faq": render_faq,
	"faq-categories": render_faq,
	"code": render_code,
}


def render_section(s):
	t = s.get("type")
	if t in NOTE_TYPES:
		return None  # skip author notes
	r = RENDERERS.get(t)
	if r is None and t == "hero":
		return None
	return (r or render_generic)(s)


def main():
	with open(JSON_PATH) as f:
		data = json.load(f)

	updated = 0
	for root, _dirs, files in os.walk(SRC):
		# Skip non-page directories
		bn = os.path.basename(root)
		if bn in ("_includes", "_data", "assets", "data") or "/_data" in root or "/assets" in root or "/_includes" in root:
			continue
		for fname in files:
			if not fname.endswith(".njk"):
				continue
			path = os.path.join(root, fname)
			with open(path) as f:
				existing = f.read()
			fm, _body = parse_front_matter(existing)
			url = file_url(path, fm)
			if not url or url in SKIP_URLS:
				continue
			page = next((p for p in data["pages"] if p.get("url") == url), None)
			if not page:
				continue

			title = strip_brand(page.get("title", fm.get("title", "")))
			desc = page.get("description", fm.get("description", ""))
			permalink = fm.get("permalink", "")

			out = ["---", "layout: layouts/page.njk"]
			if permalink:
				out.append(f"permalink: {permalink}")
			out.append(f'title: "{yaml_escape(title)}"')
			out.append(f'description: "{yaml_escape(desc)}"')
			if "eleventyExcludeFromCollections" in fm:
				out.append("eleventyExcludeFromCollections: true")
			out.append("---")

			sections = page.get("sections", [])
			hero = next((s for s in sections if s.get("type") == "hero"), None)
			if hero:
				out.append("")
				out.append(render_hero(hero))
			for s in sections:
				if s.get("type") == "hero":
					continue
				rendered = render_section(s)
				if rendered:
					out.append("")
					out.append(rendered)

			content = "\n".join(out).rstrip() + "\n"
			with open(path, "w") as f:
				f.write(content)
			updated += 1
			print(f"Wrote {os.path.relpath(path, ROOT)}")

	print(f"\nUpdated {updated} pages.")


if __name__ == "__main__":
	main()
