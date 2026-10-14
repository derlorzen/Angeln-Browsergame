// Spielcode-Vermittlung im Browser: Raum eröffnen bzw. mit Code beitreten, WebRTC-Angebote über den Server
// austauschen (server/rooms.mjs). Danach läuft alles direkt zwischen den Browsern; der Server sieht keine Spielzüge.

export type RoomEvent =
  | { t: 'join'; id: number; name: string }
  | { t: 'leave'; id: number }
  | { t: 'msg'; from: number; data: string }
  | { t: 'closed'; reason: string };

export class RoomError extends Error {}

/** Spielcode zur Anzeige: „K7M-2QX“ */
export const formatCode = (c: string) => (c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c);
/** Eingabe säubern: Bindestriche/Leerzeichen weg, Großbuchstaben. */
export const cleanCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new RoomError('Der Spielserver ist nicht erreichbar. Besteht eine Internetverbindung?');
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* keine JSON-Antwort: z. B. rein statisches Hosting ohne Vermittlung */
  }
  if (!res.ok || data.error) {
    if (res.status === 404 && !data.error) throw new RoomError('Auf diesem Server gibt es keine Spielcode-Vermittlung. Bitte die Codes manuell austauschen.');
    throw new RoomError(typeof data.error === 'string' ? data.error : `Fehler ${res.status}`);
  }
  return data;
}

export class Room {
  private es: EventSource | null = null;
  onEvent: (e: RoomEvent) => void = () => {};
  closed = false;

  private constructor(readonly code: string, private readonly token: string, readonly id: number, readonly hostName = '') {}

  /** Host: neuen Raum eröffnen. */
  static async create(name: string, maxGuests = 3): Promise<Room> {
    const d = await post('api/rooms', { name, max: maxGuests });
    if (typeof d.code !== 'string' || typeof d.token !== 'string') throw new RoomError('Unerwartete Antwort des Servers.');
    return new Room(d.code, d.token, 0);
  }

  /** Mitspieler: mit Spielcode beitreten. */
  static async join(code: string, name: string): Promise<Room> {
    const c = cleanCode(code);
    if (c.length < 4) throw new RoomError('Bitte den Spielcode des Hosts eingeben (6 Zeichen, z. B. K7M-2QX).');
    const d = await post(`api/rooms/${c}/join`, { name });
    if (typeof d.token !== 'string' || typeof d.id !== 'number') throw new RoomError('Unerwartete Antwort des Servers.');
    return new Room(c, d.token, d.id, typeof d.host === 'string' ? d.host : '');
  }

  /** Ereignisse empfangen (Server-Sent Events, verbindet sich bei Abbruch selbst neu). */
  listen(): void {
    if (this.es) return;
    const es = new EventSource(`api/rooms/${this.code}/events?token=${encodeURIComponent(this.token)}`);
    this.es = es;
    es.onmessage = (ev) => {
      let m: RoomEvent;
      try {
        m = JSON.parse(ev.data) as RoomEvent;
      } catch {
        return;
      }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'closed') {
        this.stopListening();
        this.closed = true;
      }
      this.onEvent(m);
    };
  }

  stopListening(): void {
    this.es?.close();
    this.es = null;
  }

  /** Nachricht (WebRTC-Angebot/-Antwort) an einen Teilnehmer; Gäste schreiben immer an den Host (0). */
  async send(to: number, data: string): Promise<void> {
    await post(`api/rooms/${this.code}/msg`, { token: this.token, to, data });
  }

  /** Host: Raum schließen (started: Partie beginnt, keine Beitritte mehr). Gast: Raum verlassen. */
  close(started = false, reason?: string): void {
    this.stopListening();
    if (this.closed) return;
    this.closed = true;
    void post(`api/rooms/${this.code}/close`, { token: this.token, started, reason }).catch(() => undefined);
  }
}
