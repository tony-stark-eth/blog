---
title: "The Claude Code Plugins That Actually Make a Difference"
description: "My daily driver setup: 6 plugins, custom hooks, and a token-killing proxy. Here's what each one does and why I keep it installed."
date: 2026-03-24
tags: ["claude-code", "developer-productivity", "plugins", "developer-tools"]
locale: "en"
translationSlug: "2026-03-claude-code-plugins-i-use"
draft: false
---

In my [last post](/blog/2026-03-10x-output-with-quality/) I talked about the system that lets me 10x my output: I make decisions, Claude Code writes code, and a quality stack validates everything. What I didn't cover is the tooling layer between me and Claude Code itself — the plugins, hooks, and extensions that turn a good CLI into a great one.

This is the full list of what I run daily and why each piece earns its spot.

## Context7 — Always Up-to-Date Docs

**What it does:** Fetches current documentation and code examples for any library, directly inside Claude Code via MCP.

**Why it matters:** Claude's training data has a cutoff. When I'm working with Symfony 8 or Tailwind 4, I need Claude to reference the actual current API — not something from a version that shipped 18 months ago. Context7 bridges that gap. Instead of me copy-pasting docs into the conversation, Claude can pull them itself.

This is one of those plugins that quietly prevents entire categories of bugs. Every time Claude generates code against an outdated API signature, that's a review round wasted. Context7 eliminates most of those.

## Code Review Graph — Structural Awareness

**What it does:** Builds a persistent knowledge graph of your codebase using Tree-sitter parsing. Tracks functions, classes, dependencies, and change impact — stored locally in SQLite.

**Why it matters:** This one solves the single biggest token waste in Claude Code: re-reading the entire codebase for every task. Code Review Graph maps the structure once, updates incrementally (under 2 seconds), and gives Claude precise context about what's affected by a change.

The numbers are compelling. On production repositories, it reduces token consumption by 6-26x depending on project size. But the real value isn't token savings — it's review quality. When Claude knows the blast radius of a change (which functions call the modified code, which tests cover it, which modules depend on it), its reviews go from "looks fine" to actually useful.

It supports 14 languages including PHP, TypeScript, and Go — which covers everything I work with. The D3.js graph visualization is a nice bonus for understanding unfamiliar codebases.

```bash
# Build the graph once, then it auto-updates on file changes and commits
/code-review-graph:build-graph

# Review a PR with full impact analysis
/code-review-graph:review-pr
```

## Planning with Files — Structured Thinking for Complex Tasks

**What it does:** Creates a file-based planning system (`task_plan.md`, `findings.md`, `progress.md`) for complex multi-step tasks. Tracks progress, logs findings, and survives session restarts.

**Why I use it:** For anything that takes more than a few tool calls — a multi-file refactor, a new feature across multiple domains, a migration — I need Claude to plan before it acts. This plugin forces that structure. Instead of Claude diving into code changes and losing track of what it already did, everything gets written to files that persist.

The session recovery is the underrated feature here. When Claude's context gets long and I need to start fresh (which happens — I mentioned in the last post that context degrades after 30+ iterations), the plan files carry forward. Claude reads them, picks up where it left off, and doesn't redo work.

## PhpStorm Plugin — IDE-Level Intelligence

**What it does:** Connects Claude Code to PhpStorm's inspection engine via MCP. Gives Claude access to symbol resolution, code search, file operations, and PhpStorm's own code analysis.

**Why it matters:** PhpStorm understands PHP at a level that raw file reading can't match. When Claude needs to find all usages of a method, resolve a class hierarchy, or check for inspection warnings, it can use PhpStorm's index instead of grepping through files. The difference is precision: PhpStorm knows that `$this->handle()` in a command class resolves to a specific method, while grep just finds strings.

I have all the PhpStorm MCP tools pre-allowed in my settings so Claude can use them without asking permission every time. That's a deliberate choice — these are all read operations plus formatting, nothing destructive.

## PHPantom Docker — PHP LSP Without the Mess

**What it does:** Runs a PHP Language Server Protocol instance inside Docker, giving Claude Code access to PHP-native intelligence (type inference, autocompletion context, go-to-definition) without polluting my local environment.

**Why it matters:** Between PhpStorm's inspections and PHPantom's LSP, Claude has two complementary views of the PHP codebase. PhpStorm excels at project-level analysis (architecture, inspections, refactoring). PHPantom gives raw LSP capabilities that work even when PhpStorm isn't running — useful for CI-adjacent work or when I'm in a pure terminal session.

## RTK (Rust Token Killer) — The Invisible Optimizer

**What it does:** A Rust-based CLI proxy that intercepts shell commands (like `git status`, `docker ps`, `ls`) and strips their output to only what Claude actually needs. Installed as a hook that rewrites commands transparently.

**Why I built it into my workflow:** Token costs add up. Every `git status` that dumps 200 lines of untracked files, every `docker compose ps` that includes formatting Claude doesn't need — that's context window space wasted on noise. RTK filters it down to the signal.

The savings are 60-90% on typical dev operations. Over a long session, that's the difference between hitting context limits and staying productive. And because it runs as a pre-tool-use hook, I never think about it — every Bash command Claude runs gets optimized automatically.

```bash
# Check your cumulative savings
rtk gain

# See which commands saved the most tokens
rtk gain --history
```

## The Hooks That Tie It Together

Plugins are half the story. The other half is the hooks and settings that prevent mistakes:

**rm -rf blocker:** A pre-tool-use hook that blocks any `rm` command with both recursive and force flags. Claude can delete individual files, but it can't wipe directories. This has saved me exactly once — and once is enough.

**Main branch push blocker:** Blocks `git push` to main or master. Claude works on feature branches. Always. No exceptions, no "just this once."

**Permission defaults:** `acceptEdits` mode means Claude can read and edit files without asking, but destructive operations still require confirmation. The PhpStorm MCP tools are pre-allowed because they're all safe. Sensitive paths (`~/.ssh`, `~/.aws`, credentials) are explicitly denied.

## What I Don't Use

Equally important: I don't install every plugin available. No CMS integrations, no AI-to-AI chains, no experimental features that aren't stable. Every plugin in my setup has been there for at least a week and proved its value through daily use. If something adds complexity without measurably improving output quality or speed, it gets removed.

The goal isn't maximizing the number of tools — it's minimizing friction between my decisions and working code.

## The Stack at a Glance

| Layer | Tool | Purpose |
|---|---|---|
| Docs | Context7 | Current library documentation |
| Code Intelligence | Code Review Graph | Structural awareness, impact analysis |
| Planning | Planning with Files | Multi-step task tracking |
| IDE | PhpStorm Plugin | Symbol resolution, inspections |
| LSP | PHPantom Docker | PHP language server in Docker |
| Optimization | RTK | Token reduction on CLI output |
| Safety | Custom hooks | Block destructive operations |

If you're using Claude Code without any plugins, start with Context7 and Code Review Graph. They have the highest impact-to-setup-effort ratio. If you're in a PHP/PhpStorm environment, the PhpStorm plugin is a no-brainer. And if token costs matter to you (they should), look at RTK.

The plugins don't make Claude Code smarter. They give it better information to work with — and that's the difference between a tool that generates plausible code and one that generates correct code.
