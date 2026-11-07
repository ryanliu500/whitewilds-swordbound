import { describe, expect, it } from 'vitest';
import { COMBAT, chooseAttack, isLaunch, thrustSpeed } from '../game/sim/combat';
import { createGame, damagePlayer, emptyInput, step } from '../game/sim/game';

const run = (g: ReturnType<typeof createGame>, s: number, i = emptyInput()) => { for (let n = 0; n < Math.round(s * 60); n++) step(g, i, 1 / 60); };

describe('Phase 1B combat', () => {
  it('jump slash beats sprint thrust, which beats the combo', () => {
    expect(chooseAttack(true, true, 2)).toBe('jump');
    expect(chooseAttack(false, true, 2)).toBe('thrustWind');
    expect(chooseAttack(false, false, 3)).toBe('spin');
  });
  it('starts unarmed, draws on click, sheathes after 12s idle', () => {
    const g = createGame();
    expect(g.player.sword).toBe(0);
    step(g, { ...emptyInput(), attack: true }, 1 / 60);
    expect(g.player.sword).toBeGreaterThan(11.9);
    run(g, 11.8);
    expect(g.player.sword).toBeGreaterThan(0);
    run(g, 0.3);
    expect(g.player.sword).toBe(0);
  });
  it('chains four different hits in a row', () => {
    const g = createGame(); const kinds: string[] = [];
    for (let n = 0; n < 4; n++) { step(g, { ...emptyInput(), attack: true }, 1 / 60); kinds.push(g.player.move.kind); run(g, 0.62); }
    expect(kinds).toEqual(['slash1', 'slash2', 'slash3', 'spin']);
  });
  it('sprint thrust: 1.5s wind-up, sprint→jog over 2s, then down to a limp over 4s', () => {
    expect(COMBAT.durations.thrustWind).toBe(1.5);
    expect(COMBAT.durations.thrustEnd).toBe(1.5);
    expect(thrustSpeed(0)).toBeCloseTo(COMBAT.sprintSpeed);
    expect(thrustSpeed(2)).toBeCloseTo(COMBAT.jogSpeed);
    expect(thrustSpeed(6)).toBeCloseTo(COMBAT.limpSpeed);
    expect(thrustSpeed(4)).toBeLessThan(COMBAT.jogSpeed);
  });
  it('only heavy hits launch the hero into a ragdoll', () => {
    expect(isLaunch(18)).toBe(true);
    expect(isLaunch(7)).toBe(false);
    const g = createGame();
    damagePlayer(g, 10, g.player.x, g.player.z + 2, 7);
    expect(g.player.ragdoll).toBe(false);
    g.player.invulnerable = 0;
    damagePlayer(g, 10, g.player.x, g.player.z + 2, 18);
    expect(g.player.ragdoll).toBe(true);
  });
  it('a fatal ragdoll shows game over within the 6s watchdog', () => {
    const g = createGame();
    damagePlayer(g, 999, g.player.x, g.player.z + 2, 18);
    run(g, 6.1);
    expect(g.gameOver > 0 || g.deaths === 1).toBe(true);
  });
});
