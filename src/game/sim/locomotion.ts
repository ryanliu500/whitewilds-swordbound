export const LOCOMOTION = { turnSpeed: 9, turnResponse: 12, maxSlopeDegrees: 55, groundProbe: 0.6 };
export function angleDifference(target: number, current: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
export function turnTowards(current: number, target: number, dt: number) {
  const error = angleDifference(target, current);
  const amount = Math.min(Math.abs(error) * (1 - Math.exp(-LOCOMOTION.turnResponse * dt)), LOCOMOTION.turnSpeed * dt);
  return current + Math.sign(error) * amount;
}
export function walkableSlope(sample: (x: number, z: number) => number, x: number, z: number) {
  const probe = 0.3;
  const sx = (sample(x + probe, z) - sample(x - probe, z)) / (2 * probe);
  const sz = (sample(x, z + probe) - sample(x, z - probe)) / (2 * probe);
  return Math.hypot(sx, sz) <= Math.tan(LOCOMOTION.maxSlopeDegrees * Math.PI / 180);
}
export function canFollowGround(wasGrounded: boolean, vy: number, previousGround: number, ground: number, distance: number, walkable: boolean) {
  return wasGrounded && vy <= 0 && walkable && Math.abs(ground - previousGround) <= LOCOMOTION.groundProbe + distance * Math.tan(LOCOMOTION.maxSlopeDegrees * Math.PI / 180);
}