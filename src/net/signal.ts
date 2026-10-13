// Manuelles Signaling: WebRTC-Angebot/Antwort werden als kopierbare Codes ausgetauscht.
// Codes sind nicht vertrauenswürdige Eingaben: Größe, Format, Version, Art und Inhalt werden geprüft.
export const SIGNAL_VERSION = 1;
export const CODE_MAX_CHARS = 20000;
const JSON_MAX_BYTES = 48000;
const SDP_MAX = 30000;
export const OFFER_MAX_AGE_MS = 60 * 60 * 1000;

export type SignalKind = 'offer' | 'answer';
export interface SignalPayload {
  app: 'angeln';
  v: number;
  k: SignalKind;
  sid: string; // Sitzungs-ID des Angebots; die Antwort muss sie wiederholen
  ts: number;
  sdp: string;
  name?: string;
}

const PREFIX: Record<SignalKind, string> = { offer: 'ANGELN-EINLADUNG', answer: 'ANGELN-ANTWORT' };

export class SignalError extends Error {}

function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new SignalError('Der Code enthält ungültige Zeichen. Bitte vollständig und unverändert einfügen.');
  const b = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  let bin: string;
  try {
    bin = atob(b);
  } catch {
    throw new SignalError('Der Code ist beschädigt oder unvollständig.');
  }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function streamBytes(input: Uint8Array, ts: TransformStream<Uint8Array, Uint8Array>, limit: number): Promise<Uint8Array> {
  const writer = ts.writable.getWriter();
  void writer.write(input).catch(() => undefined);
  void writer.close().catch(() => undefined);
  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      void reader.cancel();
      throw new SignalError('Der Code ist unerwartet groß und wurde abgelehnt.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const hasCompression = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeSignal(p: SignalPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (hasCompression()) {
    const z = await streamBytes(json, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>, JSON_MAX_BYTES * 2);
    return `${PREFIX[p.k]}-${SIGNAL_VERSION}Z.${b64urlEncode(z)}`;
  }
  return `${PREFIX[p.k]}-${SIGNAL_VERSION}U.${b64urlEncode(json)}`;
}

export function newSessionId(): string {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join('');
}

/** Prüft und dekodiert einen eingefügten Code. Wirft SignalError mit verständlicher Meldung. */
export async function decodeSignal(raw: string, expect: SignalKind, now = Date.now()): Promise<SignalPayload> {
  if (typeof raw !== 'string') throw new SignalError('Kein Code eingefügt.');
  const code = raw.replace(/\s+/g, '');
  if (!code) throw new SignalError('Kein Code eingefügt.');
  if (code.length > CODE_MAX_CHARS) throw new SignalError(`Der Code ist zu lang (max. ${CODE_MAX_CHARS} Zeichen).`);
  const other: SignalKind = expect === 'offer' ? 'answer' : 'offer';
  if (code.startsWith(PREFIX[other] + '-'))
    throw new SignalError(
      expect === 'offer'
        ? 'Das ist ein Antwortcode. Hier wird der Einladungscode des Erstellers benötigt.'
        : 'Das ist ein Einladungscode. Hier wird der Antwortcode des Mitspielers benötigt.',
    );
  const m = /^([A-Z-]+)-(\d+)([ZU])\.(.+)$/.exec(code);
  if (!m || m[1] !== PREFIX[expect]) throw new SignalError('Das ist kein gültiger Code für „Angeln – Fürsten der Schlei“.');
  if (Number(m[2]) !== SIGNAL_VERSION)
    throw new SignalError(`Der Code stammt von einer anderen Spielversion (Code v${m[2]}, dieses Spiel v${SIGNAL_VERSION}). Beide müssen dieselbe Version nutzen.`);
  let bytes = b64urlDecode(m[4]);
  if (m[3] === 'Z') {
    if (!hasCompression()) throw new SignalError('Dieser Browser kann komprimierte Codes nicht lesen. Bitte einen aktuellen Browser verwenden.');
    try {
      bytes = await streamBytes(bytes, new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>, JSON_MAX_BYTES);
    } catch (e) {
      if (e instanceof SignalError) throw e;
      throw new SignalError('Der Code ist beschädigt oder unvollständig (Entpacken fehlgeschlagen).');
    }
  } else if (bytes.length > JSON_MAX_BYTES) throw new SignalError('Der Code ist zu groß.');
  let obj: unknown;
  try {
    obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new SignalError('Der Code ist beschädigt (ungültiger Inhalt).');
  }
  const p = obj as Partial<SignalPayload>;
  if (!p || typeof p !== 'object' || p.app !== 'angeln') throw new SignalError('Der Code gehört nicht zu diesem Spiel.');
  if (p.v !== SIGNAL_VERSION) throw new SignalError('Der Code stammt von einer anderen Spielversion.');
  if (p.k !== expect) throw new SignalError('Falsche Code-Art.');
  if (typeof p.sid !== 'string' || !/^[a-z0-9]{8,32}$/.test(p.sid)) throw new SignalError('Der Code hat eine ungültige Sitzungskennung.');
  if (typeof p.ts !== 'number' || !Number.isFinite(p.ts)) throw new SignalError('Der Code hat keinen gültigen Zeitstempel.');
  if (typeof p.sdp !== 'string' || p.sdp.length > SDP_MAX || !p.sdp.startsWith('v=0'))
    throw new SignalError('Der Code enthält keine gültige Verbindungsbeschreibung.');
  if (p.name !== undefined && (typeof p.name !== 'string' || p.name.length > 40)) throw new SignalError('Ungültiger Spielername im Code.');
  if (expect === 'offer' && now - p.ts > OFFER_MAX_AGE_MS)
    throw new SignalError('Diese Einladung ist veraltet (älter als 60 Minuten). Bitte eine neue Einladung erstellen lassen.');
  if (p.ts - now > OFFER_MAX_AGE_MS) throw new SignalError('Der Zeitstempel des Codes liegt weit in der Zukunft – bitte Uhrzeit der Geräte prüfen.');
  return p as SignalPayload;
}
