# Blog — Build in Public

## Quick Start

```bash
bun install && bun run dev
# → http://localhost:4321
```

## Projekt

Persönlicher Dev-Blog. Astro 5 + Tailwind 4 + TypeScript strict. Statische Seiten, kein JS-Framework.
Posts in `src/content/blog/en/` (Englisch) und `src/content/blog/de/` (Deutsch) als Markdown.
Cross-Post auf Dev.to + Hashnode via GitHub Actions (nur EN-Posts).

## Commands

| Command | Beschreibung |
|---|---|
| `bun run dev` | Dev Server mit HMR |
| `bun run build` | Production Build → `dist/` |
| `bun run preview` | Preview des Production Builds |
| `bunx astro check` | TypeScript + Astro Validation |
| `bunx tsc --noEmit` | Strikte Type Checks |
| `bun run cross-post` | Manuelles Cross-Posting auf Dev.to + Hashnode |

## Guidelines

Lies `.claude/writing.md` für Schreib-Regeln bei Blog-Posts.
Lies `.claude/technical.md` für Code-Konventionen im Astro-Projekt.

## Verbote

- KEIN React, Vue, Svelte oder anderes JS-Framework — nur Astro Components
- KEIN CMS, keine Datenbank — Content lebt als Markdown in Git
- KEIN `@astrojs/tailwind` (deprecated) — Tailwind 4 via `@tailwindcss/vite`
- KEIN Google Fonts CDN — Fonts lokal via `@fontsource`
- KEIN Google Analytics — Umami oder Cloudflare Analytics
- KEINE Cookie-Banner — DSGVO-konforme Analytics brauchen keine
- KEINE Inline-Styles — alles Tailwind Utility Classes
- KEIN `any` in TypeScript — nie, auch nicht als Workaround
- KEIN `client:*` Directive außer wenn Interaktivität zwingend nötig (Toggle, Copy Button)

## Kategorien

- `category: "tech"` (Default) — technische Posts, werden cross-gepostet
- `category: "personal"` — persönliche Posts, KEIN Cross-Posting, eigene `/personal/` Seite
- Tech und Personal Posts werden NIE gemischt auf der gleichen Listing-Seite

## i18n

- Englisch = Default Locale (kein URL-Prefix: `/blog/post-slug/`)
- Deutsch = `/de/blog/post-slug/`
- Gleiche Dateinamen in `en/` und `de/` verknüpfen Sprachversionen
- **Jeder Post MUSS in beiden Sprachen existieren** (EN + DE)
- Cross-Post nur EN-Posts (Dev.to/Hashnode sind englischsprachig)
