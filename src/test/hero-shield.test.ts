import { describe, expect, it } from 'vitest';
import { isDoubleClick, updateShield } from '../game/sim/shield';
import { createGame, emptyInput, step } from '../game/sim/game';

describe('hero shield', () => {
  it('starts hidden and reveals for six seconds', () => {
    const g = createGame();
    expect(g.player.shieldTime).toBe(0);
    step(g, { ...emptyInput(), shield: true }, 0.05);
    expect(g.player.shieldTime).toBe(6);
  });
  it('hides after exactly six seconds without use', () => {
    expect(updateShield(6, false, false, 5.99)).toBeCloseTo(0.01);
    expect(updateShield(6, false, false, 6)).toBe(0);
  });
  it('resets six seconds when the visible shield is used', () => {
    expect(updateShield(0.1, false, true, 0.05)).toBe(6);
    expect(updateShield(0, false, true, 0.05)).toBe(0);
  });
  it('requires two clicks close together to reveal', () => {
    expect(isDoubleClick(null, 100)).toBe(false);
    expect(isDoubleClick(100, 300)).toBe(true);
    expect(isDoubleClick(100, 451)).toBe(false);
  });
  it('cannot block with a hidden shield', () => {
    const g = createGame();
    step(g, { ...emptyInput(), block: true }, 0.05);
    expect(g.player.blocking).toBe(false);
    step(g, { ...emptyInput(), shield: true, block: true }, 0.05);
    expect(g.player.blocking).toBe(true);
  });
});