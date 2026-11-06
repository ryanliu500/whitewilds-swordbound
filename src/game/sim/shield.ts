export const SHIELD_HIDE_SECONDS = 6;

export function updateShield(remaining: number, reveal: boolean, using: boolean, dt: number) {
  if (reveal || (using && remaining > 0)) return SHIELD_HIDE_SECONDS;
  return Math.max(0, remaining - dt);
}

export function isDoubleClick(previous: number | null, now: number) {
  return previous !== null && now >= previous && now - previous <= 350;
}