# voicetel.com

Static marketing site for VoiceTel — wholesale programmable voice platform compatible with Twilio's voice markup at wholesale prices.

Built with Eleventy v3, Nunjucks, vanilla CSS, and vanilla JavaScript. No frontend framework, no bundler, no server-side runtime. Hosted on GitHub Pages.

## Local development

Requires Node 20+.

```sh
npm install
npm run serve
```

Eleventy serves the built site at <http://localhost:8080> with live reload.

## Build

```sh
npm run build
```

Output in `_site/`.

## Quality gates

Run all checks locally before committing:

```sh
npm run build
npm run lint:js
npm run lint:css
npm run lint:html
npm run format:check
npm run a11y      # requires built site + a local server (see below)
```

The accessibility check uses pa11y-ci against a locally-served build:

```sh
npm run build
npx http-server _site -p 8080 -s &
npm run a11y
```

## Deploy

Push to `main`. The GitHub Actions workflow at `.github/workflows/deploy.yml` builds the site and publishes to GitHub Pages. The custom domain `voicetel.com` is configured via `src/CNAME`.

## Updating data

All centralized data lives in `src/_data/` and is also emitted as static JSON at `_site/data/*.json` so other VoiceTel surfaces (callBroadcast portal, smppGateway portal, phone.voicetel.com, sdn.voicetel.com) can fetch a single source of truth.

- `site.json` — brand metadata, hostnames, support contacts, navigation taxonomy.
- `pricing.json` — all rates.
- `compat.json` — voice markup compatibility matrix.
- `endpoints.json` — API + portal URLs, mobile app downloads, SDN endpoint.
- `faq.json` — FAQ items + categories.

Edit the JSON, run `npm run build`, push. The data feed updates everywhere on the next consumer fetch.

## API documentation

The `/docs/api/` section is generated from vendored OpenAPI specs in `vendor/api-specs/` using `@redocly/cli build-docs`. Run:

```sh
npm run docs:api
```

Re-fetch specs from `api.voicetel.com/doc/*.json` when the API changes (the URLs are listed in `tools/build-api-docs.mjs`).

## Adding a doc page

1. Create a Markdown file under `src/docs/voiceml/` or another `/docs/` subsection.
2. Set the front-matter: `layout: layouts/docs.njk`, `title: ...`, `description: ...`.
3. Run `npm run build`. The page is automatically picked up by the docs collection and rendered in the sidebar nav.

## Design system

The unified design standard for all VoiceTel surfaces lives in `directives/design-system.md` (private workspace). The implementation ships at `src/assets/css/tokens.css` and `components.css`. Other VoiceTel projects copy/sync those two CSS files when they migrate to the standard.

## DNS

- `voicetel.com` apex → GitHub Pages (A records to GitHub's current Pages IPs; verify before publishing).
- `www.voicetel.com` → existing portal, unchanged.
- `api.voicetel.com` → existing API host, unchanged.
- `sdn.voicetel.com` → existing SDN spec on AWS S3 static hosting (HTTP-only); marketing copy lives at `voicetel.com/sdn/`.
- `phone.voicetel.com` → existing VoiceTel Phone app distribution; marketing copy lives at `voicetel.com/phone/`.

See the GitHub Pages settings for the exact IPs and the TXT verification record.
