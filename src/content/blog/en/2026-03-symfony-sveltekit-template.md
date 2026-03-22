---
title: "My Opinionated Symfony + SvelteKit Template with 10 PHPStan Extensions"
description: "A full-stack template for PHP 8.4 + Symfony 8 + SvelteKit 2 with level max static analysis, mutation testing, architecture tests, and CI from commit zero."
date: 2026-03-29
tags: ["symfony", "phpstan", "sveltekit", "open-source", "developer-tools"]
locale: "en"
translationSlug: "2026-03-symfony-sveltekit-template"
draft: false
---

Every time I start a new PHP project, I face the same ritual: 30 minutes of configuring PHPStan, 20 minutes on ECS, another hour on CI pipelines, Rector setup, mutation testing baseline, Doctrine configuration, Docker multi-stage builds. I've done this enough times that I know exactly what I want — and I got tired of rebuilding it from scratch.

So I built a template. Not a skeleton — an opinionated, production-ready starting point with every quality tool pre-configured at the level I actually use in production.

The repo is at **[github.com/tony-stark-eth/template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit)**.

## What's in the Stack

**Backend**: PHP 8.4, Symfony 8, Doctrine ORM, FrankenPHP in Worker Mode.

**Frontend**: SvelteKit 2 with Svelte 5, TypeScript in strict mode, Tailwind 4, Bun as the package manager and runtime.

**Database**: PostgreSQL 17 with PgBouncer in Transaction Mode. PgBouncer is there from day one because adding it later to an existing setup is more painful than people expect — especially if your code uses `SET` commands or advisory locks that don't survive connection reuse. Better to design around it early.

**Infrastructure**: OpenTofu modules for Hetzner. Deploying to a Hetzner VPS is cheap and simple; the modules handle the server provisioning, DNS, and firewall setup.

## Same-Origin Architecture

The template puts both the PHP API and the SvelteKit frontend behind a single Caddy reverse proxy on a single domain. API routes go to FrankenPHP, everything else goes to the SvelteKit server.

This means no CORS headers, no `SameSite=None` cookies, no cross-origin authentication complexity. A session cookie set by Symfony is readable by SvelteKit's server-side rendering on the same origin. The SvelteKit `load` function calls `fetch('/api/...')` — no base URL configuration, no environment variable juggling per environment.

The tradeoff is that both services must be deployed together. For a product with separate teams on frontend and backend, a split origin might make sense. For a solo developer or a small team shipping one product, Same-Origin keeps the operational surface small.

## The PHPStan Setup

PHPStan is configured at level max with 10 extensions:

- **phpstan-strict-rules** — the extensions PHPStan ships but doesn't enable by default
- **phpstan-deprecation-rules** — surfaces deprecated API usage before your dependencies drop them
- **phpstan-symfony** — understands Symfony's service container and DI conventions
- **phpstan-doctrine** — knows about Doctrine entity mappings and query builder types
- **phpstan-phpunit** — type inference inside PHPUnit tests
- **shipmonk/phpstan-rules** — ~40 additional rules covering enum exhaustiveness and exception handling hygiene
- **voku/phpstan-rules** — operator type safety (no more implicit int/string coercions)
- **tomasvotruba/cognitive-complexity** — hard limit of 8 per method, 50 per class. If PHPStan fails because of cognitive complexity, the method needs to be split, not the limit raised.
- **tomasvotruba/type-coverage** — 100% type coverage required. No untyped property, no missing return type.
- **phpat/phpat** — architecture tests as code. Define which layers can depend on which, and PHPStan enforces it on every run.

That last one is underused in PHP projects. With phpat, I can write rules like "controllers may not depend on Doctrine repositories directly" and get a static analysis failure — not a code review comment, not a runtime error — if that boundary is crossed. The template ships with a basic `ArchitectureTest.php` that you extend as the project grows.

## Mutation Testing

PHPUnit plus code coverage tells you that your tests run. Infection tells you whether they actually test anything.

Infection works by mutating the source code — flipping a `>` to `>=`, removing a `return`, changing a `true` to `false` — and then running your test suite against each mutation. If a test fails after mutation, the mutation is "killed." If nothing fails, the mutation "escapes," meaning your tests don't cover that behavior.

The template requires a Mutation Score Indicator (MSI) of at least 80%, and Covered MSI of at least 90%. These aren't arbitrary numbers — 80% MSI means that 4 out of 5 possible mutations to your code break at least one test. At lower thresholds, you'll find test suites that have 90% line coverage but barely prove anything about behavior.

Infection runs as part of CI, after PHPUnit, only when the unit test suite passes.

## The Other Quality Tools

**Rector** runs with PHP 8.4 and Symfony 8 rule sets. Early returns, enum usage, typed properties, dead code removal — the code in the repository always reflects current PHP idioms regardless of whether a human or an AI wrote it. Rector is configured to auto-fix, not just report.

**ECS** (Easy Coding Standard) handles formatting and coding style. It runs before PHPStan in CI and fails the build before the slower analysis even starts. On commit, CaptainHook runs ECS and PHPStan locally so you know before you push.

**CaptainHook** rather than GrumPHP for git hooks. GrumPHP has historically had issues with how it handles the hook environment; CaptainHook is simpler and its configuration is more explicit.

## CI/CD

Two workflows cover the full stack:

`ci.yml` runs on every push and PR: ECS → PHPStan → Rector check → PHPUnit with path coverage → Infection. The order matters: formatting and static analysis are fast and fail early; mutation testing is slow and only runs when everything else passes.

`ci-frontend.yml` covers the SvelteKit side: ESLint → Svelte Check → Bun build. This runs in parallel with the PHP pipeline.

Two additional workflows use Claude Code. `claude-update.yml` runs on a biweekly schedule and opens PRs for dependency updates — both Composer and npm — with commit messages that explain what changed and why it matters. `claude-review.yml` posts an automated code review on every PR. Neither replaces human review, but they catch the obvious things before a human spends time on them.

## Claude Code Integration

The template ships with a `CLAUDE.md` and a `.claude/` directory that encodes the architecture decisions and coding conventions. This is the same approach I described in [my previous post about 10x output with quality](/blog/2026-03-10x-output-with-quality/): you document the decisions once, and then every Claude Code session starts with that context already loaded.

The `.claude/` guidelines cover things like: how to structure Symfony services, which Doctrine patterns to use, how the Same-Origin routing works, which PHPStan rules are intentional versus suppressible. If you use Claude Code to build on top of this template, it already knows the constraints.

## What This Template Is Not

It's not a microservices framework, not a monorepo setup, and not designed for projects where the frontend and backend are owned by separate teams. It's a solid starting point for a single product, built by a small team that wants quality tooling from day one without spending a week configuring it.

If you want the full context for how I built this — and why the quality stack matters more than the AI that helped me write it — read [How I 10x My Output as a Senior Developer Without Sacrificing Code Quality](/blog/2026-03-10x-output-with-quality/).

Fork it, run `docker compose up`, and you have PHPStan level max passing from commit zero.
