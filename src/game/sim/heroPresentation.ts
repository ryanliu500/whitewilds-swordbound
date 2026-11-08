/** Render-only tuning and analytical cloth envelopes; never modifies collision state. */
export const HERO_MOTION = { groundedPelvisRate: 2.4, gearSeconds: 0.6 };
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export function groundedOffset(current: number, target: number, dt: number, enabled: boolean) {
  if (!enabled) return target;
  const step = HERO_MOTION.groundedPelvisRate * Math.min(dt, 0.05);
  return current + Math.max(-step, Math.min(step, target - current));
}
export type ClothCapsule = { ax: number; ay: number; az: number; bx: number; by: number; bz: number; radius: number };
export const SCABBARD: ClothCapsule = { ax: -0.34, ay: 0.81, az: -0.32, bx: 0.34, by: -0.02, bz: -0.32, radius: 0.12 };
export const STOWED_SHIELD: ClothCapsule = { ax: 0.22, ay: 0.28, az: -0.43, bx: 0.22, by: 0.28, bz: -0.43, radius: 0.41 };
/** Project cloth to the back-facing surface. Works before frame one, not an iterative escape solver. */
export function capeClearance(x: number, y: number, z: number, volumes: readonly ClothCapsule[]) {
  let out = z;
  for (const v of volumes) {
    const dx = v.bx - v.ax, dy = v.by - v.ay;
    const len = dx * dx + dy * dy;
    const t = len > 1e-8 ? clamp01(((x - v.ax) * dx + (y - v.ay) * dy) / len) : 0;
    const cx = v.ax + dx * t, cy = v.ay + dy * t;
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    if (d2 < v.radius ** 2) out = Math.min(out, v.az + (v.bz - v.az) * t - Math.sqrt(v.radius ** 2 - d2) - 0.04);
  }
  return out;
}