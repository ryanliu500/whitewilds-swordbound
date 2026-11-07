import { describe, expect, it } from 'vitest';
import { updateShield } from '../game/sim/shield';
import { createGame, emptyInput, step } from '../game/sim/game';

describe('hero shield (Q)', () => {
  it('pressing Q blocks on the very first frame', () => {
    const g = createGame();
    expect(g.player.shieldTime).toBe(0);
    step(g, { ...emptyInput(), guard: true }, 1 / 60);
    expect(g.player.blocking).toBe(true);
    expect(g.player.shieldTime).toBe(6);
  });
  it('stows after exactly six seconds without guarding', () => {
    expect(updateShield(6, false, 5.99)).toBeCloseTo(0.01);
    expect(updateShield(6, false, 6)).toBe(0);
  });
  it('stops blocking as soon as Q is released', () => {
    const g = createGame();
    step(g, { ...emptyInput(), guard: true }, 1 / 60);
    step(g, emptyInput(), 1 / 60);
    expect(g.player.blocking).toBe(false);
    expect(g.player.shieldTime).toBeGreaterThan(5.9);
  });
});
