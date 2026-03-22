# Technical Guidelines

## Astro

- Astro Components (`.astro`) bevorzugen — kein Svelte/React für statischen Content
- TypeScript strict überall (`"strict": true` in tsconfig.json)
- Content Collections mit Schema-Validierung (Zod) — nie untyped Frontmatter
- Kein `client:*` Directive außer wenn Interaktivität nötig (Toggle, Copy Button)
- Wenn JS nötig: Vanilla `<script>` Tag im Astro Component, kein Framework
- Astro 5 Content Collections API nutzen (`getCollection`, `getEntry`)
- Keine dynamischen Imports in `.astro` Dateien — alles statisch

## Tailwind

- Utility Classes direkt im Template — kein `@apply` außer in `global.css`
- Dark Mode via `dark:` Prefix (class-basiert, nicht media)
- `prose` + `dark:prose-invert` für Markdown Content — nicht manuell stylen
- Farben über `@theme` Custom Properties in `global.css`, nie hardcoded hex
- Responsive: Mobile First, `sm:` / `md:` / `lg:` Breakpoints
- Tailwind 4 Syntax: `@import "tailwindcss"`, `@plugin`, `@theme` — nicht die v3 Config

## TypeScript

- `"strict": true` — keine Ausnahmen
- Kein `any` — nie, auch nicht als Workaround. `unknown` + Type Guard wenn nötig
- Kein `as` Type Assertion außer nach vorheriger Validierung
- Interfaces für Props, Zod Schemas für Content
- `satisfies` Operator bevorzugen über Type Assertions

## Dateien & Benennung

- Astro Components: PascalCase (`PostCard.astro`, `LanguageSwitcher.astro`)
- Blog Posts: `YYYY-MM-slug.md` in `src/content/blog/{locale}/`
- Utility Functions: camelCase, in `src/utils/`
- CSS Custom Properties: kebab-case (`--color-brand-500`)
- Alle Source-Dateien in `src/` — nie in `public/` außer statische Assets
- Bilder: WebP bevorzugen, Astro `<Image />` Component für automatische Optimierung
- Fonts: `@fontsource/*` Pakete, importiert in `global.css`

## Performance

- Kein JS wenn nicht nötig — Astro rendert alles zu statischem HTML
- Bilder lazy-loaden (Astro `<Image />` macht das automatisch)
- Fonts: `font-display: swap` + Preload für primäre Font
- Keine externen Skripte außer Analytics (defer/async)
- Max 2 Font-Familien (Sans + Mono), max 3 Weights pro Familie
- Kein `import` von npm Paketen die JS zum Client schicken

## i18n

- Englisch = Default Locale, kein URL-Prefix
- Deutsch = `/de/` Prefix
- `locale` Feld im Frontmatter ist Pflicht
- Gleicher Dateiname in `en/` und `de/` = verknüpfte Übersetzung
- UI Strings (Navigation, Footer, "Read more") in `src/i18n/ui.ts` als Record<locale, strings>
- hreflang Tags im `<head>` für Posts die in beiden Sprachen existieren
- Kein i18n-Framework (kein `astro-i18n`, kein `i18next`) — Astro native Routing + eigene Utils reichen

## Code-Qualität

- `bunx astro check` muss fehlerfrei sein (TypeScript + Astro Validation)
- `bunx tsc --noEmit` für strikte Type Checks
- ESLint mit `@typescript-eslint/strict` Preset
- Kein toter Code — unbenutzte Imports, Variablen, Components sofort entfernen
- Kein auskommentierter Code — Git ist die History

## Coding-Prinzipien (aus dem Template-Repo übernommen)

- **KISS**: Die einfachste Lösung die funktioniert. Ein Blog braucht kein State Management.
- **YAGNI**: Keine Features für "vielleicht später". Kein Search, kein CMS, kein Newsletter — bis es gebraucht wird.
- **DRY**: Shared Layouts, wiederverwendbare Components. Aber nicht über-abstrahieren — zwei ähnliche Components sind OK wenn die Alternative ein komplexes Props-System ist.
- **Early Returns**: In Utility Functions und `getStaticPaths` — Guard Clauses statt tief verschachtelter Conditionals.
- **Composition**: Components zusammenstecken statt riesige Monolith-Layouts.
