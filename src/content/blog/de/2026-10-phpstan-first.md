---
title: "PHPStan zuerst: Die Reihenfolge meiner Gates für KI-geschriebenes PHP"
description: "Welches Quality Gate zuerst, wenn ein KI-Agent dein PHP schreibt: PHPStan, dann ECS und Rector, Tests, Architekturregeln, Mutation Testing."
date: 2026-10-26
tags: ["php", "phpstan", "claude-code", "code-quality", "symfony"]
locale: "de"
translationSlug: "2026-10-phpstan-first"
category: "tech"
draft: false
---

Ein KI-Agent schreibt PHP, das viel öfter richtig aussieht, als es richtig ist. Alle Quality-Tools auf einmal einzuschalten, löst das nicht: Der Agent ertrinkt in Meldungen, und du auch. Ich führe Gates in fester Reihenfolge ein, sortiert danach, wie viel jedes pro Sekunde Laufzeit findet, und ich richte sie ein, bevor ich den Agenten schnell arbeiten lasse.

## Zwei Reihenfolgen, nicht eine

In „welches Gate zuerst“ stecken zwei Fragen:

- **Einführungsreihenfolge:** Welches Tool bringst du in einem Projekt zuerst ein und auf Grün, bevor das nächste kommt?
- **Ausführungsreihenfolge:** In welcher Reihenfolge laufen die Tools bei einem Commit oder in der CI?

Die Antworten sind verschieden. Die Einführung richtet sich nach dem Nutzen: Das Gate, das die meisten echten Fehler in KI-Code findet, kommt zuerst. Die Ausführung richtet sich nach den Kosten: Der schnellste Check schlägt zuerst fehl, damit die langsamen nicht umsonst laufen. In diesem Beitrag geht es vor allem um die erste Frage. Die Beispiele stammen aus meinem öffentlichen [template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai).

## Gate 1: PHPStan auf Level max

Die typischen Fehler in KI-geschriebenem PHP sind Typfehler. Eine Methode gibt `?Item` zurück und wird benutzt, als käme immer ein `Item`. Ein Array aus dekodiertem JSON wird ohne Prüfung als `array<string, string>` behandelt. Eine Methode wird aufgerufen, die es in dieser Klasse nicht gibt, weil sie in einer anderen Bibliothek existiert, die das Modell kennt. PHPStan findet all das, ohne eine Zeile auszuführen, und zwar in genau der Datei, die der Agent gerade geschrieben hat.

Deshalb kommt es zuerst. Es läuft günstig, seine Meldungen sind präzise (Datei, Zeile, Grund), und ein Agent kann sie selbst beheben, ohne zu raten, was du gemeint hast.

Das Template nutzt die strengsten Einstellungen, die ich kenne:

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

`checkImplicitMixed` ist für Agenten-Code die wichtigste Einstellung. Ohne sie geht ein Wert ohne deklarierten Typ still als `mixed` durch, und `mixed` lässt fast alles passieren. Die zweite ist die Grenze für kognitive Komplexität von 8 pro Funktion: Agenten lösen ein Problem gern mit einer langen Methode voller verschachtelter Bedingungen. Eine harte Grenze zwingt sie zum Aufteilen, und das Ergebnis lässt sich leichter reviewen.

Was ich als Erstes übernehmen würde, noch vor Level max, ist eine Liste verbotener Funktionen mit Begründung:

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

Entscheidend ist die Meldung. Ein Agent, der „use ClockInterface instead“ liest, weiß, was als Nächstes zu tun ist. Eine Regel, die nur „verboten“ sagt, führt zum nächsten Workaround.

### Wo ich nicht streng bin

Die `phpstan.neon` im Template hat zwei `ignoreErrors`-Einträge. Jeder gilt nur für einen Pfad: Checked Exceptions in Closures unter `config/` und dynamische Aufrufe statischer Methoden unter `tests/`. Lieber zwei enge, sichtbare Ausnahmen als ein ganzes Level weniger. Ein globales Ignore-Muster dagegen fügt ein Agent gern ein, um auf Grün zu kommen. Jede Änderung an dieser Datei reviewst du selbst.

## Gate 2: ECS und Rector

ECS und Rector finden selten Bugs. Sie kommen an zweiter Stelle, weil sie fast nichts kosten: Beide beheben ihre Meldungen selbst und nehmen die Stil-Diskussion aus deinem Review.

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

Im Gate selbst läuft Rector nur als Dry-Run (`rector process --dry-run`). Es meldet, was es ändern würde, und schlägt fehl, wenn es etwas findet. Das Beheben läuft über ein eigenes Target (`make rector-fix`), du siehst die Änderung also, bevor sie landet. Bei Agenten-Code bringen die Sets `DEAD_CODE` und `EARLY_RETURN` am meisten: Ungenutzte Variablen und tief verschachtelte `if`-Blöcke bleiben nach ein paar Runden „behebe diesen Fehler“ oft übrig.

Warum nicht zuerst? Weil sauber formatierter Code mit falschen Typen immer noch falscher Code ist. Führst du ECS vor PHPStan ein, bestehen die ersten Wochen an Meldungen aus Leerzeichen.

## Gate 3: Tests

Tests kommen an dritter Stelle, nicht weil sie weniger wichtig sind, sondern weil der Agent sie auch schreibt. Ein Test vom selben Modell, das den Code geschrieben hat, bestätigt eher den Code, samt seiner Fehler. Statische Analyse hat diese Schlagseite nicht. Also kommen Tests, wenn die Typen stimmen, und sie werden später noch einmal geprüft (Gate 5).

Das Template trennt die schnelle Suite von der langsamen:

```makefile
test-unit: ## Run unit tests only
	$(PHP_CONT) vendor/bin/phpunit --testsuite=unit

test-integration: ## Run integration tests only
	$(PHP_CONT) vendor/bin/phpunit --testsuite=integration
```

Während einer Session mit einem Agenten läuft nach jeder Änderung nur die Unit-Suite. Die komplette Suite läuft einmal vor dem Commit. So bleibt die Rückmeldung kurz genug, dass der Agent sie auch nutzt.

## Gate 4: Architekturregeln

KI-geschriebener Code überschreitet Schichtgrenzen, ohne es zu merken: ein Shared-Service, der eine Domain-Klasse importiert, eine Entity, die einen Controller kennt. Das Template hat dafür Regeln mit phpat:

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

Jetzt der ehrliche Teil. phpat läuft als PHPStan-Extension und prüft nur Regelklassen, die als Service mit dem Tag `phpat.test` registriert sind. In der `phpstan.neon` des Templates sind sie das nicht. Die Regeln existieren, das Paket ist installiert, die Doku führt phpat als Gate, das die CI blockiert. Ausgelöst hat es nie.

Das ist die Lehre aus diesem Gate, und sie gilt für jedes andere: Ein Gate, das du nie hast fehlschlagen sehen, ist kein Gate. Wenn du eine Regel hinzufügst, bau absichtlich einen Verstoß ein, sieh zu, wie der Check rot wird, und entferne ihn wieder.

## Gate 5: Mutation Testing

Mutation Testing prüft Gate 3. Infection verändert deinen Code (dreht eine Bedingung um, entfernt einen Methodenaufruf, streicht ein `return`) und lässt die Tests erneut laufen. Bleiben sie grün, testen sie diese Zeile nicht. Genau das ist die Schwäche von Tests, die ein Agent für seinen eigenen Code schreibt.

```json
"minMsi": 80,
"minCoveredMsi": 90,
"testFrameworkOptions": "--testsuite=unit",
```

Es kommt zuletzt, weil es das mit Abstand langsamste Gate ist und erst nützt, wenn die Tests darüber stabil sind. In der CI hat der Job `needs: unit-tests`: Schlagen die Unit-Tests fehl, startet der Mutationslauf gar nicht. Im Template gemessen (Median aus drei Läufen, Docker auf einem i7-13700K): PHPStan über das ganze Projekt braucht 0,4 s mit Result-Cache und 2,1 s ohne, Infection über die Unit-Suite 4,7 s. Das Template ist klein; in einer echten Codebasis wächst der Abstand, weil jeder Mutant die betroffenen Tests erneut laufen lässt.

## Ausführungsreihenfolge: das Günstigste zuerst

Beim Commit ist die Reihenfolge eine andere. Der Pre-Commit-Hook im Template schaut nur auf gestagte PHP-Dateien und führt ECS aus, dann PHPStan, dann Rector als Dry-Run. `make quality` startet dieselben drei Tools. ECS kommt zuerst, damit du nicht auf eine komplette Analyse wartest, nur um zu erfahren, dass eine Klammer falsch steht. Bei fünf gestagten Dateien braucht ECS im Template 0,23 s, PHPStan 1,2 s (Median aus drei Läufen).

In der CI laufen ECS, PHPStan, Rector und die Unit-Tests parallel nach einem gemeinsamen Image-Build. Mutation Testing wartet auf die Unit-Tests. Integrations- und End-to-End-Tests brauchen eine Datenbank und laufen in einem eigenen Job.

Zusammen bekommst du beides: Die Einführungsreihenfolge sagt dir, was du zuerst behebst, die Ausführungsreihenfolge, worauf du am wenigsten wartest.

## Wenn du bei null anfängst

Hat dein Projekt noch nichts davon, würde ich so vorgehen:

1. PHPStan auf dem Level, das du heute bestehst, plus die Liste verbotener Funktionen. Das Level schrittweise bis max anheben.
2. ECS und Rector mit Auto-Fix, in einem eigenen Commit, damit sich der Diff nicht mit echten Änderungen mischt.
3. Eine schnelle Unit-Suite, die der Agent nach jeder Änderung ausführt.
4. Architekturregeln, jede mit einem eingebauten Verstoß bewiesen.
5. Infection erst mit niedrigen Schwellen, dann anheben.

Erst danach lasse ich den Agenten größere Schritte machen. Das Template hat alle fünf an Bord (und, Stand jetzt, eines davon nicht angeschlossen): [github.com/tony-stark-eth/template-symfony-ai](https://github.com/tony-stark-eth/template-symfony-ai). Welches Gate fängt in deinen Projekten die meisten KI-Fehler?
