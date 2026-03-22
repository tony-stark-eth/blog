# blog.tony-stark.xyz

Personal dev blog — Build in Public. Astro 5, Tailwind 4, TypeScript strict.

## Quick Start

```bash
bun install
bun run dev        # → http://localhost:4321
```

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Dev server with HMR |
| `bun run build` | Production build → `dist/` |
| `bun run preview` | Preview production build |
| `bun run cross-post` | Manual cross-post to Dev.to + Hashnode |
| `bunx astro check` | TypeScript + Astro validation |
| `bunx tsc --noEmit` | Strict type checks |

## Stack

- **SSG**: [Astro 5](https://astro.build) — zero JS by default, content collections, native i18n
- **Styling**: Tailwind 4 + `@tailwindcss/typography` (prose classes for Markdown)
- **i18n**: English (default, no URL prefix) + German (`/de/` prefix)
- **Hosting**: Cloudflare Pages (auto-deploy on push to main)
- **Cross-posting**: Dev.to + Hashnode via GitHub Actions (canonical URL → own domain)
- **Fonts**: Inter + JetBrains Mono (self-hosted via `@fontsource`)
- **Dark mode**: Class-based toggle with `localStorage` persistence

## Project Structure

```
src/
├── content/blog/
│   ├── en/                  # English posts (default locale)
│   └── de/                  # German posts (/de/ prefix)
├── layouts/
│   ├── BaseLayout.astro     # HTML shell, meta, OG, hreflang, dark mode
│   └── PostLayout.astro     # Post layout with ToC, share, JSON-LD
├── components/
│   ├── PostCard.astro       # Post preview card
│   ├── TableOfContents.astro
│   ├── ShareButtons.astro
│   ├── LanguageSwitcher.astro
│   ├── DarkModeToggle.astro
│   └── TagList.astro
├── pages/
│   ├── index.astro          # EN landing
│   ├── blog/                # EN blog listing + [slug]
│   └── de/                  # DE mirror of above
├── i18n/ui.ts               # Translation strings
├── utils/reading-time.ts
└── styles/global.css        # Tailwind 4 config
```

## Writing a New Post

1. Create `src/content/blog/en/YYYY-MM-slug.md` with frontmatter:

```yaml
---
title: "Your title here"
description: "Max 160 chars, used as meta description"
date: 2026-04-01
tags: ["tag1", "tag2", "tag3"]
locale: "en"
translationSlug: "YYYY-MM-slug"
draft: false
---
```

2. Create the German version at `src/content/blog/de/YYYY-MM-slug.md` (same filename = linked translation, set `locale: "de"`)
3. Push to main → auto-deploys to Cloudflare Pages → cross-posts EN version to Dev.to + Hashnode

Every post **must** exist in both EN and DE.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy.yml` | Push to main | Build + deploy to Cloudflare Pages |
| `cross-post.yml` | After successful deploy | Publish EN posts to Dev.to + Hashnode |
| `ci.yml` | Pull request | `astro check` + `tsc --noEmit` + `build` |

## SEO

- Canonical URLs on own domain (cross-posts reference back)
- Open Graph + Twitter Cards on every page
- `hreflang` tags for bilingual posts
- JSON-LD `BlogPosting` structured data
- RSS feeds: `/rss.xml` (EN) and `/de/rss.xml` (DE)
- Sitemap: auto-generated with i18n via `@astrojs/sitemap`

## License

Content (blog posts) is copyrighted. Code is MIT.
