// Erzeugt Übersichtsbilder aller Einheiten- und Gebäudesprites (zur Sichtprüfung).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
const what = process.argv[2] ?? 'units';
await p.evaluate(async (what) => {
  const S = await import('/src/render/sprites.ts');
  document.body.innerHTML = '';
  const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900; document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.fillStyle = '#6f8a44'; g.fillRect(0, 0, 1400, 900);
  if (what === 'units') {
    const types = ['arbeiter', 'landsknecht', 'schuetze', 'spaeher'];
    types.forEach((t, row) => {
      const fr = S.unitSprites(t, S.PLAYER_COLORS[row % 4]);
      fr.forEach((s, k) => { const r = s.res; g.drawImage(s.c, 20 + k * 190, 10 + row * 220, s.c.width * 1.1, s.c.height * 1.1); });
    });
  } else {
    const ts = what === 'big' ? ['dorfzentrum','wohnhaus','bauernhof','kaserne'] : ['dorfzentrum','wohnhaus','holzfaeller','bauernhof','muehle','heringszaun','raeucherei','lehmgrube','markt','kaserne','brarupmarkt'];
    let x = 10, y = 10, rowH = 0;
    for (const t of ts) {
      const s = S.buildingSprite(t, S.PLAYER_COLORS[0]);
      const k = what === 'big' ? 1.1 : 0.62; const w = s.c.width * k, h = s.c.height * k;
      if (x + w > 1400) { x = 10; y += rowH + 5; rowH = 0; }
      g.drawImage(s.c, x, y, w, h); x += w + 5; rowH = Math.max(rowH, h);
    }
  }
}, what);
await p.screenshot({ path: `/tmp/claude-0/shots/sheet-${what}.png` });
await b.close();
