---
title: "From Template to Production App in a Weekend"
description: "How I built SmartHabit Tracker — adaptive notifications, real-time sync, multi-transport push — on top of a quality-first Symfony template."
date: 2026-03-24
tags: ["symfony", "pwa", "open-source", "side-project", "real-time"]
locale: "en"
translationSlug: "2026-04-smarthabit-tracker"
draft: false
---

I built the [template-symfony-sveltekit](https://github.com/tony-stark-eth/template-symfony-sveltekit) over a weekend — PHPStan level max, mutation testing, five CI workflows, the whole stack pre-configured. The point of a template is to prove it works by actually using it. So I immediately started [SmartHabit Tracker](https://github.com/tony-stark-eth/smarthabit-tracker) on top of it.

This is the story of what happened when the guardrails met real feature development.

## What SmartHabit Tracker Does

It's a household habit tracker. Multiple people in the same household share a habit list, log completions with a single tap, and get notified at the right time — not at a fixed time you set once and then ignore.

The notification piece is the interesting part. Most habit apps let you set a reminder at 8am and then you snooze it forever. SmartHabit Tracker watches when you actually complete habits over 21 days and adapts the reminder time toward your real behavior. If you consistently log your morning run between 7:15 and 7:45, the reminder shifts there. If your pattern changes, the timing follows.

The multi-platform side was a deliberate constraint I set early: no Firebase. I've used Firebase before and the free tier has limits that matter at scale, and the dependency on Google's infrastructure is one I didn't want. Instead: Web Push for the PWA, [ntfy](https://ntfy.sh) for Android, APNs for iOS. One Symfony service, three transports, platform detection on the frontend.

## The MAD Algorithm

MAD stands for Median Absolute Deviation. It's a robust statistical measure — resistant to outliers the way median is resistant compared to mean. For habit timing, that matters: a single anomalous day (you logged at 11pm because you were traveling) shouldn't wreck the model.

The implementation takes the last 21 days of completion timestamps for a habit, calculates the median completion time, then uses MAD to determine how wide the behavioral window is. A habit with consistent timing gets a tight window and an earlier reminder. A habit with scattered timing gets a looser window. The algorithm isn't ML — it's statistics, running in PHP, with no external dependencies.

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

I made the threshold values configurable per-household rather than global constants. That was a decision the template's architecture tests enforced: `phpat` flagged a service that was reading from a global config file when it should have been reading from a household-scoped repository. Without that rule, I'd have shipped it wrong and refactored later.

## Real-Time Sync with Mercure

The template already included Mercure via Caddy. Wiring it into habit logging took one afternoon.

The flow: a user taps "done" on a habit. The frontend applies an optimistic update immediately — the UI responds in under 50ms regardless of network. In the background, it posts to the API. The API persists the log, then publishes a Mercure event to the household's private topic. Every other connected device in the household receives the update and reflects it without polling.

The optimistic UI piece required careful handling of rollback. If the API call fails, the frontend needs to undo the optimistic state change. I had Claude Code generate the initial SvelteKit store logic, and it got the happy path right but missed the rollback. Caught in review. The pattern I ended up with:

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

The Mercure subscription runs on a shared `EventSource` per household. I didn't want one connection per component. Managing that shared connection in SvelteKit meant using a Svelte store with lifecycle hooks — another place where the generated code needed a review pass before it was correct.

## Household Isolation

Every API endpoint is protected by a Symfony security voter that validates household membership. Not role-based access — voter-based. The voter receives the habit (or completion log, or household member) being accessed and checks whether the authenticated user belongs to the same household.

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

This pattern meant I never had to write `if ($habit->getHousehold() !== $user->getHousehold())` in controller code. The voter enforces the boundary. The template's architecture rules prevented me from putting access logic in controllers — `phpat` would have flagged it.

## The Quality Stack in Practice

The template shipped with 10 PHPStan extensions configured at level max, Rector with PHP 8.4 + Symfony 8 rulesets, ECS for coding standards, Infection for mutation testing, and CaptainHook running checks on every commit.

Here's what that actually caught during SmartHabit development:

**PHPStan caught a nullable type I'd missed.** A query method returned `?Household` but I was calling methods on it without a null check. The AI-generated code handled the non-null path correctly and silently dropped the null case. PHPStan flagged it at level max. Without it, that's a production `NullPointerException` waiting for a user who somehow ends up without a household association.

**Infection proved a timing test was hollow.** I had a test for the MAD calculation that passed but didn't actually assert the right output — it asserted that the result was `not null`. Infection mutated the return value and the test still passed. I rewrote the test to assert the specific timestamp. MSI for the notification domain ended up at 93%.

**Rector caught a PHP 8.4 pattern I'd written in PHP 7 style.** The property hooks feature was available and Rector flagged the old-style getter/setter pair as replaceable. Not a bug, but it matters: the codebase looks consistent, regardless of which lines Claude Code wrote and which I wrote.

**CaptainHook blocked a commit with ECS violations.** I wrote a quick helper function manually during a debugging session, formatted it however, and tried to commit. Hook ran ECS, failed, auto-fixed, and I had to stage the fix before the commit went through. That's the intended behavior — and it works the same whether the code is human-written or AI-generated.

## The Test Numbers

233 unit and integration tests, 38 Playwright end-to-end tests. 93% mutation score index on the backend.

The E2E tests cover the critical paths: habit creation, completion logging (including the optimistic UI rollback), household member invitation, and notification preference configuration. They run against a real Docker environment in CI — not mocked, not stubbed. The Playwright suite runs in the CI workflow after the backend quality checks pass, so a PHPStan failure won't waste time running E2E tests.

Five workflows total:
- Backend quality (PHPStan, ECS, Rector)
- Frontend linting and type checking
- PHPUnit + Infection
- Playwright E2E
- Deploy to production (Hetzner via OpenTofu, only on push to `main`)

Push to `main` triggers a deployment. Docker health checks prevent the new containers from going live if they fail the health endpoint. I've had it block a broken deploy twice during development. That's the system working.

## What Was Hard

The PWA offline queue was the most difficult part. The service worker needs to queue habit completions when offline, replay them when connectivity returns, and handle conflicts if another household member logged the same habit in the meantime. The conflict resolution is simple — last-write-wins with a server timestamp — but getting the queue to replay reliably across page reloads, browser restarts, and varying network conditions took more iteration than anything else.

The Capacitor integration for iOS was a close second. The native shell is thin, but APNs requires certificates, entitlements, provisioning profiles, and a specific Symfony bundle configuration that doesn't have great documentation. I spent a full afternoon on that alone.

## The Template's Return on Investment

The [template](https://github.com/tony-stark-eth/template-symfony-sveltekit) made SmartHabit Tracker's quality consistent from the first commit. I didn't configure PHPStan for this project — it was already configured. I didn't write CI workflows — they were already there. I didn't set up mutation testing — it was already passing on an empty codebase.

That meant every hour I spent on SmartHabit Tracker went toward product decisions and domain logic, not tooling setup. And the tooling caught real bugs — not theoretical ones, not "this would be a problem at scale" ones. Actual defects that would have reached production.

If you want to build something similar:

**[github.com/tony-stark-eth/smarthabit-tracker](https://github.com/tony-stark-eth/smarthabit-tracker)**

The quality stack from [post 1](/blog/2026-03-10x-output-with-quality/) is fully intact. Fork it, adjust the habit domain, keep the guardrails.
