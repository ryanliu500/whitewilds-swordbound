import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameState } from './sim/game';

export const HERO_FABRIC = {
  outer: new THREE.MeshStandardMaterial({ color: '#e8e6df', roughness: 0.94, side: THREE.DoubleSide }),
  lining: new THREE.MeshStandardMaterial({ color: '#b8c9cc', roughness: 1, side: THREE.DoubleSide }),
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
    if (!c) continue;
    const prev = chain[i - 1] ?? { x: 0, y: 0, z: 0 };
    // target is a blend of the drive force (stronger lower down) and the row above (cloth continuity)
    const gx = prev.x * 0.55 + tx * t, gy = prev.y * 0.55 + ty * t, gz = prev.z * 0.55 + tz * t;
    const k = stiff * (1 - t * 0.55);
    c.vx += ((gx - c.x) * k - c.vx * damping) * dt;
    c.vy += ((gy - c.y) * k - c.vy * damping) * dt;
    c.vz += ((gz - c.z) * k - c.vz * damping) * dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  }
}

/** Closed cloth crown with an open face below the eye-level brow. */
export function Hood({ game }: { game: GameState }) {
  const segs = 32, rows = 18;
  const { geometry, base } = useMemo(() => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const dome = Math.max(0, (t - 0.58) / 0.42);
      const closure = THREE.MathUtils.smoothstep(t, 0.58, 0.88);
      const open = 1.06 * (1 - closure);
      const radius = t < 0.58 ? 0.30 + 0.085 * Math.sin(t / 0.58 * Math.PI / 2) : 0.385 * Math.cos(dome * Math.PI / 2);
      for (let c = 0; c <= segs; c++) {
        const u = c / segs, a = open + u * (Math.PI * 2 - open * 2);
        const front = Math.max(0, Math.cos(a));
        const fold = Math.sin(a * 7 + t * 2) * 0.012 * Math.sin(t * Math.PI);
        // A generous dome, pinched to ONE apex: no uncapped rim over the scalp.
        const y = t < 0.58 ? -0.34 + t / 0.58 * 0.58 : 0.24 + Math.sin(dome * Math.PI / 2) * 0.36;
        const brow = front * Math.sin(dome * Math.PI) * 0.06;
        pos.push(Math.sin(a) * (radius + fold), y - brow, Math.cos(a) * (radius + fold) * 1.06 - dome * 0.045 + 0.015);
        uv.push(u, t);
        if (r < rows && c < segs) { const i = r * (segs + 1) + c, j = i + segs + 1; idx.push(i, j, i + 1, i + 1, j, j + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return { geometry: g, base: Float32Array.from(pos) };
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const motion = useBodyMotion(game), chain = useRef(makeChain(rows + 1));
  useFrame((_, delta) => {
    if (game.paused) return;
    const dt = Math.min(delta, 0.05), m = motion(dt);
    stepChain(chain.current, -m.side * 0.004 - m.turn * 0.014, -m.vy * 0.003, -Math.max(0, m.fwd) * 0.004, dt, 140, 12);
    const attr = geometry.getAttribute('position');
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, ch = chain.current[r];
      if (!ch) continue;
      for (let c = 0; c <= segs; c++) {
        const i = (r * (segs + 1) + c) * 3, u = c / segs;
        const flutter = Math.sin(m.time * 7 + u * 9 + t * 4) * Math.min(0.015, Math.abs(m.fwd) * 0.001) * Math.sin(t * Math.PI);
        let x = (base[i] ?? 0) + ch.x * t * 0.2;
        let y = (base[i + 1] ?? 0) + ch.y * t * 0.2 + flutter * 0.4;
        let z = (base[i + 2] ?? 0) + ch.z * t * 0.2 + flutter;
        // Skull collision envelope includes face and extra cloth clearance.
        if (y > -0.12) {
          const ny = (y - 0.18) / 0.36;
          const length = Math.sqrt((x / 0.34) ** 2 + ny ** 2 + ((z - 0.015) / 0.36) ** 2);
          if (length < 1 && length > 0.001) { x /= length; y = 0.18 + (y - 0.18) / length; z = 0.015 + (z - 0.015) / length; }
        }
        attr.setXYZ(i / 3, x, y, z);
      }
    }
    attr.needsUpdate = true; geometry.computeVertexNormals();
  });
  return <mesh name="hero-hood" geometry={geometry} material={HERO_FABRIC.outer} castShadow receiveShadow frustumCulled={false} />;
}

/** Shoulder mantle that drapes over both arms plus a long back cape, all driven by a spring chain. */
export function FlowingCloak({ game }: { game: GameState }) {
  const cols = 20, rows = 20;
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, cols, rows), []);
  const material = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f0eee9'; ctx.fillRect(0, 0, 256, 512);
      // Fine woven threads, not fur. UV-bound ink follows the deforming cloth.
      for (let y = 0; y < 512; y += 3) { ctx.fillStyle = y % 2 ? '#e8e6df' : '#e4e2db'; ctx.fillRect(0, y, 256, 1); }
      for (let x = 0; x < 256; x += 4) { ctx.fillStyle = '#e8e6df'; ctx.fillRect(x, 0, 1, 512); }
      ctx.strokeStyle = '#a9b9bb'; ctx.lineWidth = 2; ctx.strokeRect(7, 7, 242, 498);
      ctx.strokeStyle = '#252b32'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(128, 72); ctx.lineTo(113, 92); ctx.lineTo(133, 107); ctx.lineTo(119, 139); ctx.lineTo(127, 162); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(126, 102); ctx.lineTo(145, 95); ctx.lineTo(151, 82); ctx.moveTo(123, 130); ctx.lineTo(104, 142); ctx.lineTo(99, 158); ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ color: '#e8e6df', map, roughness: 0.94, side: THREE.DoubleSide });
  }, []);
  useEffect(() => () => { geometry.dispose(); material.map?.dispose(); material.dispose(); }, [geometry, material]);
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
      if (!ch) continue;
      for (let col = 0; col <= cols; col++) {
        const u = col / cols * 2 - 1; // -1..1 across, edges wrap around arms
        const edge = Math.abs(u);
        // wrap: outer columns curve forward over the shoulders/arms, less so further down
        const wrapAng = u * (1.75 - t * 0.6);
        // one garment with the hood: the top gathers at the neck (inside the cowl), then slopes over the shoulders
        const radius = 0.22 + Math.sin(Math.min(1, t * 5) * Math.PI * 0.5) * 0.32 + t * 0.26;
        const wave = Math.sin(m.time * 5 - t * 7 + u * 3) * (0.02 + speed * 0.004) * free;
        const ripple = Math.sin(m.time * 9 - t * 11 + u * 5) * Math.min(0.05, speed * 0.002) * t;
        // shoulder mantle sits high, arm edges hang shorter than the back
        const len = 2.04 - edge * edge * 1.14;
        attr.setXYZ(row * (cols + 1) + col,
          Math.sin(wrapAng) * radius * 1.15 + ch.x * free + wave,
          0.86 - t * (len + 0.16) + ch.y * free * (1 - edge * 0.5) + Math.cos(u * Math.PI * 6) * 0.015 * t,
          -Math.cos(wrapAng) * radius * 0.82 - 0.02 + ch.z * free * (1 - edge * 0.6) + Math.cos(u * Math.PI * 5) * 0.035 * t + ripple);
      }
    }
    attr.needsUpdate = true; geometry.computeVertexNormals();
  });
  return <group>
    <mesh name="hero-flowing-cloak" geometry={geometry} material={material} castShadow receiveShadow frustumCulled={false} />
  </group>;
}
