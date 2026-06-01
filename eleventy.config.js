import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import markdownIt from "markdown-it";
import markdownItAnchor from "markdown-it-anchor";
import markdownItAttrs from "markdown-it-attrs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default function (eleventyConfig) {
	eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
	eleventyConfig.addPassthroughCopy({ "vendor/api-specs": "api-specs" });
	eleventyConfig.addPassthroughCopy("src/CNAME");
	eleventyConfig.addPassthroughCopy("src/robots.txt");
	eleventyConfig.addPassthroughCopy({ "src/.well-known": ".well-known" });

	eleventyConfig.addPlugin(syntaxHighlight, {
		preAttributes: { tabindex: 0 },
	});

	const md = markdownIt({
		html: true,
		linkify: true,
		typographer: true,
	})
		.use(markdownItAnchor, {
			permalink: markdownItAnchor.permalink.headerLink({
				safariReaderFix: true,
			}),
			level: [2, 3, 4],
		})
		.use(markdownItAttrs);
	eleventyConfig.setLibrary("md", md);

	eleventyConfig.addShortcode("icon", function (name, label) {
		const safe = String(name).replace(/[^a-z0-9-]/gi, "");
		const path = resolve(__dirname, `src/_includes/icons/${safe}.svg`);
		let svg;
		try {
			svg = readFileSync(path, "utf8");
		} catch {
			return `<!-- icon "${safe}" not vendored -->`;
		}
		const accessible = label
			? svg.replace("<svg", `<svg role="img" aria-label="${label}"`)
			: svg.replace("<svg", '<svg aria-hidden="true"');
		return accessible;
	});

	eleventyConfig.addFilter("isoDate", (value) => {
		const d = value instanceof Date ? value : new Date(value);
		return d.toISOString().slice(0, 10);
	});

	eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

	eleventyConfig.addShortcode("yearsSince", (startYear) =>
		String(new Date().getFullYear() - Number(startYear))
	);

	eleventyConfig.addShortcode("todayISO", () => new Date().toISOString().slice(0, 10));

	eleventyConfig.addShortcode("todayLong", () =>
		new Intl.DateTimeFormat("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		}).format(new Date())
	);

	// Path-prefixes that drive the schema.org @type selector in pageJsonLd.
	const CONTENT_PREFIXES = [
		"/docs/",
		"/support/",
		"/voiceml/migrate",
		"/voiceml/calculator",
		"/voiceml/compatibility",
		"/voiceml/validator",
		"/pricing/",
		"/network/",
		"/colocations/",
		"/cloud-regions/",
	];
	const TECH_ARTICLE_PREFIXES = [
		"/docs/api/",
		"/docs/sdks",
		"/docs/voiceml-sdks",
		"/support/voice/",
	];

	function startsWithAny(url, prefixes) {
		if (!url) return false;
		return prefixes.some((p) => url === p || url.startsWith(p));
	}

	// Convert a YYYY-MM-DD date string into a fully-qualified ISO 8601
	// datetime at midnight UTC. Google's Rich Results checker flags
	// date-only values on Article.datePublished / dateModified as
	// "Invalid datetime" + "missing a timezone".
	function toIsoDateTime(d) {
		if (!d) return d;
		return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00+00:00` : d;
	}

	eleventyConfig.addShortcode(
		"pageJsonLd",
		function (pageUrl, inputPath, title, description, lastmodMap, dpMap, site) {
			const mod = lastmodMap && lastmodMap[inputPath];
			if (!mod) return "";
			const pub = (dpMap && dpMap[inputPath]) || mod;
			let type = "WebPage";
			if (startsWithAny(pageUrl, TECH_ARTICLE_PREFIXES)) {
				type = "TechArticle";
			} else if (startsWithAny(pageUrl, CONTENT_PREFIXES)) {
				type = "Article";
			}
			const url = `${site.url}${pageUrl}`;
			const name = title ? `${title} — ${site.brand}` : `${site.brand} — ${site.tagline}`;
			const desc = description || site.description;
			const ogImage = `${site.url}/assets/img/og-default.png`;
			const payload = {
				"@context": "https://schema.org",
				"@type": type,
				url,
				name,
				description: desc,
				image: { "@type": "ImageObject", url: ogImage, width: 1200, height: 630 },
				datePublished: toIsoDateTime(pub),
				dateModified: toIsoDateTime(mod),
				inLanguage: site.lang || "en",
				isPartOf: { "@type": "WebSite", name: site.brand, url: site.url },
				publisher: {
					"@type": "Organization",
					name: site.brand,
					url: site.url,
					logo: { "@type": "ImageObject", url: ogImage, width: 1200, height: 630 },
				},
			};
			if (type !== "WebPage") {
				payload.headline = title || site.brand;
				payload.author = { "@type": "Organization", name: site.brand, url: site.url };
				payload.mainEntityOfPage = { "@type": "WebPage", "@id": url };
			}
			return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
		}
	);

	// Builds a flat, newest-first list of pages updated within `days`.
	// Used by /changelog/ (grouped view) and /changelog/feed.xml (Atom).
	function changelogFlat(allPages, lastmodMap, days) {
		const cutoff = new Date();
		cutoff.setUTCDate(cutoff.getUTCDate() - days);
		const cutoffIso = cutoff.toISOString().slice(0, 10);
		const out = [];
		for (const p of allPages || []) {
			if (!p || !p.url) continue;
			if (p.data && p.data.eleventyExcludeFromCollections) continue;
			if (p.url === "/404.html" || p.url === "/changelog/") continue;
			const inputPath = p.inputPath;
			const date =
				(lastmodMap && lastmodMap[inputPath]) ||
				(p.date && p.date.toISOString && p.date.toISOString().slice(0, 10));
			if (!date || date < cutoffIso) continue;
			const rawTitle = p.data && p.data.title;
			const title = rawTitle || (p.url === "/" ? "Home" : p.url);
			out.push({
				url: p.url,
				title,
				description: (p.data && p.data.description) || "",
				date,
			});
		}
		out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
		return out;
	}

	eleventyConfig.addFilter("changelogFlat", function (allPages, lastmodMap, days) {
		return changelogFlat(allPages, lastmodMap, Number(days) || 90);
	});

	eleventyConfig.addFilter("changelogGroups", function (allPages, lastmodMap, days) {
		const flat = changelogFlat(allPages, lastmodMap, Number(days) || 90);
		const groups = [];
		let current = null;
		for (const e of flat) {
			if (!current || current.date !== e.date) {
				current = { date: e.date, entries: [] };
				groups.push(current);
			}
			current.entries.push(e);
		}
		return groups;
	});

	eleventyConfig.addShortcode("breadcrumbsJsonLd", function (pageUrl, allPages, siteUrl) {
		if (!pageUrl || pageUrl === "/") return "";
		const segments = pageUrl.split("/").filter(Boolean);
		if (segments.length === 0) return "";
		const items = [{ name: "Home", url: `${siteUrl}/` }];
		let cursor = "";
		for (const seg of segments) {
			cursor += `/${seg}`;
			const url = `${cursor}/`;
			const match = (allPages || []).find((p) => p && p.url === url);
			if (!match && url !== pageUrl) continue;
			const title =
				match?.data?.title ||
				seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
			items.push({ name: title, url: `${siteUrl}${url}` });
		}
		if (items.length < 3) return "";
		const itemListElement = items.map((it, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: it.name,
			item: it.url,
		}));
		const payload = {
			"@context": "https://schema.org",
			"@type": "BreadcrumbList",
			itemListElement,
		};
		return `<script type="application/ld+json">${JSON.stringify(payload)}</script>`;
	});

	// Wrap every standalone "Twilio" mention in an <abbr> carrying the
	// trademark disclosure as its title. The transform runs after
	// rendering and skips <pre>, <code>, <title>, <script>, <style>, and
	// <meta> blocks, plus any "Twilio" already inside an HTML tag or
	// attribute. Single source of truth, applied site-wide.
	const TM_TWILIO =
		'<abbr class="tm" title="Twilio is a trademark of Twilio Inc. VoiceTel is not affiliated with or endorsed by Twilio.">Twilio</abbr>';
	const TM_SKIP =
		/<(pre|code|title|script|style)\b[\s\S]*?<\/\1>|<meta\b[^>]*>|\bTwilio\b(?![^<>]*>)/g;
	eleventyConfig.addTransform("tmTwilio", function (content, outputPath) {
		if (!outputPath || !outputPath.endsWith(".html")) return content;
		return content.replace(TM_SKIP, (match) => (match[0] === "<" ? match : TM_TWILIO));
	});

	return {
		dir: {
			input: "src",
			output: "_site",
			includes: "_includes",
			data: "_data",
		},
		templateFormats: ["njk", "md", "html", "11ty.js"],
		markdownTemplateEngine: "njk",
		htmlTemplateEngine: "njk",
	};
}
