// Vermittlung (Signaling) für den Mehrspielermodus: Der Host eröffnet einen Raum und erhält einen kurzen
// Spielcode; Mitspieler treten mit diesem Code bei. Über den Raum laufen nur die WebRTC-Verbindungsangebote
// (je wenige Kilobyte). Die Partie selbst läuft danach direkt zwischen den Browsern.
// Ohne Abhängigkeiten (nur node:http-Typen), damit sie im Produktionsserver und im Vite-Entwicklungsserver läuft.

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // ohne I, L, O, 0, 1 (verwechslungsarm)
const CODE_LEN = 6;
const MAX_GUESTS = 3;
const MAX_ROOMS = 500;
const MAX_BODY = 64 * 1024;
const MAX_QUEUE = 50;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;
const HEARTBEAT_MS = 20000;

/** @param {number} n */
function randomToken(n = 24) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}
function randomCode() {
  const a = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => ALPHABET[b % ALPHABET.length]).join('');
}
/** Eingabe säubern: Bindestriche/Leerzeichen weg, Großbuchstaben. */
export function normalizeCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
}
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) : '') || 'Gast';

/**
 * @param {{ now?: () => number }} [opts]
 */
export function createRooms(opts = {}) {
  const now = opts.now ?? (() => Date.now());
  /** @type {Map<string, any>} */
  const rooms = new Map();
  /** @type {Map<string, {n: number, t: number}>} */
  const rate = new Map();

  const limited = (ip, max) => {
    const t = now();
    const r = rate.get(ip);
    if (!r || t - r.t > 60000) {
      rate.set(ip, { n: 1, t });
      return false;
    }
    r.n++;
    return r.n > max;
  };

  const sweep = () => {
    const t = now();
    for (const [code, room] of rooms) if (t - room.last > ROOM_IDLE_MS) closeRoom(code, 'Der Raum ist abgelaufen.');
    if (rate.size > 5000) rate.clear();
  };

  const write = (member, e) => {
    try {
      member.res.write(`id: ${e.id}\ndata: ${JSON.stringify(e.msg)}\n\n`);
    } catch {
      member.res = null;
    }
  };
  /**
   * Nachricht an einen Teilnehmer. Jede Nachricht bekommt eine fortlaufende Nummer und bleibt im Protokoll des
   * Teilnehmers; reißt der Ereignisstrom ab, liefert der Server beim Wiederverbinden (Last-Event-ID) alles Verpasste nach.
   */
  const deliver = (member, msg) => {
    if (!member) return false;
    if (member.queue.length >= MAX_QUEUE) member.queue.shift();
    const e = { id: ++member.seq, msg };
    member.queue.push(e);
    if (member.res) write(member, e);
    return true;
  };

  const closeRoom = (code, reason) => {
    const room = rooms.get(code);
    if (!room) return;
    rooms.delete(code);
    for (const m of [room.host, ...room.guests.values()]) {
      deliver(m, { t: 'closed', reason });
      try {
        m.res?.end();
      } catch {
        /* schon zu */
      }
    }
  };

  const memberOf = (room, token) => {
    if (typeof token !== 'string' || !token) return null;
    if (room.host.token === token) return room.host;
    for (const g of room.guests.values()) if (g.token === token) return g;
    return null;
  };

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const readBody = (req) =>
    new Promise((resolve) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          resolve(null);
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });

  const sweepTimer = setInterval(sweep, 60000);
  sweepTimer.unref?.();

  /**
   * Bearbeitet /api/… – liefert false, wenn die Anfrage nicht zur Vermittlung gehört.
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://x');
    const m = /\/api\/(health|rooms)(?:\/([A-Za-z0-9-]{1,12})(?:\/(join|msg|events|close))?)?\/?$/.exec(url.pathname);
    if (!m) return false;
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '?').split(',')[0].trim();
    if (m[1] === 'health') {
      send(res, 200, { ok: true, rooms: rooms.size });
      return true;
    }
    const code = m[2] ? normalizeCode(m[2]) : '';
    const action = m[3] ?? '';

    // Ereignisstrom (Server-Sent Events) für Host und Gäste
    if (req.method === 'GET' && action === 'events') {
      const room = rooms.get(code);
      const member = room && memberOf(room, url.searchParams.get('token'));
      if (!member) {
        send(res, 404, { error: 'Raum oder Teilnehmer unbekannt.' });
        return true;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(': verbunden\n\n');
      try {
        member.res?.end();
      } catch {
        /* alte Verbindung */
      }
      member.res = res;
      const last = Number(req.headers['last-event-id'] ?? url.searchParams.get('last') ?? 0) || 0;
      for (const e of member.queue) if (e.id > last) write(member, e);
      const hb = setInterval(() => {
        try {
          res.write(': ping\n\n');
        } catch {
          clearInterval(hb);
        }
      }, HEARTBEAT_MS);
      req.on('close', () => {
        clearInterval(hb);
        if (member.res === res) member.res = null;
      });
      return true;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Nur POST.' });
      return true;
    }
    const body = await readBody(req);
    if (!body || typeof body !== 'object') {
      send(res, 400, { error: 'Ungültige Anfrage.' });
      return true;
    }

    // Raum eröffnen
    if (!code) {
      if (limited(ip, 20)) { send(res, 429, { error: 'Zu viele neue Räume – bitte kurz warten.' }); return true; }
      sweep();
      if (rooms.size >= MAX_ROOMS) { send(res, 503, { error: 'Der Server ist gerade voll. Bitte später erneut versuchen.' }); return true; }
      let c = randomCode();
      for (let k = 0; k < 20 && rooms.has(c); k++) c = randomCode();
      const host = { id: 0, token: randomToken(), name: cleanName(body.name), queue: [], seq: 0, res: null };
      rooms.set(c, { code: c, host, guests: new Map(), nextId: 1, open: true, last: now(), max: Math.min(MAX_GUESTS, Math.max(1, Number(body.max) | 0 || MAX_GUESTS)) });
      send(res, 200, { code: c, token: host.token });
      return true;
    }
    const room = rooms.get(code);
    if (!room) {
      if (limited(ip, 60)) { send(res, 429, { error: 'Zu viele Versuche – bitte kurz warten.' }); return true; }
      send(res, 404, { error: 'Zu diesem Spielcode gibt es kein offenes Spiel. Bitte den Code prüfen.' });
      return true;
    }
    room.last = now();

    if (action === 'join') {
      if (!room.open) { send(res, 409, { error: 'Dieses Spiel hat bereits begonnen.' }); return true; }
      if (room.guests.size >= room.max) { send(res, 409, { error: 'Dieses Spiel ist bereits voll.' }); return true; }
      const g = { id: room.nextId++, token: randomToken(), name: cleanName(body.name), queue: [], seq: 0, res: null };
      room.guests.set(g.id, g);
      deliver(room.host, { t: 'join', id: g.id, name: g.name });
      send(res, 200, { token: g.token, id: g.id, host: room.host.name });
      return true;
    }
    const member = memberOf(room, body.token);
    if (!member) {
      send(res, 403, { error: 'Unbekannter Teilnehmer.' });
      return true;
    }
    if (action === 'msg') {
      const to = Number(body.to);
      if (typeof body.data !== 'string' || body.data.length > 48000) { send(res, 400, { error: 'Nachricht ungültig.' }); return true; }
      // Gäste dürfen nur dem Host schreiben, der Host jedem Gast
      const target = member === room.host ? room.guests.get(to) : to === 0 ? room.host : null;
      if (!target) { send(res, 404, { error: 'Empfänger unbekannt.' }); return true; }
      deliver(target, { t: 'msg', from: member.id, data: body.data });
      send(res, 200, { ok: true });
      return true;
    }
    if (action === 'close') {
      if (member === room.host) {
        if (body.started) {
          // Partie läuft: keine neuen Beitritte, Vermittlung wird nicht mehr gebraucht
          room.open = false;
          closeRoom(code, 'Die Partie hat begonnen.');
        } else closeRoom(code, typeof body.reason === 'string' ? body.reason.slice(0, 200) : 'Der Host hat das Spiel geschlossen.');
      } else {
        room.guests.delete(member.id);
        deliver(room.host, { t: 'leave', id: member.id });
        try {
          member.res?.end();
        } catch {
          /* schon zu */
        }
      }
      send(res, 200, { ok: true });
      return true;
    }
    send(res, 404, { error: 'Unbekannte Aktion.' });
    return true;
  }

  return { handle, rooms, stop: () => clearInterval(sweepTimer) };
}
