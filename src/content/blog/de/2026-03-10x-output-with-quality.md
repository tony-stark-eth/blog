---
title: "Wie ich meinen Output als Senior Developer verzehnfache ohne Qualitätseinbußen"
description: "An einem Wochenende habe ich zwei produktionsreife Repositories gebaut. Das System dahinter — und warum der Quality-Stack wichtiger ist als die KI."
date: 2026-03-22
tags: ["developer-productivity", "code-quality", "claude-code", "phpstan", "open-source"]
locale: "de"
translationSlug: "2026-03-10x-output-with-quality"
draft: false
sticky: true
cover:
  src: "/images/blog/10x-output-quality.png"
  alt: "Terminal mit PHPStan level max bestanden neben Claude Code Output"
---

Letztes Wochenende habe ich zwei Repositories von Grund auf gebaut: ein [opinionated Full-Stack-Template](https://github.com/tony-stark-eth/template-symfony-sveltekit) für PHP 8.4 + Symfony 8 + SvelteKit 2, und eine [vollständige Habit-Tracking-Anwendung](https://github.com/tony-stark-eth/smarthabit-tracker) darauf aufgebaut. 51 Commits, 6 GitHub Actions Workflows, 10 PHPStan-Extensions auf level max konfiguriert, Docker Multi-Stage Builds, OpenTofu-Infrastruktur — alles mit grünem CI.

Das ist kein normales Wochenende.

Ich bin ein Senior Developer mit klaren Vorstellungen von Code-Qualität. Ich shippe keinen Code ohne statische Analyse auf höchstem Level, mutation testing, Architecture Tests und automatisiertes Formatting. Das hat sich nicht geändert. Geändert hat sich, *wie* ich dorthin komme.

## Der Flaschenhals war nie das Denken

Hier ist, was mir klar geworden ist: Als Senior Developer habe ich die meiste Zeit nie mit Architekturentscheidungen oder dem Lösen schwieriger Probleme verbracht. Sondern mit allem drum herum. Boilerplate schreiben. Tools konfigurieren. API-Signaturen nachschlagen. Den 14. PHPUnit-Test schreiben, der dem gleichen Muster folgt wie die vorherigen 13. YAML-Einrückungen in CI-Workflows korrigieren.

Diese Aufgaben erfordern Wissen, um sie korrekt auszuführen, aber keine Kreativität. Sie sind die Steuer, die du für sauberes Bauen zahlst.

KI-Code-Assistenten schaffen diese Steuer ab.

## Das System

Mein Workflow hat drei Ebenen, und die Reihenfolge ist entscheidend.

**Ebene 1: Ich treffe die Entscheidungen.** Architektur, Tech-Stack, Datenmodell, welche Tools verwendet werden und warum, was die Qualitätsstandards sind. Dieser Teil ist vollständig menschlich. Ich habe Stunden in einer Planungssession verbracht, um den Quality-Stack des Templates zu definieren — welche PHPStan-Extensions einzubeziehen, warum CaptainHook statt GrumPHP, warum Same-Origin-Architektur statt separater API- und Frontend-Domains, warum PgBouncer im transaction mode `DISCARD ALL` benötigt. Das sind Entscheidungen, die Erfahrung und Urteilsvermögen erfordern. Keine KI hat sie für mich getroffen.

**Ebene 2: Ich schreibe die Spec, die KI schreibt den Code.** Sobald die Entscheidungen getroffen sind, dokumentiere ich sie in einem Format, gegen das Claude Code ausführen kann. Eine `CLAUDE.md`-Datei, die den Projektkontext und harte Constraints definiert. Ein `.claude/`-Verzeichnis mit Coding-Guidelines, Test-Regeln und Architektur-Konventionen. Wenn ich Claude Code sage, eine `phpstan.neon` mit level max und 10 bestimmten Extensions zu erstellen, muss es nicht herausfinden, *welche* Extensions — diese Entscheidung habe ich bereits getroffen. Es muss nur korrekte Konfiguration produzieren. Das ist eine Aufgabe, die es gut bewältigt.

**Ebene 3: Ich reviewe alles.** Jede Zeile, die Claude Code produziert, geht durch mein Review. Kein Rubber-Stamping — ein echtes Review, bei dem ich auf dieselben Dinge achte wie bei jedem PR. Macht das Doctrine-Mapping Sinn? Ist das Caddyfile-Routing korrekt für Same-Origin? Sind die CI-Workflow-Abhängigkeiten richtig, damit PHPStan vor den Tests läuft? Hier setzt sich Senior-Erfahrung fort: Ich erkenne Probleme, die die KI nicht als Probleme erkennt, weil sie Verständnis erfordern, wie Dinge in Production interagieren.

## Warum der Quality-Stack der Multiplikator ist

Das ist es, was die meisten "KI macht mich 10x produktiver"-Posts falsch machen: Sie fokussieren sich auf die KI und ignorieren das Sicherheitsnetz.

Würde ich Claude Code ohne PHPStan auf level max einsetzen, ohne mutation testing, ohne Architecture Tests — ich würde schneller shippen, sicher. Ich würde auch Bugs shippen. KI-generierter Code ist plausibler Code. Er sieht richtig aus. Oft *ist* er richtig. Aber "oft" ist nicht "immer", und in der Lücke zwischen diesen beiden Wörtern leben die Production-Incidents.

Mein Quality-Stack verwandelt KI-assistierte Geschwindigkeit in KI-assistierte *Sicherheit*:

**PHPStan auf level max mit 10 Extensions** erkennt Typfehler, vergessene Exceptions, Cognitive-Complexity-Verletzungen und Architekturgrenz-Überschreitungen. Wenn Claude Code einen Service generiert, der versehentlich von einer Infrastruktur-Schicht abhängt, schlägt phpat an, bevor ich den Code überhaupt sehe.

**Mutation Testing via Infection** beweist, dass Tests tatsächlich etwas testen. Es ist einfach, Tests zu schreiben, die bestehen, aber kein bedeutungsvolles Verhalten prüfen — besonders wenn eine KI sie schreibt. Infection mutiert den Code und prüft, ob Tests die Änderung erkennen. MSI unter 80% bedeutet, die Test-Suite ist dekorativ.

**Rector mit Auto-Fix-Regeln** stellt sicher, dass der Code PHP-8.4-Idiomen folgt, egal wer — oder was — ihn geschrieben hat. Early Returns, Type Declarations, Dead-Code-Entfernung. Der Code, der im Repository landet, sieht immer aus wie *mein* Code, nicht wie "KI-Code".

**CaptainHook Git Hooks** führen ECS und PHPStan bei jedem Commit aus. Auch in einer schnellen Session mit Claude Code umgeht nichts das Quality Gate.

Das Ergebnis: Ich bewege mich schnell, aber die Leitplanken sind immer aktiv. Die KI schlägt vor, der Quality-Stack validiert, und ich treffe die endgültige Entscheidung.

## Wo KI versagt

Ich möchte konkret benennen, wo Claude Code scheitert, weil die ehrliche Version dieser Geschichte wichtiger ist als die Hype-Version.

**Es hinterfragt deine Entscheidungen nicht.** Wenn ich es bitte, etwas architektonisch Falsches zu implementieren, macht es das souverän und korrekt — die falsche Sache, gut gemacht. Die `CLAUDE.md` hilft hier, weil sie meine Entscheidungen kodiert, aber sie kann kein Urteilsvermögen kodieren, das ich noch nicht artikuliert habe.

**Es verliert Kontext in langen Sessions.** Nach 30+ Iterationen hin und her vergisst Claude Code Constraints aus früher im Gespräch. Ich habe gelernt, Sessions fokussiert zu halten: ein Feature, eine Dateigruppe, dann neu starten.

**Es generiert plausible, aber falsche Konfigurationen.** Ein Caddyfile, das korrekt aussieht, aber die Routing-Reihenfolge falsch hat. Eine `phpstan.neon`, die eine Extension einbindet, die mit einer anderen konfliktiert. Eine `compose.yaml`, bei der sich der PgBouncer-Service mit dem falschen Netzwerk verbindet. Das sind genau die Bugs, die mein Review-Schritt auffängt — und genau deshalb ist der Review-Schritt nicht optional.

**Es kann keine Recherche betreiben.** Als ich zwischen `ntfy` und Firebase für Push-Notifications entscheiden musste, konnte Claude Code die Abwägungen nicht anhand von echten Erfahrungen bewerten. Es konnte Vor- und Nachteile auflisten, aber nicht sagen, dass das kostenlose Firebase-Kontingent ein Benachrichtigungslimit hat, das bei 500 Haushalten relevant wird. Diese Erkenntnis kam aus meiner eigenen Erfahrung.

## Die Zahlen

Was mich früher einen vollen Sprint (zwei Wochen) gekostet hat — Docker-Konfiguration, CI-Pipeline, Quality-Tooling, Frontend-Scaffolding, Infrastruktur-Skelett — erledige ich jetzt an einem Wochenende. Nicht weil die KI es für mich tut, sondern weil sie die Implementierung übernimmt, während ich mich auf die Entscheidungen konzentriere.

Das Template-Repository enthält: ein mehrstufiges Dockerfile mit FrankenPHP, drei Compose-Dateien (dev/override/prod), 10 PHPStan-Extensions konfiguriert und bestanden, Rector mit PHP-8.4- und Symfony-8-Regelsets, ECS für Coding Standards, PHPUnit 13 mit Path Coverage, Infection für mutation testing, CaptainHook für Git Hooks, 6 GitHub Actions Workflows, OpenTofu-Module für Hetzner-Deployment, und ein vollständiges `.claude/`-Verzeichnis mit Guidelines.

Das alles manuell zu konfigurieren — auch für jemanden, der es schon einmal gemacht hat — dauert Tage. Mit Claude Code, das gegen eine klare Spec ausführt, dauert es Stunden.

## Selbst ausprobieren

Das Template ist Open Source und zum Forken gedacht:

**[github.com/tony-stark-eth/template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit)**

Jedes Quality-Tool ist vorkonfiguriert. Jeder CI-Workflow ist bereit. Fork es, führe `docker compose up` aus, und du hast ein Full-Stack-Projekt mit PHPStan level max ab dem ersten Commit.

`CLAUDE.md` und `.claude/`-Guidelines sind enthalten — wenn du Claude Code nutzt, weiß es bereits, wie es mit der Codebase arbeiten soll.

Wenn du als Senior Developer skeptisch gegenüber KI-Tools bist: ich war es auch. Der Trick ist, die KI nicht fahren zu lassen. Du fährst. Die KI ist der Motor. Und der Quality-Stack sind die Bremsen.
