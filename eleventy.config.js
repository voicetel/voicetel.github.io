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
