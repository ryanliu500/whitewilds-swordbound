/**
 * Pure verlet ragdoll: 15 point masses joined by rigid bones and soft range links.
 * Lower torso (pelvis + hips) and upper torso (chest + shoulders) are separate
 * bodies joined by a spine with limited bend; arms swing freely in 3D; limbs
 * collide with each other, the ground, obstacles and enemy bodies.
 */
export const PARTS = ['pelvis','chest','head','shL','elL','haL','shR','elR','haR','hipL','knL','ftL','hipR','knR','ftR'] as const;
export type Part = typeof PARTS[number];
export type V3 = [number, number, number];
export type Ragdoll = { pos: V3[]; prev: V3[]; still: number };
const I = Object.fromEntries(PARTS.map((n, i) => [n, i])) as Record<Part, number>;

/** Rest pose in hero-local space (+x = hero's left, +z = forward), metres. */
const HIP_Y = 1.36;
export const REST: Record<Part, V3> = {
  pelvis: [0, HIP_Y, 0], chest: [0, HIP_Y + 0.76, 0], head: [0, HIP_Y + 1.2, 0],
  shL: [0.42, HIP_Y + 0.78, 0], elL: [0.42, HIP_Y + 0.28, 0], haL: [0.42, HIP_Y - 0.24, 0],
  shR: [-0.42, HIP_Y + 0.78, 0], elR: [-0.42, HIP_Y + 0.28, 0], haR: [-0.42, HIP_Y - 0.24, 0],
  hipL: [0.2, HIP_Y, 0], knL: [0.2, HIP_Y - 0.66, 0], ftL: [0.2, 0, 0],
  hipR: [-0.2, HIP_Y, 0], knR: [-0.2, HIP_Y - 0.66, 0], ftR: [-0.2, 0, 0],
};
const RADIUS: Record<Part, number> = { pelvis: .24, chest: .3, head: .27, shL: .13, elL: .08, haL: .08, shR: .13, elR: .08, haR: .08, hipL: .12, knL: .1, ftL: .1, hipR: .12, knR: .1, ftR: .1 };

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const restLen = (a: Part, b: Part) => dist(REST[a], REST[b]);
type Link = { a: number; b: number; min: number; max: number; k: number };
const bone = (a: Part, b: Part): Link => { const l = restLen(a, b); return { a: I[a], b: I[b], min: l, max: l, k: 1 }; };
const range = (a: Part, b: Part, lo: number, hi: number, k = 0.5): Link => { const l = restLen(a, b); return { a: I[a], b: I[b], min: l * lo, max: l * hi, k }; };
/** Keeps a hinge from folding shut: endpoints of a 2-bone chain stay at least `frac` of full reach apart. */
const hinge = (a: Part, m: Part, b: Part, frac: number): Link => ({ a: I[a], b: I[b], min: (restLen(a, m) + restLen(m, b)) * frac, max: restLen(a, m) + restLen(m, b), k: 0.8 });

export const LINKS: Link[] = [
  // lower torso (rigid triangle)
  bone('pelvis', 'hipL'), bone('pelvis', 'hipR'), bone('hipL', 'hipR'),
  // upper torso (rigid triangle)
  bone('chest', 'shL'), bone('chest', 'shR'), bone('shL', 'shR'),
  // spine: fixed length, bend and twist limited by soft shoulder↔hip ranges
  bone('pelvis', 'chest'),
  range('shL', 'hipL', 0.82, 1.06), range('shR', 'hipR', 0.82, 1.06),
  range('shL', 'hipR', 0.88, 1.08), range('shR', 'hipL', 0.88, 1.08),
  // neck: limited nod/tilt
  bone('chest', 'head'), range('head', 'shL', 0.85, 1.12, 0.6), range('head', 'shR', 0.85, 1.12, 0.6), range('head', 'pelvis', 0.9, 1.0, 0.6),
  // arms: free ball shoulders, elbows can't fold flat
  bone('shL', 'elL'), bone('elL', 'haL'), hinge('shL', 'elL', 'haL', 0.35),
  bone('shR', 'elR'), bone('elR', 'haR'), hinge('shR', 'elR', 'haR', 0.35),
  // legs: knees can't fold flat, thighs can't fold into the belly
  bone('hipL', 'knL'), bone('knL', 'ftL'), hinge('hipL', 'knL', 'ftL', 0.4), range('knL', 'chest', 0.55, 1.2, 0.4),
  bone('hipR', 'knR'), bone('knR', 'ftR'), hinge('hipR', 'knR', 'ftR', 0.4), range('knR', 'chest', 0.55, 1.2, 0.4),
];
const linked = new Set(LINKS.map(l => `${Math.min(l.a, l.b)}-${Math.max(l.a, l.b)}`));
/** Pairs that collide: anything not directly linked (arm vs torso, leg vs leg, hand vs head …). */
export const CONTACT_PAIRS: [number, number][] = [];
for (let a = 0; a < PARTS.length; a++) for (let b = a + 1; b < PARTS.length; b++) if (!linked.has(`${a}-${b}`)) CONTACT_PAIRS.push([a, b]);

export type World = { ground: (x: number, z: number, y: number) => number; push?: (p: V3, r: number) => void };
export const RAG = { gravity: 28, iterations: 10, groundFriction: 18, airDrag: 0.15, bounce: 0.25, stillSpeed: 0.8 };

/** Builds the ragdoll from the standing pose and throws it with velocity (vx,vy,vz) plus a torso hit spin. */
export function createRagdoll(x: number, y: number, z: number, rot: number, v: V3, dt = 1 / 60): Ragdoll {
  const c = Math.cos(rot), s = Math.sin(rot);
  const pos = PARTS.map(n => { const [lx, ly, lz] = REST[n]; return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c] as V3; });
  // upper body takes the hit harder than the feet → the body folds and tumbles instead of sliding stiffly
  const prev = pos.map((p, i) => { const h = (p[1] - y) / 2.6, k = 0.6 + h * 0.7; return [p[0] - v[0] * k * dt, p[1] - v[1] * (0.8 + h * 0.3) * dt, p[2] - v[2] * k * dt] as V3; });
  return { pos, prev, still: 0 };
}

/** Pushes the part nearest to (x,y,z) — how later hits and hitboxes shove individual limbs. */
export function hitRagdoll(r: Ragdoll, x: number, y: number, z: number, v: V3, dt = 1 / 60) {
  let best = 0, bd = Infinity;
  r.pos.forEach((p, i) => { const d = dist(p, [x, y, z]); if (d < bd) { bd = d; best = i; } });
  r.pos.forEach((p, i) => { const w = Math.max(0, 1 - dist(p, r.pos[best]!) / 1.2); const q = r.prev[i]!; q[0] -= v[0] * w * dt; q[1] -= v[1] * w * dt; q[2] -= v[2] * w * dt; });
}

export function stepRagdoll(r: Ragdoll, w: World, dt: number) {
  const { pos, prev } = r; let maxSpeed = 0;
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i]!, q = prev[i]!, drag = Math.exp(-RAG.airDrag * dt);
    const vx = (p[0] - q[0]) * drag, vy = (p[1] - q[1]) * drag, vz = (p[2] - q[2]) * drag;
    q[0] = p[0]; q[1] = p[1]; q[2] = p[2];
    p[0] += vx; p[1] += vy - RAG.gravity * dt * dt; p[2] += vz;
  }
  for (let it = 0; it < RAG.iterations; it++) {
    for (const l of LINKS) solveLink(pos[l.a]!, pos[l.b]!, l.min, l.max, l.k);
    for (const [a, b] of CONTACT_PAIRS) { const ra = RADIUS[PARTS[a]!], rb = RADIUS[PARTS[b]!]; solveLink(pos[a]!, pos[b]!, ra + rb, Infinity, 0.6); }
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i]!, rad = RADIUS[PARTS[i]!];
      w.push?.(p, rad);
      const g = w.ground(p[0], p[2], p[1]) + rad * 0.6;
      if (p[1] < g) {
        const q = prev[i]!, vy = p[1] - q[1];
        p[1] = g; if (vy < 0) q[1] = g + vy * RAG.bounce;
        // friction: drag the previous position toward the current one (kills sliding)
        const f = 1 - Math.exp(-RAG.groundFriction * dt / RAG.iterations * 4);
        q[0] += (p[0] - q[0]) * f; q[2] += (p[2] - q[2]) * f;
      }
    }
  }
  for (let i = 0; i < pos.length; i++) maxSpeed = Math.max(maxSpeed, dist(pos[i]!, prev[i]!) / dt);
  r.still = maxSpeed < RAG.stillSpeed ? r.still + dt : 0;
  return maxSpeed;
}

function solveLink(a: V3, b: V3, min: number, max: number, k: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz) || 1e-6;
  const target = d < min ? min : d > max ? max : d; if (target === d) return;
  const m = ((d - target) / d) * 0.5 * k;
  a[0] += dx * m; a[1] += dy * m; a[2] += dz * m; b[0] -= dx * m; b[1] -= dy * m; b[2] -= dz * m;
}

export const partIndex = I;
export const partPos = (r: Ragdoll, n: Part) => r.pos[I[n]]!;
