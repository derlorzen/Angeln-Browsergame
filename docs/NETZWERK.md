# Mehrspieler: Spielcode, Code-Austausch, Netzwerkgrenzen, Synchronisation

## Begriffe

| Baustein | Was er tut | In diesem Spiel |
|---|---|---|
| **Hosting** | liefert HTML/JS/CSS aus | `server/server.mjs` (Docker/Coolify) oder beliebiger HTTPS-Webspace; simuliert nichts, speichert nichts |
| **Signaling** | Austausch der Verbindungsbeschreibungen (SDP-Angebot/-Antwort inkl. ICE-Kandidaten) | **Spielcode-Vermittlung** über `/api/rooms` des eigenen Servers (`server/rooms.mjs`); Rückfall: **manuell**, Einladungs- und Antwortcode werden von den Spielern selbst übermittelt |
| **STUN** | ermittelt die von außen sichtbare Adresse (für NAT-Durchdringung) | optional, Standard `stun:stun.l.google.com:19302`, in *Einstellungen* änderbar oder abschaltbar. Externer Dienst, sieht keine Spieldaten |
| **TURN** | Relay-Server, leitet den Datenverkehr weiter, wenn direkt nichts geht | **nicht** voreingestellt; optional eigener TURN-Server eintragbar |

Es wird keine Bibliothek verwendet, die stillschweigend einen fremden Vermittlungsserver nutzt. Der Verbindungsaufbau
nutzt nur die Browser-API `RTCPeerConnection` und einen `RTCDataChannel` (`src/net/peer.ts`); die Spielcode-Vermittlung
läuft auf demselben Server, der das Spiel ausliefert.

## Ablauf mit Spielcode (Standard)

1. Host: *Spiel erstellen* → `POST api/rooms` → der Server legt einen Raum an und antwortet mit einem sechsstelligen
   Code (Alphabet ohne verwechselbare Zeichen I, L, O, 0, 1) und einem geheimen Token.
2. Mitspieler: *Mit Spielcode beitreten* → `POST api/rooms/<code>/join` → Token und Teilnehmernummer. Der Host erfährt
   über seinen Ereignisstrom (`GET …/events`, Server-Sent Events) von dem Beitritt.
3. Der Host erzeugt für diesen Mitspieler ein WebRTC-Angebot (derselbe Einladungscode wie im manuellen Modus) und
   schickt es über `POST …/msg` an ihn; der Mitspieler antwortet auf demselben Weg mit dem Antwortcode.
4. Der DataChannel öffnet sich, der Mitspieler sendet `hello` und erhält einen Lobbyplatz. Bis zu drei Mitspieler,
   je einer eigenen Verbindung zum Host (Sterntopologie).
5. Beim Start schließt der Host den Raum (`…/close`, keine Beitritte mehr). Die Partie läuft danach nur noch über die
   direkten Verbindungen; der Server sieht keine Spielzüge.

Kommt die direkte Verbindung nicht innerhalb von 15 s zustande, versucht es der Mitspieler automatisch ein zweites
Mal. Grenzen des Vermittlungsservers: höchstens 500 offene Räume, 3 Mitspieler je Raum, 64 KB je Anfrage, 48 KB je
Nachricht, 50 wartende Nachrichten je Teilnehmer, 20 neue Räume und 60 Fehlversuche je Adresse und Minute; Räume
verfallen nach drei Stunden ohne Aktivität. Ein Spielcode ist kein Passwort: Wer ihn kennt, kann beitreten, solange
Plätze offen sind – der Host kann Mitspieler in der Lobby entfernen und Plätze schließen.

## Ablauf ohne Server (manueller Code-Austausch, für zwei Spieler)

1. A: *Spiel erstellen* → Browser erzeugt ein WebRTC-Angebot und wartet, bis die ICE-Sammlung abgeschlossen ist (max. 8 s).
2. Daraus entsteht der **Einladungscode** `ANGELN-EINLADUNG-1Z.<base64url>`: JSON `{app, v, k:'offer', sid, ts, sdp, name}`,
   mit `deflate-raw` komprimiert (CompressionStream) und Base64url-kodiert. Typische Länge: 600–1500 Zeichen.
3. A schickt den Code außerhalb des Spiels an B.
4. B fügt ihn unter *Spiel beitreten* ein; der Browser prüft ihn und erzeugt den **Antwortcode** `ANGELN-ANTWORT-1Z.…`
   mit derselben Sitzungskennung `sid`.
5. B schickt den Antwortcode zurück, A fügt ihn ein → DataChannel öffnet sich → gemeinsame Lobby.
6. Beide wählen Name, Farbe, Startort und bestätigen „bereit“; A startet (gleicher Kartenseed auf beiden Seiten).

Ein sechsstelliger Code ohne Vermittlung kann die Gegenstelle nicht finden – deshalb sind die Codes in diesem Modus
lang. Er ist für statisches Hosting ohne `/api/rooms` gedacht und erreichbar über „Ohne Server: …“ in den Menüs.

### Prüfung der Codes (nicht vertrauenswürdige Eingaben, `src/net/signal.ts`)

- Länge max. 20 000 Zeichen; Leerzeichen/Zeilenumbrüche vom Kopieren werden entfernt
- Präfix bestimmt Art (Einladung/Antwort) – vertauschte Codes werden mit klarer Meldung abgelehnt
- Versionsnummer im Präfix und im Inhalt; abweichende Version → Meldung „andere Spielversion“
- Base64url-Zeichenprüfung, begrenztes Entpacken (max. 48 kB, schützt vor Dekompressionsbomben)
- JSON-Schema: `app`, `v`, `k`, `sid` (8–32 Zeichen a–z0–9), `ts`, `sdp` (muss mit `v=0` beginnen, max. 30 kB), `name` (max. 40)
- Einladungen älter als 60 Minuten gelten als veraltet
- Antwort mit fremder `sid` (z. B. zu einer älteren Einladung) wird abgelehnt; eine zweite Antwort auf dieselbe Einladung ebenso
- „Neue Einladung“ schließt die alte Verbindung und erzeugt eine neue `sid`; Abbrechen schließt die Verbindung sauber

## Netzwerkgrenzen

- **Mit STUN (Standard):** Verbindungen über verschiedene Internetanschlüsse gelingen häufig, aber nicht immer.
  Symmetrisches NAT (manche Mobilfunknetze, Firmen- und Hotelnetze, CGNAT) verhindert direkte Verbindungen.
- **Ohne ICE-Dienste:** Es werden nur lokale Adressen angeboten. Das funktioniert in der Regel nur auf demselben
  Gerät oder im selben lokalen Netz. Keine externen Abhängigkeiten.
- **Mit eigenem TURN:** erhöht die Erfolgsquote deutlich, setzt aber einen selbst betriebenen oder gemieteten Relay voraus.
- Scheitert der Aufbau, erscheint nach max. 25 s: „Es konnte keine direkte Verbindung hergestellt werden (NAT/Firewall
  blockiert) …“. Eine universelle Verbindbarkeit wird nicht versprochen.

## Synchronisation (Host-autoritativ)

- Der Browser des Erstellers (Host) führt die **einzige maßgebliche Simulation** mit festen 10 Takten/s (`src/sim/world.ts`).
- Der Gast schickt nur **Befehle** `{t:'cmd', s:<Sequenznummer>, c:<Befehl>}`. Der Host
  - prüft die Struktur (`validateCommand`: Befehlstyp-Whitelist, Ganzzahl-IDs, max. 200 IDs, Koordinaten im Kartenbereich),
  - verwirft doppelte/veraltete Sequenznummern und begrenzt die Rate (30/s, Burst 60),
  - ordnet den Befehl **verbindungsbasiert** Spieler 1 zu (ein Gast kann sich nicht als anderer Spieler ausgeben),
  - prüft in der Simulation Besitz, Kosten, Bauplatz, Voraussetzungen – genau wie für eigene Befehle und die KI.
- Der Host sendet jeden Takt ein **Delta** (geänderte sichtbare Objekte, aus der Sicht verschwundene, zerstörte) und
  alle 3 s bzw. nach Rückstau einen **vollständigen Zustand**. Darin bestätigt `ack` die letzte verarbeitete Befehlsnummer.
- **Kriegsnebel serverseitig:** Der Gast erhält nur eigene Objekte, gegnerische Objekte auf aktuell sichtbaren Kacheln,
  sichtbare Baumänderungen und sichtbare Ereignisse. Gegnerische Ressourcen und Warteschlangen werden nie gesendet
  (öffentlich ist nur das Prestige als Siegfortschritt). Zuletzt gesehene Gebäude merkt sich der Gast selbst.
- Darstellung und Simulation sind getrennt: Der Gast interpoliert Positionen zwischen zwei Zuständen.
- Stabile Objekt-IDs, Protokollversion (`PROTOCOL_VERSION`, derzeit 6) im Lobby-Handshake, Nachrichten > 256 kB werden verworfen,
  Sendepuffer > 2 MB wird nicht weiter befüllt (Deltas pausieren, danach Vollzustand).
- Heartbeat (Ping/Pong). Schließt der Host die Seite, sieht der Gast „Verbindung beendet … keine automatische
  Hostmigration“. Verlässt der Gast die Partie, übernimmt beim Host die KI dessen Siedlung.

### Vertrauensmodell

Der Gast kann keine Ressourcen erfinden oder fremde Einheiten steuern. **Gegen Manipulation durch den Host gibt es
in dieser Architektur keine unabhängige Kontrolle** – der Host könnte seinen eigenen Browser verändern.

### Bis zu vier Spieler

Der Host verwaltet je Mitspieler einen `PeerLink` mit eigenem Snapshotter (eigene Sicht), eigener Sequenzprüfung,
Flutbegrenzung und Ping (`HostDriver`, `src/game/drivers.ts`). Die Lobby hat vier Plätze (Host, Mitspieler, KI, offen,
geschlossen); Farben und Startorte hält der Host eindeutig, Parteien dürfen sich wiederholen. Mit drei oder vier
Spielern wird die Karte mit 160 × 160 Kacheln erzeugt – beide Seiten leiten Größe und Startplätze aus Seed, Karte und
Spielerzahl ab. Scheidet ein Spieler aus, kann er zuschauen; verlässt ein Mitspieler die Partie, übernimmt die KI.
Der Host muss bis zum Ende im Spiel bleiben (keine Hostmigration).

## Testanleitung über zwei Internetanschlüsse (noch offen, siehe Testbericht)

1. Spiel per HTTPS hosten (Docker/Coolify mit Spielcode-Vermittlung) – oder beide Personen starten `npm run dev` lokal.
2. Gerät A im Heim-WLAN, Gerät B z. B. per Mobilfunk-Hotspot (anderer Anschluss).
3. Beide: *Einstellungen* → STUN aktiv lassen.
4. A eröffnet ein Spiel und nennt B den Spielcode; B tritt bei.
5. Notieren: Verbindung ja/nein, Zeit bis zur Lobby, angezeigte Latenz oben rechts (z. B. „Host · 45 ms“),
   ob Bewegungen beim Gast flüssig sind, Verhalten beim Schließen eines Tabs.
6. Bei Fehlschlag: mit einem anderen Netz (z. B. beide Heim-WLANs) wiederholen; optional eigenen TURN eintragen.
