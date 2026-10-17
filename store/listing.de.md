# Chrome-Web-Store-Eintrag: Deutsch

**Name:** Harkback

**Zusammenfassung** (höchstens 132 Zeichen):
Erklärt Begriffe beim Lesen, merkt sich, was du verstanden hast, und holt es zurück, wenn dir der Begriff wieder begegnet.

**Kategorie:** Produktivität

**Sprache:** Deutsch

## Beschreibung

Harkback ist für Menschen, die Fachartikel und technische Dokumente lesen. Markiere einen Begriff, und er wird im Zusammenhang des Absatzes erklärt, den du gerade liest. Jede Erklärung wird in deinem Browser gespeichert. Taucht derselbe Begriff auf einer späteren Seite wieder auf, auch anders geschrieben, unterstreicht Harkback ihn und zeigt, was du beim letzten Mal verstanden hast.

Es will kein besserer Chatbot sein. Es ergänzt, was einem Chatfenster fehlt: Gedächtnis.

SO FUNKTIONIERT ES
• Markiere einen Begriff und klicke auf Erklären, nutze das Kontextmenü oder drücke Alt+Shift+E. Die Erklärung nutzt den Absatz und den Abschnitt um den Begriff und zitiert die Seite, wenn sie ihn definiert.
• Wiederhole Begriffe, bei denen du unsicher bist. Harkback plant sie mit dem Gedächtnismodell FSRS-7: Bewerte dich mit Nochmal, Schwer, Gut oder Leicht, und jeder Begriff kommt kurz vor dem Vergessen zurück. Begriffe, die auf anderen aufbauen, werden in der richtigen Reihenfolge wiederholt, und ein unklarer Begriff weist auf Voraussetzungen hin, die dir vielleicht fehlen. Ein Rechtsklick auf das Symbol in der Symbolleiste öffnet Wiederholung oder Verlauf.
• Sieh dir eine Seite vorab an: Welche ihrer Schlüsselbegriffe sind neu für dich und welche kennst du schon?
• Auf späteren Seiten werden Begriffe unterstrichen, die du schon nachgeschlagen hast. Zeige darauf, um die frühere Erklärung zu sehen, wo du dem Begriff begegnet bist und wie gut du ihn verstanden hast. Abkürzungen werden ihren vollen Namen zugeordnet („LLM“ und „Large Language Model“).
• Stelle auf jeder Karte Rückfragen. Das Gespräch wird mit der Erklärung gespeichert. Brich eine Antwort mittendrin ab oder versuche es mit einem anderen Modell erneut, wenn eines fehlschlägt.
• Deine Einträge bilden einen Wissensgraphen aus Konzepten, Aliasen, Voraussetzungen, Varianten und verwandten Begriffen. Bestätige eine Beziehung, bei der sich das Modell unsicher war, und teile ein Konzept auf, das zwei verschiedene Begriffe vereint hat (das macht auch ein Zusammenführen rückgängig). Durchsuche ihn, wiederhole ihn, sieh ihn als Karte an, exportiere ihn als Markdown-Notizen (mit [[Links]] für Obsidian), als Anki-Karten oder als JSONL-Sicherung, die du wieder importieren kannst.
• Trage zur Datenallmende bei: Harkback erstellt aus deinen Nachschlagevorgängen in offen lizenzierten arXiv- und DOI-Artikeln eine anonyme Datei (Kennung des Artikels, Begriff, Fachgebiet, wie gut du ihn verstanden hast, der Monat), zeigt sie dir vollständig und speichert sie auf deinem Computer.

PDFS UND FACHARTIKEL
arXiv-Artikel funktionieren automatisch. Andere PDFs öffnen sich in Harkbacks eigenem Reader, mit gesetzten Formeln. Gescannte PDFs werden beim Scrollen per OCR auf deinem Computer gelesen und verhalten sich dann wie Text. Englisch ist eingebaut; weitere Sprachen lädst du einmalig aus einer Liste herunter. Andere Websites werden nur gescannt, wenn du auf die Schaltfläche in der Symbolleiste klickst oder die Website erlaubst. Unter Einstellungen → Websites kannst du außerdem GitHub (READMEs, Issues und Pull Requests), Notion, Google Docs (veröffentlichte oder mobile Ansicht) und YouTube-Untertitel hinzufügen oder gängige Forschungsseiten wie bioRxiv, PubMed und OpenReview mit einer Schaltfläche ergänzen. In den automatischen Untertiteln von YouTube werden Begriffe auch dann erkannt, wenn die Spracherkennung sie kleinschreibt, Buchstabe für Buchstabe ausschreibt oder leicht falsch versteht.

DU WÄHLST DAS MODELL
Harkback hat keinen Server und kein Konto. Du verbindest dein eigenes Modell: entweder eines, das auf deinem Computer läuft, sodass dein Text ihn nie verlässt, oder einen gehosteten Dienst, den du mit deinem eigenen API-Schlüssel nutzt. Auch Modelle in deinem eigenen Netzwerk funktionieren. Das in Chrome eingebaute Modell (Gemini Nano) läuft auf deinem Computer, ohne dass etwas eingerichtet werden muss. Es ist ein kleines Modell, also langsamer als ein Cloud-Modell und am besten für kurze Erklärungen.

DATENSCHUTZ
• Deine Einträge bleiben in deinem Browser. Der Entwickler erhält nichts.
• An das konfigurierte Modell wird nur gesendet, was du auslöst: bei einer Erklärung der markierte Text, sein Absatz, der Abschnitt und der Seitentitel; bei einer Seitenvorschau der Seitentext; bei „Meine Antwort prüfen“ der Begriff und deine Antwort.
• Markiere eine Quelle als sensibel, und ihr Inhalt wird nur an ein lokales Modell gesendet, nie an ein entferntes. Eine Seite, die privat wirkt (ein privates GitHub-Repository, eine unveröffentlichte Notion- oder Google-Docs-Seite), wird an kein Modell gesendet, bis du Nur lokal oder Trotzdem senden wählst.
• Private Fenster erklären, speichern aber nichts.
• Auf YouTube liest Harkback nur die Untertitel, die der Player gerade anzeigt, und erst, nachdem du die Website hinzugefügt hast.
• Die Datei für die Datenallmende enthält keine Zitate, Erklärungen, Adressen oder genauen Zeiten und nie eine sensible Quelle. Es wird nichts hochgeladen: Du entscheidest, ob du sie irgendwo einreichst.
• Harkback selbst lädt nur optionale OCR-Sprachdaten herunter, einmalig und per Prüfsumme geprüft. Wenn du das in Chrome eingebaute Modell wählst, lädt Chrome es herunter, sobald du auf Herunterladen klickst.
• Keine Analyse, keine Werbung, kein Tracking. Open Source unter Apache-2.0.
• API-Schlüssel werden unverschlüsselt im Speicher der Erweiterung abgelegt; nutze einen Schlüssel mit Ausgabenlimit.

SPRACHEN
Die Oberfläche gibt es in zehn Sprachen, und Erklärungen können in 16 Sprachen verfasst werden.

Quellcode, Datenschutzerklärung und Support: siehe die Links auf dieser Seite.
