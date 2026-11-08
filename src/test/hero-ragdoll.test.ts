import { describe, expect, it } from 'vitest';
import { createGame, damagePlayer, emptyInput, step } from '@/game/sim/game';
import { partPos } from '@/game/sim/ragdoll';

const run = (g: ReturnType<typeof createGame>, s: number) => { for (let n = 0; n < s * 60; n++) step(g, emptyInput(), 1 / 60); };

describe('player ragdoll', () => {
  it('a fatal hit shows game over once, then respawns and stays alive', () => {
    const g = createGame(); damagePlayer(g, 100, g.player.x - 1, g.player.z, 10);
    run(g, 15);
    expect(g.deaths).toBe(1);
    expect(g.gameOver).toBe(0);
    expect(g.player.dead).toBe(false);
  });
  it('upper and lower torso are separate parts that stay joined', () => {
    const g = createGame(); damagePlayer(g, 5, g.player.x - 1, g.player.z, 20);
    run(g, 0.5);
    const r = g.player.rag!, a = partPos(r, 'pelvis'), b = partPos(r, 'chest');
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(0.76, 1);
  });
});
