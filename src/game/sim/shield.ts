export const SHIELD_HIDE_SECONDS = 6;

/** Guarding (Q held) reveals instantly and keeps the shield out; it stows after 6s of not guarding. */
export function updateShield(remaining: number, guarding: boolean, dt: number) {
  if (guarding) return SHIELD_HIDE_SECONDS;
  return Math.max(0, remaining - dt);
}
