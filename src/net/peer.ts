// Direkte WebRTC-Verbindung mit DataChannel. Kein Signaling-Server: Angebot/Antwort laufen über kopierte Codes.
// ICE-Dienste sind optional und konfigurierbar (öffentlicher STUN, kein ICE, eigener TURN).
import { SignalError, decodeSignal, encodeSignal, newSessionId, type SignalPayload } from './signal';

export interface IceSettings {
  mode: 'stun' | 'none';
  stunUrl: string;
  turnUrl: string;
  turnUser: string;
  turnPass: string;
}

export const DEFAULT_ICE: IceSettings = {
  mode: 'stun',
  stunUrl: 'stun:stun.l.google.com:19302',
  turnUrl: '',
  turnUser: '',
  turnPass: '',
};

export function iceServers(s: IceSettings): RTCIceServer[] {
  const out: RTCIceServer[] = [];
  if (s.mode === 'stun' && /^stuns?:[^\s]+$/.test(s.stunUrl.trim())) out.push({ urls: s.stunUrl.trim() });
  if (/^turns?:[^\s]+$/.test(s.turnUrl.trim())) out.push({ urls: s.turnUrl.trim(), username: s.turnUser, credential: s.turnPass });
  return out;
}

export type LinkState = 'new' | 'gathering' | 'waiting' | 'connecting' | 'open' | 'closed' | 'failed';

const GATHER_TIMEOUT_MS = 8000;
const CONNECT_TIMEOUT_MS = 25000;
export const MAX_INBOUND_BYTES = 256 * 1024;

export class PeerLink {
  readonly pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  state: LinkState = 'new';
  sid = '';
  answered = false;
  candidateTypes = new Set<string>();
  onOpen: () => void = () => {};
  onMessage: (data: unknown) => void = () => {};
  onClose: (reason: string) => void = () => {};
  onState: (s: LinkState) => void = () => {};
  private closedReason = '';
  private connectTimer = 0;

  constructor(readonly ice: IceSettings) {
    this.pc = new RTCPeerConnection({ iceServers: iceServers(ice) });
    this.pc.onicecandidate = (e) => {
      if (e.candidate?.type) this.candidateTypes.add(e.candidate.type);
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === 'failed') this.fail(this.failText());
      else if (s === 'disconnected') {
        // kann sich erholen (kurzer Netz- oder Lastaussetzer) – abwarten
        window.setTimeout(() => {
          if (this.pc.connectionState === 'disconnected') this.fail('Die Verbindung zum Mitspieler ist abgerissen.');
        }, 15000);
      }
    };
    this.pc.ondatachannel = (e) => this.attach(e.channel);
  }

  private failText(): string {
    const relay = this.ice.turnUrl ? '' : ' Ohne TURN-Relay ist keine Umleitung möglich.';
    const mode = this.ice.mode === 'none'
      ? ' Im Modus „ohne ICE-Dienste“ klappt die Verbindung meist nur im selben lokalen Netz.'
      : '';
    return `Es konnte keine direkte Verbindung hergestellt werden (NAT/Firewall blockiert).${mode}${relay}`;
  }

  private setState(s: LinkState): void {
    this.state = s;
    this.onState(s);
  }

  private attach(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      window.clearTimeout(this.connectTimer);
      this.setState('open');
      this.onOpen();
    };
    dc.onclose = () => this.fail(this.closedReason || 'Der Datenkanal wurde geschlossen – Mitspieler hat das Spiel verlassen.');
    dc.onerror = () => undefined;
    dc.onmessage = (e) => {
      const size = typeof e.data === 'string' ? e.data.length : (e.data as ArrayBuffer).byteLength;
      if (size > MAX_INBOUND_BYTES) return; // übergroße Nachrichten verwerfen
      if (typeof e.data !== 'string') return;
      let obj: unknown;
      try {
        obj = JSON.parse(e.data);
      } catch {
        return;
      }
      this.onMessage(obj);
    };
  }

  private fail(reason: string): void {
    if (this.state === 'closed' || this.state === 'failed') return;
    window.clearTimeout(this.connectTimer);
    this.setState('failed');
    this.closedReason = reason;
    try {
      this.pc.close();
    } catch {
      /* ignorieren */
    }
    this.onClose(reason);
  }

  close(reason = 'Verbindung beendet.'): void {
    if (this.state === 'closed' || this.state === 'failed') return;
    this.closedReason = reason;
    window.clearTimeout(this.connectTimer);
    this.setState('closed');
    try {
      this.dc?.close();
      this.pc.close();
    } catch {
      /* ignorieren */
    }
  }

  send(obj: unknown): boolean {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    // Warteschlange begrenzen: bei Rückstau wird nicht weiter gepuffert
    if (this.dc.bufferedAmount > 2 * 1024 * 1024) return false;
    try {
      this.dc.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  get buffered(): number {
    return this.dc?.bufferedAmount ?? 0;
  }

  private async gather(): Promise<void> {
    this.setState('gathering');
    if (this.pc.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      const t = window.setTimeout(resolve, GATHER_TIMEOUT_MS);
      this.pc.addEventListener('icegatheringstatechange', () => {
        if (this.pc.iceGatheringState === 'complete') {
          window.clearTimeout(t);
          resolve();
        }
      });
    });
  }

  /** Spieler A: Angebot erzeugen, ICE-Sammlung abwarten, Einladungscode liefern. */
  static async host(ice: IceSettings, name: string): Promise<{ link: PeerLink; code: string }> {
    const link = new PeerLink(ice);
    link.sid = newSessionId();
    link.attach(link.pc.createDataChannel('angeln', { ordered: true }));
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await link.gather();
    const sdp = link.pc.localDescription?.sdp ?? '';
    if (!/a=candidate/.test(sdp)) throw new SignalError('Es wurden keine Verbindungswege (ICE-Kandidaten) gefunden.');
    const code = await encodeSignal({ app: 'angeln', v: 1, k: 'offer', sid: link.sid, ts: Date.now(), sdp, name });
    link.setState('waiting');
    return { link, code };
  }

  /** Spieler B: Einladung prüfen, Antwort erzeugen und als Code liefern. */
  static async join(ice: IceSettings, offerCode: string, name: string): Promise<{ link: PeerLink; code: string; offer: SignalPayload }> {
    const offer = await decodeSignal(offerCode, 'offer');
    const link = new PeerLink(ice);
    link.sid = offer.sid;
    try {
      await link.pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
    } catch {
      link.close();
      throw new SignalError('Die Einladung enthält eine ungültige Verbindungsbeschreibung.');
    }
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await link.gather();
    const sdp = link.pc.localDescription?.sdp ?? '';
    const code = await encodeSignal({ app: 'angeln', v: 1, k: 'answer', sid: offer.sid, ts: Date.now(), sdp, name });
    link.setState('connecting');
    link.armTimeout();
    return { link, code, offer };
  }

  /** Spieler A: Antwortcode anwenden. Doppelte oder fremde Antworten werden abgewiesen. */
  async acceptAnswer(code: string): Promise<SignalPayload> {
    if (this.answered) throw new SignalError('Für diese Einladung wurde bereits ein Antwortcode eingegeben. Für einen neuen Versuch bitte „Neue Einladung“ wählen.');
    if (this.state === 'closed' || this.state === 'failed') throw new SignalError('Diese Einladung ist nicht mehr aktiv. Bitte eine neue Einladung erstellen.');
    const ans = await decodeSignal(code, 'answer');
    if (ans.sid !== this.sid) throw new SignalError('Dieser Antwortcode gehört zu einer anderen (älteren) Einladung. Der Mitspieler muss die aktuelle Einladung verwenden.');
    this.answered = true;
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: ans.sdp });
    } catch {
      this.answered = false;
      throw new SignalError('Der Antwortcode enthält eine ungültige Verbindungsbeschreibung.');
    }
    this.setState('connecting');
    this.armTimeout();
    return ans;
  }

  private armTimeout(): void {
    window.clearTimeout(this.connectTimer);
    this.connectTimer = window.setTimeout(() => {
      if (this.state !== 'open') this.fail(this.failText());
    }, CONNECT_TIMEOUT_MS);
  }
}
