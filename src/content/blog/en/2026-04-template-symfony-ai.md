---
title: "A Symfony Template Where AI Failing Is a Feature"
description: "My new Symfony 8 + FrankenPHP + AI template ships with model failover, circuit breakers, and Claude Code guidelines. Zero to production in one command."
date: 2026-04-06
tags: ["symfony", "ai", "open-source", "template", "developer-tools"]
locale: "en"
translationSlug: "2026-04-template-symfony-ai"
draft: false
---

Two weeks ago I [open-sourced my news aggregator](https://github.com/tony-stark-eth/news-aggregator). During the build, I realized that about 70% of the code had nothing to do with news — it was Docker infrastructure, quality tooling, AI wiring, CI pipelines, and Claude Code guidelines. The same 70% I'd want in every new Symfony project.

So I extracted it into [template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). It's a GitHub template repo: click "Use this template," run `make start`, and you have a fully working Symfony 8 app with AI integration, strict quality tools, and CI — ready for you to add domain logic.

## What This Is (and Isn't)

I already have [template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit) for full-stack apps with a JavaScript frontend. This new template is different: it's for server-rendered apps where Twig + DaisyUI is enough and the interesting part is the backend — especially AI integration.

The stack: FrankenPHP (Caddy + PHP 8.4), PostgreSQL 17 with PgBouncer, Symfony Messenger with Doctrine transport, DaisyUI over Tailwind CDN, TypeScript compiled via Bun. No JavaScript framework, no Webpack, no Node.

## AI That Expects to Fail

The template includes a complete AI infrastructure layer built around one assumption: free AI models are unreliable.

The `ModelFailoverPlatform` wraps Symfony AI's `PlatformInterface` with model-level failover. When the primary model fails, it tries each fallback in order:

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

This sits in `src/Shared/AI/` — framework code that any domain can use. Your domain services inject `PlatformInterface` and never think about failover. When you build a categorization service or a summarization service, you write the happy path. The platform handles retries.

There's also a `ModelDiscoveryService` with a circuit breaker. After 3 consecutive failures hitting the OpenRouter models endpoint, it stops for 24 hours and uses a cached model list. And a `ModelQualityTracker` that records acceptance/rejection rates per model so you can see which ones actually return useful results.

All of this ships in the template. You configure your OpenRouter API key (or don't — the app runs fine without AI), and the infrastructure handles the rest.

## Quality at PHPStan Max from Commit Zero

The template inherits the same quality bar I use in production:

- **PHPStan level max** with 10 extensions (strict rules, Symfony, Doctrine, cognitive complexity cap of 8, 100% type coverage)
- **ECS** with PSR-12 + strict + cleanCode sets
- **Rector** for PHP 8.4 + Symfony 8 automatic upgrades
- **Infection** mutation testing at 80% MSI, 90% covered MSI
- **PHPat** architecture tests enforcing layer boundaries

The git hooks run ECS, PHPStan, and Rector on every commit. The commit-msg hook enforces Conventional Commits. CI runs the full suite in parallel.

The important detail: there are zero `ignoreErrors` entries in `phpstan.neon`. The template code is written to satisfy PHPStan max, not configured around violations. When you add your own code, you'll hit real errors that force you to write better types — not phantom issues from a relaxed baseline.

## Claude Code Integration

The `.claude/` directory contains guidelines that Claude Code reads automatically:

- `coding-php.md` — strict types, final readonly classes, interface-first boundaries, ClockInterface over DateTime, size limits per method/class
- `coding-typescript.md` — strict mode, no `any`, Bun build pipeline, DaisyUI conventions
- `testing.md` — PHPUnit suite structure, Infection thresholds, CI pipeline order
- `architecture.md` — Docker services, DDD structure, how to add domains, AI infrastructure overview

These aren't documentation for humans (though they work as that too). They're instructions that shape how Claude Code generates code in your project. When Claude creates a new service, it uses `final readonly class`, injects interfaces, and uses `ClockInterface` — because the guidelines say so.

The root `CLAUDE.md` has the hard rules: no DateTime, no var_dump, no empty(), no YAML config, interface-first architecture, Conventional Commits. Claude Code follows them consistently once they exist in the file.

## The Example Domain

The template ships with a throwaway `Example/` domain: an `Item` entity, a controller, a seed command. It exists to show the DDD pattern — how entities, controllers, and commands are organized, how Doctrine mappings work per-domain, how architecture tests enforce boundaries.

Adding your own domain is four steps:

1. Create `src/YourDomain/Entity/`, `Controller/`, `Service/`
2. Register the entity mapping in `config/packages/doctrine.php`
3. Generate a migration
4. Update the PHPat architecture tests

Then delete `Example/`. It served its purpose.

## What's Not Included

I deliberately left out things that are project-specific:

- **No search** — SEAL + Loupe is great but index schemas are domain-specific
- **No Messenger worker** — the transport is configured, but worker services depend on your queue topology
- **No Scheduler** — recurring tasks are too project-specific to template
- **No domain AI services** — the failover platform is there, but categorization/summarization/evaluation are your domain's concern

The template gives you infrastructure. You build the product.

## Getting Started

```bash
# Use the GitHub template button, or:
git clone https://github.com/tony-stark-eth/template-symfony-ai my-project
cd my-project
make start     # Build + boot Docker
make hooks     # Install git hooks
make quality   # Verify everything passes
```

Open https://localhost:8443, login with `demo@localhost` / `demo`. You're running.

The repo is at [tony-stark-eth/template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). MIT licensed. If you're starting a Symfony project and want AI integration without rebuilding the plumbing, this saves you the first two days.
