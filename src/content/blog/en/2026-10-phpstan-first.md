---
title: "PHPStan First: The Gate Order I Use for AI-Written PHP Code"
description: "Which quality gate to add first when an AI agent writes your PHP: PHPStan, then ECS and Rector, tests, architecture rules, mutation testing."
date: 2026-10-26
tags: ["php", "phpstan", "claude-code", "code-quality", "symfony"]
locale: "en"
translationSlug: "2026-10-phpstan-first"
category: "tech"
draft: false
---

An AI agent writes PHP that looks right far more often than it is right. Turning on every quality tool at once doesn't fix that: the agent drowns in findings, and so do you. I add gates in a fixed order, sorted by how much each one catches per second it costs, and I set them up before I let the agent go fast.

## Two orders, not one

There are two questions hiding in "which gate first":

- **Adoption order:** which tool do you introduce first in a project, and get to green, before the next one?
- **Execution order:** in which order do the tools run on a commit or in CI?

They have different answers. Adoption order follows value: the gate that catches the most real defects in AI-written code goes first. Execution order follows cost: the fastest check fails first, so the slow ones don't run for nothing. This post is mostly about the first one. The examples come from my public [template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai).

## Gate 1: PHPStan at level max

The typical mistakes in AI-written PHP are type mistakes. A method that returns `?Item` gets used as if it always returned `Item`. An array from a decoded JSON payload is treated as `array<string, string>` without a check. A method gets called that doesn't exist on that class, because it existed in some other library the model has seen. PHPStan finds all of these without running a single line, and it finds them in the file the agent just wrote.

That's why it comes first. It is cheap to run, its findings are precise (file, line, reason), and an agent can fix them on its own without guessing what you meant.

The template runs it at the strictest settings I know of:

```neon
parameters:
    level: max
    # ...
    checkUninitializedProperties: true
    checkImplicitMixed: true
    checkBenevolentUnionTypes: true

    cognitive_complexity:
        class: 50
        function: 8

    type_coverage:
        return: 100
        param: 100
        property: 100
        constant: 100
        declare: 100
```

`checkImplicitMixed` is the one that matters most for agent code. Without it, a value with no declared type quietly passes as `mixed`, and `mixed` lets almost anything through. The cognitive complexity limit of 8 per function is the other one: agents like to solve a problem with one long method full of nested conditions. A hard limit forces them to split it, and the result is easier to review.

The part I'd copy first, even before level max, is a list of forbidden functions with a reason attached:

```neon
services:
    -
        class: ShipMonk\PHPStan\Rule\ForbidCustomFunctionsRule
        tags: [phpstan.rules.rule]
        arguments:
            forbiddenFunctions:
                var_dump: 'use logger instead'
                dd: 'use logger instead'
                time: 'use ClockInterface instead'
                date: 'use ClockInterface instead'
```

The message is the point. An agent that hits "use ClockInterface instead" knows what to do next. A rule that only says "forbidden" leads to the next workaround.

### Where I'm not strict

The template's `phpstan.neon` has two `ignoreErrors` entries. Each is limited to a path: checked exceptions thrown in closures under `config/`, and dynamic calls to static methods under `tests/`. I'd rather have two narrow, visible exceptions than relax a whole level. A global ignore pattern, on the other hand, is something an agent will happily add to get green. Review every change to that file yourself.

## Gate 2: ECS and Rector

ECS and Rector rarely find bugs. They come second because they are almost free: both can fix their own findings, and they take the style discussion out of your review.

```php
return ECSConfig::configure()
    // ...
    ->withPreparedSets(
        psr12: true,
        common: true,
        strict: true,
        cleanCode: true,
    );
```

```php
return RectorConfig::configure()
    // ...
    ->withSets([
        SetList::PHP_84,
        SetList::CODE_QUALITY,
        SetList::DEAD_CODE,
        SetList::EARLY_RETURN,
        SetList::TYPE_DECLARATION,
    ]);
```

In the gate itself, Rector only runs as a dry-run (`rector process --dry-run`). It reports what it would change and fails if there is something. The fixing happens through a separate target (`make rector-fix`), so you see the change before it lands. For agent code, the `DEAD_CODE` and `EARLY_RETURN` sets do the most: unused variables and deeply nested `if` blocks are common leftovers after a few rounds of "fix this error".

Why not first? Because a clean format on code with wrong types is still wrong code. If you introduce ECS before PHPStan, the first weeks of findings are whitespace.

## Gate 3: Tests

Tests come third, not because they matter less, but because the agent writes them too. A test written by the same model that wrote the code tends to confirm the code, including its mistakes. Static analysis has no such bias. So tests come after the types are right, and they get checked again later (Gate 5).

The template separates the fast suite from the slow one:

```makefile
test-unit: ## Run unit tests only
	$(PHP_CONT) vendor/bin/phpunit --testsuite=unit

test-integration: ## Run integration tests only
	$(PHP_CONT) vendor/bin/phpunit --testsuite=integration
```

During a session with an agent, only the unit suite runs after each change. The full suite runs once before the commit. That keeps the feedback loop short enough that the agent uses it.

## Gate 4: Architecture rules

AI-written code crosses layer boundaries without noticing: a shared service that imports a domain class, an entity that knows about a controller. The template has rules for that with phpat:

```php
public function testSharedDoesNotDependOnDomains(): Rule
{
    return PHPat::rule()
        ->classes(Selector::inNamespace('App\Shared'))
        ->excluding(
            Selector::inNamespace('App\Shared\Controller'),
        )
        ->shouldNot()
        ->dependOn()
        ->classes(
            Selector::inNamespace('App\Example'),
            Selector::inNamespace('App\User'),
        );
}
```

Here is the honest part. phpat runs as a PHPStan extension, and it only checks rule classes that are registered as services with the `phpat.test` tag. In the template's `phpstan.neon`, they aren't. The rules exist, the package is installed, the docs list phpat as a gate that blocks CI. It never fired.

That's the lesson for this gate, and it applies to every other one: a gate you've never seen fail is not a gate. When you add a rule, add one violation on purpose, watch the check go red, then remove it.

## Gate 5: Mutation testing

Mutation testing is the check on Gate 3. Infection changes your code (flips a condition, removes a method call, drops a `return`) and runs the tests again. If they still pass, the tests don't test that line. That's exactly the weakness of tests an agent writes for its own code.

```json
"minMsi": 80,
"minCoveredMsi": 90,
"testFrameworkOptions": "--testsuite=unit",
```

It comes last because it is by far the slowest gate, and because it is only useful once the tests above it are stable. In CI, the job has `needs: unit-tests`: if the unit tests fail, the mutation run doesn't start. Measured on the template (median of three runs, Docker on an i7-13700K): PHPStan over the whole project takes 0.4 s with its result cache and 2.1 s without, Infection over the unit suite takes 4.7 s. The template is small; on a real codebase the gap grows, because every mutant reruns the tests that cover it.

## Execution order: cheapest first

On a commit, the order is different. The template's pre-commit hook only looks at staged PHP files and runs ECS, then PHPStan, then Rector as a dry-run. `make quality` runs the same three tools. ECS goes first, so you don't wait for a full analysis just to learn that a bracket is in the wrong place. With five staged files, ECS takes 0.23 s on the template and PHPStan 1.2 s (median of three runs).

In CI, ECS, PHPStan, Rector and the unit tests run in parallel after one shared image build. Mutation testing waits for the unit tests. Integration and end-to-end tests need a database and run in their own job.

The combination gives you both: adoption order says what to fix first, execution order says what to wait for least.

## If you start from zero

If your project has none of this yet, I'd go like this:

1. PHPStan at the level you pass today, plus the forbidden-functions list. Raise the level step by step until max.
2. ECS and Rector with auto-fix, in one separate commit, so the diff doesn't mix with real changes.
3. A fast unit suite that the agent runs after every change.
4. Architecture rules, each one proven with a planted violation.
5. Infection with low thresholds first, then raise them.

Only after that I let the agent take bigger steps. The template has all five in place (and, as of writing, one of them not wired up) at [github.com/tony-stark-eth/template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). Which gate catches the most AI mistakes in your projects?
