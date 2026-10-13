# Architektur

TypeScript + Vite, keine Laufzeitabhängigkeiten außer **PixiJS 8** (WebGL-Darstellung). Alle Grafiken und Klänge
werden beim Start im Browser prozedural erzeugt.

```
src/
  data/defs.ts         Spieldaten: Ressourcen, Gebäude, Einheiten, Kosten, Bauzeiten, Raten, Regeln
  sim/                 Simulation (DOM-frei, auch in Node testbar)
    map.ts             Kartengenerator (Schlei, Ufer, Moor, Lehm, Wälder, Wege, Knicks mit Toren)
    world.ts           maßgebliche Welt: Befehlsprüfung, Wirtschaft/Produktionsketten, Einheiten, Kampf, Sieg, Speichern
    path.ts, heap.ts   A* auf dem Raster (8 Richtungen, kein Eckenschneiden, Geländekosten, Glättung)
    rules.ts           gemeinsame Regeln: Bauplatzprüfung (auch für die Vorschau), Sichtberechnung mit Knick-Sichtsperre
    snapshot.ts        je Empfänger gefilterte Zustände (Kriegsnebel), Deltas und Vollzustände
    rng.ts, types.ts
  ai/ai.ts             KI – nutzt ausschließlich normale Spielerbefehle
  net/                 Netzwerk
    signal.ts          Einladungs-/Antwortcodes: versioniert, komprimiert, streng geprüft
    peer.ts            RTCPeerConnection + DataChannel, ICE-Einstellungen, Zeitlimits, Fehlermeldungen
    protocol.ts        Nachrichtenformate, Validierung, Ratenbegrenzung
  game/
    client.ts          ClientState: Sicht eines Spielers, nur aus Snapshots gespeist (lokal wie im Netz)
    drivers.ts         LocalDriver (Einzelspiel), HostDriver (Simulation + Gast), GuestDriver (nur Anzeige/Befehle)
    game.ts            Spielbildschirm: Eingabe, Kamera, Ereignisse, Dialoge, Spielschleife (requestAnimationFrame)
  render/
    view.ts            BaseRenderer: Kamera, Koordinaten, Picking, Effekte, Nebelbild
    pixi.ts            PixiRenderer (WebGL): Atlas, Chunks, Tiefensortierung, Nebel-Sprite, Stimmungseffekte
    renderer.ts        CanvasRenderer (Canvas 2D, Rückfallebene) und Minikarte
    factory.ts         Auswahl WebGL/Canvas
    draw.ts, sprites.ts, props.ts, units.ts   prozedurale Sprites (Gelände, Gebäude, Requisiten, Figuren, Symbole)
  ui/                  HUD (Ressourcenleiste, Auswahlfenster, Befehlskarte, Tooltips), Menüs/Lobby, Lehrmeister, Texte
  audio/sound.ts       synthetische Klänge (WebAudio)
  storage/save.ts      Einstellungen und Einzelspieler-Spielstand (localStorage)
```

## Datenfluss

```
 Eingabe/KI/Gast ──Befehle──► World.queueCommand ──► World.step() (10 Hz, fester Takt)
                                                         │
                                         Snapshotter (je Spieler, nebelgefiltert)
                                                         │
                     lokal: direkt ─────────────────────►│◄───── Netz: JSON über DataChannel
                                                         ▼
                                                    ClientState ──► Renderer (rAF, interpoliert) + HUD
```

- **Feste Takte:** Ein Worker-Taktgeber (nicht gedrosselt in Hintergrund-Tabs) pumpt die Simulation mit 100 ms;
  die Darstellung läuft unabhängig per `requestAnimationFrame` und interpoliert Einheitenpositionen.
- **Ein Pfad für alle:** Auch im Einzelspiel bekommt die Darstellung nur gefilterte Snapshots; dadurch ist der
  Netzwerkpfad (Nebel, Deltas) ständig mitgetestet.
- **Leistung:** Sichtbereichsbegrenzung (Chunks, Bildschirmtest je Objekt), zwischengespeicherte Sprites/Atlanten,
  räumlicher Index (4×4-Kachelzellen) für Zielsuche und Abstoßung, A*-Puffer werden wiederverwendet.
- **Erweiterbarkeit auf 4 Spieler:** Welt, Snapshots, Lobby-Format und Karte (4 Startplätze) sind mehrspielerfähig;
  der Host bräuchte nur mehrere PeerLinks.
