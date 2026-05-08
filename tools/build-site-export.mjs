import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(ROOT, "_site");
const OUT = resolve(SITE, "data/site-export.json");

async function walkHtml(dir, results = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip Redoc-rendered API docs (each ~1MB, mostly inlined JS bundle).
			if (full.endsWith(`${SITE}/docs/api`)) continue;
			await walkHtml(full, results);
		} else if (entry.name.endsWith(".html")) {
			results.push(full);
		}
	}
	return results;
}

function urlFromFile(file) {
	const rel = relative(SITE, file);
	if (rel === "index.html") return "/";
	if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"index.html".length);
	return "/" + rel;
}

function decodeEntities(s) {
	return s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&copy;/g, "©")
		.replace(/&ndash;/g, "–")
		.replace(/&mdash;/g, "—")
		.replace(/&ldquo;/g, "“")
		.replace(/&rdquo;/g, "”")
		.replace(/&rarr;/g, "→")
		.replace(/&larr;/g, "←")
		.replace(/&[#\w]+;/g, " ");
}

function stripTags(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
		.replace(/<[^>]+>/g, " ");
}

function normalizeWs(s) {
	return s.replace(/\s+/g, " ").trim();
}

function extractText(html) {
	return normalizeWs(decodeEntities(stripTags(html)));
}

function attr(html, name) {
	const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
	const m = html.match(re);
	return m ? m[1] : "";
}

function parseHtml(html, originHost) {
	const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
	const title = titleMatch ? extractText(titleMatch[1]) : "";

	const descMatch = html.match(/<meta\s+name="description"[^>]*>/i);
	const description = descMatch ? attr(descMatch[0], "content") : "";

	const canonicalMatch = html.match(/<link\s+rel="canonical"[^>]*>/i);
	const canonical = canonicalMatch ? attr(canonicalMatch[0], "href") : "";

	const lang = attr(html.match(/<html[^>]*>/i)?.[0] || "", "lang");

	const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
	const mainHtml = mainMatch ? mainMatch[1] : "";
	const bodyText = extractText(mainHtml);
	const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;

	const headings = { h1: [], h2: [], h3: [] };
	for (const level of [1, 2, 3]) {
		const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi");
		let m;
		while ((m = re.exec(mainHtml)) !== null) {
			const text = extractText(m[1]);
			if (text) headings[`h${level}`].push(text);
		}
	}

	const links = { internal: 0, external: 0, mailto: 0, tel: 0 };
	const linkTargets = new Set();
	const linkRe = /<a[^>]*href="([^"]+)"[^>]*>/gi;
	let lm;
	while ((lm = linkRe.exec(mainHtml)) !== null) {
		const href = lm[1];
		linkTargets.add(href);
		if (href.startsWith("mailto:")) links.mailto++;
		else if (href.startsWith("tel:")) links.tel++;
		else if (/^https?:\/\//i.test(href)) {
			try {
				const u = new URL(href);
				if (u.host === originHost) links.internal++;
				else links.external++;
			} catch {
				links.external++;
			}
		} else {
			links.internal++;
		}
	}

	return {
		title,
		description,
		canonical,
		lang,
		headings,
		wordCount,
		body: bodyText,
		links,
		linkTargets: Array.from(linkTargets).sort(),
	};
}

async function main() {
	const siteData = JSON.parse(await readFile(resolve(ROOT, "src/_data/site.json"), "utf8"));
	const originHost = new URL(siteData.url).host;

	const files = (await walkHtml(SITE)).sort();
	const pages = [];
	for (const file of files) {
		const html = await readFile(file, "utf8");
		const parsed = parseHtml(html, originHost);
		pages.push({
			url: urlFromFile(file),
			source: relative(ROOT, file),
			...parsed,
		});
	}

	const out = {
		version: "1",
		updated: new Date().toISOString(),
		site: {
			brand: siteData.brand,
			legalName: siteData.legalName,
			tagline: siteData.tagline,
			description: siteData.description,
			url: siteData.url,
			portalUrl: siteData.portalUrl,
			apiBaseUrl: siteData.apiBaseUrl,
			pops: siteData.pops,
			supportEmail: siteData.supportEmail,
		},
		nav: siteData.nav,
		footerNav: siteData.footerNav,
		menuCarousel: siteData.menuCarousel,
		count: pages.length,
		pages,
	};

	await mkdir(dirname(OUT), { recursive: true });
	await writeFile(OUT, JSON.stringify(out, null, "\t"));
	const size = (await readFile(OUT)).length;
	console.log(`Wrote ${OUT}`);
	console.log(`  ${pages.length} pages, ${(size / 1024).toFixed(1)} KB`);
}

await main();
