import { describe, expect, test } from 'vitest';
import { RateLimiter, parseGuestMsg, parseHostMsg, validateCommand } from '../src/net/protocol';
import { CODE_MAX_CHARS, OFFER_MAX_AGE_MS, decodeSignal, encodeSignal, newSessionId, type SignalPayload } from '../src/net/signal';
import { Snapshotter } from '../src/sim/snapshot';
import type { Unit } from '../src/sim/types';
import { World } from '../src/sim/world';

const SDP = 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host\r\n';
const offer = (o: Partial<SignalPayload> = {}): SignalPayload => ({ app: 'angeln', v: 1, k: 'offer', sid: newSessionId(), ts: Date.now(), sdp: SDP, name: 'Anna', ...o });

describe('Einladungs- und Antwortcodes', () => {
  test('Rundreise und Komprimierung', async () => {
    const p = offer();
    const code = await encodeSignal(p);
    expect(code.startsWith('ANGELN-EINLADUNG-1Z.')).toBe(true);
    expect(code.length).toBeLessThan(SDP.length * 2);
    const back = await decodeSignal(code, 'offer');
    expect(back.sdp).toBe(SDP);
    expect(back.sid).toBe(p.sid);
    // Zeilenumbrüche/Leerzeichen beim Kopieren werden toleriert
    const wrapped = code.replace(/(.{40})/g, '$1\n  ');
    expect((await decodeSignal(wrapped, 'offer')).sid).toBe(p.sid);
  });

  test('falsche Art, Versionen, Beschädigung, Größe und Alter werden verständlich abgelehnt', async () => {
    const ans = await encodeSignal({ ...offer(), k: 'answer' });
    await expect(decodeSignal(ans, 'offer')).rejects.toThrow(/Antwortcode/);
    const off = await encodeSignal(offer());
    await expect(decodeSignal(off, 'answer')).rejects.toThrow(/Einladungscode/);
    await expect(decodeSignal(off.replace('-1Z.', '-2Z.'), 'offer')).rejects.toThrow(/anderen Spielversion/);
    await expect(decodeSignal(off.slice(0, off.length - 30), 'offer')).rejects.toThrow(/beschädigt|unvollständig/);
    await expect(decodeSignal(off.slice(0, 25) + '!!!' + off.slice(28), 'offer')).rejects.toThrow(/ungültige Zeichen/);
    await expect(decodeSignal('x'.repeat(CODE_MAX_CHARS + 1), 'offer')).rejects.toThrow(/zu lang/);
    await expect(decodeSignal('', 'offer')).rejects.toThrow(/Kein Code/);
    await expect(decodeSignal('hallo welt', 'offer')).rejects.toThrow(/kein gültiger Code/);
    const old = await encodeSignal(offer({ ts: Date.now() - OFFER_MAX_AGE_MS - 1000 }));
    await expect(decodeSignal(old, 'offer')).rejects.toThrow(/veraltet/);
    const badSdp = await encodeSignal(offer({ sdp: 'kein sdp' }));
    await expect(decodeSignal(badSdp, 'offer')).rejects.toThrow(/Verbindungsbeschreibung/);
    const badSid = await encodeSignal(offer({ sid: '../../etc' }));
    await expect(decodeSignal(badSid, 'offer')).rejects.toThrow(/Sitzungskennung/);
    // fremdes JSON
    const foreign = 'ANGELN-EINLADUNG-1U.' + btoa(JSON.stringify({ app: 'x' })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    await expect(decodeSignal(foreign, 'offer')).rejects.toThrow(/nicht zu diesem Spiel/);
  });

  test('Dekompressionsbombe wird begrenzt', async () => {
    const huge = { ...offer(), sdp: 'v=0' + ' '.repeat(200000) };
    const code = await encodeSignal(huge as SignalPayload);
    expect(code.length).toBeLessThan(CODE_MAX_CHARS); // klein komprimiert …
    await expect(decodeSignal(code, 'offer')).rejects.toThrow(/groß/); // … aber entpackt zu groß
  });
});

describe('Protokollprüfung', () => {
  test('gültige Befehle passieren, Müll wird verworfen', () => {
    expect(validateCommand({ c: 'move', ids: [1, 2], x: 3.5, y: 4 })).toEqual({ c: 'move', ids: [1, 2], x: 3.5, y: 4, am: false });
    expect(validateCommand({ c: 'place', ids: [], b: 'wohnhaus', x: 5, y: 6 })).toBeTruthy();
    expect(validateCommand({ c: 'place', ids: [], b: 'schloss', x: 5, y: 6 })).toBeNull();
    expect(validateCommand({ c: 'train', b: 4, u: 'drache' })).toBeNull();
    expect(validateCommand({ c: 'move', ids: Array(500).fill(1), x: 1, y: 1 })).toBeNull();
    expect(validateCommand({ c: 'move', ids: [1], x: Infinity, y: 1 })).toBeNull();
    expect(validateCommand({ c: 'move', ids: [-1], x: 1, y: 1 })).toBeNull();
    expect(validateCommand({ c: 'buy', b: 1, r: 'taler' })).toBeNull();
    expect(validateCommand({ c: 'setRes', res: { taler: 1e9 } })).toBeNull();
    expect(parseGuestMsg({ t: 'cmd', s: 0, c: { c: 'stop', ids: [1] } })).toBeNull(); // Sequenz muss >= 1 sein
    expect(parseGuestMsg({ t: 'cmd', s: 1, c: { c: 'stop', ids: [1] } })).toBeTruthy();
    expect(parseGuestMsg({ t: 'lset', name: '<script>', color: 9, slot: 0, ready: true })).toBeNull();
    expect(parseGuestMsg({ t: 'lset', name: '<b>Bob</b>\u0000', color: 1, slot: 1, ready: true })).toEqual({ t: 'lset', name: 'bBob/b', color: 1, slot: 1, ready: true });
    expect(parseGuestMsg({ t: 'snap', s: {} })).toBeNull(); // Gast darf keine Zustände senden
    expect(parseHostMsg({ t: 'snap', s: { ents: 'x' } })).toBeNull();
  });

  test('Ratenbegrenzung', () => {
    const r = new RateLimiter(10, 5);
    let ok = 0;
    for (let i = 0; i < 50; i++) if (r.take(1000)) ok++;
    expect(ok).toBe(5);
    expect(r.take(2000)).toBe(true);
  });
});

describe('Snapshots und Kriegsnebel', () => {
  const mk = () =>
    new World({ seed: 777, players: [{ name: 'A', color: 0, slot: 0, isAI: false }, { name: 'B', color: 1, slot: 1, isAI: false }] });

  test('verborgene Gegner, Ressourcen und Warteschlangen werden nicht gesendet', () => {
    const w = mk();
    const s = new Snapshotter(1).make(w, true);
    const enemyIds = [...w.ents.values()].filter((e) => e.owner === 0).map((e) => e.id);
    expect(s.ents.some((e) => enemyIds.includes(e.i))).toBe(false);
    expect(s.players[0].res).toBeUndefined();
    expect(s.players[1].res).toBeDefined();
    // eigene sichtbar
    expect(s.ents.filter((e) => e.o === 1).length).toBeGreaterThan(0);
  });

  test('sichtbare Gegner erscheinen, verschwinden wieder als „hid“, Tote als „gone“', () => {
    const w = mk();
    const snap = new Snapshotter(1);
    snap.make(w, true);
    const enemy = [...w.ents.values()].find((e) => e.kind === 'u' && e.owner === 0) as Unit;
    const own = [...w.ents.values()].find((e) => e.kind === 'u' && e.owner === 1) as Unit;
    enemy.x = own.x + 1;
    enemy.y = own.y;
    w.step();
    w.step();
    let s = snap.make(w, false);
    const seen = s.ents.find((e) => e.i === enemy.id);
    expect(seen).toBeTruthy();
    // gegnerische Gebäudedetails (Warteschlange) sind nie enthalten
    enemy.x = w.map.slots[0].x + 4;
    enemy.y = w.map.slots[0].y + 4;
    w.step();
    w.step();
    s = snap.make(w, false);
    expect(s.hid).toContain(enemy.id);
    // Delta: unveränderte eigene Gebäude werden nicht erneut gesendet
    const s2 = snap.make(w, false);
    expect(s2.ents.filter((e) => e.k === 1).length).toBe(0);
    // Tod einer eigenen Einheit -> gone
    own.hp = 0;
    w.step();
    s = snap.make(w, false);
    expect(s.gone).toContain(own.id);
  });

  test('Ereignisse des Gegners außerhalb der Sicht werden nicht übertragen', () => {
    const w = mk();
    const snap = new Snapshotter(1);
    w.events.push({ e: 'err', p: 0, msg: 'geheim' }, { e: 'sold', p: 0, taler: 30, prestige: 2 }, { e: 'chop', x: w.map.slots[0].x, y: w.map.slots[0].y });
    const s = snap.make(w, false);
    expect(s.ev.length).toBe(0);
  });
});
