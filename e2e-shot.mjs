import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message + e.stack));
await p.goto('http://localhost:5173/');
await p.waitForTimeout(1000);
await p.click('text=Einzelspiel gegen die KI');
await p.click('text=Partie beginnen');
await p.waitForTimeout(1500);
await p.screenshot({ path: '/tmp/claude-0/shots/game.png' });
// Arbeiter mit Rahmen auswählen
await p.mouse.move(500, 250); await p.mouse.down(); await p.mouse.move(900, 550, {steps: 5}); await p.mouse.up();
await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/claude-0/shots/game2.png' });
console.log(errs.join('\n'));
await b.close();
