#!/usr/bin/env node
// Submit every URL in the built sitemap to IndexNow. Fans out to Bing,
// Yandex, Seznam, Naver via the shared endpoint. The key is in site.json
// and is also hosted at /{key}.txt for ownership verification — both must
// match or IndexNow rejects the submission.
//
// Usage:  node tools/submit-indexnow.mjs [sitemapPath]
//         (defaults to _site/sitemap.xml; pass a path or local file if
//          you've fetched the live sitemap from a CI step.)

import { readFile } from "node:fs/promises";

const site = JSON.parse(await readFile("src/_data/site.json", "utf8"));
const key = site.indexNowKey;
const host = new URL(site.url).hostname;

if (!key) {
	console.error("submit-indexnow: site.indexNowKey is not set");
	process.exit(1);
}

const sitemapPath = process.argv[2] || "_site/sitemap.xml";
const xml = await readFile(sitemapPath, "utf8");
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (urls.length === 0) {
	console.error(`submit-indexnow: no <loc> entries found in ${sitemapPath}`);
	process.exit(1);
}

const body = {
	host,
	key,
	keyLocation: `https://${host}/${key}.txt`,
	urlList: urls,
};

const res = await fetch("https://api.indexnow.org/IndexNow", {
	method: "POST",
	headers: { "Content-Type": "application/json; charset=utf-8" },
	body: JSON.stringify(body),
});

const text = await res.text();
console.log(`submit-indexnow: ${urls.length} URLs → ${res.status} ${res.statusText}`);
if (text) console.log(text);

// 200 OK = accepted; 202 Accepted = received, key validation pending.
if (res.status !== 200 && res.status !== 202) {
	process.exit(1);
}
