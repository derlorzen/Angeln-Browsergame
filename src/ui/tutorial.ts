// Kurzer Einstieg: Schritt-für-Schritt-Hinweise, die sich anhand des Spielzustands selbst abhaken.
import type { Game } from '../game/game';

interface Step {
  text: string;
  done: (g: Game) => boolean;
}

export class Tutorial {
  private el = document.getElementById('tutorial')!;
  private flags = new Set<string>();
  private doneSteps = new Set<number>();
  private steps: Step[];
  private lastHtml = '';

  constructor(private game: Game, visible: boolean) {
    const own = (t: string, built = false) => [...game.client.buildings.values()].some((b) => b.o === game.client.me && b.t === t && (!built || b.b));
    this.steps = [
      { text: 'Kamera bewegen: Pfeiltasten, Mauszeiger an den Bildrand oder mittlere Maustaste ziehen. Mausrad zoomt.', done: () => this.flags.has('cam') },
      { text: 'Arbeiter auswählen: Linksklick auf einen Arbeiter oder einen Rahmen um mehrere ziehen.', done: (g) => [...g.selected].some((id) => g.client.units.get(id)?.t === 'arbeiter') },
      { text: 'Rechtsklick auf einen Baum: Die Arbeiter schlagen Holz und bringen es zum Dorfzentrum.', done: () => this.flags.has('gather') },
      { text: 'Wohnhaus bauen: Arbeiter wählen → Wohnhaus-Knopf (unten rechts, Taste Q) → gültigen grünen Platz anklicken.', done: () => own('wohnhaus') },
      { text: 'Bauernhof bauen und Arbeiter zuweisen (Arbeiter wählen, Rechtsklick auf den fertigen Hof). Er liefert Getreide.', done: () => [...game.client.buildings.values()].some((b) => b.o === game.client.me && b.t === 'bauernhof' && (b.st?.length ?? 0) > 0) },
      { text: 'Lehmgrube auf braunem Lehmboden bauen und besetzen. Heringszaun am Ufer der Schlei liefert Fisch.', done: () => own('lehmgrube') && own('heringszaun') },
      { text: 'Waren herstellen: Bockmühle (Getreide → Waren) oder Räucherei (Fisch + Holz → Waren).', done: () => own('muehle', true) || own('raeucherei', true) },
      { text: 'Markt bauen und Waren verkaufen: bringt Taler und Prestige. Tipp: automatischen Verkauf einschalten.', done: () => this.flags.has('sold') },
      { text: 'Kaserne bauen und Soldaten ausbilden. Besetzt den Brarup-Markt in Süderbrarup (Westen) für Handelsvorteile.', done: () => own('kaserne', true) },
      { text: 'Späher ins Thorsberger Moor schicken (Westen, „?“): Die Fundstelle bringt einmalig Prestige und Taler.', done: (g) => g.client.moor >= 0 },
      { text: 'Sieg: Gegnerisches Dorfzentrum (Kappeln/Arnis) zerstören – oder als Erster das Prestigeziel erreichen.', done: (g) => g.client.winner >= 0 },
    ];
    this.el.classList.toggle('hidden', !visible);
  }

  flag(f: string): void {
    this.flags.add(f);
  }

  toggle(): void {
    this.el.classList.toggle('hidden');
    this.lastHtml = '';
  }

  update(): void {
    if (this.el.classList.contains('hidden')) {
      // Fortschritt trotzdem mitführen
      this.steps.forEach((s, k) => s.done(this.game) && this.doneSteps.add(k));
      return;
    }
    this.steps.forEach((s, k) => {
      if (!this.doneSteps.has(k) && s.done(this.game)) this.doneSteps.add(k);
    });
    const cur = this.steps.findIndex((_, k) => !this.doneSteps.has(k));
    // kompakt: erledigte Schritte zählen, nur aktuellen und nächsten Schritt zeigen
    const shown = cur < 0 ? [] : [cur, cur + 1].filter((k) => k < this.steps.length);
    const html = `<h3>Lehrmeister <span class="note">${this.doneSteps.size}/${this.steps.length}</span> <button class="btn" data-x>×</button></h3><ol start="${cur + 1}">${shown
      .map((k) => `<li class="${this.doneSteps.has(k) ? 'done' : k === cur ? 'cur' : ''}">${this.steps[k].text}</li>`)
      .join('')}</ol>${cur < 0 ? '<p>Alle Schritte erledigt – viel Erfolg!</p>' : ''}<div class="note">F1: Steuerung · F2: Lehrmeister ein/aus</div>`;
    if (html !== this.lastHtml) {
      this.lastHtml = html;
      this.el.innerHTML = html;
      this.el.querySelector('[data-x]')?.addEventListener('click', () => this.toggle());
    }
  }
}
