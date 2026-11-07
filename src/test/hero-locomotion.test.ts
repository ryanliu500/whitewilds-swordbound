import { describe, expect, it } from 'vitest';
import { createGame, emptyInput, step } from '../game/sim/game';
import { heightAt, ISLAND } from '../game/sim/world';

describe('Phase 1A locomotion', () => {
  for (const hz of [20, 60, 120]) {
    for (const forward of [-1, 1]) {
      it(`keeps feet grounded on tutorial slopes at ${hz}Hz, direction ${forward}`, () => {
        const g = createGame();
        g.player.z = ISLAND[1] + 170;
        g.player.y = heightAt(g.player.x, g.player.z);
        for (let n = 0; n < hz * 4; n++) {
          step(g, { ...emptyInput(), forward }, 1 / hz);
          expect(g.player.grounded).toBe(true);
          expect(g.player.y).toBeCloseTo(heightAt(g.player.x, g.player.z), 6);
        }
      });
    }
  }
  it('animates a reversal rather than snapping 180 degrees', () => {
    const g = createGame();
    const before = g.player.rot;
    step(g, { ...emptyInput(), forward: -1 }, 1 / 60);
    const turned = Math.abs(Math.atan2(Math.sin(g.player.rot - before), Math.cos(g.player.rot - before)));
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(0.3);
    for (let n = 0; n < 90; n++) step(g, { ...emptyInput(), forward: -1 }, 1 / 60);
    expect(Math.cos(g.player.rot)).toBeCloseTo(1, 4);
  });
  it('does not glue a deliberate jump to the slope', () => {
    const g = createGame();
    step(g, { ...emptyInput(), jump: true, forward: 1 }, 1 / 60);
    expect(g.player.grounded).toBe(false);
    expect(g.player.vy).toBeGreaterThan(0);
    expect(g.player.y).toBeGreaterThan(heightAt(g.player.x, g.player.z));
  });
});