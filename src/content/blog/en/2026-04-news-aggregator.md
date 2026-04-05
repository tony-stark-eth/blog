---
title: "Building an AI News Aggregator That Works Without AI"
description: "How I built a self-hosted RSS aggregator with AI categorization and smart alerts — and why rule-based fallback made it actually reliable."
date: 2026-04-05
tags: ["symfony", "ai", "open-source", "self-hosted", "rss"]
locale: "en"
translationSlug: "2026-04-news-aggregator"
draft: false
---

I wanted a news aggregator that runs on my homeserver, categorizes articles automatically, and sends me alerts when something relevant happens. Every hosted solution I tried had the same problem: the AI features were great until the API went down, the free tier ran out, or the model got deprecated. Then you're left with an app that forgot how to do its job.

So I built [News Aggregator](https://github.com/tony-stark-eth/news-aggregator) — a Symfony 8 app where AI is an enhancement layer, not a dependency. It categorizes, summarizes, and evaluates article severity via OpenRouter's free models. When AI fails (and free models fail a lot), rule-based logic takes over seamlessly. The system never stops working.

## The Failover Problem

OpenRouter's `openrouter/free` endpoint auto-routes to the best available free model. That's convenient until you realize "best available" changes hourly and some models return garbage. I needed a fallback chain that doesn't require me to manually update model IDs when one gets deprecated.

The solution is a `ModelFailoverPlatform` — a `PlatformInterface` decorator that wraps the OpenRouter platform with model-level failover:

```php
// services.php — model failover chain
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

If `openrouter/free` fails, it tries each fallback model in order. If all models fail, the service falls back to rule-based logic. Three layers of resilience: primary model, failover chain, rule-based fallback.

There's also a `ModelDiscoveryService` with a circuit breaker. After 3 consecutive API failures, it stops hitting the OpenRouter models endpoint for 24 hours and uses a cached model list instead. No point hammering a dead API.

## Rule-Based Isn't Dumb

The rule-based categorization uses keyword matching with weighted category maps. It's not sophisticated, but it's deterministic and instant:

```php
private const array KEYWORD_MAP = [
    'politics' => ['election', 'parliament', 'minister', 'legislation', ...],
    'tech'     => ['software', 'algorithm', 'startup', 'cloud', ...],
    'business' => ['revenue', 'acquisition', 'market', 'earnings', ...],
];
```

When AI is available, `AiCategorizationService` wraps `RuleBasedCategorizationService` as a decorator. If the AI response passes the quality gate (valid category slug, not a hallucinated value), it wins. If not, the inner rule-based service runs instead. The caller never knows which path executed.

This decorator pattern turned out to be the most important architectural decision. Every AI service follows it: categorization, summarization, deduplication, alert evaluation. You can pull the OpenRouter API key out of the config entirely and the app keeps running — just with less accurate categorization.

## Smart Alerts Without Burning API Calls

The alert system has three rule types: keyword-only, AI-only, and keyword+AI. The keyword+AI type is where the design gets interesting.

A naive implementation would send every article through AI evaluation. With 16 RSS sources fetching every 15-60 minutes, that's hundreds of API calls per day — burning through free tier limits and getting rate-limited. Instead, keyword matching always runs first. AI evaluation only triggers on articles that already matched keywords. This cuts AI calls to maybe 10-20 per day.

```php
// FetchSourceHandler pipeline
$matches = $this->articleMatcher->match($article, $alertRules);
foreach ($matches as $match) {
    // AI evaluation only runs if the rule requires it AND keywords matched
    $this->messageBus->dispatch(new SendNotificationMessage(
        $match->rule->getId(),
        $article->getId(),
        $match->matchedKeywords,
    ));
}
```

The `SendNotificationHandler` then decides whether to call AI based on the rule type. If it's keyword+AI and the AI rates severity below the threshold, the notification gets silently dropped. No noise.

## The Scheduler Bug That Took Three CI Runs

This one was fun to debug. CI kept failing with:

```
No transport supports Messenger DSN "symfony://scheduler_fetch"
```

The `FetchScheduleProvider` uses `#[AsSchedule('fetch')]`, which automatically registers a Messenger transport with DSN `schedule://fetch`. But someone (me) had also manually defined the transport in `messenger.php` with DSN `symfony://scheduler_fetch`. Wrong prefix — `symfony://` vs `schedule://`.

Locally, this never surfaced because the dev environment had a warm cache where the auto-registered transport took precedence. In CI, the container compiled fresh and hit the invalid manual definition first. I only found it after the PgBouncer database routing fix cleared the earlier failure that was masking this one. Layered bugs — each fix reveals the next.

## Architecture Tests as Guardrails

I use PHPat (architecture testing via PHPStan) to enforce domain boundaries. The project follows DDD with six bounded contexts: Article, Source, Enrichment, Notification, Digest, and Shared.

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

The `FetchSourceHandler` gets an explicit exclusion because it's the orchestration pipeline — the one place where all domains converge. Every other class in the Article namespace is forbidden from importing Enrichment or Notification code. PHPStan enforces this on every commit via the pre-commit hook.

During the architecture audit before release, these rules caught that 7 services were missing interfaces — concrete classes injected directly instead of through contracts. The interface-first rule is in the project's guidelines, but without automated enforcement, it drifted. PHPat would have caught it earlier if the rules existed from the start.

## The Stack

- **Symfony 8.0** on FrankenPHP (Caddy built-in, HTTP/3, worker mode)
- **PostgreSQL 17** with PgBouncer (transaction pooling for web, direct for Messenger worker)
- **OpenRouter free models** via `symfony/ai-bundle` 0.6.x
- **SEAL + Loupe** for full-text search (SQLite-based, zero infrastructure)
- **DaisyUI + Tailwind** for the frontend, plain TypeScript compiled via Bun
- **PHPStan level max**, ECS, Rector, Infection mutation testing (80% MSI)
- **GitHub Actions** CI with GHCR image publishing

The whole thing runs on a single homeserver alongside Home Assistant, Plex, TeslaMate, and a TCG card scanner. Docker Compose, no Kubernetes, no cloud bills.

## What I'd Do Differently

I'd write the PHPat architecture rules in Phase 2, not Phase 13. The interface violations I caught in the audit would have been prevented from day one. Architecture tests are like type systems — they're most valuable when they're present from the start, not retrofitted.

I'd also skip Symfony Panther for E2E tests in CI. Headless Chrome inside Docker containers is inherently flaky. The functional tests (WebTestCase) catch 95% of what E2E catches, without the stale element exceptions and timing issues. I ended up marking E2E as `continue-on-error` in CI anyway.

The source code is at [tony-stark-eth/news-aggregator](https://github.com/tony-stark-eth/news-aggregator). MIT licensed. If you run your own homeserver and want an aggregator that doesn't depend on a third-party service staying alive, this might be useful.
