---
title: "How I 10x My Output as a Senior Developer Without Sacrificing Code Quality"
description: "I built two production-ready repositories in a single weekend. Here's the system that makes it possible — and why the quality stack matters more than the AI."
date: 2026-03-22
tags: ["developer-productivity", "code-quality", "claude-code", "phpstan", "open-source"]
locale: "en"
translationSlug: "2026-03-10x-output-with-quality"
draft: false
sticky: true
cover:
  src: "/images/blog/10x-output-quality.png"
  alt: "Terminal showing PHPStan level max passing alongside Claude Code output"
---

Last weekend I shipped two repositories from scratch: an [opinionated full-stack template](https://github.com/tony-stark-eth/template-symfony-sveltekit) for PHP 8.4 + Symfony 8 + SvelteKit 2, and a [complete habit tracking application](https://github.com/tony-stark-eth/smarthabit-tracker) built on top of it. 51 commits, 6 GitHub Actions workflows, 10 PHPStan extensions configured at level max, Docker multi-stage builds, OpenTofu infrastructure — all passing CI.

That's not a normal weekend.

I'm a senior developer with strong opinions about code quality. I don't ship code without static analysis at the highest level, mutation testing, architecture tests, and automated formatting. None of that changed. What changed is *how* I get there.

## The Bottleneck Was Never Thinking

Here's what I realized: most of my time as a senior developer was never spent on architecture decisions or solving hard problems. It was spent on everything around those decisions. Writing boilerplate. Configuring tools. Looking up API signatures. Writing the 14th PHPUnit test that follows the same pattern as the previous 13. Fixing YAML indentation in CI workflows.

These tasks require knowledge to do correctly, but they don't require creativity. They're the tax you pay for building things properly.

AI code assistants eliminate that tax.

## The System

My workflow has three layers, and the order matters.

**Layer 1: I make the decisions.** Architecture, tech stack, data model, which tools to use and why, what the quality standards are. This part is entirely human. I spent hours in a planning session defining the template's quality stack — which PHPStan extensions to include, why CaptainHook over GrumPHP, why Same-Origin architecture instead of separate API and frontend domains, why PgBouncer in transaction mode needs `DISCARD ALL`. These are decisions that require experience and judgment. No AI made them for me.

**Layer 2: I write the spec, the AI writes the code.** Once the decisions are made, I document them in a format Claude Code can execute against. A `CLAUDE.md` file that defines the project context and hard constraints. A `.claude/` directory with coding guidelines, testing rules, and architecture conventions. When I tell Claude Code to create a `phpstan.neon` with level max and 10 specific extensions, it doesn't need to figure out *which* extensions — I already made that call. It just needs to produce correct configuration. That's a task it handles well.

**Layer 3: I review everything.** Every line Claude Code produces goes through my review. Not a rubber stamp — an actual review where I check for the same things I'd check in any PR. Does the Doctrine mapping make sense? Is the Caddyfile routing correct for Same-Origin? Are the CI workflow dependencies right so PHPStan runs before tests? This is where senior experience compounds: I catch issues that the AI doesn't know are issues, because they require understanding how things interact in production.

## Why the Quality Stack Is the Multiplier

Here's what most "AI makes me 10x productive" posts get wrong: they focus on the AI and ignore the safety net.

If I used Claude Code without PHPStan at level max, without mutation testing, without architecture tests — I'd ship faster, sure. I'd also ship bugs. AI-generated code is plausible code. It looks right. It often *is* right. But "often" is not "always", and the gap between those two words is where production incidents live.

My quality stack is what turns AI-assisted speed into AI-assisted *confidence*:

**PHPStan at level max with 10 extensions** catches type errors, forgotten exceptions, cognitive complexity violations, and architectural boundary crossings. If Claude Code generates a service that accidentally depends on an infrastructure layer, phpat flags it before I even see the code.

**Mutation testing via Infection** proves that tests actually test something. It's easy to write tests that pass but don't assert meaningful behavior — especially when an AI writes them. Infection mutates the code and checks if tests catch the change. MSI below 80% means the test suite is decorative.

**Rector with auto-fix rules** ensures the code follows PHP 8.4 idioms regardless of who — or what — wrote it. Early returns, type declarations, dead code removal. The code that lands in the repository always looks like *my* code, not like "AI code."

**CaptainHook git hooks** run ECS and PHPStan on every commit. Even in a fast-moving session with Claude Code, nothing bypasses the quality gate.

The result: I move fast, but the guardrails are always on. The AI proposes, the quality stack validates, and I make the final call.

## What AI Is Bad At

I want to be specific about where Claude Code fails, because the honest version of this story matters more than the hype version.

**It doesn't question your decisions.** If I tell it to implement something architecturally wrong, it will do it confidently and correctly — the wrong thing, done well. The `CLAUDE.md` helps here because it encodes my decisions, but it can't encode judgment I haven't articulated yet.

**It loses context in long sessions.** After 30+ back-and-forth iterations, Claude Code starts forgetting constraints from earlier in the conversation. I've learned to keep sessions focused: one feature, one file group, then start fresh.

**It generates plausible-but-wrong configuration.** A Caddyfile that looks correct but has the routing order wrong. A `phpstan.neon` that includes an extension that conflicts with another. A `compose.yaml` where the PgBouncer service connects to the wrong network. These are exactly the bugs that my review step catches — and exactly why the review step isn't optional.

**It can't do research.** When I needed to decide between `ntfy` and Firebase for push notifications, Claude Code couldn't evaluate the tradeoffs with real-world experience. It could list pros and cons, but it couldn't tell me that Firebase's free tier has a notification limit that would matter at 500 households. That insight came from my own experience.

## The Numbers

What used to take me a full sprint (two weeks) to set up — Docker configuration, CI pipeline, quality tooling, frontend scaffolding, infrastructure skeleton — I now complete in a weekend. Not because the AI does it for me, but because it handles the implementation while I focus on the decisions.

The template repository has: a multi-stage Dockerfile with FrankenPHP, three compose files (dev/override/prod), 10 PHPStan extensions configured and passing, Rector with PHP 8.4 + Symfony 8 rulesets, ECS for coding standards, PHPUnit 13 with path coverage, Infection for mutation testing, CaptainHook for git hooks, 6 GitHub Actions workflows, OpenTofu modules for Hetzner deployment, and a full `.claude/` directory with guidelines.

Configuring all of that manually — even for someone who's done it before — takes days. With Claude Code executing against a clear spec, it takes hours.

## Try It Yourself

The template is open source and designed to be forked:

**[github.com/tony-stark-eth/template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit)**

Every quality tool is pre-configured. Every CI workflow is ready. Fork it, run `docker compose up`, and you have a full-stack project with PHPStan level max from commit zero.

The `CLAUDE.md` and `.claude/` guidelines are included — so if you use Claude Code, it already knows how to work with the codebase.

If you're a senior developer feeling skeptical about AI tools: I was too. The trick is not to let the AI drive. You drive. The AI is the engine. And the quality stack is the brakes.
