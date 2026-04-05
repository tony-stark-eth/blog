---
title: "Ein AI News Aggregator, der auch ohne AI funktioniert"
description: "Selbstgehosteter RSS-Aggregator mit AI-Kategorisierung und Smart Alerts — warum regelbasierter Fallback ihn erst zuverlässig macht."
date: 2026-04-05
tags: ["symfony", "ai", "open-source", "self-hosted", "rss"]
locale: "de"
translationSlug: "2026-04-news-aggregator"
draft: false
---

Ich wollte einen News-Aggregator, der auf meinem Homeserver läuft, Artikel automatisch kategorisiert und mich benachrichtigt, wenn etwas Relevantes passiert. Jede gehostete Lösung hatte dasselbe Problem: Die AI-Features waren super — bis die API ausfiel, das Free Tier aufgebraucht war oder das Modell deprecated wurde. Dann steht man mit einer App da, die vergessen hat, wie sie funktioniert.

Also habe ich [News Aggregator](https://github.com/tony-stark-eth/news-aggregator) gebaut — eine Symfony 8 App, bei der AI ein Enhancement Layer ist, keine Abhängigkeit. Sie kategorisiert, fasst zusammen und bewertet Artikelrelevanz über OpenRouters kostenlose Modelle. Wenn AI ausfällt (und kostenlose Modelle fallen oft aus), übernimmt regelbasierte Logik nahtlos. Das System hört nie auf zu funktionieren.

## Das Failover-Problem

OpenRouters `openrouter/free` Endpoint routet automatisch zum besten verfügbaren kostenlosen Modell. Das ist praktisch, bis man merkt, dass sich "bestes verfügbares" stündlich ändert und manche Modelle Müll zurückgeben. Ich brauchte eine Fallback-Kette, die nicht erfordert, dass ich Model-IDs manuell aktualisiere, wenn eines deprecated wird.

Die Lösung ist eine `ModelFailoverPlatform` — ein `PlatformInterface`-Decorator, der die OpenRouter-Plattform mit Model-Level Failover umschließt:

```php
// services.php — Model-Failover-Kette
$services->set('ai.platform.openrouter.failover', ModelFailoverPlatform::class)
    ->arg('$innerPlatform', service('ai.platform.openrouter'))
    ->arg('$fallbackModels', [
        'minimax/minimax-m2.5:free',
        'z-ai/glm-4.5-air:free',
        'openai/gpt-oss-120b:free',
        'qwen/qwen3.6-plus:free',
        'nvidia/nemotron-3-super-120b-a12b:free',
    ]);
```

Wenn `openrouter/free` fehlschlägt, probiert es jedes Fallback-Modell der Reihe nach. Wenn alle Modelle versagen, fällt der Service auf regelbasierte Logik zurück. Drei Ebenen der Ausfallsicherheit: primäres Modell, Failover-Kette, regelbasierter Fallback.

Dazu gibt es einen `ModelDiscoveryService` mit Circuit Breaker. Nach 3 aufeinanderfolgenden API-Fehlern stoppt er Anfragen an den OpenRouter-Models-Endpoint für 24 Stunden und nutzt stattdessen eine gecachte Modellliste. Kein Grund, eine tote API zu bombardieren.

## Regelbasiert ist nicht dumm

Die regelbasierte Kategorisierung nutzt Keyword-Matching mit gewichteten Kategorie-Maps. Nicht ausgefallen, aber deterministisch und sofort:

```php
private const array KEYWORD_MAP = [
    'politics' => ['election', 'parliament', 'minister', 'legislation', ...],
    'tech'     => ['software', 'algorithm', 'startup', 'cloud', ...],
    'business' => ['revenue', 'acquisition', 'market', 'earnings', ...],
];
```

Wenn AI verfügbar ist, umschließt `AiCategorizationService` den `RuleBasedCategorizationService` als Decorator. Wenn die AI-Antwort das Quality Gate passiert (valider Kategorie-Slug, kein halluzinierter Wert), gewinnt sie. Wenn nicht, läuft stattdessen der innere regelbasierte Service. Der Aufrufer weiß nie, welcher Pfad ausgeführt wurde.

Dieses Decorator-Pattern war die wichtigste Architekturentscheidung. Jeder AI-Service folgt ihm: Kategorisierung, Zusammenfassung, Deduplizierung, Alert-Bewertung. Man kann den OpenRouter API-Key komplett aus der Config entfernen und die App läuft weiter — nur mit weniger akkurater Kategorisierung.

## Smart Alerts ohne API-Calls zu verbrennen

Das Alert-System hat drei Regeltypen: keyword-only, AI-only und keyword+AI. Der keyword+AI-Typ ist der interessante.

Eine naive Implementierung würde jeden Artikel durch die AI-Bewertung schicken. Mit 16 RSS-Quellen, die alle 15-60 Minuten fetchen, sind das hunderte API-Calls pro Tag — das Free Tier ist schnell aufgebraucht und man wird rate-limited. Stattdessen läuft Keyword-Matching immer zuerst. AI-Bewertung wird nur bei Artikeln ausgelöst, die bereits Keywords getroffen haben. Das reduziert AI-Calls auf vielleicht 10-20 pro Tag.

```php
// FetchSourceHandler Pipeline
$matches = $this->articleMatcher->match($article, $alertRules);
foreach ($matches as $match) {
    // AI-Bewertung läuft nur, wenn die Regel es verlangt UND Keywords getroffen haben
    $this->messageBus->dispatch(new SendNotificationMessage(
        $match->rule->getId(),
        $article->getId(),
        $match->matchedKeywords,
    ));
}
```

Der `SendNotificationHandler` entscheidet dann basierend auf dem Regeltyp, ob AI aufgerufen wird. Wenn es keyword+AI ist und die AI die Severity unter dem Schwellenwert bewertet, wird die Benachrichtigung still verworfen. Kein Rauschen.

## Der Scheduler-Bug, der drei CI-Runs kostete

Der hier hat Spaß gemacht zu debuggen. CI schlug immer wieder fehl mit:

```
No transport supports Messenger DSN "symfony://scheduler_fetch"
```

Der `FetchScheduleProvider` nutzt `#[AsSchedule('fetch')]`, was automatisch einen Messenger-Transport mit DSN `schedule://fetch` registriert. Aber jemand (ich) hatte den Transport auch manuell in `messenger.php` definiert — mit DSN `symfony://scheduler_fetch`. Falsches Prefix: `symfony://` statt `schedule://`.

Lokal trat das nie auf, weil die Dev-Umgebung einen warmen Cache hatte, in dem der auto-registrierte Transport Vorrang hatte. In CI wurde der Container frisch kompiliert und traf zuerst auf die ungültige manuelle Definition. Ich fand es erst, nachdem der PgBouncer-Datenbankrouting-Fix den früheren Fehler beseitigt hatte, der diesen verdeckte. Geschichtete Bugs — jeder Fix enthüllt den nächsten.

## Architekturtests als Leitplanken

Ich nutze PHPat (Architekturtests via PHPStan) um Domain-Grenzen durchzusetzen. Das Projekt folgt DDD mit sechs Bounded Contexts: Article, Source, Enrichment, Notification, Digest und Shared.

```php
public function testArticleDoesNotDependOnEnrichmentOrNotification(): Rule
{
    return PHPat::rule()
        ->classes(Selector::inNamespace('App\Article'))
        ->excluding(Selector::classname(
            'App\Article\MessageHandler\FetchSourceHandler'
        ))
        ->shouldNot()
        ->dependOn()
        ->classes(
            Selector::inNamespace('App\Enrichment'),
            Selector::inNamespace('App\Notification'),
            Selector::inNamespace('App\Digest'),
        );
}
```

Der `FetchSourceHandler` bekommt eine explizite Ausnahme, weil er die Orchestrierungs-Pipeline ist — der einzige Ort, an dem alle Domains zusammenlaufen. Jede andere Klasse im Article-Namespace darf keinen Enrichment- oder Notification-Code importieren. PHPStan erzwingt das bei jedem Commit über den Pre-Commit Hook.

Beim Architektur-Audit vor dem Release haben diese Regeln aufgedeckt, dass 7 Services keine Interfaces hatten — konkrete Klassen direkt injiziert statt über Contracts. Die Interface-First-Regel steht in den Projektrichtlinien, aber ohne automatisierte Durchsetzung ist sie abgedriftet. PHPat hätte es früher gefangen, wenn die Regeln von Anfang an existiert hätten.

## Der Stack

- **Symfony 8.0** auf FrankenPHP (Caddy built-in, HTTP/3, Worker Mode)
- **PostgreSQL 17** mit PgBouncer (Transaction Pooling für Web, direkt für Messenger Worker)
- **OpenRouter Free Models** via `symfony/ai-bundle` 0.6.x
- **SEAL + Loupe** für Volltextsuche (SQLite-basiert, keine Infrastruktur nötig)
- **DaisyUI + Tailwind** fürs Frontend, plain TypeScript kompiliert via Bun
- **PHPStan Level max**, ECS, Rector, Infection Mutation Testing (80% MSI)
- **GitHub Actions** CI mit GHCR Image Publishing

Das Ganze läuft auf einem einzelnen Homeserver neben Home Assistant, Plex, TeslaMate und einem TCG-Kartenscanner. Docker Compose, kein Kubernetes, keine Cloud-Rechnungen.

## Was ich anders machen würde

Ich würde die PHPat-Architekturregeln in Phase 2 schreiben, nicht Phase 13. Die Interface-Verletzungen, die ich im Audit gefangen habe, wären von Tag eins verhindert worden. Architekturtests sind wie Typsysteme — am wertvollsten, wenn sie von Anfang an da sind, nicht nachträglich eingebaut.

Ich würde auch Symfony Panther für E2E-Tests in CI weglassen. Headless Chrome in Docker-Containern ist inhärent flaky. Die funktionalen Tests (WebTestCase) fangen 95% dessen, was E2E fängt — ohne Stale-Element-Exceptions und Timing-Probleme. Am Ende habe ich E2E in CI sowieso auf `continue-on-error` gesetzt.

Der Quellcode liegt auf [tony-stark-eth/news-aggregator](https://github.com/tony-stark-eth/news-aggregator). MIT-lizenziert. Wenn du deinen eigenen Homeserver betreibst und einen Aggregator willst, der nicht davon abhängt, dass ein Third-Party-Service am Leben bleibt, könnte das nützlich sein.
