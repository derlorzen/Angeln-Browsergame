// Übersicht: Gebäude und Einheiten der Zeitalter (für Sichtprüfung der prozeduralen Grafik).
// Aufruf: BASE_URL=http://localhost:5173/ OUT=datei.png node e2e/sheet-ages.mjs [buildings|units]
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
const what = process.argv[2] ?? 'buildings';
await p.evaluate(async (what) => {
  const S = await import('/src/render/sprites.ts');
  document.body.innerHTML = '';
  const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 1000; document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.fillStyle = '#6f8a44'; g.fillRect(0, 0, 1600, 1000);
  g.font = 'bold 16px Georgia'; g.fillStyle = '#fff';
  const col = S.PLAYER_COLORS[1];
  if (what === 'buildings') {
    const rows = [
      ['18. Jh.', [['manufaktur', 2], ['hafen', 2], ['schanze', 2], ['meierei', 1], ['gestuet', 1], ['salzsiederei', 1], ['zollhaus', 1]]],
      ['20. Jh.', [['dorfzentrum', 3], ['wohnhaus', 3], ['kaserne', 3], ['markt', 3], ['bahnhof', 3], ['fabrik', 3], ['bunker', 3]]],
      ['22. Jh.', [['dorfzentrum', 4], ['wohnhaus', 4], ['kaserne', 4], ['markt', 4], ['vertikalfarm', 4], ['gezeitenwerk', 4], ['schildturm', 4]]],
    ];
    let y = 10;
    for (const [label, list] of rows) {
      g.fillText(label, 10, y + 20);
      let x = 80, h = 0;
      for (const [t, age] of list) {
        const s = S.buildingSprite(t, col, 'angeln', age);
        const k = 0.5;
        g.drawImage(s.c, x, y, s.c.width * k, s.c.height * k);
        x += s.c.width * k;
        h = Math.max(h, s.c.height * k);
      }
      y += h + 10;
    }
  } else {
    const types = ['fuesilier', 'kanone', 'infanterist', 'panzer', 'exosoldat', 'drohne'];
    types.forEach((t, k) => {
      const fr = S.unitSprites(t, col, 'angeln');
      g.fillText(t, 10, 40 + k * 160);
      [0, 2, 5, 6].forEach((fi, j) => g.drawImage(fr[fi].c, 120 + j * 200, k * 160, fr[fi].c.width * 1.0, fr[fi].c.height * 1.0));
    });
  }
}, what);
await p.screenshot({ path: process.env.OUT ?? `/tmp/ages-${what}.png` });
await b.close();
