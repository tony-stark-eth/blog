# Writing Guidelines

## Stimme & Ton

- Direkt, technisch, kein Marketing-Sprech
- Erste Person Singular ("Ich habe...", "Mein Ansatz...", "I built...", "My approach...")
- Deutsch ODER Englisch — nie gemischt innerhalb eines Posts
- **Jeder Post muss in BEIDEN Sprachen existieren** (EN + DE). Englisch ist Default.
- Gleicher Dateiname in `en/` und `de/` verknüpft die Sprachversionen

## Struktur

- **Titel**: Konkret, keyword-reich, kein Clickbait. "How I..." oder "Why I..." funktionieren gut. 50-70 Zeichen (SEO optimal).
- **Description**: Max 160 Zeichen, eigenständig lesbar. Wird als Meta Description + Social Preview genutzt.
- **Intro**: Max 3 Sätze. Problem oder Kontext. Kein "In diesem Post werde ich..."
- **Body**: H2 für Hauptabschnitte, H3 für Unterabschnitte. Nie H4+ (zu tief für einen Blog Post).
- **Code-Beispiele**: Immer mit Sprach-Tag (```php, ```typescript). Kommentare im Code erklären das Warum, nicht das Was.
- **Abschluss**: Kein "Zusammenfassung" oder "Fazit". Entweder ein klarer Call-to-Action (Link zum Repo, Frage an Leser) oder der letzte Abschnitt endet natürlich.

## Frontmatter-Regeln

```yaml
---
title: "Concise, keyword-rich title"          # 50-70 Zeichen
description: "Standalone readable summary"     # Max 160 Zeichen
date: 2026-03-22                               # ISO Format
tags: ["symfony", "phpstan", "open-source"]    # 3-5 Tags, lowercase
locale: "en"                                   # "en" oder "de" — Pflicht
draft: false                                   # true = wird nicht gebaut
translationSlug: "same-slug-in-other-lang"     # Optional: Pendant in anderer Sprache
cover:                                         # Optional, empfohlen für Social
  src: "/images/blog/cover.png"
  alt: "Descriptive alt text"
---
```

## Was Claude NICHT tun soll beim Schreiben

- Keine Floskeln: "In der heutigen schnelllebigen Welt...", "Es ist allgemein bekannt...", "In today's fast-paced world..."
- Kein Filler: "Grundsätzlich", "Tatsächlich", "Im Grunde genommen", "Basically", "Actually"
- Keine übertriebenen Superlative: "revolutionär", "bahnbrechend", "Game-Changer", "revolutionary"
- Keine Emojis in Fließtext (nur in Listen wenn es zur Lesbarkeit beiträgt)
- Keine Entschuldigungen oder Disclaimer ("Ich bin kein Experte, aber...", "I'm no expert, but...")
- Keine künstlichen Cliffhanger zwischen Abschnitten
- Kein "Let's dive in", "Without further ado", "Stay tuned"
- Keine Wiederholung der Einleitung am Ende ("In this post we learned...")

## Sprach-spezifische Regeln

### Englisch
- American English Spelling (color, not colour)
- Contractions OK in Fließtext (don't, isn't, I've)
- Code-Kommentare auf Englisch

### Deutsch
- Kein Denglisch wo es ein gutes deutsches Wort gibt (aber: "Framework", "Template", "Deployment" sind OK — das sind Fachbegriffe)
- Du-Form (nicht Sie) — Dev-Community ist informell
- Code-Kommentare trotzdem auf Englisch (Code ist international)
