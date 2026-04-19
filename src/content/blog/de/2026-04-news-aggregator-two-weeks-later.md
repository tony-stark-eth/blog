---
title: "Zwei Wochen News Aggregator: RAG-Chat und ein Sentiment-Regler"
description: "Was ich in zwei Wochen zu meinem Symfony News Aggregator ergänzt habe: pgvector-Chat, Sentiment-Slider, Full-Text-Fetch und der Worker-Cache-Bug."
date: 2026-04-19
tags: ["symfony", "ai", "rag", "pgvector", "self-hosted"]
locale: "de"
translationSlug: "2026-04-news-aggregator-two-weeks-later"
draft: false
---

Vor zwei Wochen habe ich [meinen News Aggregator veröffentlicht](/de/blog/2026-04-news-aggregator/) — eine fertige Symfony 8 App: Feeds fetchen, mit AI anreichern, Alerts verschicken, Digests generieren. Fünfzig Commits später sieht er anders aus. Der Aggregator hat einen konversationellen Chat bekommen, der sein eigenes Archiv durchsucht, einen Sentiment-Regler, der das Ranking zu meiner aktuellen Stimmung verbiegt, und eine Full-Text-Fetch-Stufe, die den eigentlichen Artikeltext zieht, wenn ein Feed nur einen Teaser liefert. Plus einen operativen Bug, den ich dreimal behoben habe, bevor ich ihn wirklich behoben habe.

Das ist das Follow-up: was sich geändert hat, warum, und die Stellen, die schwieriger waren als sie aussahen.

## Chat, der dein eigenes Archiv durchsucht

Der Original-Post hat Kategorisierung und Alerts erwähnt. Chat nicht, weil Chat damals nicht gebaut war. Jetzt schon: ein streaming-fähiger konversationeller Agent, der dein Artikelarchiv mit hybrider semantischer + Keyword-Suche durchsucht und die Quellen in seiner Antwort zitiert.

Die Such-Schicht ist der interessante Teil. `pgvector` hält Artikel-Embeddings, [SEAL + Loupe](https://github.com/schranz-search/schranz-search) macht Full-Text-Keyword-Suche. Semantische Suche fängt Paraphrasen und Synonyme; Keyword-Suche fängt Eigennamen, die das Embedding-Modell zermatscht. Keine von beiden ist alleine gut. Zusammen decken sie sich gegenseitig ab:

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

Das `#[AsTool]`-Attribut kommt von `symfony/ai-agent`. Die Agent-Runtime greift das Tool auf, injiziert es in den Prompt, und das Modell entscheidet, wann es aufgerufen wird. Ich schreibe keine Parsing-Logik. Der Agent bekommt außerdem einen `ConversationMessageStore` (DBAL-basiert), damit jeder Turn persistiert wird und der User einen Chat Tage später fortsetzen kann.

Ein nicht offensichtliches Detail: Der Chat-Agent braucht einen anderen Modell-Pool als die Enrichment-Pipeline. Enrichment braucht nur Text-Completion — jedes kostenlose Modell reicht. Chat braucht Tool-Calling, was den Pool deutlich einschränkt. Also hat der `ModelDiscoveryService` einen zweiten Modus bekommen, der nach `supported_parameters` mit `"tools"` filtert und einen separaten `chat`-Pool neben dem `enrichment`-Pool pflegt. Ohne diese Trennung würde der Chat still in ein Text-only-Modell routen und das `article_search` Tool würde nie feuern.

Streaming war das nächste Kaninchenloch. OpenRouters kostenlose Modelle haben First-Token-Latenzen im Bereich von 5-30 Sekunden — lang genug, dass ein naiver SSE-Stream hinter einem Reverse Proxy still wegtimeoutet. Die Lösung: SSE `status`-Events während der Modell-Auflösung schicken, damit die Verbindung warm bleibt:

```php
// StreamingChatService — keepalive pattern
yield SseEvent::status('Resolving model...');
yield SseEvent::status('Searching archive...');
yield SseEvent::status('Generating response...');

foreach ($agent->stream($messages) as $chunk) {
    yield SseEvent::chunk($chunk);
}
```

Der Browser-Client weiß, dass er `status`-Events als inline Thinking-Indikator rendern soll. Das erste Token fühlt sich sofort an, auch wenn es das nicht ist.

## Sentiment als Ranking-Regler, nicht als Filter

Die Idee ist aus einer Internet-Ästhetik namens *Hopecore* geklaut — Hoffnung und konstruktive Geschichten finden in einem Feed, der sonst apokalyptisch trendet. Das Inverse gibt es auch: manche Tage will ich kritische, investigative, accountability-getriebene Berichterstattung, keine Wohlfühl-Stories. Ich wollte eine Steuerung, die beides abdeckt.

Der neue Slider in der Navbar geht von -10 bis +10. Bei 0 macht er nichts. Bei +3 rankt er den Feed neu und lässt positive Artikel nach oben blubbern. Bei +7 filtert er zusätzlich Artikel unter -0.3 Sentiment raus. Gleiches Prinzip für die negative Seite. Es ist ein Regler für "Ich will gerade mehr von dieser Art News", kein binärer An/Aus-Toggle.

Das Scoring selbst hat zwei Pfade. Die AI extrahiert einen Sentiment-Score (-1.0 bis +1.0) als Teil desselben Enrichment-API-Calls, der Kategorisierung und Zusammenfassung macht — null Zusatzkosten, nur ein weiteres JSON-Feld. Ist AI nicht verfügbar, läuft ein regelbasierter Fallback mit ~30 Positiv/Negativ-Keyword-Listen, Titel 2x gewichtet, gekappt bei ±0.8, damit er nie ein echtes AI-Urteil überstimmt:

```php
// RuleBasedSentimentScoringService — capped so AI always wins
$titleScore   = $this->score($titleTokens)   * self::TITLE_WEIGHT;
$contentScore = $this->score($contentTokens);
$raw = ($titleScore + $contentScore) / ($titleTokens->count() + $contentTokens->count());

return max(-0.8, min(0.8, $raw));
```

Zwei Details haben ein paar Iterationen gebraucht.

**Erstens**: Wie setzt man den Slider zurück. Mobile hat keinen Rechtsklick, und der offensichtliche dedizierte Button hätte Platz gekostet, den ich nicht opfern wollte. Double-Tap funktioniert auf Desktop und Mobile und fühlt sich natürlich an, sobald man es gelernt hat:

```typescript
slider.addEventListener("dblclick", () => {
    slider.value = "0";
    postSentiment(url, 0);
});
```

**Zweitens**: Wie aktualisiert man das Dashboard ohne Full Page Reload. Die erste Version hat ein `sentiment-changed` Event gefeuert und... niemand hat es konsumiert. Der Slider bewegte sich, der Server speicherte den Wert, die Seite blieb alt. Am Ende habe ich htmx' programmatisches API benutzt, um den Body zu swappen:

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

Gleicher Effekt wie ein Reload, aber Scroll-Position bleibt erhalten und nichts flackert. Der Fallback auf `location.reload()` ist für den Fall, dass htmx noch nicht geladen ist — doppelter Boden.

Der Slider füttert außerdem den Chat-System-Prompt. Bei +7 wird dem Assistant angehängt: *"The user prefers positive and uplifting information. Frame responses with optimism where appropriate."* Bei -7 dreht es sich ins Negative. Gleiches gilt für die periodische Digest-Generierung: ein freundlicher Digest, wenn der Regler oben ist, ein harter, wenn er unten ist. Sentiment hat aufgehört, ein UI-Feature zu sein, und ist zu einer User-Preference geworden, die die ganze App durchdringt.

## Full-Text-Fetch, der nie blockiert

Die meisten RSS-Feeds liefern einen Teaser — den ersten Absatz plus einen Link. Für Kategorisierung und Zusammenfassung ist das oft nicht genug. Der Aggregator fährt jetzt eine Phase 1.5 zwischen "Feed gefetcht" und "AI Enrichment": Artikel-URL fetchen, [Readability.php](https://github.com/fivefilters/readability.php) drüberlaufen lassen, Hauptinhalt extrahieren, am Artikel persistieren.

Die entscheidende Regel: Diese Stufe **darf die Pipeline nie blockieren**. Wenn die Zielseite langsam ist, mich rate-limited, eine Paywall serviert oder 500 zurückgibt, wird der Artikel trotzdem AI-enriched mit dem Content, den der Feed geliefert hat. Keine Partial States, keine toten Queue-Messages.

Das bedeutete einen dritten Messenger-Transport (`async_fulltext`), einen Per-Domain-Rate-Limiter, damit ich nicht eine einzelne Site mit parallelen Requests hämmere, und einen Fallback, der beim Fetch-Fehler einfach die Schultern zuckt:

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

Der Dispatch von `EnrichArticleMessage` sitzt außerhalb des try-Blocks. Egal ob Full-Text geklappt hat oder nicht, der Artikel tritt ins AI-Enrichment ein. Fehler degradieren Qualität; sie brechen nie den Flow.

Der Per-Domain-Rate-Limiter nutzt Symfonys `RateLimiterFactory` mit einem Sliding Window, key'd by Host: zwei Requests pro 5 Sekunden pro Domain by default, konfigurierbar via env. Wenn eine Site in einem Fetch-Zyklus 20 Artikel veröffentlicht, tröpfeln sie durch, statt einen Block auszulösen.

## Settings, die an zwei Orten leben

Ein kleines Pattern, das mehr bringt, als es kosten. Environment-Variablen sind super für Deployment-Zeit-Config. Sie sind schlecht für "Ich will gerade aus der Admin-UI die Display-Sprachen ändern". Der ursprüngliche Aggregator hatte eine Handvoll Env-Vars, die ohne Container-Restart nicht zu tunen waren.

Die Lösung ist ein Hybrid-Store. Env-Vars liefern Defaults; eine `Setting`-Entity in Postgres liefert Overrides. Der Service liest zuerst die DB, fällt dann auf den injizierten Default zurück:

```php
final readonly class SettingsService implements SettingsServiceInterface
{
    public function __construct(
        private SettingRepositoryInterface $settingRepository,
        string $displayLanguages,        // default from %env%
        int $fetchDefaultInterval,       // default from %env%
        int $retentionArticles,          // default from %env%
        int $retentionLogs,               // default from %env%
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

Eine Admin-UI schreibt in die DB; der nächste Request liest den Override. Kein Restart, keine Env-File-Änderung. Die Defaults liegen weiterhin im Container-Image, was wichtig ist, wenn die DB beim ersten Boot leer ist oder du alles zurücksetzen willst.

Der Sentiment-Slider ist der einzige Wert ohne Env-Default — er ist pro-User-State mit einem hardcodierten `'0'` Fallback. Alles andere kann aus der Deployment-Config gebootstrapped werden.

## Der Worker-Cache-Bug, der mich immer wieder erwischt hat

Ich habe dreimal einen Fix für denselben Bug geliefert, bevor ich ihn verstanden habe.

**Symptom**: Ein Worker-Container crasht beim Startup mit `TypeError: too few arguments to Service::__construct()` nach einem Deploy. Worker neu starten, läuft wieder. Ein paar Deploys später, gleicher Crash.

**Root Cause**: Workers laufen mit `APP_DEBUG=0` für Performance. Symfony compiliert den DI-Container einmal und cached ihn. Der Web-Container recompiliert bei jeder Code-Änderung, weil `APP_DEBUG=1` im Dev-Modus. Die Workers mounten das Source-Code-Volume, also updatet der *Code*, aber der gecachte Container in `/var/cache/prod/` nicht. Wenn ich einen Konstruktor-Parameter zu einem Service hinzufüge, ruft der neue Code `new Service($a, $b, $c)` auf, während der gecachte Container noch `new Service($a, $b)` verdrahtet.

Erster Fix: manuelles `docker compose restart worker`. Hält bis zum nächsten Deploy.

Zweiter Fix: Cache-Verzeichnis auf dem Host gelöscht. Hält bis Docker es mit dem im Image gebackenen Cache neu erstellt.

Dritter Fix, der echte: Cache-Clear ins Worker-Command selbst einbacken. Jeder Worker-Startup führt jetzt Cache-Operationen aus, bevor er die Queue konsumiert:

```yaml
# compose.override.yaml
worker:
  command: ["sh", "-c",
    "php bin/console cache:clear --no-warmup -q && \
     php bin/console cache:warmup -q && \
     php bin/console messenger:consume async scheduler_fetch \
       --time-limit=3600 --memory-limit=128M -vv"]
```

Workers restarten durch `--time-limit=3600` (eine Stunde) sowieso — Messengers eingebautes Sicherheitsventil gegen Memory-Leaks. Der Cache-Clear fügt pro Restart-Zyklus vielleicht 2 Sekunden hinzu. Im Gegenzug ist der Container immer kohärent mit dem Source-Code, der in ihn gemountet wird. Der `TypeError` trat nicht mehr auf.

Gelernt: Überall wo du live Code in einen Container mountest, der kompilierte Metadaten cached, ist ein Cache-Clear beim Startup keine Paranoia — es ist die einzige state-sichere Option.

## Queue-bewusstes Failover

Die ursprüngliche Failover-Kette hat kostenlose Modelle der Reihe nach probiert und nur dann auf paid durchgefallen, wenn ich `OPENROUTER_PAID_FALLBACK_MODEL` konfiguriert hatte. Okay für normale Last. Nicht okay, wenn ein Source-Dump plötzlich 2000 Artikel in die Queue schiebt und jeder Free-Model-Versuch 30 Sekunden an Timeouts und Retries verbrennt.

Der `ModelFailoverPlatform` schaut jetzt auf die Queue-Tiefe und passt an:

```
Queue depth <  QUEUE_ACCELERATE_THRESHOLD  (default 20)
    → full chain: primary free → free fallbacks → paid fallback

Queue depth >= QUEUE_ACCELERATE_THRESHOLD
    → primary free → paid fallback (skip free chain)

Queue depth >= QUEUE_SKIP_FREE_THRESHOLD    (default 50)
    → paid fallback only
```

Unter einem großen Backlog umgeht die App die instabile Free-Kette und zahlt Cents, um die Queue zu leeren. Bei der Verifikation an einem echten Backlog hat Gemini 2.5 Flash Lite 1.891 liegengebliebene Artikel für insgesamt etwa 40 Cent verarbeitet. Der Free-Tier-Versuch hätte den Rest des Tages gebraucht.

Die Schwellen sind bewusst als Env-Vars exponiert, damit ich sie an "Free Tier reicht dicke"-Tagen hoch setzen kann und an "einfach durchziehen"-Tagen niedrig. Kein Code-Deploy, um den Modus zu wechseln.

## Kleine Dinge, die zusammen viel ausmachen

Ein paar kleinere Änderungen, die keinen eigenen Abschnitt brauchen:

- **OPML-Import/-Export** — Feed-Portabilität, weil niemand eine Seed-Liste per Hand editieren sollte
- **Pipeline-Status-Dashboard** — Queue-Tiefen, Enrichment-Stats, Sentiment-Verteilung, Source Health in einer Ansicht
- **Source-Health-Sparkline + Error-Log** — `SourceHealthEvent`-Entity trackt Fetch-Erfolg/-Fehler pro Tag, die Sources-Tabelle zeigt eine 7-Tage-Sparkline, Fehler sind inline ausklappbar
- **Feed-URL-Validierung im Neue-Source-Formular** — htmx Validate-Button, der den Feed serverseitig fetched und parsed, eine Inline-Preview zurückgibt und die Language-Dropdown basierend auf RSS `<language>` / Atom `xml:lang` / dc:language / Character-Heuristik automatisch füllt
- **Collapsible Sidebar mit localStorage-Persistenz** — UX-Politur nach einem Monat mit der App
- **Konfigurierbare Farbschema-Presets** — weil DaisyUI 35 Themes kostenlos mitbringt
- **Per-Source-Reliability-Weight** — Quellen, die häufig Duplikate oder Low-Quality-Content veröffentlichen, werden im Scoring runtergewichtet
- **`/health`-Endpoint** — 200 mit DB-Connectivity-Check, 503 wenn die DB nicht erreichbar ist, keine Auth nötig, keine geleakten Connection-Details mehr bei Fehlern
- **Doctrine-Listener-Auto-Reindex** — der Search-Index bleibt frisch ohne manuelle `app:search-reindex` Runs

Fünfzig Commits Kanten abschleifen. Keine davon interessant genug für einen eigenen Abschnitt. Alle zusammen machen die App fertiger.

## Was als Nächstes kommt

Der Sentiment-Slider hat noch eine Lücke: kein Per-Kategorie-Baseline. Wenn Tech-News im Schnitt um 0.2 positiv skew'd und Politik um -0.3, wendet ein flacher Slider denselben Adjustment auf beide an und überkorrigiert eine Kategorie. Ich will pro Kategorie normalisieren, bevor die User-Preference angewandt wird. Ist als Follow-up-Issue notiert, nicht in diesem PR.

Ich will dem Chat-Agent außerdem die Bookmarks des Users beibringen — aktuell durchsucht er das ganze Archiv, was okay ist, aber ein "was habe ich zu X gespeichert" Flow wäre nützlich. Das ist ein zweites `#[AsTool]` plus etwas Prompt-Tuning.

Source auf [tony-stark-eth/news-aggregator](https://github.com/tony-stark-eth/news-aggregator). Weiterhin MIT. Wenn du die frühere Version laufen hattest, holt ein `git pull && make build && make up` alles aus diesem Post — inklusive des Cache-Clear beim Worker-Startup, für den du mir dankbar sein wirst, wenn du das nächste Mal einen Konstruktor-Parameter hinzufügst.
