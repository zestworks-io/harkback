<p align="center">
  <img src="assets/logo.png" alt="Harkback" width="96">
</p>

<h1 align="center">Harkback</h1>

<h3 align="center">
Begriffe beim Lesen erklären lassen. Behalten, was du verstanden hast.<br>Es wiederfinden, wenn der Begriff wieder auftaucht.
</h3>

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="CHANGELOG.md"><img alt="Version" src="https://img.shields.io/github/package-json/v/zestworks-io/harkback?filename=apps%2Fextension%2Fpackage.json&label=version&color=informational"></a>
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-%E2%89%A522-339933?logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Local first" src="https://img.shields.io/badge/data-local--first-success">
  <a href="https://github.com/zestworks-io/harkback/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/zestworks-io/harkback?style=flat"></a>
  <a href="https://github.com/zestworks-io/harkback/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/zestworks-io/harkback"></a>
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

<p align="center">
| <a href="#schnellstart"><b>Schnellstart</b></a> | <a href="#funktionen"><b>Funktionen</b></a> | <a href="guide/README.md"><b>Dokumentation</b></a> | <a href="#datenschutz"><b>Datenschutz</b></a> | <a href="CHANGELOG.md"><b>Änderungsprotokoll</b></a> | <a href="CONTRIBUTING.md"><b>Mitmachen</b></a> |
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <b>Deutsch</b> · <a href="README.pt-BR.md">Português (Brasil)</a></p>

Harkback ist eine Chrome-Erweiterung für Menschen, die wissenschaftliche Arbeiten und technische Dokumente lesen. Markiere einen Begriff, und er wird im Kontext erklärt. Jede Erklärung wird in einem lokalen, nur anfügbaren Protokoll gespeichert. Taucht derselbe Begriff auf einer späteren Seite auf, auch in anderer Schreibweise, unterstreicht Harkback ihn und zeigt, was du beim letzten Mal verstanden hast.

> „harken back“: auf einen früheren Punkt zurückkommen.

<p align="center">
  <a href="assets/demo.mp4"><img src="assets/demo.gif" alt="Demo" width="720"></a>
  <br><sub>Markiere einen Begriff in einem PDF, stelle eine Nachfrage, und das ganze Gespräch bleibt erhalten. Klicke auf die Animation für das Video in voller Qualität.</sub>
</p>

## Schnellstart

```sh
git clone https://github.com/zestworks-io/harkback.git && cd harkback
pnpm install && pnpm --filter @harkback/extension build
```

Öffne `chrome://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und wähle `apps/extension/.output/chrome-mv3` aus. Wähle dann ein Modell:

<details open>
<summary><b>Lokales Modell (kostenlos)</b></summary>

Installiere [Ollama](https://ollama.com), lade ein Modell herunter und wähle auf der Einrichtungsseite **Ollama**. Mit _Verbindung testen_ erhältst du den Befehl, der die Erweiterung zulässt. Nichts verlässt deinen Computer.

</details>

<details>
<summary><b>Gehostetes Modell (mit deinem eigenen API-Schlüssel)</b></summary>

Wähle OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter oder eine eigene OpenAI-kompatible Adresse und füge deinen Schlüssel ein. Der Anbieter rechnet direkt mit dir ab; Harkback hat keinen Server dazwischen.

</details>

Markiere dann auf einer beliebigen Seite einen Begriff und drücke `Alt+Shift+E`. Details findest du unter [Installation](#installation) und [Ein Modell verbinden](#ein-modell-verbinden). Die ersten Schritte stehen im [Einstiegsleitfaden](guide/de/getting-started.md).

<details>
<summary><b>Inhalt</b></summary>

- [Warum nicht einfach ChatGPT fragen?](#warum-nicht-einfach-chatgpt-fragen)
- [Funktionen](#funktionen)
- [Dein Wissensgraph](#dein-wissensgraph)
- [So funktioniert es](#so-funktioniert-es)
- [Installation](#installation)
- [Ein Modell verbinden](#ein-modell-verbinden)
- [Harkback benutzen](#harkback-benutzen)
- [Dokumentation](#dokumentation)
- [Datenschutz](#datenschutz)
- [Deine Daten](#deine-daten)
- [Einschränkungen](#einschränkungen)
- [Aufbau des Repositorys](#aufbau-des-repositorys)
- [Entwicklung](#entwicklung)
- [Mitmachen](#mitmachen)
- [Lizenz](#lizenz)

</details>

## Warum nicht einfach ChatGPT fragen?

Du kannst einen Begriff in einen Chatbot einfügen und bekommst eine gute Antwort. Harkback versucht nicht, eine bessere Antwort zu geben. Es ergänzt, was einem Chatfenster fehlt: **Gedächtnis**. Jeder nachgeschlagene Begriff wird zu einem Eintrag mit Seite, Zitat und Datum, und die Einträge werden zu einem Wissensgraphen verknüpft, der dir gehört.

|                       | Einen Chatbot fragen                                                | Harkback                                                                                                       |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Kontext**           | Begriff und etwas Text kopieren, den Tab wechseln                   | Den Begriff auf der Seite markieren; Absatz und Abschnitt gehen mit, und das Zitat wird geprüft                |
| **Beim nächsten Mal** | Ein neuer Chat beginnt leer, oder du vergisst, dass du gefragt hast | Der Begriff wird auf späteren Seiten unterstrichen, mit dem, was du beim letzten Mal verstanden hast           |
| **Struktur**          | Ein Haufen Transkripte                                              | Konzepte mit Aliasen, Voraussetzungen, Varianten und verwandten Begriffen                                      |
| **Behalten**          | Nichts                                                              | Eine Wiederholungsliste, geplant von einem Gedächtnismodell: Jeder Begriff kommt kurz vor dem Vergessen zurück |
| **Deine Einträge**    | Liegen im Konto des Anbieters                                       | Bleiben in deinem Browser; Export als Markdown, Obsidian-Notizen oder JSONL                                    |
| **Modell und Kosten** | Ein Dienst, ein Tarif                                               | Jedes unterstützte Modell: lokales Ollama kostet nichts, oder nutze deinen eigenen API-Schlüssel               |

Harkback ist kostenlos und Open Source (Apache-2.0), hat keinen Server und kein Abo. Es braucht allerdings ein Modell, das die Erklärungen schreibt: Ein lokales Modell ist kostenlos, ein gehostetes rechnet der Anbieter über deinen eigenen Schlüssel ab.

## Funktionen

- **Im Kontext erklären.** Markiere einen Begriff, klicke auf _Erklären_ oder drücke `Alt+Shift+E`. Die Antwort wird vom konfigurierten Modell gestreamt und als _in der Quelle definiert_ (die Seite definiert den Begriff, und das Zitat wird mit dem Seitentext abgeglichen) oder als _externes Wissen_ gekennzeichnet.
- **Merken.** Jede Erklärung, Nachfrage und Markierung „Verstanden / Noch unklar“ wird als Ereignis in IndexedDB gespeichert. Nichts verlässt deinen Browser außer der Modellanfrage, die du auslöst.
- **Folgegespräche.** Frage auf der Karte weiter; jede Frage bleibt über ihrer Antwort, und das Gespräch wird mit der Erklärung gespeichert. Der Verlauf zeigt es vollständig, die Suche findet es. Formeln werden gesetzt.
- **Wiedersehen.** Auf späteren Seiten werden nachgeschlagene Begriffe unterstrichen. Beim Darüberfahren siehst du, wann und wo du den Begriff getroffen hast und was du verstanden hast, dazu eine Zeile, welcher Text auf der Seite getroffen hat; dann kannst du ihn als gemerkt markieren, noch einmal erklären lassen, die beiden Verwendungen vergleichen oder ihn stummschalten.
- **Ein Konzept, viele Schreibweisen.** `LLM`, `LLMs`, `the LLM`, `large language model` und `Large-Language Models` sind dasselbe Konzept. Ebenso `β-VAE` und `beta-VAE` sowie `fine-tuning` und `ﬁne-tuning` mit Ligatur. Ähnliche Treffer werden dir als „Ist das der Begriff, den du vor 3 Tagen nachgeschlagen hast?“ vorgelegt.
- **Verwandte Begriffe.** Sagt ein Modell, dass `QLoRA` eine Variante von `LoRA` ist, erinnert dich eine Seite, die nur `QLoRA` erwähnt, an das, was du über `LoRA` verstanden hast.
- **Konzeptseiten.** Öffne im Verlauf einen beliebigen Begriff, um zu sehen, wie gut du ihn verstanden hast, worauf er aufbaut (Voraussetzungen), seine Varianten und verwandten Begriffe und jede Begegnung. Du kannst einen Alias hinzufügen, zwei gleiche Konzepte zusammenführen, eine falsche Beziehung entfernen oder einen Begriff stummschalten.
- **Wiederholen.** Der Verlauf zeigt eine Schaltfläche _Wiederholen_ mit der Zahl der fälligen Begriffe. Jeder Begriff wird mit [FSRS-7](https://github.com/open-spaced-repetition/fsrs4anki) geplant, einem Gedächtnismodell: Bewerte eine Antwort mit _Nochmal_, _Schwer_, _Gut_ oder _Leicht_, und der Begriff kommt kurz vor dem Vergessen zurück; leichte Begriffe rücken schnell auseinander, schwere kehren bald wieder. Jede Schaltfläche zeigt, wann der Begriff zurückkommt. Du kannst eintippen, woran du dich erinnerst, bevor du die Erklärung aufdeckst, und die optionale Schaltfläche **Meine Antwort prüfen** fragt dein Modell, wie nah du dran warst (sie schlägt nur eine Bewertung vor; du entscheidest, und du kannst sie in den Einstellungen ausschalten). Das ganze Wiederholen geht per Tastatur: `Space` zeigt die Erklärung, `1`–`4` bewertet, `S` überspringt. Begriffe, die auf anderen aufbauen, kommen nach ihren Voraussetzungen, wenn beide fällig sind, und ein Begriff, mit dem du kämpfst, verweist auf die Voraussetzungen, die vielleicht fehlen. Einen Begriff bei einem Hinweis zum Wiedersehen als gemerkt zu markieren zählt als leichte Wiederholung. Eine Einstellung legt fest, wie wahrscheinlich du dich beim Fälligwerden an einen Begriff erinnern willst (standardmäßig 90 %). Das Symbol in der Symbolleiste zeigt die Zahl der fälligen Begriffe.
- **Wochenrückblick.** Verlauf → _Wochenrückblick_ zeigt, was dir in einer Woche begegnet ist: neue und wiederbesuchte Begriffe, Antworten, Begriffe, die dir noch unklar sind, wo du gelesen hast, und neue Verbindungen zwischen Konzepten. Er wird auf deinem Computer aus deinen Einträgen erstellt und ruft kein Modell auf.
- **Baut auf dem auf, was du weißt.** Liegt ein nachgeschlagener Begriff nahe an einem, den du schon verstehst, wird das dem Modell mitgeteilt, und es kann den Unterschied erklären, statt bei null anzufangen.
- **Privat von Grund auf.** Das automatische Scannen ist auf arxiv.org beschränkt, bis du Websites hinzufügst; eine Schaltfläche in den Einstellungen fügt die gängigen Forschungsseiten hinzu. Sensible Websites können auf ein lokales Modell festgelegt werden, und private Fenster zeichnen nie auf und scannen nie.
- **Portable Einträge.** Exportiere alles als Markdown, als Anki-Karten, als Ordner verknüpfter Notizen (eine Datei pro Konzept mit `[[Links]]`, bereit für Obsidian; was du unter der Markierungszeile schreibst, übersteht den nächsten Export) oder als versioniertes JSONL-Ereignisprotokoll mit veröffentlichtem JSON-Schema. Eine wöchentliche JSONL-Sicherung wird nach `Downloads/harkback` geschrieben, und **JSONL importieren** im Verlauf stellt sie wieder her (bereits vorhandene Einträge werden übersprungen). Eine Einstellung kann sensible Quellen aus Sicherungen und Exporten ausnehmen.
- **Stoppen, wiederholen, Modell wechseln.** Eine Schaltfläche _Stoppen_ beendet eine Antwort, während sie geschrieben wird. Nach einem Fehler bietet die Karte _Erneut versuchen_ und, wenn mehrere Modelle konfiguriert sind, _Mit … versuchen_ für jedes andere.
- **Seite vor dem Lesen in der Vorschau ansehen.** Klicke auf die Schaltfläche in der Symbolleiste, drücke `Alt+Shift+P` oder nutze das Kontextmenü, und Harkback bietet an, die Seite zu scannen, und nennt das Modell und ob es entfernt läuft; ohne deine Zustimmung wird nichts gesendet. Ein Modellaufruf wählt die Schlüsselbegriffe der Seite aus, und deine eigenen Einträge sortieren sie in _noch unklar_, _eingerostet_, _neu für dich_ und _bekannt_. Die _Vorschau_ zeigt für einen bekannten Begriff deine frühere Erklärung, für einen neuen eine kurze vom Modell geschriebene, und zeichnet nichts auf. Das Modell sieht nur den Seitentext, nie deine Konzeptliste, und eine sensible Seite nutzt nur ein lokales Modell. Ein Scan liest die ersten 16.000 Zeichen einer Seite und sagt dir, wenn eine längere Seite abgeschnitten wurde.
- **YouTube-Untertitel.** Füge YouTube in den Einstellungen hinzu, und bei eingeschalteten Untertiteln werden bereits nachgeschlagene Begriffe in der Untertitelzeile unterstrichen. Pausiere und markiere einen Begriff, um ihn anhand der bisher gesehenen Untertitel erklären zu lassen. Die Abfrage wird mit der Wiedergabeposition (`12:34`) aufgezeichnet, und Verlauf, Wiederholen und Exporte verlinken auf diesen Moment. Aus, bis du die Website hinzufügst; es wird nichts heruntergeladen, nur die auf dem Bildschirm sichtbare Untertitelzeile wird gelesen.
- **GitHub, Notion und Google Docs.** Füge die Website in den Einstellungen hinzu, und ihre Seiten werden nach ihrem eigenen Layout gelesen: die README eines Repositorys, das Gespräch eines Issues oder Pull Requests, eine Notion-Seite, die veröffentlichte oder mobile Ansicht eines Google-Dokuments. Ein Dokument ist eine Quelle, egal wie du dorthin gelangt bist, und es wird nur sein eigener Text gelesen, nicht die Menüs drumherum.
- **Fragt vor dem Senden einer privaten Seite.** Eine Seite, die privat wirkt, etwa ein privates GitHub-Repository oder eine nicht veröffentlichte Notion- oder Google-Docs-Seite, wird an kein Modell gesendet, bis du _Nur lokal_ oder _Trotzdem senden_ wählst. Ein Schloss in der Ecke der Seite zeigt den Zustand an und ändert ihn; deine Wahl wird aufgezeichnet und kann für die Website gemerkt werden.
- **Mehrere Wege zum Start.** Markiere Text und klicke auf _Erklären_ (Maus-, Tastatur- oder Touch-Auswahl), drücke `Alt+Shift+E` oder nutze _Erklären_ im Kontextmenü. Seiten, die mehr Text nachladen oder ohne Neuladen zu einer anderen Seite wechseln, werden erneut gescannt.
- **Dein Modell, deine Wahl.** Das in Chrome integrierte Gemini Nano (auf deinem Computer, nichts einzurichten), Ollama, OpenAI, Anthropic, Google Gemini, xAI Grok, OpenRouter oder jeder OpenAI-kompatible Server. Anthropic und Gemini nutzen ihre nativen APIs.

## Dein Wissensgraph

Jede Abfrage erweitert einen Graphen dessen, was du gelesen hast, aufgebaut aus deiner eigenen Lektüre und nicht aus dem Gedächtnis eines Allzweckmodells.

- **Konzepte sind die Knoten.** `LoRA` ist ein Knoten, egal welche Schreibweise eine Seite verwendet (`LoRA`, `low-rank adaptation`) und in welcher Sprache du ihm begegnet bist. Er behält seine Aliase, sein Fachgebiet und wie gut du ihn verstanden hast.
- **Beziehungen sind die Kanten.** Ein Modell schlägt beim Nachschlagen eines Begriffs `variant_of`-, `prerequisite`- und `related`-Verknüpfungen vor, zum Beispiel ist `QLoRA` eine Variante von `LoRA`. Du kannst eine falsche entfernen, zwei gleiche Konzepte zusammenführen oder einen Alias hinzufügen.
- **Alles verweist auf Belege.** Ein Konzept listet jede Begegnung: die Seite, das Zitat, das Datum, deine Erklärung und das Folgegespräch.
- **Der Graph arbeitet mit.** Eine Seite, die nur `QLoRA` erwähnt, erinnert dich an `LoRA`, dem Modell wird gesagt, was du schon weißt, damit es den Unterschied erklären kann, und das Wiederholen wird pro Konzept geplant.
- **Er gehört dir.** Exportiere einen Ordner verknüpfter Notizen (`[[Links]]`, eine Datei pro Konzept) und öffne ihn in Obsidian, um dort den Graphen zu sehen, oder exportiere das vollständige Ereignisprotokoll als JSONL.

Öffne **Graph** im Verlauf, um ihn als Karte zu sehen: Konzepte werden danach eingefärbt, wie gut du sie verstanden hast (verstanden, wackelig, unklar oder neu), mit Pfeilen für Voraussetzungen und Varianten. Filtere nach Fachgebiet, Verständnis oder dem Zeitpunkt der letzten Abfrage. Ziehen verschiebt, Scrollen zoomt, ein Klick auf ein Konzept öffnet es. Du kannst ihn auch über Konzeptseiten durchstöbern und, nach dem Export, über Obsidian.

## So funktioniert es

```
 lesen               erklären                merken                   wiederfinden
 ─────               ────────                ──────                   ────────────
 content script  →   background worker   →   nur anfügbares       →   der Matcher durchsucht die
 liest den Seiten-   wählt je nach           Ereignisprotokoll        nächste Seite nach bekannten
 text aus und        Sensibilität der Seite  (IndexedDB), wird zu     Namen, wählt die zeigens-
 verfolgt deine      ein Modell, streamt     Konzepten, Aliasen und   werten Konzepte aus und
 Auswahl             die Antwort, löst das   Begegnungen abgespielt   zeichnet Unterstreichung
                     Konzept auf                                      + Karte
```

1. **Lesen.** Ein Content-Script extrahiert den lesbaren Text der Seite (LaTeXML-Struktur auf arXiv, sonst Readability) und führt eine Zuordnung von Textpositionen zu DOM-Knoten.
2. **Erklären.** Der Background-Worker prüft die Regeln der Website, wählt ein Modell, wendet eine lokale Ratenbegrenzung an und sendet den Begriff mit seinem Absatz. Der Prompt listet bekannte Konzepte als Kandidaten auf, damit das Modell sagen kann: „Das ist dasselbe Konzept wie c1.“ Die Antwort wird fehlertolerant ausgewertet: abgeschnittene Karten, nachgestellte Kommas und dekorierte Bezeichnungen werden verkraftet.
3. **Merken.** Das Ergebnis wird zu Ereignissen (`concept.created`, `encounter.created`, `edge.proposed`, ...). Konzepte, Aliase und Zusammenführungen werden durch Abspielen des Protokolls abgeleitet und nie gespeichert, sodass eine bessere Abgleichsregel auch alte Einträge verbessert.
4. **Wiederfinden.** Auf jeder Seite durchsucht ein Aho-Corasick-Matcher den Text nach allen bekannten Namen und Abkürzungen. Die Auswahl der Wiedersehen wendet dann die Regeln an, die sie nützlich halten: nicht auf der Seite, auf der du den Begriff nachgeschlagen hast, nicht innerhalb eines Mindestabstands, stummgeschaltete Konzepte bleiben stumm, und eine mehrdeutige Abkürzung braucht einen zweiten Begriff desselben Fachgebiets auf der Seite.

## Installation

Erfordert Node 22 oder neuer und [pnpm](https://pnpm.io). Es gibt noch keinen Store-Eintrag, lade die Erweiterung also aus dem Quellcode:

```sh
# im Wurzelverzeichnis des Repositorys
pnpm install
pnpm --filter @harkback/extension build
```

Öffne `chrome://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und wähle `apps/extension/.output/chrome-mv3` aus. Die Einrichtungsseite öffnet sich bei der Installation.

**Microsoft Edge.** Führe `pnpm build -b edge` in `apps/extension` aus (oder `pnpm zip:edge`), öffne `edge://extensions`, aktiviere den **Entwicklermodus**, wähle **Entpackte Erweiterung laden** und wähle `apps/extension/.output/edge-mv3` aus. Edge bietet das in Chrome integrierte Modell möglicherweise nicht an; wähle bei der Einrichtung ein anderes Modell.

## Ein Modell verbinden

Die Einrichtung hat drei Schritte: **Willkommen** (ein Beispiel für einen Hinweis zum Wiedersehen und eine eingebaute Beispielerklärung, die du ohne Modellaufruf ausprobieren kannst), **Datenschutz** (wohin dein Text geht; du musst das Zustimmungsfeld ankreuzen, damit _Weiter_ aktiv wird) und **Modell** (einen Anbieter wählen, dann _Fertig_). Wenn du die Einrichtung erneut durchläufst, wird das vorhandene Modell aktualisiert, statt eine Kopie anzulegen. Weitere Modelle und Optionen kannst du später auf der Einstellungsseite hinzufügen bzw. ändern; dort legst du auch Ratenbegrenzungen, Hinweise zum Wiedersehen und fest, wie lange ein Modell schweigen darf, bevor eine Anfrage aufgegeben wird.

![Die Einstellungsseite mit einem Modell: Name, Modell, Adresse, API-Schlüssel und eine Schaltfläche Verbindung testen](assets/settings.png)

| Anbieter                        | Base URL                                           | Hinweise                                                                                                                                                                                                |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama                          | `http://127.0.0.1:11434/v1`                        | Lokal, kein Schlüssel. Siehe unten.                                                                                                                                                                     |
| Chrome integriert (Gemini Nano) | keine                                              | Auf diesem Computer, kein Schlüssel. Bei der Einrichtung oder in den Einstellungen herunterladen. Ein kleines Modell: langsamer als ein Cloud-Modell und am besten in Englisch, Spanisch und Japanisch. |
| OpenAI                          | `https://api.openai.com/v1`                        | Braucht einen API-Schlüssel.                                                                                                                                                                            |
| Anthropic                       | `https://api.anthropic.com/v1`                     | Braucht einen API-Schlüssel.                                                                                                                                                                            |
| Google Gemini                   | `https://generativelanguage.googleapis.com/v1beta` | Braucht einen API-Schlüssel.                                                                                                                                                                            |
| xAI Grok                        | `https://api.x.ai/v1`                              | Braucht einen API-Schlüssel.                                                                                                                                                                            |
| OpenRouter                      | `https://openrouter.ai/api/v1`                     | Braucht einen API-Schlüssel.                                                                                                                                                                            |
| Benutzerdefiniert               | jede Adresse                                       | `https`, außer für diesen Computer und dein eigenes Netzwerk (`192.168.x.x`, `10.x.x.x`, `name.local`, Tailscale).                                                                                      |

Jeder Anbieter spricht sein eigenes Format: Anthropic und Google Gemini nutzen ihre nativen APIs, alles andere, einschließlich Ollama, Grok, OpenRouter und jeder benutzerdefinierten Adresse wie einem Firmen-Proxy, nutzt das OpenAI-kompatible Format. Die Wahl eines Anbieters füllt seine Adresse aus, die du weiter bearbeiten kannst. Wähle **Benutzerdefiniert** für jeden anderen OpenAI-kompatiblen Dienst.

Chrome bittet dich, den Zugriff auf die Adresse des Modells zuzulassen, wenn du es zum ersten Mal testest oder speicherst. Lehnst du ab, sagt die Erklärkarte das, statt mit einem Netzwerkfehler zu scheitern.

**Ollama** lehnt Anfragen von Browser-Erweiterungen ab, solange der Ursprung der Erweiterung nicht erlaubt ist. Die Schaltfläche _Verbindung testen_ zeigt den genauen Befehl für dein System, zum Beispiel unter macOS:

```sh
launchctl setenv OLLAMA_ORIGINS "chrome-extension://<your-extension-id>"
```

Starte danach Ollama neu.

## Harkback benutzen

| Du möchtest                                     | So geht's                                                                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Einen Begriff erklären                          | Markiere ihn und klicke auf **Erklären**, oder drücke `Alt+Shift+E`.                                                                                                                         |
| Weiterfragen                                    | Nutze **Nachfragen** auf der Karte. Frage und Antwort werden mit der Erklärung gespeichert.                                                                                                  |
| Eine Seite scannen, die nicht auf arXiv ist     | Klicke auf die Schaltfläche in der Symbolleiste, oder erlaube die Website unter _Websites_ in den Einstellungen für automatische Scans.                                                      |
| Ein PDF lesen                                   | Klicke auf dem PDF auf die Schaltfläche in der Symbolleiste: arXiv-Arbeiten öffnen sich als HTML, andere PDFs im Reader.                                                                     |
| Sehen, was du nachgeschlagen hast               | Öffne die Verlaufsseite von der Einstellungsseite oder der Einrichtungsseite aus. Sie aktualisiert sich live, und der Quellentitel jedes Eintrags verlinkt auf die Seite, von der er stammt. |
| Deine Einträge aufbewahren                      | Verlaufsseite → **Markdown exportieren**, **Anki-Karten exportieren** oder **JSONL jetzt sichern**.                                                                                          |
| Aus einer Sicherung wiederherstellen            | Verlaufsseite → **JSONL importieren**.                                                                                                                                                       |
| Sehen, wie Konzepte zusammenhängen              | Verlaufsseite → **Graph**.                                                                                                                                                                   |
| Verhindern, dass ein Begriff unterstrichen wird | Über die Unterstreichung fahren → **Nicht mehr anzeigen**.                                                                                                                                   |
| Eine Quelle von entfernten Modellen fernhalten  | Karte → **Quelle als sensibel markieren**, oder in den Einstellungen eine Sensibel-Regel für die Website hinzufügen.                                                                         |
| Eine Seite klären, die privat wirkt             | Das Schloss in der Ecke der Seite oder die Frage bei deiner ersten Erklärung: **Nur lokal** oder **Trotzdem senden**.                                                                        |

## Dokumentation

Der Ordner [`guide/`](guide/README.md) enthält die Details (auf Englisch, außer dem [Einstiegsleitfaden](guide/de/getting-started.md)):

- [Erste Schritte](guide/de/getting-started.md), das [Benutzerhandbuch](guide/user-guide.md), [Modelle und Anbieter](guide/models.md) und [Fehlerbehebung](guide/troubleshooting.md).
- [Datenschutz und sensible Quellen](guide/privacy.md): was gesendet wird, was nie, und wie das durchgesetzt wird.
- [Architektur](guide/architecture.md) und das [Datenformat](guide/data-format.md), für Mitwirkende und für alle, die auf deinen Einträgen aufbauen wollen.
- Das [Änderungsprotokoll](CHANGELOG.md).

## Datenschutz

- Wenn du eine Erklärung anforderst, gehen der markierte Text, sein Absatz, der Abschnitt und der Seitentitel an den von dir konfigurierten Modelldienst, zu den Bedingungen dieses Anbieters.
- Beim Wiederholen sendet die optionale Schaltfläche **Meine Antwort prüfen** den Begriff, deine eingetippte Antwort und die gespeicherte Erklärung an dein Modell, nur wenn du sie drückst. Schalte sie in den Einstellungen aus, und die Schaltfläche erscheint nie. Es gelten dieselben Modell- und Sensible-Quellen-Regeln wie bei einer Erklärung.
- Einträge bleiben in diesem Browser. Sicherungen enthalten nur Einträge, nie Einstellungen oder API-Schlüssel.
- Seiten werden nur auf arxiv.org automatisch gescannt. Überall sonst musst du auf die Schaltfläche klicken, `Alt+Shift+E` drücken oder die Website erlauben.
- Inhalte aus einer sensiblen Quelle werden nie an ein nicht lokales Modell gesendet, auch nicht als Kontext für spätere Vergleiche. Ein Server in deinem eigenen Netzwerk gilt als nicht lokal. Eine Quelle bleibt sensibel, bis du sie in ihrem Verlaufseintrag wieder als normal markierst.
- Eine Seite, die privat wirkt (ein privates GitHub-Repository; eine nicht veröffentlichte Notion- oder Google-Docs-Seite), wird an kein Modell gesendet, bis du entscheidest. Bei Seiten, die die Website weder so noch so kennzeichnet, wird auf Notion und Google Docs gefragt, auf GitHub nicht. Was eine Seite über sich selbst verrät, ist nur ein Hinweis; markiere eine Website also als sensibel, wenn es darauf ankommt.
- Eine Einstellung nimmt sensible Quellen aus Sicherungen und Exporten aus.
- Private Fenster erklären, zeichnen aber nie auf, scannen nie und zeigen nie Wiedersehen an.
- Unterstreichungen beim Wiedersehen leben in der Seite, daher können die eigenen Skripte der Seite ableiten, zu welchen Begriffen du Einträge hast.
- Das Löschen einer Erklärung entfernt sie in der App; auf dem Datenträger können Spuren bleiben, und exportierte Sicherungen lassen sich nicht zurückrufen.
- API-Schlüssel werden **unverschlüsselt** im Speicher der Erweiterung abgelegt.

Maßgeblich sind die in der Erweiterung angezeigten Hinweise: [`apps/extension/src/lib/pages/privacy.ts`](apps/extension/src/lib/pages/privacy.ts).

## Deine Daten

Alles ist ein Ereignis in einem nur anfügbaren Protokoll. Das Format ist öffentlich:

- Ereignistypen und Nutzdaten: [`packages/spec`](packages/spec), mit dem erzeugten [JSON-Schema](packages/spec/schema/event.schema.json).
- Abspielen, Abgleich und Export: [`packages/core`](packages/core), das keine Browser-Abhängigkeiten hat und eigenständig verwendet werden kann.

Da Konzepte und Aliase aus dem Protokoll abgeleitet werden, ist deine JSONL-Sicherung eine vollständige, portable Kopie dessen, was du weißt.

## Einschränkungen

- Chrome und Microsoft Edge (Manifest V3). Firefox und Safari werden nicht unterstützt. Das in Chrome integrierte Modell ist nicht in jedem Browser verfügbar; Edge braucht ein anderes Modell.
- Erklärungen hängen vom gewählten Modell ab; kleine lokale Modelle liefern womöglich schwächere Konzeptkarten, was die Qualität der Wiedersehen senkt, aber das Aufzeichnen nie stört.
- Text im integrierten PDF-Viewer des Browsers lässt sich nicht lesen, daher öffnet Harkback das PDF auf einer eigenen Reader-Seite (arXiv-Arbeiten gehen stattdessen zur HTML-Version). Gescannte PDFs werden per OCR auf deinem Computer gelesen (Englisch ist eingebaut; weitere Sprachen sind je ein Download von `cdn.jsdelivr.net`), was langsamer und ungenauer ist als echter Text, Handschrift, Formeln und Tabellen nicht wiederherstellt, und die Absatzerkennung bei komplizierten Layouts (Tabellen, Abbildungen mit Text, drei oder mehr Spalten) ist ungefähr. Ein PDF auf deinem Computer braucht zwei Freigaben: Schalte „Zugriff auf Datei-URLs zulassen“ für Harkback in `chrome://extensions` ein und klicke beim ersten Mal auf der Reader-Seite auf „Lokale Dateien zulassen“.
- Die automatische Abgleichung von Abkürzungen braucht mindestens drei Wörter im vollen Namen (`LLM` aus `Large Language Model`). Zwei Abkürzungen, die im selben Fachgebiet auf verschiedene volle Namen zeigen (zum Beispiel zwei verschiedene „GNN“), bleiben getrennte Konzepte.
- Chinesische Namen und japanische Namen, die nur in Kanji geschrieben sind, müssen mindestens drei Zeichen lang sein, um unterstrichen zu werden, um Fehltreffer zu vermeiden. Namen mit Kana oder Hangul brauchen zwei.
- YouTube: Es werden nur `www.youtube.com/watch`-Seiten mit eingeschalteten Untertiteln (CC) gelesen, und nur die Untertitelzeilen, die der Player seit dem Öffnen der Seite angezeigt hat, stehen als Kontext zur Verfügung. Automatisch erzeugte Untertitel schreiben Fachbegriffe oft falsch, und ein falsch geschriebener Begriff passt nicht zu deinen Einträgen. Shorts, eingebettete Player auf anderen Seiten und der Vollbildmodus (der Player verbirgt die Hinweise von Harkback; nutze den Kinomodus) werden nicht unterstützt, und eine Änderung der YouTube-Seite kann das Lesen der Untertitel verhindern, bis Harkback aktualisiert wird.
- GitHub, Notion und Google Docs: Es werden nur Repository-Startseiten, Issues und Pull Requests (keine Codedateien), Notion-Seiten und Google-Dokumente in ihrer veröffentlichten oder mobilen Ansicht gelesen. Notion zeigt nur die Blöcke, die es gezeichnet hat, daher wird eine lange Seite möglicherweise nur teilweise gelesen. Der Google-Docs-Editor zeichnet seinen Text und lässt sich nicht lesen, und die Vorschauansicht wurde nicht geprüft. Diese Websites ändern ihr Layout ohne Vorankündigung; erkennt Harkback eine nicht mehr, liest es die Seite wie jede andere, bis es aktualisiert wird.
- Akzente werden beim Abgleich ignoriert („résumé“ und „resume“ sind ein Begriff), aber es gibt keine Stammformenreduktion für andere Sprachen als Englisch, daher sind gebeugte Formen wie deutsche Plurale eigene Begriffe.
- Die Oberfläche ist standardmäßig Englisch und auch in vereinfachtem und traditionellem Chinesisch, Japanisch, Koreanisch, Spanisch, Französisch, Deutsch und brasilianischem Portugiesisch verfügbar. Erklärungen können in 16 Sprachen geschrieben werden, getrennt in den Einstellungen gewählt. Exportierte Notizen und Markdown verwenden nur englische oder chinesische Bezeichnungen.

## Aufbau des Repositorys

| Pfad             | Was es ist                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/spec`  | Das Ereignisformat: Konstanten, zod-Schemas und das erzeugte JSON-Schema.                                                                     |
| `packages/core`  | Reine Logik: Abspielen, Namensnormalisierung, Konzeptabgleich, Auswahl der Wiedersehen, Prompts, Ausgabe-Parsing, JSONL- und Markdown-Export. |
| `apps/extension` | Die Chrome-Erweiterung, gebaut mit [WXT](https://wxt.dev): Content-Script, Background-Worker, Verlauf, Einstellungen und Einrichtung.         |
| `tools/lint`     | ESLint-Konfiguration.                                                                                                                         |
| `guide`          | Die Dokumentation: Benutzerhandbuch, Modelle, Datenschutz, Architektur, Datenformat.                                                          |

## Entwicklung

```sh
pnpm install
pnpm --filter @harkback/extension dev     # Live-Reload
```

Bevor du einen Pull Request öffnest:

```sh
pnpm typecheck     # alle Pakete
pnpm lint          # ESLint
pnpm test          # Unit-Tests
pnpm check:build   # Produktions-Build: Manifest-Berechtigungen und Content-Script-Größe
pnpm e2e           # End-to-End-Tests in Chromium (einmal `pnpm exec playwright install chromium` ausführen)
pnpm format:check  # Formatierung
```

Um ein Release für Microsoft Edge Add-ons zu paketieren, führe `pnpm zip:edge` aus (siehe `store/edge/README.md`). Um ein Release für den Chrome Web Store zu paketieren, erhöhe `version` in `apps/extension/package.json` und führe dann `pnpm release` aus. Es führt die Prüfungen aus, baut die Produktionserweiterung, verifiziert das Paket und schreibt `apps/extension/.output/harkback-<version>-chrome.zip`. Mit `tools/package.sh --skip-checks` wird nur das Zip gebaut.

Die End-to-End-Tests laden die gebaute Erweiterung in Chromium, liefern arXiv-Seiten aus `apps/extension/fixtures` aus und sprechen mit einem lokalen Stub-Modellserver. Sie decken den ganzen Kreislauf ab: eine Arbeit lesen, erklären, aufzeichnen, die Verlaufsseite und Wiedersehen auf anderen Arbeiten. Siehe `apps/extension/e2e`.

## Mitmachen

Fehlerberichte und Pull Requests sind willkommen. Lies zuerst [CONTRIBUTING.md](CONTRIBUTING.md). Ein Sicherheitsproblem meldest du gemäß [SECURITY.md](SECURITY.md).

## Lizenz

[Apache-2.0](LICENSE)
