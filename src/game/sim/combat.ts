/** Pure Phase 1B combat rules: attack priority, timings, sprint-thrust pacing, launch threshold. */
export type MoveKind = 'none' | 'slash1' | 'slash2' | 'slash3' | 'spin' | 'jump' | 'jumpLand' | 'thrustWind' | 'thrust' | 'thrustEnd' | 'getup';

export const COMBAT = {
  swordStow: 12,        // seconds without attacking before the sword is sheathed
  shieldStow: 6,        // seconds without guarding before the shield is stowed
  comboWindow: 0.55,    // time after a slash ends to continue the combo
  chainAt: 0.6,         // fraction of a slash after which the next slash may start
  durations: { slash1: 0.5, slash2: 0.5, slash3: 0.62, spin: 0.9, jumpLand: 0.8, thrustWind: 1.5, thrustEnd: 1.5, getup: 1.5 } as Record<string, number> & Record<"slash1"|"slash2"|"slash3"|"spin"|"jumpLand"|"thrustWind"|"thrustEnd"|"getup"|"thrust", number>,
  damage: { slash1: 25, slash2: 25, slash3: 32, spin: 38, jumpLand: 50, thrust: 18 } as Record<string, number> & Record<"slash1"|"slash2"|"slash3"|"spin"|"jumpLand"|"thrustWind"|"thrustEnd"|"getup"|"thrust", number>,
  thrustTick: 0.4,
  sprintSpeed: 30.8, jogSpeed: 14, limpSpeed: 2.5,
  thrustDecel: 2, thrustFatigue: 4,
  launchImpulse: 14,    // hits at or above this impulse ragdoll the hero (boss smashes ≈ top 40%)
  ragdollWatchdog: 6,   // master cap: game over / get-up happens no later than this
  gameOverSeconds: 2.5,
};

const COMBO: MoveKind[] = ['slash1', 'slash2', 'slash3', 'spin'];

/** Jump slash beats everything; sprint thrust beats the ground combo. */
export function chooseAttack(airborne: boolean, sprinting: boolean, comboIndex: number): MoveKind {
  if (airborne) return 'jump';
  if (sprinting) return 'thrustWind';
  return COMBO[((comboIndex % 4) + 4) % 4]!;
}

export const isSlash = (k: MoveKind) => k === 'slash1' || k === 'slash2' || k === 'slash3' || k === 'spin';
export const comboIndexOf = (k: MoveKind) => COMBO.indexOf(k);

/** Forward speed while holding a sprint thrust: sprint → jog over 2s, then → limp over 4s. */
export function thrustSpeed(t: number) {
  const { sprintSpeed: s, jogSpeed: j, limpSpeed: l, thrustDecel: a, thrustFatigue: b } = COMBAT;
  if (t <= a) return s + (j - s) * (t / a);
  if (t <= a + b) { const u = (t - a) / b; return j + (l - j) * (1 - (1 - u) * (1 - u)); }
  return l;
}

export const isLaunch = (impulse: number) => impulse >= COMBAT.launchImpulse;

/** Movement multiplier during a move (thrust phases return null: they set speed directly). */
export function moveSpeedFactor(k: MoveKind) {
  if (k === 'slash1' || k === 'slash2' || k === 'slash3') return 0.15;
  if (k === 'spin') return 0.3;
  if (k === 'jumpLand' || k === 'getup') return 0;
  if (k === 'thrustEnd') return 0.12;
  return 1;
}
