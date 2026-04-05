---
title: "Ein Symfony-Template, bei dem AI-Ausfälle eingeplant sind"
description: "Mein neues Symfony 8 + FrankenPHP + AI Template mit Model-Failover, Circuit Breaker und Claude Code Guidelines."
date: 2026-04-06
tags: ["symfony", "ai", "open-source", "template", "developer-tools"]
locale: "de"
translationSlug: "2026-04-template-symfony-ai"
draft: false
---

Vor zwei Wochen habe ich [meinen News Aggregator veröffentlicht](https://github.com/tony-stark-eth/news-aggregator). Beim Bauen ist mir aufgefallen, dass ungefähr 70% des Codes nichts mit News zu tun hatte — Docker-Infrastruktur, Quality-Tooling, AI-Wiring, CI-Pipelines und Claude Code Guidelines. Dieselben 70%, die ich in jedem neuen Symfony-Projekt haben will.

Also habe ich es extrahiert: [template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). Ein GitHub Template Repo: "Use this template" klicken, `make start` ausführen, und du hast eine voll funktionsfähige Symfony 8 App mit AI-Integration, striktem Quality-Tooling und CI — bereit für deine Domain-Logik.

## Was das ist (und was nicht)

Ich habe bereits [template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit) für Full-Stack-Apps mit JavaScript-Frontend. Dieses neue Template ist anders: Es ist für server-gerenderte Apps, wo Twig + DaisyUI reicht und der interessante Teil das Backend ist — besonders die AI-Integration.

Der Stack: FrankenPHP (Caddy + PHP 8.4), PostgreSQL 17 mit PgBouncer, Symfony Messenger mit Doctrine-Transport, DaisyUI über Tailwind CDN, TypeScript kompiliert via Bun. Kein JavaScript-Framework, kein Webpack, kein Node.

## AI, die mit Ausfällen rechnet

Das Template enthält eine komplette AI-Infrastrukturschicht, die auf einer Annahme basiert: kostenlose AI-Modelle sind unzuverlässig.

Die `ModelFailoverPlatform` umhüllt Symfonys `PlatformInterface` mit Model-Level Failover. Wenn das primäre Modell ausfällt, probiert sie jedes Fallback der Reihe nach:

```php
$services->set('ai.platform.openrouter.failover', ModelFailoverPlatform::class)
    ->arg('$innerPlatform', service('ai.platform.openrouter'))
    ->arg('$fallbackModels', [
        'minimax/minimax-m2.5:free',
        'z-ai/glm-4.5-air:free',
        'openai/gpt-oss-120b:free',
        'qwen/qwen3.6-plus:free',
    ]);
```

Das liegt in `src/Shared/AI/` — Framework-Code, den jede Domain nutzen kann. Deine Domain-Services injizieren `PlatformInterface` und denken nie über Failover nach. Wenn du einen Kategorisierungs- oder Zusammenfassungs-Service baust, schreibst du den Happy Path. Die Plattform kümmert sich um Retries.

Dazu gibt es einen `ModelDiscoveryService` mit Circuit Breaker. Nach 3 aufeinanderfolgenden Fehlern beim OpenRouter-Models-Endpoint stoppt er für 24 Stunden und nutzt eine gecachte Modellliste. Und einen `ModelQualityTracker`, der Akzeptanz-/Ablehnungsraten pro Modell aufzeichnet, damit du siehst, welche tatsächlich brauchbare Ergebnisse liefern.

All das wird mit dem Template ausgeliefert. Du konfigurierst deinen OpenRouter API-Key (oder auch nicht — die App läuft auch ohne AI einwandfrei), und die Infrastruktur erledigt den Rest.

## Qualität auf PHPStan Max ab Commit Zero

Das Template erbt dieselbe Qualitätslatte, die ich in Produktion nutze:

- **PHPStan Level max** mit 10 Extensions (Strict Rules, Symfony, Doctrine, Cognitive Complexity Cap von 8, 100% Type Coverage)
- **ECS** mit PSR-12 + Strict + CleanCode Sets
- **Rector** für PHP 8.4 + Symfony 8 automatische Upgrades
- **Infection** Mutation Testing bei 80% MSI, 90% Covered MSI
- **PHPat** Architekturtests die Schichtgrenzen durchsetzen

Die Git Hooks laufen ECS, PHPStan und Rector bei jedem Commit. Der Commit-Msg Hook erzwingt Conventional Commits. CI läuft parallel.

Das wichtige Detail: Es gibt null `ignoreErrors` Einträge in `phpstan.neon`. Der Template-Code ist so geschrieben, dass er PHPStan max erfüllt — nicht um Verletzungen herum konfiguriert. Wenn du eigenen Code hinzufügst, triffst du auf echte Fehler, die dich zwingen, bessere Typen zu schreiben — keine Phantom-Issues von einer relaxten Baseline.

## Claude Code Integration

Das `.claude/` Verzeichnis enthält Guidelines, die Claude Code automatisch liest:

- `coding-php.md` — Strict Types, final readonly Klassen, Interface-First, ClockInterface statt DateTime, Größenlimits pro Methode/Klasse
- `coding-typescript.md` — Strict Mode, kein `any`, Bun Build Pipeline, DaisyUI-Konventionen
- `testing.md` — PHPUnit Suite-Struktur, Infection Schwellenwerte, CI-Pipeline-Reihenfolge
- `architecture.md` — Docker Services, DDD-Struktur, Domains hinzufügen, AI-Infrastruktur

Das ist keine Dokumentation nur für Menschen (obwohl es auch dafür funktioniert). Es sind Instruktionen, die beeinflussen, wie Claude Code in deinem Projekt Code generiert. Wenn Claude einen neuen Service erstellt, nutzt es `final readonly class`, injiziert Interfaces und verwendet `ClockInterface` — weil die Guidelines es so vorgeben.

Die Root-`CLAUDE.md` hat die harten Regeln: kein DateTime, kein var_dump, kein empty(), kein YAML Config, Interface-First Architektur, Conventional Commits. Claude Code hält sich konsistent daran, sobald sie in der Datei stehen.

## Die Beispiel-Domain

Das Template enthält eine Wegwerf-`Example/` Domain: ein `Item` Entity, ein Controller, ein Seed-Command. Sie existiert, um das DDD-Pattern zu zeigen — wie Entities, Controller und Commands organisiert sind, wie Doctrine-Mappings pro Domain funktionieren, wie Architekturtests Grenzen durchsetzen.

Eine eigene Domain hinzuzufügen sind vier Schritte:

1. `src/DeineDomain/Entity/`, `Controller/`, `Service/` erstellen
2. Entity-Mapping in `config/packages/doctrine.php` registrieren
3. Migration generieren
4. PHPat Architekturtests aktualisieren

Dann `Example/` löschen. Es hat seinen Zweck erfüllt.

## Was bewusst fehlt

Ich habe projektspezifische Dinge absichtlich weggelassen:

- **Keine Suche** — SEAL + Loupe ist super, aber Index-Schemas sind domain-spezifisch
- **Kein Messenger Worker** — der Transport ist konfiguriert, aber Worker-Services hängen von deiner Queue-Topologie ab
- **Kein Scheduler** — wiederkehrende Tasks sind zu projektspezifisch zum Templaten
- **Keine Domain AI-Services** — die Failover-Plattform ist da, aber Kategorisierung/Zusammenfassung/Bewertung sind Sache deiner Domain

Das Template gibt dir Infrastruktur. Du baust das Produkt.

## Loslegen

```bash
# GitHub Template Button nutzen, oder:
git clone https://github.com/tony-stark-eth/template-symfony-ai mein-projekt
cd mein-projekt
make start     # Docker bauen + starten
make hooks     # Git Hooks installieren
make quality   # Prüfen, dass alles passt
```

https://localhost:8443 öffnen, mit `demo@localhost` / `demo` einloggen. Läuft.

Das Repo liegt auf [tony-stark-eth/template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). MIT-lizenziert. Wenn du ein Symfony-Projekt startest und AI-Integration willst, ohne die Plumbing neu zu bauen, spart dir das die ersten zwei Tage.
