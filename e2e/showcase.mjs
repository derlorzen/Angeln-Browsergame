// Erzeugt Screenshots einer weiterentwickelten Partie (KI baut für beide Seiten).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
await p.evaluate(() => localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Spieler', tutorialDone: true, renderer: 'auto' })));
await p.reload();
await p.click('[data-a=sp]');
await p.selectOption('[data-f=tut]', '0');
await p.click('[data-a=go]');
await p.waitForFunction(() => window.__game?.client?.units?.size > 0);
await p.evaluate(() => {
  const G = window.__game, d = G.driver;
  d.paused = true;
  d.world.players[0].isAI = true;
  d.ais.push(new window.__debug.AI(0, 'normal'));
  for (let i = 0; i < 600 * 8; i++) d.tick();
  d.paused = false;
});
await p.waitForTimeout(1500);
const shoot = async (name, z, dx = 0, dy = 0) => {
  await p.evaluate(({ z, dx, dy }) => {
    const G = window.__game, c = G.client;
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    G.renderer.cam.z = z;
    G.renderer.centerOn(dz.x + 1.5 + dx, dz.y + 1.5 + dy);
  }, { z, dx, dy });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `/tmp/claude-0/shots/${name}.png` });
};
await shoot('show-z1', 1, 0, 2);
await shoot('show-z2', 2, 1, 2);
await shoot('show-z05', 0.5, -6, 6);
await b.close();
