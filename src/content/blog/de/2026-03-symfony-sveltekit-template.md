---
title: "Mein Symfony + SvelteKit Template mit 10 PHPStan-Erweiterungen"
description: "Ein Full-Stack-Template für PHP 8.4 + Symfony 8 + SvelteKit 2 mit Static Analysis auf Level max, Mutation Testing, Architekturtests und CI ab Commit null."
date: 2026-03-29
tags: ["symfony", "phpstan", "sveltekit", "open-source", "developer-tools"]
locale: "de"
translationSlug: "2026-03-symfony-sveltekit-template"
draft: false
---

Jedes Mal wenn ich ein neues PHP-Projekt starte, beginnt dasselbe Ritual: 30 Minuten PHPStan konfigurieren, 20 Minuten ECS, eine weitere Stunde für CI-Pipelines, Rector-Setup, Mutation-Testing-Baseline, Doctrine-Konfiguration, Docker Multi-Stage Builds. Ich habe das oft genug gemacht, dass ich genau weiß, was ich will — und ich hatte es satt, das jedes Mal von Grund auf neu aufzubauen.

Also habe ich ein Template gebaut. Kein Skeleton — einen meinungsstarken, produktionsbereiten Ausgangspunkt mit jedem Qualitätswerkzeug, das ich selbst in Produktion verwende, fertig konfiguriert.

Das Repo liegt unter **[github.com/tony-stark-eth/template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit)**.

## Der Stack

**Backend**: PHP 8.4, Symfony 8, Doctrine ORM, FrankenPHP im Worker Mode.

**Frontend**: SvelteKit 2 mit Svelte 5, TypeScript im Strict Mode, Tailwind 4, Bun als Package Manager und Runtime.

**Datenbank**: PostgreSQL 17 mit PgBouncer im Transaction Mode. PgBouncer ist von Anfang an dabei, weil es im Nachhinein schmerzhafter hinzuzufügen ist als die meisten erwarten — besonders wenn der Code `SET`-Befehle oder Advisory Locks nutzt, die eine Connection-Wiederverwendung nicht überleben. Besser früh damit zu rechnen.

**Infrastruktur**: OpenTofu-Module für Hetzner. Deployment auf einem Hetzner-VPS ist günstig und unkompliziert; die Module übernehmen Server-Provisionierung, DNS und Firewall.

## Same-Origin-Architektur

Das Template stellt sowohl die PHP-API als auch das SvelteKit-Frontend hinter einem einzigen Caddy Reverse Proxy auf einer einzigen Domain bereit. API-Routen gehen an FrankenPHP, alles andere an den SvelteKit-Server.

Das bedeutet: keine CORS-Header, keine `SameSite=None`-Cookies, keine Cross-Origin-Authentifizierungskomplexität. Ein Session-Cookie, das Symfony setzt, ist im Server-Side Rendering von SvelteKit auf demselben Origin lesbar. Die SvelteKit-`load`-Funktion ruft `fetch('/api/...')` auf — keine Base-URL-Konfiguration, kein Jonglieren mit Umgebungsvariablen pro Umgebung.

Der Kompromiss: beide Services müssen gemeinsam deployed werden. Für ein Produkt mit getrennten Teams für Frontend und Backend könnte ein separater Origin sinnvoll sein. Für einen Solo-Entwickler oder ein kleines Team, das ein einziges Produkt baut, hält Same-Origin die operative Oberfläche klein.

## Das PHPStan-Setup

PHPStan ist auf Level max konfiguriert, mit 10 Erweiterungen:

- **phpstan-strict-rules** — die Erweiterungen, die PHPStan mitliefert, aber nicht standardmäßig aktiviert
- **phpstan-deprecation-rules** — zeigt veraltete API-Nutzung auf, bevor Abhängigkeiten sie entfernen
- **phpstan-symfony** — versteht den Symfony Service Container und DI-Konventionen
- **phpstan-doctrine** — kennt Doctrine Entity Mappings und QueryBuilder-Typen
- **phpstan-phpunit** — Typ-Inferenz innerhalb von PHPUnit-Tests
- **shipmonk/phpstan-rules** — ~40 zusätzliche Regeln für Enum-Vollständigkeit und Exception-Handling
- **voku/phpstan-rules** — Typ-Sicherheit bei Operatoren (keine impliziten int/string-Umwandlungen mehr)
- **tomasvotruba/cognitive-complexity** — Hartes Limit von 8 pro Methode, 50 pro Klasse. Wenn PHPStan wegen kognitiver Komplexität scheitert, muss die Methode aufgeteilt werden — nicht das Limit.
- **tomasvotruba/type-coverage** — 100% Type Coverage erforderlich. Kein ungetyptes Property, kein fehlender Return-Typ.
- **phpat/phpat** — Architekturtests als Code. Definiere, welche Schichten von welchen abhängen dürfen, und PHPStan erzwingt das bei jedem Lauf.

Gerade die letzte Erweiterung wird in PHP-Projekten zu selten eingesetzt. Mit phpat kann ich Regeln schreiben wie "Controller dürfen nicht direkt von Doctrine Repositories abhängen" und bekomme einen Static Analysis-Fehler — keinen Code-Review-Kommentar, keinen Laufzeitfehler —, wenn diese Grenze überschritten wird. Das Template wird mit einem grundlegenden `ArchitectureTest.php` ausgeliefert, den du mit dem Projekt erweiterst.

## Mutation Testing

PHPUnit plus Code Coverage sagt dir, dass deine Tests laufen. Infection sagt dir, ob sie wirklich etwas testen.

Infection mutiert den Quellcode — tauscht ein `>` gegen `>=` aus, entfernt ein `return`, ändert `true` zu `false` — und führt dann die Testsuite gegen jede Mutation aus. Scheitert ein Test nach der Mutation, wurde sie "getötet". Scheitert nichts, "entkam" die Mutation, was bedeutet: deine Tests decken dieses Verhalten nicht ab.

Das Template fordert einen Mutation Score Indicator (MSI) von mindestens 80% und Covered MSI von mindestens 90%. Das sind keine willkürlichen Zahlen — 80% MSI bedeutet, dass 4 von 5 möglichen Mutationen deines Codes mindestens einen Test brechen. Bei niedrigeren Schwellenwerten findet man Testsuiten mit 90% Line Coverage, die kaum etwas über das Verhalten beweisen.

Infection läuft als Teil von CI, nach PHPUnit, und nur wenn die Unit-Tests bestehen.

## Die anderen Qualitätswerkzeuge

**Rector** läuft mit PHP 8.4- und Symfony 8-Regelsets. Early Returns, Enum-Nutzung, typisierte Properties, Dead Code-Entfernung — der Code im Repository spiegelt immer aktuelle PHP-Idiome wider, egal ob ein Mensch oder eine KI ihn geschrieben hat. Rector ist so konfiguriert, dass er Probleme automatisch behebt und nicht nur meldet.

**ECS** (Easy Coding Standard) übernimmt Formatierung und Coding Style. Es läuft vor PHPStan in CI und bricht den Build ab, bevor die langsamere Analyse überhaupt startet. Beim Commit führt CaptainHook ECS und PHPStan lokal aus, damit du es weißt, bevor du pushst.

**CaptainHook** statt GrumPHP für Git Hooks. GrumPHP hatte in der Vergangenheit Probleme mit der Hook-Umgebung; CaptainHook ist simpler und seine Konfiguration expliziter.

## CI/CD

Zwei Workflows decken den gesamten Stack ab:

`ci.yml` läuft bei jedem Push und PR: ECS → PHPStan → Rector Check → PHPUnit mit Path Coverage → Infection. Die Reihenfolge ist entscheidend: Formatierung und Static Analysis sind schnell und scheitern früh; Mutation Testing ist langsam und läuft nur, wenn alles andere bestanden hat.

`ci-frontend.yml` deckt die SvelteKit-Seite ab: ESLint → Svelte Check → Bun Build. Dieser läuft parallel zur PHP-Pipeline.

Zwei weitere Workflows nutzen Claude Code. `claude-update.yml` läuft zweiwöchentlich und öffnet PRs für Dependency-Updates — sowohl Composer als auch npm — mit Commit-Messages, die erklären, was sich geändert hat und warum es wichtig ist. `claude-review.yml` postet bei jedem PR automatisch ein Code-Review. Keiner davon ersetzt menschliches Review, aber sie fangen die offensichtlichen Dinge auf, bevor ein Mensch Zeit damit verbringt.

## Claude Code Integration

Das Template wird mit einem `CLAUDE.md` und einem `.claude/`-Verzeichnis ausgeliefert, das die Architekturentscheidungen und Coding-Konventionen kodiert. Das ist derselbe Ansatz, den ich in [meinem Beitrag über 10x Output mit Qualität](/de/blog/2026-03-10x-output-with-quality/) beschrieben habe: du dokumentierst die Entscheidungen einmal, und jede Claude Code-Session startet mit diesem Kontext bereits geladen.

Die `.claude/`-Richtlinien decken Dinge ab wie: wie Symfony-Services strukturiert werden, welche Doctrine-Muster verwendet werden, wie das Same-Origin-Routing funktioniert, welche PHPStan-Regeln intentional sind und welche unterdrückt werden dürfen. Wenn du Claude Code nutzt, um auf diesem Template aufzubauen, kennt es die Einschränkungen bereits.

## Was dieses Template nicht ist

Es ist kein Microservices-Framework, kein Monorepo-Setup, und nicht für Projekte gedacht, bei denen Frontend und Backend von getrennten Teams betreut werden. Es ist ein solider Ausgangspunkt für ein einzelnes Produkt, gebaut von einem kleinen Team, das Qualitätswerkzeuge von Tag eins will, ohne eine Woche mit deren Konfiguration zu verbringen.

Wenn du den vollen Kontext willst, wie ich das gebaut habe — und warum der Qualitäts-Stack wichtiger ist als die KI, die mir beim Schreiben geholfen hat — lies [Wie ich als Senior Developer 10x mehr output schaffe ohne Codequalität zu opfern](/de/blog/2026-03-10x-output-with-quality/).

Fork es, führe `docker compose up` aus, und du hast PHPStan Level max, das ab Commit null besteht.
