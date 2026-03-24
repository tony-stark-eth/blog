---
title: "Vom Template zur Produktions-App in einem Wochenende"
description: "Wie ich SmartHabit Tracker gebaut habe — adaptive Benachrichtigungen, Real-time Sync, Multi-Transport Push — auf Basis eines quality-first Symfony-Templates."
date: 2026-03-24
tags: ["symfony", "pwa", "open-source", "side-project", "real-time"]
locale: "de"
translationSlug: "2026-04-smarthabit-tracker"
draft: false
---

Das [template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit) habe ich an einem Wochenende gebaut — PHPStan Level max, Mutation Testing, fünf CI-Workflows, der gesamte Stack vorkonfiguriert. Ein Template beweist seinen Wert erst, wenn man es wirklich benutzt. Also habe ich direkt danach [SmartHabit Tracker](https://github.com/tony-stark-eth/smarthabit-tracker) darauf aufgebaut.

Das ist die Geschichte davon, was passiert, wenn die Guardrails auf echte Feature-Entwicklung treffen.

## Was SmartHabit Tracker macht

Es ist ein Habit Tracker für Haushalte. Mehrere Personen im selben Haushalt teilen eine Habit-Liste, loggen Erledigungen mit einem einzigen Tap und werden zum richtigen Zeitpunkt benachrichtigt — nicht zu einer festen Zeit, die man einmal setzt und dann für immer ignoriert.

Der Benachrichtigungs-Teil ist das Interessante. Die meisten Habit-Apps erlauben es, einen Reminder auf 8 Uhr zu setzen, den man dann ewig snoozt. SmartHabit Tracker beobachtet, wann du Habits über 21 Tage tatsächlich erledigst, und passt die Erinnerungszeit an dein echtes Verhalten an. Wenn du deine Morgenrunde konsequent zwischen 7:15 und 7:45 Uhr loggst, verschiebt sich der Reminder dorthin. Ändert sich das Muster, folgt das Timing.

Die Multi-Plattform-Seite war eine bewusste frühe Entscheidung: kein Firebase. Firebase hat Free-Tier-Limits, die bei etwas Wachstum relevant werden, und die Abhängigkeit von Googles Infrastruktur wollte ich nicht. Stattdessen: Web Push für die PWA, [ntfy](https://ntfy.sh) für Android, APNs für iOS. Ein Symfony-Service, drei Transports, Platform-Detection im Frontend.

## Der MAD-Algorithmus

MAD steht für Median Absolute Deviation — ein robustes statistisches Maß, das gegenüber Ausreißern genauso resistent ist wie der Median gegenüber dem Mittelwert. Für Habit-Timing ist das wichtig: ein einzelner anomaler Tag (du hast um 23 Uhr geloggt, weil du unterwegs warst) soll das Modell nicht zerstören.

Die Implementierung nimmt die letzten 21 Tage der Abschluss-Timestamps für einen Habit, berechnet die mediane Abschlusszeit und nutzt MAD, um die Breite des Verhaltens-Fensters zu bestimmen. Ein Habit mit konsistentem Timing bekommt ein enges Fenster und einen früheren Reminder. Ein Habit mit streuendem Timing bekommt ein weiteres Fenster. Der Algorithmus ist kein ML — es ist Statistik, läuft in PHP, ohne externe Abhängigkeiten.

```php
// Calculate the median completion time from recent logs
$median = $this->calculateMedian($timestamps);

// MAD: median of absolute deviations from the median
$deviations = array_map(
    fn(int $ts) => abs($ts - $median),
    $timestamps
);
$mad = $this->calculateMedian($deviations);

// Tight MAD = consistent habit = reminder 30 minutes before median
// Wide MAD = scattered habit = reminder 60 minutes before median
$reminderOffset = $mad < self::TIGHT_WINDOW_THRESHOLD ? 1800 : 3600;
```

Die Threshold-Werte habe ich pro Haushalt konfigurierbar gemacht statt als globale Konstanten. Das war eine Entscheidung, die die Architektur-Tests des Templates erzwungen haben: `phpat` hat einen Service geflagged, der aus einer globalen Config las statt aus einem haushaltsscopierten Repository. Ohne diese Regel hätte ich es falsch gebaut und später refactored.

## Real-time Sync mit Mercure

Das Template enthielt Mercure via Caddy bereits. Das Einbinden in das Habit-Logging hat einen Nachmittag gebraucht.

Der Ablauf: ein User tippt "erledigt" auf einem Habit. Das Frontend wendet sofort ein optimistisches Update an — die UI reagiert in unter 50ms unabhängig vom Netzwerk. Im Hintergrund wird ein POST an die API geschickt. Die API persistiert den Log, veröffentlicht dann ein Mercure-Event auf dem privaten Topic des Haushalts. Jedes andere verbundene Gerät im Haushalt empfängt das Update und zeigt es an, ohne zu pollen.

Der optimistische UI-Teil erfordert sorgfältiges Rollback-Handling. Wenn der API-Aufruf fehlschlägt, muss das Frontend die optimistische Zustandsänderung rückgängig machen. Claude Code hat die initiale SvelteKit-Store-Logik generiert und den Happy Path korrekt hinbekommen — aber den Rollback nicht. Im Review gefunden. Das resultierende Muster:

```typescript
// Optimistic update first
habitStore.markComplete(habitId);

try {
  await api.logCompletion(habitId);
  // Mercure event will confirm state on other devices
} catch (error) {
  // Rollback on failure
  habitStore.markIncomplete(habitId);
  toast.error('Could not save — check your connection');
}
```

Das Mercure-Subscription läuft auf einem gemeinsamen `EventSource` pro Haushalt. Eine Verbindung pro Komponente wollte ich nicht. Das gemeinsame Connection-Management in SvelteKit erforderte einen Svelte Store mit Lifecycle-Hooks — ein weiterer Ort, an dem der generierte Code eine Review-Runde brauchte, bevor er korrekt war.

## Haushalt-Isolation

Jeder API-Endpoint ist durch einen Symfony Security Voter geschützt, der die Haushaltszugehörigkeit prüft. Nicht rollenbasiert — voter-basiert. Der Voter empfängt das Domain-Objekt (Habit, Completion Log oder Haushaltsmitglied) und prüft, ob der authentifizierte User zum selben Haushalt gehört.

```php
protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token): bool
{
    $user = $token->getUser();

    if (!$user instanceof User) {
        return false;
    }

    // $subject is the domain object — voter checks household membership
    return $subject->getHousehold()->isMember($user);
}
```

Dieses Muster bedeutet, dass ich niemals `if ($habit->getHousehold() !== $user->getHousehold())` in Controller-Code schreiben musste. Der Voter erzwingt die Grenze. Die Architektur-Regeln des Templates haben verhindert, dass ich Access-Logik in Controller gepackt hätte — `phpat` hätte es geflagged.

## Der Quality Stack in der Praxis

Das Template lieferte 10 PHPStan-Extensions bei Level max, Rector mit PHP 8.4 + Symfony 8 Rulesets, ECS für Coding Standards, Infection für Mutation Testing und CaptainHook, das bei jedem Commit prüft.

Das hat während der SmartHabit-Entwicklung folgendes gefangen:

**PHPStan hat einen nullable Typ erwischt, den ich übersehen hatte.** Eine Query-Methode lieferte `?Household` zurück, aber ich rief Methoden darauf auf ohne Null-Check. Der AI-generierte Code hat den Non-null-Pfad korrekt behandelt und den Null-Fall stillschweigend weggelassen. PHPStan hat es bei Level max geflagged. Ohne das wäre das eine `NullPointerException` in Production gewesen, die auf einen User wartet, der ohne Haushalt-Zuordnung endet.

**Infection hat bewiesen, dass ein Timing-Test hohl war.** Ich hatte einen Test für die MAD-Berechnung, der bestand, aber nicht die richtige Ausgabe assertete — er assertete nur, dass das Ergebnis `not null` ist. Infection mutierte den Rückgabewert und der Test bestand weiterhin. Ich habe den Test umgeschrieben, um den konkreten Timestamp zu asserten. MSI für die Benachrichtigungs-Domain liegt bei 93%.

**Rector hat ein PHP-8.4-Pattern gefunden, das ich im PHP-7-Stil geschrieben hatte.** Property Hooks waren verfügbar und Rector hat das alte Getter/Setter-Paar als ersetzbar markiert. Kein Bug — aber es spielt eine Rolle: der Codebase sieht konsistent aus, egal welche Zeilen Claude Code geschrieben hat und welche ich.

**CaptainHook hat einen Commit mit ECS-Verstößen blockiert.** Ich habe während einer Debugging-Session eine schnelle Hilfsfunktion manuell geschrieben, beliebig formatiert und versucht zu committen. Der Hook hat ECS ausgeführt, ist fehlgeschlagen, hat auto-gefixed, und ich musste den Fix stagen, bevor der Commit durchging. Das ist das gewünschte Verhalten — und es funktioniert gleich, egal ob der Code von einem Menschen oder einer KI stammt.

## Die Test-Zahlen

233 Unit- und Integrationstests, 38 Playwright End-to-End-Tests. 93% Mutation Score Index im Backend.

Die E2E-Tests decken die kritischen Pfade ab: Habit-Erstellung, Completion-Logging (inklusive optimistischem UI-Rollback), Haushaltsmitglieder-Einladung und Benachrichtigungs-Konfiguration. Sie laufen gegen eine echte Docker-Umgebung in CI — nicht gemockt, nicht gestubbt. Die Playwright-Suite läuft im CI-Workflow nach den Backend-Quality-Checks, sodass ein PHPStan-Fehler keine E2E-Tests verschwendet.

Fünf Workflows insgesamt:
- Backend Quality (PHPStan, ECS, Rector)
- Frontend Linting und Type Checking
- PHPUnit + Infection
- Playwright E2E
- Deploy to Production (Hetzner via OpenTofu, nur bei Push auf `main`)

Push auf `main` löst ein Deployment aus. Docker Health Checks verhindern, dass neue Container live gehen, wenn sie den Health-Endpoint nicht bestehen. Während der Entwicklung hat das zwei fehlerhafte Deploys blockiert. Das System funktioniert.

## Was schwierig war

Die PWA-Offline-Queue war der schwierigste Teil. Der Service Worker muss Habit-Completions bei fehlender Verbindung einreihen, bei Wiederherstellung der Verbindung abspielen und Konflikte behandeln, wenn ein anderes Haushaltsmitglied denselben Habit in der Zwischenzeit geloggt hat. Die Konfliktlösung ist simpel — Last-Write-Wins mit einem Server-Timestamp — aber die Queue zuverlässig über Seitenneuladungen, Browser-Neustarts und wechselnde Netzwerkbedingungen hinweg zu kriegen, hat mehr Iterationen gebraucht als alles andere.

Die Capacitor-Integration für iOS war ein knapper zweiter Platz. Die native Shell ist dünn, aber APNs verlangt Zertifikate, Entitlements, Provisioning Profiles und eine spezifische Symfony-Bundle-Konfiguration, für die es keine gute Dokumentation gibt. Dafür habe ich allein einen ganzen Nachmittag gebraucht.

## Der Return on Investment des Templates

Das [Template](https://github.com/tony-stark-eth/template-symfony-sveltekit) hat SmartHabit Tracker ab dem ersten Commit qualitativ konsistent gemacht. Ich habe PHPStan für dieses Projekt nicht konfiguriert — es war bereits konfiguriert. Ich habe keine CI-Workflows geschrieben — sie waren bereits da. Ich habe kein Mutation Testing eingerichtet — es lief bereits auf einem leeren Codebase.

Das bedeutete, dass jede Stunde, die ich mit SmartHabit Tracker verbracht habe, in Produktentscheidungen und Domain-Logik geflossen ist, nicht in Tooling-Setup. Und das Tooling hat echte Bugs gefunden — keine theoretischen, keine "das wird ein Problem bei Skalierung"-Bugs. Tatsächliche Defekte, die Production erreicht hätten.

Wenn du etwas Ähnliches bauen willst:

**[github.com/tony-stark-eth/smarthabit-tracker](https://github.com/tony-stark-eth/smarthabit-tracker)**

Der Quality Stack aus [Post 1](/blog/2026-03-10x-output-with-quality/) ist vollständig erhalten. Fork it, passe die Habit-Domain an, behalte die Guardrails.
