import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameState } from './sim/game';

export const HERO_FABRIC = {
  outer: new THREE.MeshStandardMaterial({ color: '#434a50', roughness: 0.94, side: THREE.DoubleSide, flatShading: true }),
  lining: new THREE.MeshStandardMaterial({ color: '#687a7c', roughness: 1, side: THREE.DoubleSide, flatShading: true }),
  shadow: new THREE.MeshStandardMaterial({ color: '#141819', roughness: 1, side: THREE.DoubleSide, flatShading: true }),
};

/** Shared body motion in hero-local space (forward speed, sideways slide, turn rate, vertical speed). */
type Motion = { x: number; z: number; rot: number; fwd: number; side: number; turn: number; vy: number; time: number };
function useBodyMotion(game: GameState) {
  const m = useRef<Motion>({ x: game.player.x, z: game.player.z, rot: game.player.rot, fwd: 0, side: 0, turn: 0, vy: 0, time: 0 });
  return (dt: number) => {
    const s = m.current, p = game.player;
    const vx = (p.x - s.x) / Math.max(dt, 0.001), vz = (p.z - s.z) / Math.max(dt, 0.001);
    const sin = Math.sin(p.rot), cos = Math.cos(p.rot);
    const fwd = THREE.MathUtils.clamp(vx * sin + vz * cos, -30, 30);
    const side = THREE.MathUtils.clamp(vx * cos - vz * sin, -30, 30);
    const turn = THREE.MathUtils.clamp(Math.atan2(Math.sin(p.rot - s.rot), Math.cos(p.rot - s.rot)) / Math.max(dt, 0.001), -8, 8);
    const k = 1 - Math.exp(-12 * dt);
    s.fwd += (fwd - s.fwd) * k; s.side += (side - s.side) * k; s.turn += (turn - s.turn) * k;
    s.vy += ((p.grounded ? 0 : p.vy) - s.vy) * k;
    s.x = p.x; s.z = p.z; s.rot = p.rot; s.time += dt;
    return s;
  };
}

/** Per-row spring chain: each row chases the one above, so motion ripples down the fabric. */
function makeChain(n: number) { return Array.from({ length: n }, () => ({ x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0 })); }
function stepChain(chain: ReturnType<typeof makeChain>, tx: number, ty: number, tz: number, dt: number, stiff: number, damping: number) {
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i], t = i / Math.max(1, chain.length - 1);
    const prev = i === 0 ? { x: 0, y: 0, z: 0 } : chain[i - 1];
    // target is a blend of the drive force (stronger lower down) and the row above (cloth continuity)
    const gx = prev.x * 0.55 + tx * t, gy = prev.y * 0.55 + ty * t, gz = prev.z * 0.55 + tz * t;
    const k = stiff * (1 - t * 0.55);
    c.vx += ((gx - c.x) * k - c.vx * damping) * dt;
    c.vy += ((gy - c.y) * k - c.vy * damping) * dt;
    c.vz += ((gz - c.z) * k - c.vz * damping) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  }
}

/** Deep Jedi-style cowl: loose fabric that peaks back, lags head movement and drapes onto the shoulders. */
export function Hood({ game }: { game: GameState }) {
  const segs = 18, rows = 9;
  const { geometry, base } = useMemo(() => {
    const pos: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows; // 0 = shoulder drape, 1 = crown/peak
      for (let c = 0; c <= segs; c++) {
        const u = c / segs;
        // open front face: angle spans around the back, opening wider at bottom
        const open = 1.15 - t * 0.35;
        const a = open + u * (Math.PI * 2 - open * 2);
        const radius = t < 0.25 ? 0.5 - t * 0.6 : 0.36 + Math.sin((t - 0.25) / 0.75 * Math.PI) * 0.05 - Math.pow(Math.max(0, t - 0.7) / 0.3, 1.6) * 0.33;
        const y = -0.2 + t * 0.78;
        // folds around the rim and a peak that falls back
        const fold = Math.sin(u * Math.PI * 7) * 0.018 * (1 - t);
        const back = Math.pow(t, 2.2) * -0.16;
        pos.push(Math.sin(a) * (radius + fold), y, Math.cos(a) * (radius + fold) * 1.08 + back + 0.02);
        if (r < rows && c < segs) { const i = r * (segs + 1) + c, j = i + segs + 1; idx.push(i, j, i + 1, i + 1, j, j + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return { geometry: g, base: Float32Array.from(pos) };
  }, []);
  const motion = useBodyMotion(game);
  const chain = useRef(makeChain(rows + 1));
  useFrame((_, delta) => {
    if (game.paused) return;
    const dt = Math.min(delta, 0.05), m = motion(dt);
    // hood billows back with speed, swings opposite to turns, lifts when falling
    stepChain(chain.current, -m.side * 0.006 - m.turn * 0.03, -m.vy * 0.006, -Math.max(0, m.fwd) * 0.008, dt, 140, 9);
    const attr = geometry.getAttribute('position');
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, ch = chain.current[r];
      const crown = Math.max(0, t - 0.3);
      for (let c = 0; c <= segs; c++) {
        const i = (r * (segs + 1) + c) * 3, u = c / segs;
        const flutter = Math.sin(m.time * 7 + u * 9 + t * 4) * Math.min(0.03, Math.abs(m.fwd) * 0.0018);
        const rim = 1 - Math.abs(u - 0.5) * 2; // 0 at face edges
        attr.setXYZ(i / 3,
          base[i] + ch.x * crown,
          base[i + 1] + ch.y * crown + flutter * 0.5,
          base[i + 2] + ch.z * crown * (0.6 + rim) + flutter * (1 - t));
      }
    }
    attr.needsUpdate = true; geometry.computeVertexNormals();
  });
  return <group>
    <mesh name="hero-hood" geometry={geometry} material={HERO_FABRIC.outer} castShadow receiveShadow frustumCulled={false} />
    {/* shadowed face cavity */}
    <mesh position={[0, 0.17, 0.02]} scale={[1, 1.15, 0.85]} material={HERO_FABRIC.shadow}><icosahedronGeometry args={[0.29, 1]} /></mesh>
  </group>;
}

/** Shoulder mantle that drapes over both arms plus a long back cape, all driven by a spring chain. */
export function FlowingCloak({ game }: { game: GameState }) {
  const cols = 20, rows = 20;
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, cols, rows), []);
  const motion = useBodyMotion(game);
  const chain = useRef(makeChain(rows + 1));
  useFrame((_, delta) => {
    if (game.paused) return;
    const dt = Math.min(delta, 0.05), m = motion(dt), p = game.player;
    const airborne = !p.grounded && !p.swimming;
    const speed = Math.hypot(m.fwd, m.side);
    stepChain(chain.current,
      -m.side * 0.03 - m.turn * 0.12,
      (airborne ? Math.max(0, -m.vy) * 0.02 : 0) + speed * 0.012,
      -Math.max(0, m.fwd) * 0.045 - (airborne ? 0.35 : 0),
      dt, 90, 7);
    const attr = geometry.getAttribute('position');
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, free = t * t, ch = chain.current[row];
      for (let col = 0; col <= cols; col++) {
        const u = col / cols * 2 - 1; // -1..1 across, edges wrap around arms
        const edge = Math.abs(u);
        // wrap: outer columns curve forward over the shoulders/arms, less so further down
        const wrapAng = u * (1.75 - t * 0.6);
        const radius = 0.4 + t * 0.32;
        const wave = Math.sin(m.time * 5 - t * 7 + u * 3) * (0.02 + speed * 0.004) * free;
        const ripple = Math.sin(m.time * 9 - t * 11 + u * 5) * Math.min(0.05, speed * 0.002) * t;
        // shoulder mantle sits high, arm edges hang shorter than the back
        const len = 1.72 - edge * edge * 0.95;
        attr.setXYZ(row * (cols + 1) + col,
          Math.sin(wrapAng) * radius * 1.15 + ch.x * free + wave,
          0.7 - t * len + ch.y * free * (1 - edge * 0.5) + Math.cos(u * Math.PI * 6) * 0.015 * t,
          -Math.cos(wrapAng) * radius * 0.75 + 0.06 + ch.z * free * (1 - edge * 0.6) + Math.cos(u * Math.PI * 5) * 0.035 * t + ripple);
      }
    }
    attr.needsUpdate = true; geometry.computeVertexNormals();
  });
  return <group>
    <mesh name="hero-flowing-cloak" geometry={geometry} material={HERO_FABRIC.outer} castShadow receiveShadow frustumCulled={false} />
    <mesh position={[0, 0.68, 0]} material={HERO_FABRIC.lining} castShadow><cylinderGeometry args={[0.26, 0.5, 0.18, 12, 1, true]} /></mesh>
  </group>;
}
