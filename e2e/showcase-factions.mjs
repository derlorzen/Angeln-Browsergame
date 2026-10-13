// Screenshots: Parteiwahl und je eine von der KI aufgebaute Siedlung jeder Partei.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
await p.evaluate(() => localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Spieler', tutorialDone: true, renderer: 'auto' })));
await p.reload();
await p.click('[data-a=sp]');
await p.selectOption('[data-f=fac]', 'daenen');
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/shots/setup-factions.png' });
for (const fac of ['angeln', 'schwansen', 'friesen', 'daenen']) {
  await p.selectOption('[data-f=fac]', fac);
  await p.selectOption('[data-f=tut]', '0');
  await p.click('[data-a=go]');
  await p.waitForFunction(() => window.__game?.client?.units?.size > 0);
  await p.evaluate(() => {
    const G = window.__game, d = G.driver;
    d.paused = true;
    d.world.players[0].isAI = true;
    d.ais.push(new window.__debug.AI(0, 'normal'));
    for (let i = 0; i < 600 * 7; i++) d.tick();
    d.paused = false;
    const c = G.client;
    const dz = [...c.buildings.values()].find((x) => x.o === c.me && x.t === 'dorfzentrum');
    G.renderer.cam.z = 1.25;
    G.renderer.centerOn(dz.x + 2, dz.y + 3);
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `/tmp/claude-0/shots/fac-${fac}.png` });
  await p.evaluate(() => window.__game.opts.onExit());
  await p.waitForSelector('[data-a=sp]');
  await p.click('[data-a=sp]');
}
await b.close();
