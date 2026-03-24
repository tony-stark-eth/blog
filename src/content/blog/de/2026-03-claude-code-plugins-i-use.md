---
title: "Die Claude Code Plugins, die wirklich einen Unterschied machen"
description: "Mein tägliches Setup: 6 Plugins, Custom Hooks und ein Token-Killer-Proxy. Was jedes Tool macht und warum es installiert bleibt."
date: 2026-03-24
tags: ["claude-code", "developer-productivity", "plugins", "developer-tools"]
locale: "de"
translationSlug: "2026-03-claude-code-plugins-i-use"
draft: false
---

In meinem [letzten Post](/de/blog/2026-03-10x-output-with-quality/) habe ich über das System gesprochen, mit dem ich meinen Output verzehnfache: Ich treffe Entscheidungen, Claude Code schreibt den Code, und ein Quality-Stack validiert alles. Was ich nicht behandelt habe, ist die Tooling-Schicht zwischen mir und Claude Code selbst — die Plugins, Hooks und Extensions, die ein gutes CLI zu einem großartigen machen.

Hier ist die vollständige Liste dessen, was ich täglich nutze und warum jedes Teil seinen Platz verdient.

## Context7 — Immer aktuelle Dokumentation

**Was es macht:** Holt aktuelle Dokumentation und Code-Beispiele für beliebige Libraries direkt in Claude Code via MCP.

**Warum es wichtig ist:** Claudes Trainingsdaten haben einen Stichtag. Wenn ich mit Symfony 8 oder Tailwind 4 arbeite, muss Claude die tatsächliche aktuelle API referenzieren — nicht etwas aus einer Version von vor 18 Monaten. Context7 schließt diese Lücke. Statt dass ich Docs in die Konversation kopiere, kann Claude sie selbst abrufen.

Das ist eins dieser Plugins, das leise ganze Kategorien von Bugs verhindert. Jedes Mal, wenn Claude Code gegen eine veraltete API-Signatur generiert, ist das eine verschwendete Review-Runde. Context7 eliminiert die meisten davon.

## Code Review Graph — Strukturelles Verständnis

**Was es macht:** Baut einen persistenten Knowledge Graph deiner Codebase mit Tree-sitter-Parsing. Trackt Funktionen, Klassen, Abhängigkeiten und Change-Impact — lokal in SQLite gespeichert.

**Warum es wichtig ist:** Das hier löst die größte Token-Verschwendung in Claude Code: das komplette Neu-Lesen der Codebase bei jeder Aufgabe. Code Review Graph mappt die Struktur einmal, aktualisiert inkrementell (unter 2 Sekunden) und gibt Claude präzisen Kontext darüber, was von einer Änderung betroffen ist.

Die Zahlen sind überzeugend. Bei Produktions-Repositories reduziert es den Token-Verbrauch um das 6- bis 26-fache je nach Projektgröße. Aber der eigentliche Wert sind nicht die Token-Einsparungen — es ist die Review-Qualität. Wenn Claude den Blast Radius einer Änderung kennt (welche Funktionen den geänderten Code aufrufen, welche Tests ihn abdecken, welche Module davon abhängen), werden Reviews von "sieht gut aus" zu tatsächlich nützlich.

Es unterstützt 14 Sprachen, darunter PHP, TypeScript und Go — das deckt alles ab, womit ich arbeite. Die D3.js-Graph-Visualisierung ist ein netter Bonus zum Verstehen unbekannter Codebases.

```bash
# Graph einmal aufbauen, danach Auto-Update bei Dateiänderungen und Commits
/code-review-graph:build-graph

# PR mit vollständiger Impact-Analyse reviewen
/code-review-graph:review-pr
```

## Planning with Files — Strukturiertes Denken für komplexe Aufgaben

**Was es macht:** Erstellt ein dateibasiertes Planungssystem (`task_plan.md`, `findings.md`, `progress.md`) für komplexe mehrstufige Aufgaben. Trackt Fortschritt, loggt Erkenntnisse und überlebt Session-Neustarts.

**Warum ich es nutze:** Bei allem, das mehr als ein paar Tool-Calls braucht — ein Refactoring über mehrere Dateien, ein neues Feature über mehrere Domains, eine Migration — muss Claude planen, bevor es handelt. Dieses Plugin erzwingt diese Struktur. Statt dass Claude in Code-Änderungen eintaucht und den Überblick verliert, wird alles in Dateien geschrieben, die persistent sind.

Die Session-Recovery ist das unterschätzte Feature. Wenn Claudes Kontext lang wird und ich neu starten muss (passiert — ich habe im letzten Post erwähnt, dass der Kontext nach 30+ Iterationen degradiert), werden die Plan-Dateien mitgenommen. Claude liest sie, setzt dort an wo es aufgehört hat, und wiederholt keine Arbeit.

## PhpStorm Plugin — IDE-Level Intelligenz

**Was es macht:** Verbindet Claude Code mit PhpStorms Inspection Engine via MCP. Gibt Claude Zugriff auf Symbol-Auflösung, Code-Suche, Datei-Operationen und PhpStorms eigene Code-Analyse.

**Warum es wichtig ist:** PhpStorm versteht PHP auf einem Level, das reines Datei-Lesen nicht erreichen kann. Wenn Claude alle Verwendungen einer Methode finden, eine Klassenhierarchie auflösen oder Inspection-Warnungen prüfen muss, kann es PhpStorms Index nutzen statt durch Dateien zu greppen. Der Unterschied ist Präzision: PhpStorm weiß, dass `$this->handle()` in einer Command-Klasse zu einer spezifischen Methode auflöst, während grep nur Strings findet.

Ich habe alle PhpStorm-MCP-Tools in meinen Settings vorab freigegeben, damit Claude sie ohne jedes Mal um Erlaubnis zu fragen nutzen kann. Das ist eine bewusste Entscheidung — das sind alles Lese-Operationen plus Formatierung, nichts Destruktives.

## PHPantom Docker — PHP LSP ohne Chaos

**Was es macht:** Führt eine PHP Language Server Protocol Instanz in Docker aus und gibt Claude Code Zugriff auf PHP-native Intelligenz (Type Inference, Autocompletion-Kontext, Go-to-Definition) ohne meine lokale Umgebung zu verschmutzen.

**Warum es wichtig ist:** Zwischen PhpStorms Inspections und PHPantoms LSP hat Claude zwei komplementäre Sichten auf die PHP-Codebase. PhpStorm glänzt bei Projekt-Level-Analyse (Architektur, Inspections, Refactoring). PHPantom gibt rohe LSP-Fähigkeiten, die auch funktionieren, wenn PhpStorm nicht läuft — nützlich für CI-nahe Arbeit oder wenn ich in einer reinen Terminal-Session bin.

## RTK (Rust Token Killer) — Der unsichtbare Optimierer

**Was es macht:** Ein Rust-basierter CLI-Proxy, der Shell-Befehle (wie `git status`, `docker ps`, `ls`) abfängt und deren Output auf das reduziert, was Claude wirklich braucht. Installiert als Hook, der Befehle transparent umschreibt.

**Warum ich es in meinen Workflow eingebaut habe:** Token-Kosten summieren sich. Jedes `git status`, das 200 Zeilen ungetrackte Dateien ausgibt, jedes `docker compose ps` mit Formatierung, die Claude nicht braucht — das ist Context-Window-Platz, der für Rauschen verschwendet wird. RTK filtert auf das Signal herunter.

Die Einsparungen liegen bei 60-90% bei typischen Dev-Operationen. Über eine lange Session ist das der Unterschied zwischen Context-Limits erreichen und produktiv bleiben. Und weil es als Pre-Tool-Use-Hook läuft, denke ich nie darüber nach — jeder Bash-Befehl, den Claude ausführt, wird automatisch optimiert.

```bash
# Kumulative Einsparungen prüfen
rtk gain

# Sehen welche Befehle die meisten Tokens gespart haben
rtk gain --history
```

## Die Hooks, die alles zusammenhalten

Plugins sind die halbe Geschichte. Die andere Hälfte sind Hooks und Settings, die Fehler verhindern:

**rm -rf Blocker:** Ein Pre-Tool-Use-Hook, der jeden `rm`-Befehl mit Recursive- und Force-Flags blockt. Claude kann einzelne Dateien löschen, aber keine Verzeichnisse auslöschen. Das hat mich genau einmal gerettet — und einmal reicht.

**Main-Branch Push-Blocker:** Blockt `git push` auf main oder master. Claude arbeitet auf Feature Branches. Immer. Keine Ausnahmen, kein "nur dieses eine Mal."

**Permission-Defaults:** `acceptEdits`-Modus bedeutet, Claude kann Dateien lesen und bearbeiten ohne zu fragen, aber destruktive Operationen brauchen weiterhin Bestätigung. Die PhpStorm-MCP-Tools sind vorab freigegeben, weil sie alle sicher sind. Sensible Pfade (`~/.ssh`, `~/.aws`, Credentials) sind explizit gesperrt.

## Was ich nicht nutze

Genauso wichtig: Ich installiere nicht jedes verfügbare Plugin. Keine CMS-Integrationen, keine KI-zu-KI-Ketten, keine experimentellen Features, die nicht stabil sind. Jedes Plugin in meinem Setup ist seit mindestens einer Woche installiert und hat seinen Wert durch tägliche Nutzung bewiesen. Wenn etwas Komplexität hinzufügt ohne messbar die Output-Qualität oder Geschwindigkeit zu verbessern, fliegt es raus.

Das Ziel ist nicht die Anzahl der Tools zu maximieren — sondern die Reibung zwischen meinen Entscheidungen und funktionierendem Code zu minimieren.

## Der Stack im Überblick

| Schicht | Tool | Zweck |
|---|---|---|
| Docs | Context7 | Aktuelle Library-Dokumentation |
| Code-Intelligenz | Code Review Graph | Strukturelles Verständnis, Impact-Analyse |
| Planung | Planning with Files | Mehrstufige Aufgabenverfolgung |
| IDE | PhpStorm Plugin | Symbol-Auflösung, Inspections |
| LSP | PHPantom Docker | PHP Language Server in Docker |
| Optimierung | RTK | Token-Reduktion bei CLI-Output |
| Sicherheit | Custom Hooks | Destruktive Operationen blockieren |

Wenn du Claude Code ohne Plugins nutzt, starte mit Context7 und Code Review Graph. Sie haben das beste Verhältnis von Impact zu Setup-Aufwand. Wenn du in einer PHP/PhpStorm-Umgebung bist, ist das PhpStorm Plugin ein No-Brainer. Und wenn dir Token-Kosten wichtig sind (sollten sie), schau dir RTK an.

Die Plugins machen Claude Code nicht schlauer. Sie geben ihm bessere Informationen — und das ist der Unterschied zwischen einem Tool, das plausiblen Code generiert, und einem, das korrekten Code generiert.
