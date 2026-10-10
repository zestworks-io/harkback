# Erste Schritte

Fünf Minuten von Null bis zum ersten gemerkten Begriff.

> Dies ist die deutsche Übersetzung der [englischen Anleitung für die ersten Schritte](../getting-started.md). Die übrigen Seiten gibt es bisher nur auf Englisch: siehe die [englische Dokumentation](../README.md).

## 1. Installieren

Harkback ist eine Chrome-Erweiterung (Manifest V3). Es gibt noch keinen Eintrag im Store, daher wird sie aus dem Quellcode geladen. Sie benötigen Node 22 oder neuer und [pnpm](https://pnpm.io).

```sh
git clone https://github.com/zestworks-io/harkback.git
cd harkback
pnpm install
pnpm --filter @harkback/extension build
```

Öffnen Sie `chrome://extensions`, schalten Sie den **Entwicklermodus** ein, wählen Sie **Entpackte Erweiterung laden** und dann `apps/extension/.output/chrome-mv3`. Die Einrichtungsseite öffnet sich von selbst.

Nachdem Sie neuen Code geholt haben, bauen Sie erneut und klicken Sie auf der Karte der Erweiterung auf das Symbol zum Neuladen.

## 2. Ein Modell verbinden

Harkback hat keinen Server. Es braucht ein Modell, das die Erklärungen schreibt, und Sie wählen, welches. Die Einrichtungsseite hat drei Schritte; ein abgeschlossener Schritt zeigt ein ✓ und lässt sich anklicken, um dorthin zurückzukehren.

1. **Willkommen.** Sehen Sie sich einen Beispiel-Hinweis zum Wiedersehen an und klicken Sie auf den unterstrichenen Begriff, um zu sehen, wie eine Erklärung aussieht. Es wird kein Modell aufgerufen.
2. **Datenschutz.** Lesen Sie, wohin Ihr Text geht, und setzen Sie das Häkchen bei der Zustimmung. **Weiter** bleibt deaktiviert, bis Sie das getan haben.
3. **Modell.** Wählen Sie einen Anbieter; die Adresse wird eingetragen. Fügen Sie einen API-Schlüssel ein, wenn der Anbieter einen braucht (Ollama und das in Chrome eingebaute Modell brauchen keinen). Drücken Sie **Verbindung testen**, und Chrome fragt, ob Harkback diese Adresse erreichen darf; erlauben Sie es. Während des Tests werden ein Ladesymbol und „Verbinde…“ angezeigt, und die Schaltfläche ist bis zum Ende deaktiviert. Drücken Sie dann **Einrichtung abschließen**.

**Das in Chrome eingebaute Modell (Gemini Nano)** braucht weder Adresse noch Schlüssel. Wenn Sie es auswählen, sehen Sie den Status des Modells und eine Schaltfläche **Modell herunterladen**; **Einrichtung abschließen** wartet, bis der Download fertig ist. Es ist ein kleines Modell, das auf Ihrem Computer läuft, rechnen Sie also damit, dass es langsamer ist als ein Cloud-Modell, besonders bei der ersten Anfrage, und einfachere Antworten gibt. Es eignet sich für kurze Erklärungen.

Weitere Modelle und Optionen können Sie später auf der Einstellungsseite hinzufügen. Wenn Sie die Einrichtung erneut ausführen, wird das vorhandene Modell aktualisiert; es wird keine zweite Kopie angelegt.

Die einfachste kostenlose Möglichkeit ist ein lokales [Ollama](https://ollama.com)-Modell. Es braucht einen zusätzlichen Schritt, weil Ollama Anfragen von Browser-Erweiterungen ablehnt, bis Sie den Ursprung der Erweiterung erlauben. Die Test-Schaltfläche zeigt den genauen Befehl für Ihr System. Alle Anbieter und wie Sie ein Modell auf einem anderen Computer in Ihrem Heimnetz betreiben, steht unter [Modelle und Anbieter](../models.md).

Die Oberfläche startet auf Englisch. Ihre Sprache und die Sprache der Erklärungen können Sie auf der Einrichtungs- oder Einstellungsseite ändern.

## 3. Einen Begriff erklären

1. Öffnen Sie ein Paper auf [arxiv.org](https://arxiv.org). arXiv-Seiten werden automatisch gescannt.
2. Wählen Sie einen Begriff aus, zum Beispiel `LoRA`.
3. Klicken Sie neben der Auswahl auf **Erklären** oder drücken Sie `Alt+Shift+E`.
4. Lesen Sie die Antwort, während sie eintrifft. Ein grünes Label sagt, dass die Seite den Begriff selbst definiert; ein gelbes, dass die Antwort aus dem eigenen Wissen des Modells stammt.
5. Drücken Sie **Verstanden** oder **Noch unklar**. Diese Antwort ist die erste Bewertung des Begriffs und bestimmt, wann Harkback ihn zur Wiederholung zurückbringt.

Weitere Wege zum Start: das Kontextmenü auf ausgewähltem Text und eine Auswahl per Tastatur oder Touch.

## 4. Dem Begriff wieder begegnen

Öffnen Sie ein anderes Paper, das `LoRA`, `low-rank adaptation` oder `LoRAs` erwähnt. Der Begriff ist unterstrichen. Fahren Sie mit dem Zeiger darüber, um zu sehen, wann und wo Sie ihn nachgeschlagen haben und was Sie damals verstanden haben. Sie können ihn als gemerkt markieren, noch einmal erklären lassen, die beiden Verwendungen vergleichen oder ihn stummschalten.

## 5. Ansehen, was Sie haben

Öffnen Sie die Seite **Verlauf** (verlinkt von den Einstellungen und der Einrichtung). Sie listet jeden Begriff nach Konzept auf, mit Suche, Folgeunterhaltungen, einer Wiederholungswarteschlange und einem Graphen, wie Ihre Konzepte zusammenhängen. Dort können Sie auch Ihre Aufzeichnungen exportieren und aus einer Sicherung wiederherstellen.

## Etwas lesen, das nicht auf arXiv steht

- **Eine Webseite:** Klicken Sie einmal auf die Schaltfläche in der Symbolleiste. Um eine Website danach automatisch zu scannen, fügen Sie sie in den Einstellungen unter _Websites_ hinzu.
- **Ein PDF:** Klicken Sie auf dem PDF auf die Schaltfläche in der Symbolleiste. arXiv-PDFs öffnen sich als HTML-Version; andere PDFs öffnen sich im eigenen Reader von Harkback. Ein PDF auf Ihrem Computer braucht beim ersten Mal zwei Freigaben; siehe [Fehlerbehebung](../troubleshooting.md#a-pdf-on-my-computer-will-not-open).
- **Etwas Vertrauliches:** Markieren Sie die Website oder die Quelle zuerst als sensibel. Siehe [Datenschutz und sensible Quellen](../privacy.md).

## Weiter

[Benutzerhandbuch](../user-guide.md) · [Modelle und Anbieter](../models.md) · [Fehlerbehebung](../troubleshooting.md)
