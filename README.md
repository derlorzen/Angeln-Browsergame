# Angeln – Fürsten der Schlei

Echtzeit-Strategiespiel im Browser. Zwei Siedlungen an der Schlei – **Kappeln** und **Arnis** – ringen um Fischgründe,
Handel und die Wege zum **Brarup-Markt** in Süderbrarup. Siedlungsbau und Produktionsketten wie bei Anno 1602,
direkte Einheitensteuerung wie bei Command & Conquer, Erkundung und Gefechte wie bei Age of Empires – mit eigenen
Grafiken, Regeln und Klängen. Schauplatz: eine fiktive, frühneuzeitliche Landschaft Angeln um 1600 – und fünf weitere Karten zwischen Rendsburg und Esbjerg.

- Sechs Karten zwischen Rendsburg und Esbjerg (Schlei, Flensburger Förde, Danewerk, Eider, Nordfriesische Marsch,
  Ribe/Kongeå) mit fair ausgeglichenen Startplätzen (siehe unten)
- Vier spielbare Parteien mit eigenem Baustil, eigenen Figuren, Boni und Spezialeinheit (siehe unten)
- Einzelspieler gegen eine KI (zwei Stufen, Partei wählbar), mit Lehrmeister-Einstieg
- Online-Modus für zwei Menschen über **direktes WebRTC**, ohne eigenen Server (manueller Code-Austausch)
- Militärischer Sieg (gegnerisches Dorfzentrum zerstören) oder wirtschaftlicher Sieg (Prestige aus Handel)
- Darstellung mit **PixiJS 8 (WebGL)**, automatischer Rückfall auf Canvas 2D
- Alle Grafiken und Klänge werden beim Start im Browser erzeugt; keine externen Assets, keine KI-Aufrufe zur Laufzeit

Weitere Dokumente: [docs/NETZWERK.md](docs/NETZWERK.md) (Code-Austausch, Netzwerkgrenzen, Synchronisation),
[docs/TESTBERICHT.md](docs/TESTBERICHT.md) (ausgeführte Tests, Messwerte, offene Punkte),
[docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md) (Aufbau des Codes).

## Lokal starten

Voraussetzung: Node.js ≥ 20 (getestet mit 22) und npm.

```bash
npm install
npm run dev          # Entwicklungsserver auf http://localhost:5173
```

Weitere Befehle:

```bash
npm run build        # Typprüfung + Produktionsbuild nach dist/
npm run preview      # dist/ lokal ausliefern (http://localhost:4173)
npm test             # Unit-/Simulationstests (Vitest)
npm run e2e          # Mehrspieler-Ende-zu-Ende-Test mit zwei Chromium-Prozessen (benötigt laufenden Server, s. u.)
```

Für Mehrspieler-Tests auf **einem** Rechner genügen zwei Browserfenster (z. B. ein normales und ein privates Fenster),
beide auf derselben Adresse.

## Statisches HTTPS-Hosting

Das Spiel ist eine rein statische Seite: `npm run build` erzeugt den Ordner `dist/` mit `index.html` und gebündelten
JS/CSS-Dateien (relative Pfade, also in jedem Unterverzeichnis lauffähig). Der Server liefert nur Dateien aus; er
simuliert keine Partien und speichert keine Spielstände.

Beispiele:

- **GitHub Pages:** Inhalt von `dist/` in einen Branch `gh-pages` oder per GitHub Actions („Deploy static content“) veröffentlichen.
- **Netlify / Cloudflare Pages:** Build-Befehl `npm run build`, Ausgabeverzeichnis `dist`.
- **Eigener Webserver (nginx, Apache, Caddy):** `dist/` in das Web-Wurzelverzeichnis kopieren, HTTPS aktivieren.

- **Coolify (oder jeder Docker-Host):** Das beiliegende `Dockerfile` baut das Spiel und liefert es mit nginx auf
  Port 80 aus (`deploy/nginx.conf`). In Coolify: *New Resource → Application → GitHub-Repository*, Branch wählen,
  Build Pack **Dockerfile**, Port **80**, eine Domain mit `https://` eintragen – Coolify holt das Let's-Encrypt-Zertifikat.
  Alternativ ohne Docker: Build Pack *Nixpacks* mit „Static site“, Build-Befehl `npm run build`, Verzeichnis `dist`.

HTTPS ist wichtig: WebRTC und die Zwischenablage-Funktion verlangen einen „sicheren Kontext“ (HTTPS oder `localhost`).

## Parteien (bewusst klischeehaft)

| Partei | Fokus | Boni | Spezialeinheit | Baustil |
|---|---|---|---|---|
| **Angeliter** „Wat mutt, dat mutt.“ | Landwirtschaft | Hof +30 % Getreide, Mühle 20 % schneller, Wohnhaus −20 % | **Knickwächter** – billige Bauernwehr mit Sense, neben Knicks besonders zäh | Reet, Fachwerk mit roter Ausfachung, Rotvieh |
| **Schwansener** „Wer reitet, der regiert.“ | Handel, Reiterei | Markt +25 % Taler und +1 Prestige je Verkauf, Zukauf −20 %, Späher +30 % LP; Wohnhaus +10 % | **Gutsreiter** – schwer gepanzerter Lanzenreiter | weiß verputzte Herrenhäuser, Ziegel-Walmdächer, Alleen, Pferde |
| **Nordfriesen** „Lewwer duad üs Slaav!“ | Fischerei | Heringszaun +50 %, Räucherei 25 % schneller, Arbeiter kosten 30 Fisch statt Getreide, +120 Fisch zum Start; Hof −20 % | **Grabenspringer** – überspringt mit dem Springstock Knicks | Haubarg, Friesenhaus mit Frontispiz, Klinker, Schafe |
| **Dänen** „For Konge og Fædreland!“ | Militär | Soldaten −15 %, Kaserne 25 % schneller, Amtshaus +30 % LP und stärkere Schützen | **Musketier** – größte Reichweite, hoher Schaden, langes Nachladen | Backstein-Renaissance mit Sandsteinbändern, Treppengiebel, Kupferhelme |

Jede Partei kann jeden Startplatz besetzen; die KI spielt je Partei unterschiedlich (z. B. greifen die Dänen früher an).

## Karten

| Karte | Startorte | Neutraler Markt | Fundstelle | Besonderheiten |
|---|---|---|---|---|
| **Die Schlei** (Angeln) | Kappeln / Arnis | Brarup-Markt | Thorsberger Moor | Meeresarm, Knicklandschaft |
| **Flensburger Förde** | Glücksburg / Gravenstein | Flensburger Markt | Findling am Fördeufer | über das Wasser nah, zu Lande nur um die Fördespitze |
| **Danewerk** | Schuby / Kropp | Viehmarkt am Ochsenweg | Haithabu | durchgehender Wall mit wenigen Toren, Heide im Westen, Haddebyer Noor |
| **Eider und Rendsburg** | Owschlag / Jevenstedt | Rendsburger Markt (Eiderinsel) | Grenzstein an der Eider | Fluss als Grenze mit Brücken und Furt, Moore, Gräben in der Niederung |
| **Nordfriesische Marsch** | Husum / Tönning | Viehmarkt Oldenswort | Rungholt-Spuren | Watt (begehbar, langsam), Priele, Deiche mit Stöpen, Gräben statt Knicks |
| **Ribe und Kongeå** | Varde / Tønder | Ochsenmarkt Ribe | Grabhügel auf der Heide | Wattenmeer mit Fanø und Rømø, Heide, Kongeå mit Furten |

Die Orte wurden nach bekannten Koordinaten (etwa ±2 km genau) maßstabstreu und mit Norden oben eingepasst; ein Abgleich
mit Google Maps war bei der Erstellung nicht möglich. Damit keine Seite bevorzugt wird, gleicht der Generator danach aus:
Markt und Fundstelle liegen für beide gleich weit entfernt (gemessen als Laufweg), Holz und Acker in Reichweite werden
angeglichen, jeder Startplatz hat Lehmboden, und Startplätze ohne Ufer bekommen einen Fischteich. Die Abweichungen von
der echten Geografie sind im Spiel unter *Hintergrund & Quellen* je Karte gekennzeichnet. Im Mehrspieler wählt der Host
die Karte.

## Kurze Spielanleitung

**Ziel:** Gegnerisches Dorfzentrum zerstören *oder* als Erster das Prestigeziel erreichen (Standard 250).

| Rohstoff | Herkunft | Verwendung |
|---|---|---|
| Holz | Arbeiter schlagen Bäume (Rechtsklick auf Baum), Abgabe am Dorfzentrum/Holzfällerlager | fast alle Gebäude, Räucherei, Armbrustschützen |
| Getreide | Bauernhof mit Feldern, bis zu 3 zugewiesene Arbeiter | Arbeiter, Soldaten, Mühle |
| Fisch | Heringszaun am Ufer – Meer, Fluss, See, Watt oder Fischteich (arbeitet selbstständig) | Späher, Landsknechte, Räucherei |
| Lehm | Lehmgrube auf Lehmboden, bis zu 3 Arbeiter | Gebäude |
| Waren | Bockmühle (4 Getreide → 3 Waren), Räucherei (3 Fisch + 1 Holz → 2 Waren) | Verkauf am Markt |
| Taler | Warenverkauf am Markt | Soldaten, Holz/Lehm zukaufen |

- **Bevölkerung** begrenzt Arbeiter und Soldaten; Wohnhäuser +5 (max. 80).
- **Neutraler Markt** (⚑, je Karte ein anderer Ort, z. B. Brarup-Markt): Wer ihn allein mit Einheiten besetzt,
  verkauft teurer, erhält doppeltes Prestige je Verkauf und laufend Prestige → umkämpfter Verkehrsknoten.
- **Fundstelle** („?“, z. B. Thorsberger Moor): Die erste Einheit dort bringt einmalig Prestige und Taler.
- **Knicks** (Wallhecken) versperren Weg und Sicht; Wege und Tore führen hindurch. **Deiche** und das **Danewerk**
  ebenso (nur Stöpen/Tore), **Gräben** versperren nur den Weg. Watt ist begehbar, aber langsam.

**Steuerung:** Linksklick wählt, Rahmen ziehen wählt mehrere, Rechtsklick bewegt/arbeitet/greift an,
Befehlskarte unten rechts (Tasten Q W E R / A S D F / Y X C V), Pfeiltasten/Bildrand/mittlere Maustaste bewegen die
Kamera, Mausrad zoomt, Minikarte anklicken. Im Spiel: **F1** Hilfe, **F2** Lehrmeister, **F3** Leistungsanzeige,
**Esc** Menü (Speichern im Einzelspiel), **Strg+Zahl** Gruppen.

## Code-Austausch im Mehrspieler (Kurzfassung)

1. Spieler A: *Mehrspieler: Spiel erstellen* → *Einladung erzeugen* → langen Einladungscode kopieren und z. B. per Messenger schicken.
2. Spieler B: *Spiel beitreten* → Code einfügen → *Antwortcode erzeugen* → Antwortcode zurückschicken.
3. Spieler A fügt den Antwortcode ein → *Verbinden*. Sobald der DataChannel offen ist, erscheint die Lobby.
4. A wählt die Karte, beide wählen Partei/Farbe/Startort, setzen „bereit“, A startet.

Es gibt **keinen** Vermittlungsserver. Ein optionaler öffentlicher STUN-Server hilft beim Finden der Verbindungswege
(abschaltbar), TURN ist nicht voreingestellt (optional eigener Server). Direktes WebRTC funktioniert nicht durch jedes
NAT bzw. jede Firewall – Details und Grenzen in [docs/NETZWERK.md](docs/NETZWERK.md).

## Hintergrund und Freiheiten

Erfundener Konflikt, vereinfachte Karte und zeitliche Freiheiten (u. a. Arnis erst 1667 gegründet, Moorfunde erst im
19. Jahrhundert ausgegraben, Mühle Amanda erst 1888 – im Spiel daher eine Bockmühle) sind im Spiel unter
*Hintergrund & Quellen* gekennzeichnet, mit Quellenangaben.
