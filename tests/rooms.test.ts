// Spielcode-Vermittlung (server/rooms.mjs): Raum eröffnen, beitreten, Angebote weiterreichen, Grenzen.
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createRooms, normalizeCode } from '../server/rooms.mjs';

let server: Server;
let base = '';
const rooms = createRooms();
beforeAll(async () => {
  server = createServer((req, res) => {
    void rooms.handle(req, res).then((ok) => {
      if (!ok) res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/api`;
});
afterAll(() => {
  rooms.stop();
  server.close();
});
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: (await r.json()) as Record<string, unknown> };
};
/** liest Ereignisse aus dem SSE-Strom, bis n Datenzeilen da sind */
async function events(code: string, token: string, n: number, last = 0): Promise<Record<string, unknown>[]> {
  const ctl = new AbortController();
  // last: Nummer der zuletzt gesehenen Nachricht (wie Last-Event-ID beim Wiederverbinden)
  const r = await fetch(`${base}/rooms/${code}/events?token=${token}`, { signal: ctl.signal, headers: last ? { 'Last-Event-ID': String(last) } : {} });
  const reader = r.body!.getReader();
  const out: Record<string, unknown>[] = [];
  let buf = '';
  while (out.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += new TextDecoder().decode(value);
    for (;;) {
      const k = buf.indexOf('\n\n');
      if (k < 0) break;
      const chunk = buf.slice(0, k);
      buf = buf.slice(k + 2);
      const data = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (data) out.push(JSON.parse(data.slice(6)));
    }
  }
  ctl.abort();
  return out;
}

describe('Spielcode-Vermittlung', () => {
  test('Host eröffnet, Gast tritt mit Code bei, Angebot und Antwort werden weitergereicht', async () => {
    const h = await post('/rooms', { name: 'Hinrich' });
    expect(h.status).toBe(200);
    const code = h.data.code as string;
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    // Eingabe mit Bindestrich und Kleinbuchstaben wird akzeptiert
    const g = await post(`/rooms/${code.slice(0, 3).toLowerCase()}-${code.slice(3)}/join`, { name: 'Boy' });
    expect(g.status).toBe(200);
    expect(g.data.host).toBe('Hinrich');
    const hostEv = await events(code, h.data.token as string, 1);
    expect(hostEv[0]).toMatchObject({ t: 'join', id: g.data.id, name: 'Boy' });
    expect((await post(`/rooms/${code}/msg`, { token: h.data.token, to: g.data.id, data: 'ANGEBOT' })).status).toBe(200);
    const guestEv = await events(code, g.data.token as string, 1);
    expect(guestEv[0]).toMatchObject({ t: 'msg', from: 0, data: 'ANGEBOT' });
    expect((await post(`/rooms/${code}/msg`, { token: g.data.token, to: 0, data: 'ANTWORT' })).status).toBe(200);
    // Wiederverbinden mit Last-Event-ID: nur Neues, Verpasstes wird nachgeliefert
    expect((await events(code, h.data.token as string, 1, 1))[0]).toMatchObject({ t: 'msg', from: g.data.id, data: 'ANTWORT' });
    // ohne Last-Event-ID beginnt der Strom von vorn (Beitritt und Antwort)
    expect((await events(code, h.data.token as string, 2)).map((e) => e.t)).toEqual(['join', 'msg']);
    // Gäste dürfen nur dem Host schreiben, Fremde gar nicht
    expect((await post(`/rooms/${code}/msg`, { token: g.data.token, to: 5, data: 'x' })).status).toBe(404);
    expect((await post(`/rooms/${code}/msg`, { token: 'falsch', to: 0, data: 'x' })).status).toBe(403);
    // nach Spielbeginn keine Beitritte mehr
    expect((await post(`/rooms/${code}/close`, { token: h.data.token, started: true })).status).toBe(200);
    expect((await post(`/rooms/${code}/join`, { name: 'Spät' })).status).toBe(404);
  });

  test('höchstens drei Mitspieler, unbekannte Codes und übergroße Nachrichten werden abgewiesen', async () => {
    const h = await post('/rooms', { name: 'H' });
    const code = h.data.code as string;
    for (let k = 0; k < 3; k++) expect((await post(`/rooms/${code}/join`, { name: `G${k}` })).status).toBe(200);
    const full = await post(`/rooms/${code}/join`, { name: 'G4' });
    expect(full.status).toBe(409);
    expect(full.data.error).toMatch(/voll/);
    const none = await post('/rooms/ZZZZZZ/join', { name: 'X' });
    expect(none.status).toBe(404);
    expect(none.data.error).toMatch(/Spielcode/);
    expect((await post(`/rooms/${code}/msg`, { token: h.data.token, to: 1, data: 'x'.repeat(50000) })).status).toBe(400);
    expect(normalizeCode(' k7m-2qx ')).toBe('K7M2QX');
  });
});
