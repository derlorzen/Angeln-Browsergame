import { expect, test } from 'vitest';
import { World } from '../src/sim/world';
import { AI } from '../src/ai/ai';

test('Balance: KI gegen KI endet in 8–40 Minuten mit einem Sieger', () => {
  for (const [seed, l0, l1] of [[1234,'normal','normal'],[99,'normal','normal'],[5,'leicht','normal'],[77,'normal','leicht']] as const) {
    const w = new World({ seed, players: [
      { name: 'A', color: 0, slot: 0, isAI: true, aiLevel: l0 }, { name: 'B', color: 1, slot: 1, isAI: true, aiLevel: l1 }] });
    const ais = [new AI(0, l0), new AI(1, l1)];
    const t0 = performance.now();
    let peakUnits = 0;
    for (let t = 0; t < 10 * 60 * 50 && w.winner < 0; t++) {
      for (const a of ais) a.update(w);
      w.step();
      if (t % 100 === 0) peakUnits = Math.max(peakUnits, [...w.ents.values()].filter(e => e.kind === 'u').length);
    }
    console.log(`seed ${seed} ${l0}/${l1}: winner ${w.winner} (${w.winReason}) at ${(w.tick/600).toFixed(1)} min, prestige ${w.players.map(p=>p.prestige)}, peakUnits ${peakUnits}, ms ${(performance.now()-t0).toFixed(0)}`);
    expect(w.winner).toBeGreaterThanOrEqual(0);
    expect(w.tick / 600).toBeGreaterThan(8);
    expect(w.tick / 600).toBeLessThan(40);
    console.log('  stats', w.players.map(p => `kills ${p.stats.kills} lost ${p.stats.lost} trained ${p.stats.trained} sold ${p.stats.sold}`).join(' | '));
  }
}, 300000);
