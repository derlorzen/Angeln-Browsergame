# Testbericht – Version 0.1

**Testumgebung:** Cloud-Container ohne GPU, 4 vCPU (Intel Xeon @ 2,8 GHz), 15 GB RAM, Linux, Node 22.22,
Chromium 141 (headless, Playwright 1.55). WebGL läuft dort über **SwiftShader** (Software-Emulation der GPU).
Es stand **kein** echter Laptop, kein zweites Gerät und kein zweiter Internetanschluss zur Verfügung.

## 1. Automatisierte Tests (`npm test`, Vitest) – 88/88 bestanden

| Bereich | Geprüft |
|---|---|
| Karte | deterministisch; Kappeln ↔ Arnis ↔ Brarup-Markt ↔ Moor auf 5 Seeds verbunden; Schlei, Ufer, Knicks, Tore, Lehm vorhanden |
| Startfairness | auf 10 Seeds haben beide Startplätze Bauplätze für Lehmgrube, Heringszaun, Bauernhof, Kaserne |
| Ressourcenabbau | Holz schlagen und abliefern erhöht den Vorrat |
| Produktionskette | Hof (erst nach Fertigstellung) → Getreide → Mühle → Waren → Markt → Taler + Prestige; zu wenig Waren → Fehlermeldung |
| Räucherei | verbraucht Fisch + Holz, erzeugt Waren |
| Bevölkerung | Grenze stoppt Ausbildung mit Hinweis, Wohnhaus hebt sie an |
| Bauplätze | belegt, Wasser, unerforscht, zu weit entfernt, fehlende Voraussetzung, Lehm-/Uferpflicht, fehlende Mittel; Abbruch erstattet 75 % |
| Bewegung | Späher läuft quer über die Karte und betritt nie Knick-, Wasser- oder Gebäudekacheln; A* um Wände, Teilweg bei unerreichbarem Ziel |
| Kampf | Soldaten verteidigen automatisch, Schaden, Tod, Entfernung, Statistik; Dorfzentrum schießt selbst |
| Sieg | militärisch (Dorfzentrum zerstört) und wirtschaftlich (Prestigeziel) |
| Brarup-Markt / Moor | Kontrolle, Prestige-Zufluss, „umkämpft“; einmalige Moor-Belohnung |
| Regeltreue | fremde Einheiten/Gebäude nicht steuerbar; Müllbefehle werfen nicht und ändern nichts; „Aufgeben“ wirkt nur auf den Absender |
| Speichern/Laden | identischer Zustand, danach identischer Verlauf |
| KI | baut alle Gebäudearten, bildet > 3 Soldaten aus, verkauft Waren, greift das gegnerische Dorfzentrum an, Partie endet mit Sieger |
| Balance | KI gegen KI (4 Seeds, beide Stufen): Partien enden nach 12–15 Minuten mit Sieger |
| Codes | Rundreise, Toleranz für Zeilenumbrüche; Ablehnung bei falscher Art, Version, Beschädigung, ungültigen Zeichen, Überlänge, Alter, falscher SDP/Sitzungskennung, fremdem JSON, Dekompressionsbombe |
| Protokoll | Befehls-Whitelist, ID-/Koordinatengrenzen, Namensbereinigung, Gast darf keine Zustände senden, Ratenbegrenzung |
| Kriegsnebel | verborgene Gegner, gegnerische Ressourcen und Ereignisse werden nicht gesendet; „hid“/„gone“-Semantik; Deltas |
| Parteien | jede Partei hat eigene Spezialeinheit nur in ihrer Kaserne (fremde werden mit Meldung abgelehnt); Friesen zahlen Arbeiter mit Fisch; Schwansener verkaufen teurer; Boni greifen; Spielstand behält Parteien |
| Grabenspringer | überquert einen geschlossenen Knick und ist schneller am Ziel als ein Landsknecht, der nie eine Knickkachel betritt |
| Knickwächter / Musketier | Knickwächter neben Knick erleiden weniger Schaden; Musketier trifft auf 6 Kacheln (Ereignis „Muskete“) |
| KI je Partei | vier Paarungen: jede KI bildet ihre Spezialeinheit aus, alle Partien enden mit Sieger |
| Karten (6 × 8 Seeds) | Startplätze mindestens zwei Drittel der Kartenbreite (128 Kacheln) auseinander; Startfelder begehbar; Startplätze, neutraler Markt und Fundstelle gegenseitig erreichbar; Weg zum Markt höchstens max(4, 15 %) und zur Fundstelle höchstens max(5, 20 %) Kacheln unterschiedlich lang; Holz im Umkreis 15 ≥ 45 Bäume je Seite und Verhältnis ≥ 0,8; Acker im Umkreis 10 ≥ 150 Kacheln und Verhältnis ≥ 0,75 (Küstenplätze haben etwas weniger Acker, dafür Fischgründe); ≥ 3 Heringszaun-Plätze je Seite mit Verhältnis ≥ 0,25; Bauplätze für Lehmgrube, Bauernhof, Kaserne, Markt |
| Ausbaustufen | Kosten und Dauer, Stufe II des Dorfzentrums (+LP, +Wohnraum), Voraussetzungen (Dorfzentrum derselben Stufe, Markt für Stufe III), Abbruch mit voller Erstattung, Bauernhof mit mehr Feldern und schnellerem Ertrag, Markt mit mehr Talern (nicht mehr Prestige), Stufe im Spielstand und im Zustand für den Spieler |
| Prestige | Ziel „aus“ verhindert den wirtschaftlichen Sieg; Schwansener +50 % Prestige je Verkauf; Protokoll akzeptiert nur die wählbaren Ziele |
| Geländehinweise | nur für erkundete Kacheln, mit Gelände und nächstem Ortsnamen |
| Zufallskarte | gleicher Seed ergibt dieselbe Karte (Mehrspieler); 12 Seeds ergeben ≥ 5 unterschiedliche Grundformen und ≥ 6 verschiedene Ortsnamen; Fairnessprüfung mit 40 Seeds |
| Zeitalter | Aufstieg nur mit 2 Voraussetzungsgebäuden, Kosten und Dauer, Prestige; Gebäude und Einheiten an das Zeitalter gebunden, Landsknechte ab dem 20. Jh. abgelöst; Vertikalfarm erzeugt Getreide; Forschung wirkt parteiweit (auch auf vorhandene Soldaten), späte Forschung abgelehnt, Abbruch erstattet; Drohne fliegt über Wasser; Zeitalter im Zustand für beide Spieler, im Spielstand und im Protokoll; KI erreicht in 40 Minuten das 20. Jh. und baut Epochengebäude |
| Runde 4 | Arbeiter reparieren per Rechtsklick bis zu vollen LP und verbrauchen höchstens ⅓ der Holzkosten; ohne Holz Abbruch; Reparaturbefehl im Protokoll; jedes Grundgebäude hat mindestens eine Forschung im 17. Jh.; „Bessere Flügel“ beschleunigt die Mühle um 20 %; Kachelöfen +1 Wohnraum, Gezogene Läufe nur für Fernkämpfer; Parteigebäude nur für die eigene Partei baubar; Zollhaus bringt Taler, Meierei Waren, Gestüt bildet Gutsreiter schneller aus; Rechtsklick auf den neutralen Markt besetzt ihn |
| Lager, Abreißen, Verarbeitung | Lagergrenze 400 am Start, Speicher +250 (Stufe III +600), Überschuss verfällt mit Meldung, Taler unbegrenzt, Hof ruht bei vollem Lager, Grenze im Zustand für den Spieler; Abreißen erstattet 50 %, Dorfzentrum nicht abreißbar, Befehl im Protokoll; Mühle lässt 40 Getreide übrig und lässt sich anhalten/fortsetzen |
| Vier Spieler (`maps4.test.ts`) | alle sieben Karten × 4 Seeds mit 160 × 160 Kacheln: vier begehbare, gegenseitig erreichbare Startplätze mit mindestens 35 % der Kartenbreite Abstand (gemessen 56–109 Kacheln), Marktwege höchstens 45 % unterschiedlich, Holz ≥ 45 je Platz und Verhältnis ≥ 0,75, Acker ≥ 130 und Verhältnis ≥ 0,6, Fischplätze ≥ 3, Bauplätze; vier KIs (dreimal dieselbe Partei) spielen 15 Minuten ohne Fehler (0,7 ms je Takt) |
| Spielcode-Vermittlung (`rooms.test.ts`) | Raum eröffnen, Beitritt mit beliebig geschriebenem Code, Angebot/Antwort werden nur zwischen Host und Gast weitergereicht, fremde Token abgewiesen, nach Spielbeginn keine Beitritte, höchstens drei Mitspieler, unbekannter Code mit verständlicher Meldung, übergroße Nachricht abgewiesen, Wiederverbinden mit Last-Event-ID liefert Verpasstes nach |
| KI je Karte | KI gegen KI auf jeder Karte 8 Minuten ohne Fehler, beide Seiten ≥ 6 Gebäude |

## 2. Browser-Ende-zu-Ende: Mehrspieler (`npm run e2e`) – 32/32 bestanden

Zwei **getrennte Chromium-Prozesse** auf demselben Rechner, ICE-Modus „ohne ICE-Dienste“, mit dem Entwicklungsserver
**und** dem Produktionsbuild (`vite preview`) jeweils bestanden, mit WebGL- und mit Canvas-Renderer:

- Einladungscode (~650–700 Zeichen) und Antwortcode (~650 Zeichen) über die echte Oberfläche erzeugt
- Ungültiger, abgeschnittener, vertauschter Code → verständliche Meldung; doppelte Antworterzeugung abgefangen
- DataChannel öffnet sich, gemeinsame Lobby, Namens- und **Parteiaustausch** (Gast Dänen, Host Nordfriesen → in der Partie übernommen), Start erst wenn beide bereit
- **Kartenwahl** des Hosts (Nordfriesische Marsch) erscheint beim Gast; beide Seiten spielen auf derselben Karte
- Gast sieht nur eigene Einheiten, keine verborgenen Gegner, keine gegnerischen Ressourcen; gleicher Takt wie der Host
- Gast wählt per Linksklick, befiehlt per Rechtsklick → Host führt aus → Gast sieht die Bewegung
- Manipulationsversuche des Gastes (fremde Einheit bewegen, erfundener Befehl, eigener „Zustand“, doppelte und
  veraltete Sequenznummern, Müll, kaputtes JSON) bleiben wirkungslos, Host läuft weiter
- Host schließt die Seite → Gast: „Der Host hat die Partie beendet … keine automatische Hostmigration“
- Antwort auf eine veraltete Einladung abgelehnt; erneuter Aufbau mit neuer Einladung gelingt
- Gast schließt die Seite → Host erhält Meldung, KI übernimmt die Siedlung
- keine Skriptfehler

**STUN-Modus im Container:** Einladung entsteht nach ~11 s (Zeitlimit der ICE-Sammlung), nur Kandidaten vom Typ
`host`, weil ausgehendes UDP zum STUN-Server dort nicht möglich ist; die Oberfläche weist darauf hin.

## 2b. Browser-Ende-zu-Ende: Spielcode und vier Plätze (`node e2e/run-e2e-code.mjs`)

Drei **getrennte Chromium-Prozesse** (Host + zwei Mitspieler) auf demselben Rechner, Vermittlung über den
Produktionsserver (`node server/server.mjs`) bzw. die Vite-Vorschau, ICE-Modus „ohne ICE-Dienste“:

- Host eröffnet ein Spiel und erhält einen sechsstelligen Spielcode; ein unbekannter Code wird verständlich abgelehnt
- Mitspieler 1 tritt **nur mit dem Code** bei (klein geschrieben, ohne Bindestrich), Mitspieler 2 über den
  **Einladungslink** (`?spiel=CODE` füllt den Code aus)
- Platz 4 wird mit einer KI besetzt; drei Spieler wählen dieselbe Partei (Angeliter)
- Partie startet bei allen drei Menschen: vier Parteien, Karte 160 × 160, jeder Mitspieler mit eigener Spielernummer,
  sieht nur eigene Einheiten; ein Befehl von Mitspieler 2 wird beim Host ausgeführt
- Mitspieler 1 schließt die Seite → KI übernimmt, Mitspieler 2 spielt weiter; keine Skriptfehler

Ergebnis: siehe Abschnitt 5, Punkt 13 (Stabilität über viele Wiederholungen).

## 3. Browser-Ende-zu-Ende: Einzelspieler (`npm run e2e:sp`) – 20/20 bestanden

Rahmenauswahl, Holz schlagen per Rechtsklick, Bauvorschau per Hotkey, ungültiger Platz rot + Begründung, gültiger Platz
→ Baustelle + Kosten, Arbeiter errichten das Gebäude, Speichern, Laden, **Ausbau des Dorfzentrums per Taste C auf
Stufe II**, **Geländehinweis nach kurzem Verweilen**, **Zurück-Taste öffnet nur das Menü und sichert**, **nach Neuladen
„Letzte Partie fortsetzen“ mit identischem Takt und Ausbaustufe**, **Zeitalter-Aufstieg per Taste A ins 18. Jahrhundert
(Anzeige oben „18. Jh.“)**, **Zähler untätiger Arbeiter stimmt, Klick darauf wählt einen aus**, keine Skriptfehler.

## 3c. Prestige-Tempo (KI gegen KI, normal, 12 Partien auf allen Karten)

Vorher (Prestigeziel 250, 2 Prestige je Verkauf): Sieg nach **11–16 Minuten**, fast immer wirtschaftlich.
Nachher (Ziel 400, 1 Prestige je Verkauf, Marktzufluss 1 alle 20 s): Partien dauern **15–37 Minuten**, meist
militärisch entschieden; 400 Prestige wurden in 2 von 12 Partien erreicht. Der Balance-Test (4 Seeds) liegt jetzt bei
9–43 Minuten (Testgrenze auf 60 Minuten angehoben). Gegen menschliche Spieler ist das Tempo nicht gemessen.
Gefundener und behobener KI-Fehler: Ohne Wald in Lagernähe blieb eine KI dauerhaft ohne Holz stecken; sie sucht jetzt
weiter entfernt und zieht bei Holzmangel Arbeiter von vollen Höfen ab.

## 3b. Karten: Sichtprüfung

`node e2e/showcase-maps.mjs` startet jede der sechs Karten im echten Spiel (WebGL), lässt die KI 5 Minuten aufbauen und
speichert je ein Bild der Startsiedlung und eine aufgedeckte Übersicht. Geprüft wurden u. a. Förde zwischen
Husby und Gravenstein, Danewerk als durchgehender Wall mit Toren, Eider mit Mooren und Rendsburger Insel,
Deiche, Gräben und Watt in der Marsch, Wattenmeer und Heide bei Ribe. **Abgleich mit TomTom:** 35 Ortslagen per Geocoding geprüft; korrigiert wurden u. a. Gråsten (≈2 km),
Hohner See (≈3 km falsch nördlich), Audorfer See (≈3,5 km falsch südlich) und das Westende des Danewerks
(Hollingstedt). Per Rückwärtssuche (Land = Gemeinde, Watt/See = keine Gemeinde) geprüft: 50 Punkte in der Marsch und
12 an der Förde. Dabei fiel auf, dass die Förde in meiner Karte über die Halbinsel Holnis lief – jetzt korrigiert. Für die
dänische Küste ist diese Prüfung nicht möglich (dänische Gemeinden reichen ins Meer).


## 3d. Zeitalter und KI-Stufen (KI gegen KI)

Gefundene und behobene Fehler: Eine KI ohne Arbeiter und ohne Getreide konnte sich nie erholen (Getreide ist jetzt am
Markt kaufbar, die KI nutzt das); beim Sparen für das 20. Jh. verkaufte die KI die nötigen Waren sofort wieder.
**Leicht gegen normal** (6 Seeds × beide Startplätze): vor den Zeitaltern gewann die normale KI nur **4 von 12**, nach den
Änderungen (leichte KI langsamer, weniger Arbeiter und Soldaten) **11 von 12**. Gegen eine schwache KI erreicht die normale
KI 400 Prestige teils schon nach rund 20 Minuten, weil der neutrale Markt unbestritten bleibt.

Grafik: `node e2e/sheet-ages.mjs buildings|units` (Entwicklungsserver) zeigt alle neuen Gebäude und Einheiten,
`node e2e/showcase-ages.mjs` eine Siedlung im 20. und 22. Jahrhundert im echten Spiel.

## 3a. Balance der Parteien (KI gegen KI, einmalige Auswertung)

Alle 12 Paarungen × 3 Seeds = 36 Partien, beide KI „normal“: Siege Angeliter 11, Schwansener 11, Nordfriesen 7,
Dänen 7 (je 18 Partien); 7 militärische, 29 wirtschaftliche Siege; Ø 12,2 Minuten. Vor der Nachjustierung gewannen
die Nordfriesen keine Partie (Fischmangel zu Beginn) – behoben durch Startfisch, günstigere Arbeiter und
KI-Bauvorrang für den Heringszaun. Die Werte stammen aus KI-Partien; mit Menschen ist weitere Feinabstimmung nötig.

## 4. Leistung (gemessen, mit Einschränkungen)

Szenario: 105 eigene Einheiten auf Dauerpatrouille Kappeln ↔ Brarup-Markt (lange Wege durch Knicks/Tore) plus ein
Gefecht 30 gegen 30 – insgesamt **~178 aktive Einheiten** (≈ 140–170 im Bild), Fenster 1366×768.

| Messgröße | Wert |
|---|---|
| Simulation je Takt (Budget 100 ms) | **0,6–1,3 ms** |
| Szenenaufbau PixiJS (JS, je Frame) | **1,2–1,7 ms** |
| WebGL-Übergabe (SwiftShader, CPU) | 3,7–8,2 ms |
| Bildrate WebGL im Container | ~4 fps – begrenzt durch die **Software-Rasterung** von SwiftShader |
| Bildrate Canvas 2D im Container (ohne SwiftShader-Flags) | 32–55 fps (Zoom 0,5 … 1), JS 1,3–4,4 ms je Frame |

**Bewertung:** Unser JavaScript-Anteil (Simulation + Szenenaufbau) liegt bei ~3 ms pro Frame und lässt damit viel
Reserve für 60 fps. Die tatsächliche Bildrate mit WebGL auf einem gewöhnlichen Laptop (integrierte GPU) konnte hier
**nicht gemessen werden** und ist **offen**. Zur Messung: Spiel starten, **F3** drücken (zeigt Renderer, Frame-Zeit,
fps, Einheiten). Bei Problemen mit alten Grafiktreibern kann unter *Einstellungen* auf Canvas 2D umgeschaltet werden.

## 5. Offene Punkte

1. **Internet-Verbindbarkeit nicht belegt.** Getestet wurde nur zwischen zwei Prozessen auf einem Rechner.
   Ein Test mit zwei Geräten an unterschiedlichen Anschlüssen steht aus → Anleitung in [NETZWERK.md](NETZWERK.md#testanleitung-über-zwei-internetanschlüsse-noch-offen-siehe-testbericht).
2. **Ausbaustufen sind nur als Wappen mit Strichen sichtbar**, die Gebäudegrafik selbst ändert sich nicht.
3. **Leistung auf echter Laptop-GPU** nicht gemessen (siehe Abschnitt 4).
4. **Andere Browser** (Firefox, Safari) nicht getestet; benötigt werden WebRTC DataChannels und `CompressionStream`
   (Firefox ≥ 113, Safari ≥ 16.4).
5. **Kartenbalance mit Menschen** nicht erprobt; die Fairness ist nur über Messgrößen (Wege, Holz, Acker, Fischplätze) und KI-Partien geprüft.
6. **Balance:** Wirtschaftliche Siege überwiegen; die Parteien liegen in KI-Partien zwischen 7 und 11 von 18 Siegen.
   Feinabstimmung mit menschlichen Testspielern steht aus.
7. **Nicht umgesetzt (bewusst nachgelagert):** Hafen mit Fischerbooten, Hostmigration, Mehrspieler-Spielstände
   (die automatische Sicherung des Hosts setzt eine Mehrspielerpartie gegen die KI fort), Teams/Bündnisse.
8. Die Sounds sind einfache Synthesizer-Klänge; Musik fehlt.
9. **Forschungen und Parteigebäude** sind nur per Einheitentest und KI-Partien geprüft; ob Zollhaus, Meierei, Gestüt und
   Salzsiederei untereinander ausgewogen sind, zeigt erst das Spiel mit Menschen. Der Mehrspieler-Ende-zu-Ende-Test lief
   einmal mit einer Zeitüberschreitung beim Verbindungsaufbau (10 s) ab und bestand beim zweiten Lauf mit 32/32.
10. **Lagergrenzen** verändern das Spieltempo. In KI-gegen-KI-Partien (5 Seeds, 40 Minuten) erreichten die KIs mit
    Lagergrenzen die Zeitalter 3/2/4/3/2, ohne sie 3/2/4/4/3; die KI baut Speicher, sobald Lager fast voll sind oder
    das nächste Zeitalter mehr verlangt, als hineinpasst. Mit Menschen ist das noch nicht erprobt.
11. **Größere Karten (128 × 128 statt 96 × 96):** Die Wege sind länger, Angriffe und Marktbesetzung dauern entsprechend
    länger. Spielstände und die automatische Sicherung aus der Version mit 96er-Karten lassen sich nicht mehr laden
    (klare Meldung im Hauptmenü).
12. **Einmaliger Ausreißer im Mehrspielertest:** Nach der Kartenvergrößerung schlug die Prüfung „Doppelte/veraltete
    Befehle werden nur einmal ausgeführt“ in einem von vier Läufen fehl (80 statt 40 Getreide abgebucht, also zwei
    statt einer Ausbildung). Drei Wiederholungen bestanden mit 32/32. Die Ursache ist nicht geklärt; möglich ist ein
    zeitversetzt eingetroffener Befehl aus einem früheren Testschritt. Beobachten.
