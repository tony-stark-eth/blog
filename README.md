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

- **SSG**: Astro 5 (zero JS by default)
- **Styling**: Tailwind 4 + `@tailwindcss/typography`
- **i18n**: English (default) + German (`/de/` prefix)
- **Hosting**: Cloudflare Pages
- **Cross-posting**: Dev.to + Hashnode via GitHub Actions (canonical URL → own domain)
- **Fonts**: Inter + JetBrains Mono (local via @fontsource)

## Content

Posts live in `src/content/blog/en/` and `src/content/blog/de/` as Markdown. Same filename in both dirs links translations.

Every post must exist in both languages.

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy.yml` | Push to main | Build + deploy to Cloudflare Pages |
| `cross-post.yml` | After deploy | Publish EN posts to Dev.to + Hashnode |
| `ci.yml` | Pull request | astro check + tsc + build |

## License

Content (blog posts) is copyrighted. Code is MIT.
