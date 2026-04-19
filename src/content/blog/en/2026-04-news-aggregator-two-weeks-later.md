---
title: "Two Weeks of My News Aggregator: RAG Chat and a Sentiment Dial"
description: "What I added to my Symfony news aggregator in two weeks: pgvector chat, sentiment slider, full-text fetch, and the worker cache bug that kept biting me."
date: 2026-04-19
tags: ["symfony", "ai", "rag", "pgvector", "self-hosted"]
locale: "en"
translationSlug: "2026-04-news-aggregator-two-weeks-later"
draft: false
---

Two weeks ago I [shipped my news aggregator](/blog/2026-04-news-aggregator/) as a finished Symfony 8 app — fetch feeds, enrich with AI, send alerts, generate digests. Fifty commits later it looks different. The aggregator grew a conversational chat that searches its own archive, a sentiment dial that bends article ranking toward whatever mood I'm in, and a full-text fetch stage that pulls the actual article body when a feed only ships a teaser. Plus one operational bug I fixed three times before I fixed it properly.

This is the follow-up: what changed, why, and the bits that were harder than they looked.

## Chat That Searches Your Own Archive

The original post mentioned categorization and alerts. It didn't mention chat, because chat wasn't built yet. Now it is: a streaming conversational agent that searches your article archive with hybrid semantic + keyword retrieval and cites the sources in its reply.

The search layer is the interesting part. I have `pgvector` holding article embeddings and [SEAL + Loupe](https://github.com/schranz-search/schranz-search) handling full-text keyword search. Semantic search catches paraphrases and synonyms; keyword search catches proper nouns the embedding model mangled. Neither alone is great. Together they cover for each other:

```php
#[AsTool(
    name: 'article_search',
    description: 'Search the user\'s article database using hybrid semantic
                  and keyword search. Returns relevant articles with title,
                  summary, keywords, publication date, URL, and relevance.',
    method: 'search',
)]
final readonly class ArticleSearchTool implements ArticleSearchToolInterface
{
    public function search(string $query, ?int $daysBack = null, int $limit = 8): array
    {
        $since = $this->resolveSince($daysBack);
        $semantic = $this->runSemanticSearch($query, $since, $limit);
        $keyword  = $this->runKeywordSearch($query, $limit);

        return $this->combineScores($semantic, $keyword);
    }
}
```

The `#[AsTool]` attribute comes from `symfony/ai-agent`. The agent runtime picks up the tool, injects it into the prompt, and the model decides when to call it. I don't write any parsing logic. The agent also gets a `ConversationMessageStore` (DBAL-backed) so every turn persists and the user can resume a chat days later.

One non-obvious bit: the chat agent needs a different model pool than the enrichment pipeline. Enrichment only needs text completion — any free model works. Chat needs tool calling, which narrows the pool significantly. So `ModelDiscoveryService` got a second mode that filters by `supported_parameters` containing `"tools"` and maintains a separate `chat` model pool alongside the `enrichment` one. Without that split, the chat would silently route to a text-only model and the `article_search` tool would never fire.

Streaming was another rabbit hole. OpenRouter's free models have first-token latency in the 5-30 second range — long enough that a naive SSE stream silently times out behind a reverse proxy. The fix was sending SSE `status` events during model resolution so the connection stays warm:

```php
// StreamingChatService — keepalive pattern
yield SseEvent::status('Resolving model...');
yield SseEvent::status('Searching archive...');
yield SseEvent::status('Generating response...');

foreach ($agent->stream($messages) as $chunk) {
    yield SseEvent::chunk($chunk);
}
```

The browser client knows to render `status` events as an inline thinking indicator. First token feels instant even when it isn't.

## Sentiment as a Ranking Dial, Not a Filter

The idea was stolen from an internet aesthetic called *Hopecore* — finding hope and constructive stories inside a feed that otherwise trends apocalyptic. The inverse exists too: some days I want critical, investigative, accountability-driven coverage, not feel-good stories. I wanted one control that spans both.

The new slider in the navbar goes from -10 to +10. At 0 it does nothing. At +3 it re-ranks your feed to bubble positive articles up. At +7 it also filters out articles below -0.3 sentiment. Same for the negative side. It's a dial for "I want more of this kind of news right now," not a binary on/off toggle.

The scoring itself has two paths. AI extracts a sentiment score (-1.0 to +1.0) as part of the same enrichment API call that handles categorization and summarization — zero extra cost, just one more JSON field. If AI is unavailable, a rule-based fallback runs with ~30 positive/negative keyword lists, title weighted 2x, capped at ±0.8 so it never outranks a real AI judgment:

```php
// RuleBasedSentimentScoringService — capped so AI always wins
$titleScore   = $this->score($titleTokens)   * self::TITLE_WEIGHT;
$contentScore = $this->score($contentTokens);
$raw = ($titleScore + $contentScore) / ($titleTokens->count() + $contentTokens->count());

return max(-0.8, min(0.8, $raw));
```

Two details took a couple of iterations.

**First**: how to reset the slider. Mobile has no right-click and the obvious dedicated button ate space I didn't want to spend. Double-tap works on both desktop and mobile and feels natural once you learn it:

```typescript
slider.addEventListener("dblclick", () => {
    slider.value = "0";
    postSentiment(url, 0);
});
```

**Second**: how to update the dashboard without a full page reload. Initial version fired a `sentiment-changed` event and... nothing consumed it. The slider moved, the server stored the value, the page stayed stale. I ended up using htmx's programmatic API to swap the body:

```typescript
// sentiment-slider.ts
function postSentiment(url: string, value: number): void {
    fetch(url, { method: "POST", body: JSON.stringify({ value }) }).then(() => {
        const htmx = window.htmx;
        if (htmx) {
            htmx.ajax("GET", window.location.href, "body");
            return;
        }
        window.location.reload();
    });
}
```

Same effect as a reload, but keeps scroll position and avoids flashing. The fallback to `location.reload()` is for the case where htmx hasn't loaded yet — belt and suspenders.

The slider also feeds the chat system prompt. At +7 the assistant gets appended: *"The user prefers positive and uplifting information. Frame responses with optimism where appropriate."* At -7 it flips negative. Same for the periodic digest generation: a cheerful digest when the dial is up, a hard-nosed one when it's down. Sentiment stopped being a UI feature and became a user preference that pervades the whole app.

## Full-Text Fetch Without Ever Blocking

Most RSS feeds ship a teaser — the first paragraph plus a link. For categorization and summarization that's often not enough. The aggregator now runs a Phase 1.5 between "feed fetched" and "AI enrichment": fetch the article URL, run [Readability.php](https://github.com/fivefilters/readability.php) to extract the main content, persist it on the article.

The critical rule: this stage **must never block the pipeline**. If the target site is slow, rate-limits me, serves a paywall, or returns 500, the article still gets AI-enriched with whatever content the feed provided. No partial states, no dead queue messages.

That meant a third Messenger transport (`async_fulltext`), a per-domain rate limiter so I don't hammer a single site with parallel requests, and a fallback that just shrugs when the fetch fails:

```php
public function __invoke(FetchFullTextMessage $message): void
{
    $article = $this->articleRepository->find($message->articleId);
    if (!$article) {
        return;
    }

    try {
        $content = $this->contentFetcher->fetch($article->getUrl());
        if ($content !== null) {
            $article->setFullTextContent($content);
            $this->articleRepository->save($article);
        }
    } catch (\Throwable $e) {
        $this->logger->info('Full-text fetch failed, continuing without it', [
            'article_id' => $article->getId(),
            'error'      => $e->getMessage(),
        ]);
    }

    $this->messageBus->dispatch(new EnrichArticleMessage($article->getId()));
}
```

Notice the dispatch to `EnrichArticleMessage` sits outside the try block. Whether full-text succeeded or not, the article enters AI enrichment. Failure degrades quality; it never breaks the flow.

The per-domain rate limiter uses Symfony's `RateLimiterFactory` with a sliding window, keyed by host: two requests per 5 seconds per domain by default, configurable via env. When a site publishes 20 articles in one fetch cycle, they drip through instead of triggering a block.

## Settings That Live in Two Places

A small pattern that punches above its weight. Environment variables are great for deployment-time config. They're terrible for "I want to change the display languages right now from the admin UI." The original aggregator had a handful of env vars that were impossible to tune without a container restart.

The fix is a hybrid store. Env vars provide defaults; a `Setting` entity in Postgres provides overrides. The service reads DB first, falls back to the injected default:

```php
final readonly class SettingsService implements SettingsServiceInterface
{
    public function __construct(
        private SettingRepositoryInterface $settingRepository,
        string $displayLanguages,        // default from %env%
        int $fetchDefaultInterval,       // default from %env%
        int $retentionArticles,          // default from %env%
        int $retentionLogs,              // default from %env%
    ) {
        $this->defaults = [
            self::KEY_DISPLAY_LANGUAGES    => $displayLanguages,
            self::KEY_FETCH_DEFAULT_INTERVAL => (string) $fetchDefaultInterval,
            self::KEY_RETENTION_ARTICLES   => (string) $retentionArticles,
            self::KEY_RETENTION_LOGS       => (string) $retentionLogs,
            self::KEY_SENTIMENT_SLIDER     => '0',
        ];
    }

    public function get(string $key): string
    {
        $setting = $this->settingRepository->findByKey($key);
        return $setting?->getValue() ?? ($this->defaults[$key] ?? '');
    }
}
```

An admin UI writes to the DB; the next request reads the override. No restart, no env file edit. The defaults still ship in the container image, which matters if the DB is empty on first boot or you want to reset.

The sentiment slider is the one value that has no env default — it's per-user state with a hardcoded `'0'` fallback. Everything else can be bootstrapped from deployment config.

## The Worker Cache Bug That Kept Biting Me

I shipped a fix for the same bug three times before understanding it.

**Symptom**: A worker container crashes on startup with `TypeError: too few arguments to Service::__construct()` after a deploy. Restart the worker, it works again. A few deploys later, same crash.

**Root cause**: Workers run with `APP_DEBUG=0` for performance. Symfony compiles the DI container once and caches it. The web container recompiles on any code change because `APP_DEBUG=1` in dev. The workers mount the source code volume, so the *code* updates, but the cached container in `/var/cache/prod/` doesn't. When I add a constructor argument to a service, the new code calls `new Service($a, $b, $c)` while the cached container still wires `new Service($a, $b)`.

First fix: manual `docker compose restart worker`. Works until next deploy.

Second fix: I deleted the cache directory on the host. Works until Docker recreates it with the image's baked cache.

Third fix, the real one: bake the cache clear into the worker command itself. Every worker startup now runs cache operations before consuming the queue:

```yaml
# compose.override.yaml
worker:
  command: ["sh", "-c",
    "php bin/console cache:clear --no-warmup -q && \
     php bin/console cache:warmup -q && \
     php bin/console messenger:consume async scheduler_fetch \
       --time-limit=3600 --memory-limit=128M -vv"]
```

Workers restart on `--time-limit=3600` (one hour) anyway — Messenger's built-in safety valve against memory leaks. The cache clear adds maybe 2 seconds to each restart cycle. In exchange, the container is always coherent with the source code mounted into it. The `TypeError` stopped happening.

Lesson filed: anywhere you mount live code into a container that caches compiled metadata, clearing the cache on startup is not paranoia — it's the only state-safe option.

## Queue-Aware Failover

The original failover chain tried free models in order, falling through to paid only if I configured `OPENROUTER_PAID_FALLBACK_MODEL`. Fine for normal load. Not fine when a source dump suddenly queues 2000 articles and each free-model attempt burns 30 seconds on timeouts and retries.

`ModelFailoverPlatform` now looks at the queue depth and adjusts:

```
Queue depth <  QUEUE_ACCELERATE_THRESHOLD  (default 20)
    → full chain: primary free → free fallbacks → paid fallback

Queue depth >= QUEUE_ACCELERATE_THRESHOLD
    → primary free → paid fallback (skip free chain)

Queue depth >= QUEUE_SKIP_FREE_THRESHOLD    (default 50)
    → paid fallback only
```

Under a big backlog the app bypasses the flaky free chain and pays cents to drain the queue. When I verified this on a real backlog, 1,891 stranded articles processed through Gemini 2.5 Flash Lite for about 40 cents total. The free-tier attempt would have taken the rest of the day.

The threshold is exposed as env vars specifically so I can set it high for "free tier is plenty" days and low for "just drain it" days. No code deploy to switch modes.

## Small Things That Add Up

A few smaller changes that don't need their own section:

- **OPML import/export** — feed portability, because nobody should hand-edit a seed list
- **Pipeline status dashboard** — queue depths, enrichment stats, sentiment distribution, source health in one view
- **Source health sparkline + error log** — `SourceHealthEvent` entity tracks fetch success/failure per day, the sources table shows a 7-day sparkline, errors are expandable inline
- **Feed URL validation on the new-source form** — htmx Validate button that fetches and parses the feed server-side, returns an inline preview, auto-fills the language dropdown based on RSS `<language>` / Atom `xml:lang` / dc:language / character heuristic
- **Collapsible sidebar with localStorage persistence** — UX polish after a month of living with the app
- **Configurable color scheme presets** — because DaisyUI gives you 35 themes for free
- **Per-source reliability weight** — sources that publish frequent duplicates or low-quality content get downweighted in scoring
- **`/health` endpoint** — 200 with DB connectivity check, 503 when the DB is unreachable, no auth required, no more leaking connection details on failure
- **Doctrine listener auto-reindex** — search index stays fresh without manual `app:search-reindex` runs

Fifty commits of sanding down edges. None interesting enough to carry a full section. All of them made the app feel more finished.

## What's Next

The sentiment slider still has a gap: no per-category baseline. If tech news skews 0.2 positive on average and politics skews -0.3, a flat slider applies the same adjustment to both, which overcorrects one category. I want to normalize per category before applying the user's preference. Logged as a follow-up issue, not this PR.

I also want to teach the chat agent about the user's bookmarks — right now it searches the full archive, which is fine, but a "what did I save about X" flow would be useful. That's a second `#[AsTool]` plus some prompt tuning.

Source at [tony-stark-eth/news-aggregator](https://github.com/tony-stark-eth/news-aggregator). Still MIT. If you ran the earlier version, a `git pull && make build && make up` gets you everything in this post — including the cache clear on worker startup, which you'll thank me for the next time you add a constructor argument.
