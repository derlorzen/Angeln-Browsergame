// Übersicht: Dorfzentrum, Wohnhaus, Bauernhof, Kaserne und alle Einheiten je Partei.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
const what = process.argv[2] ?? 'buildings';
await p.evaluate(async (what) => {
  const S = await import('/src/render/sprites.ts');
  const F = await import('/src/data/factions.ts');
  document.body.innerHTML = '';
  const cv = document.createElement('canvas'); cv.width = 1500; cv.height = 1000; document.body.appendChild(cv);
  const g = cv.getContext('2d');
  g.fillStyle = '#6f8a44'; g.fillRect(0, 0, 1500, 1000);
  g.font = 'bold 20px Georgia'; g.fillStyle = '#fff';
  F.FACTIONS.forEach((f, row) => {
    const col = S.PLAYER_COLORS[row];
    g.fillText(F.FACTION_DEFS[f].name, 10, 30 + row * 245);
    if (what === 'buildings') {
      let x = 10;
      for (const t of ['dorfzentrum', 'wohnhaus', 'bauernhof', 'kaserne', 'raeucherei']) {
        const s = S.buildingSprite(t, col, F.FACTION_DEFS[f].arch);
        const k = 0.55;
        g.drawImage(s.c, x, 40 + row * 245, s.c.width * k, s.c.height * k);
        x += s.c.width * k;
      }
    } else {
      const types = ['arbeiter', 'landsknecht', 'schuetze', 'spaeher', F.FACTION_DEFS[f].unique];
      types.forEach((t, k) => {
        const fr = S.unitSprites(t, col, f);
        [0, 2, 5, 6].forEach((fi, j) => g.drawImage(fr[fi].c, 10 + k * 290 + j * 70, 20 + row * 245, fr[fi].c.width * 0.55, fr[fi].c.height * 0.55));
      });
    }
  });
}, what);
await p.screenshot({ path: `/tmp/claude-0/shots/factions-${what}.png` });
await b.close();
