# Angeln – Fürsten der Schlei

Echtzeit-Strategiespiel im Browser. Zwei Siedlungen an der Schlei – **Kappeln** und **Arnis** – ringen um Fischgründe,
Handel und die Wege zum **Brarup-Markt** in Süderbrarup. Siedlungsbau und Produktionsketten wie bei Anno 1602,
direkte Einheitensteuerung wie bei Command & Conquer, Erkundung und Gefechte wie bei Age of Empires – mit eigenen
Grafiken, Regeln und Klängen. Schauplatz: eine fiktive, frühneuzeitliche Landschaft Angeln um 1600 – und fünf weitere Karten zwischen Rendsburg und Esbjerg.

- Sechs Karten zwischen Rendsburg und Esbjerg (Schlei, Flensburger Förde, Danewerk, Eider, Nordfriesische Marsch,
  Ribe/Kongeå) und eine bei jedem Start neu erzeugte **Zufallskarte**, alle mit fair ausgeglichenen Startplätzen
- **Vier Zeitalter** (17., 18., 20. und 22. Jahrhundert) mit je neuen Gebäuden, Einheiten und Forschungen
- **Lagergrenzen und Speicher**, **Abreißen**, anhaltbare Verarbeitung, **31 Forschungen** an den Gebäuden (zehn schon im 17. Jh., z. B. „Bessere Flügel“ an der Mühle), **ein eigenes Gebäude je
  Partei**, **Reparieren** beschädigter Gebäude, Anzeige und Schnellwahl **untätiger Arbeiter**
- Gebäude-Ausbaustufen II und III, automatisches Sichern mit „Letzte Partie fortsetzen“, dezente Geländehinweise
- Vier spielbare Parteien mit eigenem Baustil, eigenen Figuren, Boni und Spezialeinheit (siehe unten)
- Einzelspieler gegen eine bis drei KIs (zwei Stufen, Partei wählbar), mit Lehrmeister-Einstieg
- **Mehrspieler bis zu vier Spieler mit Spielcode:** Der Host eröffnet ein Spiel und nennt einen kurzen Code
  (z. B. `K7M-2QX`) oder schickt einen Einladungslink; Mitspieler geben nur diesen Code ein. Freie Plätze kann die KI
  übernehmen, jede Partei darf mehrfach gewählt werden. Die Partie läuft direkt zwischen den Browsern (WebRTC); der
  Server vermittelt nur den Verbindungsaufbau. Ohne Vermittlung bleibt der manuelle Code-Austausch als Rückfall.
- Drei oder vier Spieler bekommen eine größere Karte (160 × 160 Kacheln) mit vier verteilten Startplätzen
- Militärischer Sieg (gegnerisches Dorfzentrum zerstören) oder wirtschaftlicher Sieg (Prestige aus Handel)
- Darstellung mit **PixiJS 8 (WebGL)**, automatischer Rückfall auf Canvas 2D
- **Smartphone und Tablet in Hoch- und Querformat:** Touch-Auswahl, Wischen, Pinch-Zoom, Rahmenauswahl und bestätigte Bauplatzierung
- Alle Grafiken und Klänge werden beim Start im Browser erzeugt; keine externen Assets, keine KI-Aufrufe zur Laufzeit

Weitere Dokumente: [docs/NETZWERK.md](docs/NETZWERK.md) (Code-Austausch, Netzwerkgrenzen, Synchronisation),
[docs/TESTBERICHT.md](docs/TESTBERICHT.md) (ausgeführte Tests, Messwerte, offene Punkte),
[docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) (Aufbau des Codes).

## Auf Smartphone und Tablet spielen

Die Oberfläche passt sich an Hoch- und Querformat sowie an Aussparungen und den unteren Systembereich an.
Eine laufende Partie kann gedreht werden. Die Retro-Grafik bleibt erhalten.

- **Wählen:** Einheit oder Gebäude antippen. Wischen bewegt die Karte; zwei Finger verschieben und zoomen.
- **Befehl:** erst Einheiten wählen, dann „Befehl“ und das Ziel antippen: bewegen, Holz schlagen, arbeiten,
  reparieren oder angreifen. Bei einem ausgewählten Ausbildungsgebäude wird der Sammelpunkt gesetzt.
- **Rahmen:** Knopf antippen und einen Rahmen um mehrere eigene Einheiten ziehen. Zwei Finger bewegen weiterhin die Karte.
- **Bauen:** Arbeiter wählen, Gebäudeknopf antippen, Bauplatz auf der Karte antippen und mit **Bauen ✓** bestätigen.
  Ungültige Plätze lassen sich nicht bestätigen. **Abbruch** beendet die Vorschau oder einen Angriffsauftrag.
- **Dorf / + / −:** zum Dorfzentrum springen beziehungsweise zoomen. Die Minikarte reagiert auf Tippen und Ziehen.
- **Ansicht:** untere Spielleiste aus- oder einblenden, um mehr Kartenfläche zu sehen.
- **Kosten und Voraussetzungen:** einen Befehlsknopf kurz gedrückt halten. Tippen auf die Kostenanzeige schließt sie.
  Die Rohstoffleiste lässt sich seitlich wischen; einzelne Rohstoffe zeigen beim Antippen ihre Erklärung.
- **Menü:** speichern, Ton und Lehrmeister umschalten oder die Steuerung nachlesen.

Im Hochformat liegen Auswahl und Minikarte über der Befehlskarte; im Querformat stehen sie nebeneinander.
Menüs, Lobby und Details können innerhalb ihres Bereichs gescrollt werden. Maus und Tastatur bleiben nutzbar.

Automatisierte Touch-Prüfungen (mit laufendem Entwicklungsserver):

```bash
npm run e2e:mobile       # fünf Gerätegrößen, Rotation, Gesten, Bau und Desktop-Bedienung
npm run e2e:mobile:net   # mobile Lobby und Touch-Befehl zwischen zwei echten WebRTC-Peers
```

Bei Bedarf `BASE_URL` und `CHROME` auf die Serveradresse und den Browserpfad setzen. Unter Windows wird standardmäßig
Chrome in `C:/Program Files/Google/Chrome/Application/chrome.exe` verwendet. Die Prüfungen emulieren mobile Chromium-
Browser; Tests auf echten Android- und iOS-Geräten stehen noch aus.

## Lokal starten

Voraussetzung: Node.js ≥ 20 (getestet mit 22) und npm.

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5173
```

Weitere Befehle:

```bash
npm run build        # Typprüfung + Produktionsbuild nach dist/
npm run preview      # dist/ lokal ausliefern (http://localhost:4173), inkl. Spielcode-Vermittlung
npm start            # Produktionsserver: dist/ + Spielcode-Vermittlung (PORT, Standard 80)
npm test             # Unit-/Simulationstests (Vitest)
npm run e2e          # Mehrspieler-Ende-zu-Ende-Test mit zwei Chromium-Prozessen (benötigt laufenden Server, s. u.)
node e2e/run-e2e-code.mjs  # Spielcode, drei Browser + KI (BASE_URL=http://localhost:4173/)
```

Für Mehrspieler-Tests auf **einem** Rechner genügen zwei Browserfenster (z. B. ein normales und ein privates Fenster),
beide auf derselben Adresse.

## Hosting

**Empfohlen (mit Spielcode):** `npm start` bzw. das beiliegende `Dockerfile` startet einen kleinen Node-Server ohne
weitere Abhängigkeiten (`server/server.mjs`). Er liefert das gebaute Spiel aus und vermittelt unter `/api/rooms`
die Spielcodes: Über ihn laufen nur die WebRTC-Verbindungsangebote (wenige Kilobyte je Mitspieler), keine Spielzüge,
keine Spielstände, keine Konten. Räume verfallen nach drei Stunden ohne Aktivität; Grenzen gegen Missbrauch sind
eingebaut (max. 500 Räume, 3 Mitspieler je Raum, 64 KB je Anfrage, Begrenzung neuer Räume je Adresse).

- **Coolify (oder jeder Docker-Host):** *New Resource → Application → GitHub-Repository*, Branch wählen, Build Pack
  **Dockerfile**, Port **80**, eine Domain mit `https://` eintragen – Coolify holt das Let's-Encrypt-Zertifikat.
  Eine bestehende Installation übernimmt die Änderung beim nächsten Deploy automatisch (das Bild enthält jetzt den
  Node-Server statt nginx; Port und Einstellungen bleiben gleich).

**Rein statisch (ohne Spielcode):** `dist/` funktioniert auch auf jedem statischen Webspace. Dann gibt es keine
Spielcode-Vermittlung; das Spiel meldet das und bietet den manuellen Austausch der langen Codes an.

- **GitHub Pages:** Inhalt von `dist/` in einen Branch `gh-pages` oder per GitHub Actions („Deploy static content“) veröffentlichen.
- **Netlify / Cloudflare Pages:** Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`.
- **Eigener Webserver (nginx, Apache, Caddy):** `dist/` in das Web-Wurzelverzeichnis kopieren, HTTPS aktivieren.


HTTPS ist wichtig: WebRTC und die Zwischenablage-Funktion verlangen einen „sicheren Kontext“ (HTTPS oder `localhost`).

## Parteien (bewusst klischeehaft)

| Partei | Fokus | Boni | Spezialeinheit | Baustil |
|---|---|---|---|---|
| **Angeliter** „Wat mutt, dat mutt.“ | Landwirtschaft | Hof +30 % Getreide, Mühle 20 % schneller, Wohnhaus −20 % | **Knickwächter** – billige Bauernwehr mit Sense, neben Knicks besonders zäh | Reet, Fachwerk mit roter Ausfachung, Rotvieh |
| **Schwansener** „Wer reitet, der regiert.“ | Handel, Reiterei | Markt +25 % Taler und +50 % Prestige je Verkauf, Zukauf −20 %, Späher +30 % LP; Wohnhaus +10 % | **Gutsreiter** – schwer gepanzerter Lanzenreiter | weiß verputzte Herrenhäuser, Ziegel-Walmdächer, Alleen, Pferde |
| **Nordfriesen** „Lewwer duad üs Slaav!“ | Fischerei | Heringszaun +50 %, Räucherei 25 % schneller, Arbeiter kosten 30 Fisch statt Getreide, +120 Fisch zum Start; Hof −20 % | **Grabenspringer** – überspringt mit dem Springstock Knicks | Haubarg, Friesenhaus mit Frontispiz, Klinker, Schafe |
| **Dänen** „For Konge og Fædreland!“ | Militär | Soldaten −15 %, Kaserne 25 % schneller, Amtshaus +30 % LP und stärkere Schützen | **Musketier** – größte Reichweite, hoher Schaden, langes Nachladen | Backstein-Renaissance mit Sandsteinbändern, Treppengiebel, Kupferhelme |

**Eigenes Gebäude je Partei** (nur diese Partei kann es bauen, Taste **X** auf der Bauseite der Arbeiter):

| Partei | Gebäude | Wirkung |
|---|---|---|
| Angeliter | **Meierei** (braucht Bauernhof) | macht aus 2 Getreide 3 Waren (Butter und Käse) |
| Schwansener | **Gestüt** (3×3, braucht Kaserne) | bildet Späher und Gutsreiter 30 % schneller aus als die Kaserne |
| Nordfriesen | **Salzsiederei** (am Ufer) | siedet ohne Arbeiter laufend Salz → Waren |
| Dänen | **Zollhaus** | erhebt laufend Sundzoll → Taler |

Jede Partei kann jeden Startplatz besetzen; die KI spielt je Partei unterschiedlich (z. B. greifen die Dänen früher an).

## Karten

Alle Karten sind 128 × 128 Kacheln groß; die beiden Startplätze liegen mindestens zwei Drittel der Kartenbreite
auseinander (Luftlinie 89–123 Kacheln). **Mit drei oder vier Spielern** wächst die Karte auf 160 × 160 Kacheln:
Zu den beiden Startorten kommen zwei weitere, die der Kartengenerator auf festem Land so wählt, dass alle vier
möglichst weit voneinander (mindestens 56, meist 75–110 Kacheln) und ähnlich weit vom Markt entfernt liegen; der
neutrale Markt rückt dafür in die Mitte. Auf der Schlei kommen Brücken nach Schwansen hinzu (Missunde, Lindaunis),
auf der Förde eine Fähre Holnis–Brunsnæs, an der Eider weitere Furten. Völlig gleich lang sind die Wege zum Markt
bei vier Spielern nicht überall: Auf wasserreichen Karten (Marsch, Eider, Schlei) unterscheiden sie sich um bis zu
rund 45 %, auf den übrigen deutlich weniger.

| Karte | Startorte | Neutraler Markt | Fundstelle | Besonderheiten |
|---|---|---|---|---|
| **Die Schlei** (Angeln) | Kappeln / Arnis | Brarup-Markt | Thorsberger Moor | Meeresarm, Knicklandschaft |
| **Flensburger Förde** | Husby / Gravenstein | Flensburger Markt | Findling am Fördeufer | Förde zwischen den Parteien, zu Lande nur um die Fördespitze; Glücksburg dazwischen |
| **Danewerk** | Schuby / Kropp | Viehmarkt am Ochsenweg | Haithabu | durchgehender Wall mit wenigen Toren, Heide im Westen, Haddebyer Noor |
| **Eider und Rendsburg** | Owschlag / Jevenstedt | Rendsburger Markt (Eiderinsel) | Grenzstein an der Eider | Fluss als Grenze mit Brücken und Furt, Moore, Gräben in der Niederung |
| **Nordfriesische Marsch** | Bredstedt / Tönning | Husumer Ochsenmarkt | Rungholt-Spuren | Watt (begehbar, langsam), Priele, Deiche mit Stöpen, Gräben statt Knicks |
| **Ribe und Kongeå** | Varde / Tønder | Ochsenmarkt Ribe | Grabhügel auf der Heide | Wattenmeer mit Fanø und Rømø, Heide, Kongeå mit Furten |
| **Zufallskarte** | zufällige Orte der Region | Markt in einem zufälligen Ort | Hünengrab, Runenstein, Opfermoor … | bei jedem Start neu: Startachse, Küste (ggf. mit Watt und Deich), Fluss mit Furten, Seen, Moore, Heide, Knicks oder Gräben |

Die Ortslagen (Startorte, Märkte, Seen, Danewerk-Endpunkte) wurden mit dem TomTom-Kartendienst geprüft und
korrigiert, ebenso der Verlauf der Flensburger Förde um Holnis und die Küstenlinie von Eiderstedt und Husum
(Rückwärtssuche: Watt und offene See gehören dort zu keiner Gemeinde). Flussläufe und die dänische Küste stammen
weiterhin aus allgemeinem Kartenwissen, weil die dänischen Gemeindeflächen bis ins Meer reichen und sich so nicht
abtasten lassen. Die Karten sind maßstabstreu und mit Norden oben eingepasst. Damit keine Seite bevorzugt wird, gleicht der Generator danach aus:
Markt und Fundstelle liegen für beide gleich weit entfernt (gemessen als Laufweg), Holz und Acker in Reichweite werden
angeglichen, jeder Startplatz hat Lehmboden, und Startplätze ohne Ufer bekommen einen Fischteich. Die Abweichungen von
der echten Geografie sind im Spiel unter *Hintergrund & Quellen* je Karte gekennzeichnet. Im Mehrspieler wählt der Host
die Karte.

## Kurze Spielanleitung

**Ziel:** Gegnerisches Dorfzentrum zerstören *oder* als Erster das Prestigeziel erreichen (wählbar 250 / **400** / 600
oder „aus“ für nur militärischen Sieg). Prestige gibt es für Verkäufe (1 je 10 Waren, mit besetztem neutralem Markt 2),
für die Besetzung des neutralen Markts (1 alle 20 s) und einmalig für die Fundstelle.

| Rohstoff | Herkunft | Verwendung |
|---|---|---|
| Holz | Arbeiter schlagen Bäume (Rechtsklick auf Baum), Abgabe am Dorfzentrum/Holzfällerlager | fast alle Gebäude, Räucherei, Armbrustschützen |
| Getreide | Bauernhof mit Feldern, bis zu 3 zugewiesene Arbeiter | Arbeiter, Soldaten, Mühle |
| Fisch | Heringszaun am Ufer – Meer, Fluss, See, Watt oder Fischteich (arbeitet selbstständig) | Späher, Landsknechte, Räucherei |
| Lehm | Lehmgrube auf Lehmboden, bis zu 3 Arbeiter | Gebäude |
| Waren | Bockmühle (4 Getreide → 3 Waren), Räucherei (3 Fisch + 1 Holz → 2 Waren) | Verkauf am Markt |
| Taler | Warenverkauf am Markt | Soldaten, Holz/Lehm zukaufen |

- **Bevölkerung** begrenzt Arbeiter und Soldaten; Wohnhäuser +5 (max. 80).
- **Lagerplatz:** Jeder Rohstoff außer Talern passt nur bis zur Lagergrenze (oben neben dem Vorrat, z. B. „270/400“).
  Das Dorfzentrum fasst 400 (Stufe II 550, Stufe III 700), jeder **Speicher** (Arbeiter, Taste **C**) +250, ausgebaut
  +400/+600. Ist ein Lager voll, verfällt der Überschuss, Höfe und Fanggründe ruhen („Speicher voll“), und die Zahl wird
  rot. Für die späten Zeitalter (bis 700 Lehm und 500 Waren) braucht man daher mehr Speicher. Arbeiter können im
  Speicher auch alle Rohstoffe abgeben.
- **Verarbeitung anhalten:** Mühle, Räucherei, Meierei, Manufaktur und Fabrik verbrauchen ihre Rohstoffe selbstständig,
  lassen aber immer mindestens 40 Getreide bzw. 30 Fisch übrig, damit noch Arbeiter ausgebildet werden können. Mit
  **Anhalten (Q)** am Gebäude verbrauchen sie gar nichts mehr. (Die KI hält ihre Rücklagen selbst zurück.)
- **Abreißen:** Fertiges Gebäude wählen, **Abreißen (V oder Entf)** zweimal drücken – erstattet die Hälfte der
  Baukosten (anteilig weniger bei Schäden). Das Dorfzentrum lässt sich nicht abreißen; Baustellen werden wie bisher
  abgebrochen (75 %).
- **Neutraler Markt** (⚑, je Karte ein anderer Ort, z. B. Brarup-Markt): Wer ihn allein mit Einheiten besetzt,
  verkauft teurer, erhält doppeltes Prestige je Verkauf und laufend Prestige → umkämpfter Verkehrsknoten.
  **So besetzt man ihn:** beliebige eigene Einheiten (auch Arbeiter) wählen und den Markt **rechts anklicken** – sie
  stellen sich in den gestrichelten Kreis um den Markt. Er gehört euch, solange nur eure Einheiten im Kreis stehen
  (der Kreis färbt sich dann in eurer Farbe); stehen dort Einheiten beider Seiten, gehört er niemandem. Ein Klick auf ⚑
  in der oberen Leiste zeigt den Markt und erklärt das.
- **Untätige Arbeiter:** Die Anzeige 💤 in der oberen Leiste zählt sie (leuchtet, sobald es welche gibt); Klick darauf
  oder Taste **.** wählt reihum den nächsten und zeigt ihn. Untätige Arbeiter tragen zudem ein kleines „z“.
- **Reparieren:** Beschädigte eigene Gebäude mit Arbeitern rechts anklicken – oder das Gebäude wählen und **Reparieren
  (Taste X)** drücken, dann holen sich die drei nächsten Arbeiter den Auftrag. Eine volle Reparatur kostet etwa ein
  Drittel des Holzpreises; ohne Holz bricht sie ab. Die Forschung „Feuerspritzen“ verdoppelt das Tempo.
- **Fundstelle** („?“, z. B. Thorsberger Moor): Die erste Einheit dort bringt einmalig Prestige und Taler.
- **Knicks** (Wallhecken) versperren Weg und Sicht; Wege und Tore führen hindurch. **Deiche** und das **Danewerk**
  ebenso (nur Stöpen/Tore), **Gräben** versperren nur den Weg. Watt ist begehbar, aber langsam.
- **Geländehinweise:** Verweilt die Maus kurz über erkundetem Gelände, erscheint ein kleiner Text (abschaltbar in den
  Einstellungen).
- **Fortsetzen:** Einzelspiel und Host-Partien werden alle 20 s und beim Verlassen der Seite automatisch gesichert. Nach
  versehentlichem Schließen oder Neuladen bietet das Hauptmenü „Letzte Partie fortsetzen“ an (eine Mehrspielerpartie
  läuft dann gegen die KI weiter). Die Zurück-Taste des Browsers öffnet im Spiel nur das Menü.

### Ausbaustufen

Ausgewähltes fertiges Gebäude → Knopf **„Stufe II/III“ (Taste C)**. Der Ausbau kostet Rohstoffe und Zeit, das Gebäude
arbeitet währenddessen weiter (Gerüst sichtbar); Abbrechen erstattet alles. Ausgebaute Gebäude tragen ein kleines Wappen
mit Strichen. Stufe II/III anderer Gebäude setzt ein Dorfzentrum derselben Stufe voraus, Stufe III des Dorfzentrums
einen fertigen Markt.

| Gebäude | Stufe II | Stufe III |
|---|---|---|
| Dorfzentrum | Kirchspielort: +50 % LP, +40 % Schaden, +5 Wohnraum | Marktflecken: doppelte LP, +80 % Schaden, +1 Reichweite, +10 Wohnraum |
| Wohnhaus | Doppelkate: +3 Wohnraum | Bürgerhaus: +6 Wohnraum |
| Bauernhof | Großer Hof: +30 % Getreide, +2 Felder | Gutshof: +60 %, +4 Felder, +1 Arbeitsplatz |
| Lehmgrube | Ziegelei: +30 % Lehm | Ringofen-Ziegelei: +60 %, +1 Arbeitsplatz |
| Heringszaun | Doppelzaun: +30 % Fisch | Fischerhütte: +60 % |
| Bockmühle / Räucherei | 25 % schneller | 40 % schneller |
| Kaserne | Exerzierplatz: Ausbildung 20 % schneller | Zeughaus: 35 % schneller |
| Markt | Kontor: +15 % Taler je Verkauf | Handelshaus: +30 % Taler |

**Steuerung:** Linksklick wählt, Rahmen ziehen wählt mehrere, Rechtsklick bewegt/arbeitet/greift an,
Befehlskarte unten rechts (Tasten Q W E R / A S D F / Y X C V), Pfeiltasten/Bildrand/mittlere Maustaste bewegen die
Kamera, Mausrad zoomt, Minikarte anklicken. Im Spiel: **F1** Hilfe, **F2** Lehrmeister, **F3** Leistungsanzeige,
**Esc** Menü (Speichern im Einzelspiel), **Strg+Zahl** Gruppen, **.** nächster untätiger Arbeiter, **Entf** abreißen bzw.
Bau abbrechen. Bei Arbeitern liegt „Halt“ auf der zweiten Bauseite (V).

### Zeitalter

Die Siedlung entwickelt sich vom **17. Jahrhundert** (um 1600) über das **18.** (um 1750) und **20.** (um 1950) bis ins
**22. Jahrhundert** (um 2150). Der Aufstieg erfolgt im ausgewählten Dorfzentrum (Taste **A**), kostet Rohstoffe und Zeit
und setzt zwei fertige Gebäude der Vorepoche voraus. Ab dem 20. Jahrhundert ändern Dorfzentrum, Wohnhäuser, Kaserne und
Markt ihr Aussehen; ältere Gebäude bleiben als Altbestand stehen. Die neuen Gebäude stehen auf der zweiten Bauseite der
Arbeiter (Taste **V** „Epochenbauten“), Forschungen an den genannten Gebäuden (Tasten A/S/D/F; Forschungen des nächsten
Zeitalters werden schon angezeigt, sind aber noch gesperrt). Jede Forschung wirkt parteiweit und einmalig, auch auf
vorhandene Einheiten.

| Zeitalter | Voraussetzung (2 davon) | Neue Gebäude | Neue Einheiten | Forschungen |
|---|---|---|---|---|
| 17. Jh. – Frühe Neuzeit | – | Grundgebäude | Späher, Landsknecht, Armbrustschütze | Räderpflug (Hof), Geschmiedete Äxte (Holzfäller), Feinmaschige Reusen (Heringszaun), Eisenbeschlagene Spaten (Lehmgrube), **Bessere Flügel** (Mühle), Buchenholz-Räucherkammern, Lederwams (Kaserne), Geeichte Waage (Markt), Schießscharten (Dorfzentrum), Kachelöfen (Wohnhaus) |
| 18. Jh. – Aufklärung | Markt, Kaserne, Bockmühle, Räucherei | Leinenmanufaktur (Getreide+Holz → Waren), Hafen mit Kuttern, Sternschanze | Füsilier, Feldkanone | Fruchtwechsel, Schubkarren, Exerzierreglement, Gezogene Läufe (+1 Reichweite), Windrose (Mühle), Schleppnetze (Hafen), Wechselbank (Markt), Feuerspritzen (Dorfzentrum), Spinnmaschine (Manufaktur) |
| 20. Jh. – Eisenbahn und Industrie | Manufaktur, Hafen, Schanze | Bahnhof (+25 % Taler), Konservenfabrik, Bunker | Infanterist, Panzerwagen (Landsknecht/Armbrust/Kanone entfallen) | Kunstdünger, Dampfmaschine (Mühle), Motorisierung, Funkgeräte, Güterzüge (Bahnhof), Kühlhäuser (Fabrik) |
| 22. Jh. – Fusionszeitalter | Bahnhof, Fabrik, Bunker | Vertikalfarm, Gezeitenkraftwerk, Schildturm | Exo-Soldat, Kampfdrohne (fliegt über Wasser, Knicks, Deiche) | Pflanzengenetik (Vertikalfarm), Nanopanzerung, Schildfelder, Plasmaladungen (Schildturm), Robotik (Dorfzentrum) |

Die neuen Gebäude haben eigene Ausbaustufen II/III. Die Spezialeinheiten der Parteien bleiben in allen Zeitaltern
verfügbar. Jeder Aufstieg bringt etwas Prestige (10/15/20). Am Markt lässt sich jetzt auch Getreide kaufen.

## Mehrspieler (Kurzfassung)

1. **Host:** *Mehrspieler: Spiel erstellen* → Name → *Spiel eröffnen*. Die Lobby zeigt einen Spielcode wie **K7M-2QX**
   (Knöpfe „Code kopieren“ und „Einladungslink kopieren“).
2. **Mitspieler (bis zu drei):** *Mehrspieler: Mit Spielcode beitreten* → Code eingeben → *Beitreten* – oder einfach
   den Einladungslink öffnen. Groß-/Kleinschreibung und Bindestrich sind egal.
3. In der Lobby wählt jeder Partei, Farbe und Startort; **dieselbe Partei darf mehrfach** vorkommen. Der Host wählt
   Karte, Prestigeziel und Startrohstoffe und kann freie Plätze mit einer **KI** (leicht/normal) besetzen, schließen
   oder Mitspieler entfernen. Mit drei oder vier Spielern spielt jeder gegen jeden auf der großen Karte.
4. Alle setzen „bereit“, der Host startet. Verlässt ein Mitspieler die Partie, übernimmt die KI seine Siedlung.

Der Browser des Hosts berechnet die Partie; die anderen senden nur Befehle und erhalten den für sie sichtbaren Zustand.
Ein öffentlicher STUN-Server hilft beim Finden der Verbindungswege (abschaltbar), TURN ist nicht voreingestellt
(optional eigener Server). Direktes WebRTC funktioniert nicht durch jedes NAT bzw. jede Firewall – Details, der
manuelle Code-Austausch ohne Server und die Grenzen stehen in [docs/NETZWERK.md](docs/NETZWERK.md).

## Hintergrund und Freiheiten

Erfundener Konflikt, vereinfachte Karte und zeitliche Freiheiten (u. a. Arnis erst 1667 gegründet, Moorfunde erst im
19. Jahrhundert ausgegraben, Mühle Amanda erst 1888 – im Spiel daher eine Bockmühle) sind im Spiel unter
*Hintergrund & Quellen* gekennzeichnet, mit Quellenangaben.
