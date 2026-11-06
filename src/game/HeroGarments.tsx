import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { GameState } from './sim/game';

export const HERO_FABRIC = {
  outer: new THREE.MeshStandardMaterial({ color: '#434a50', roughness: 0.94, side: THREE.DoubleSide, flatShading: true }),
  lining: new THREE.MeshStandardMaterial({ color: '#687a7c', roughness: 1, side: THREE.DoubleSide, flatShading: true }),
  shadow: new THREE.MeshStandardMaterial({ color: '#252b30', roughness: 1, flatShading: true }),
};

export function Hood() {
  const geometry = useMemo(() => {
    const positions: number[] = [], indices: number[] = [];
    const radii = [0.3, 0.35, 0.36, 0.3, 0.18, 0.015];
    const heights = [-0.06, 0.05, 0.23, 0.39, 0.49, 0.54];
    const segments = 16;
    radii.forEach((radius, row) => {
      for (let col = 0; col <= segments; col++) {
        const angle = 0.87 + col / segments * (Math.PI * 2 - 1.74);
        positions.push(Math.sin(angle) * radius, heights[row] ?? 0, Math.cos(angle) * radius * 1.05 - 0.02);
        if (row < radii.length - 1 && col < segments) {
          const a = row * (segments + 1) + col, b = a + segments + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices); g.computeVertexNormals();
    return g;
  }, []);
  return <group>
    <mesh geometry={geometry} material={HERO_FABRIC.outer} castShadow receiveShadow />
    <mesh position={[0, 0.19, 0]} scale={[1, 1.12, 0.72]} material={HERO_FABRIC.shadow} castShadow><icosahedronGeometry args={[0.26, 1]} /></mesh>
  </group>;
}

/** Anchored shoulders, free pleated hem: inertia, turning drag, wind and leg clearance. */
export function FlowingCloak({ game }: { game: GameState }) {
  const cols = 12, rows = 18;
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1, cols, rows);
    return g;
  }, []);
  const motion = useRef({ x: game.player.x, z: game.player.z, rot: game.player.rot, speed: 0, turn: 0, time: 0 });
  useFrame((_, delta) => {
    if (game.paused) return;
    const m = motion.current, p = game.player, dt = Math.min(delta, 0.05);
    const speed = Math.min(32, Math.hypot(p.x - m.x, p.z - m.z) / Math.max(dt, 0.001));
    const turn = Math.atan2(Math.sin(p.rot - m.rot), Math.cos(p.rot - m.rot));
    m.speed = THREE.MathUtils.lerp(m.speed, speed, 1 - Math.exp(-5 * dt));
    m.turn = THREE.MathUtils.lerp(m.turn, THREE.MathUtils.clamp(turn / Math.max(dt, 0.001), -4, 4), 1 - Math.exp(-4 * dt));
    m.x = p.x; m.z = p.z; m.rot = p.rot; m.time += dt;
    const attr = geometry.getAttribute('position');
    for (let row = 0; row <= rows; row++) {
      const t = row / rows, free = t * t;
      for (let col = 0; col <= cols; col++) {
        const u = col / cols * 2 - 1;
        const wave = Math.sin(m.time * 3.2 - t * 5 + u * 2) * (0.025 + m.speed * 0.003);
        const flare = m.speed * 0.018 + (p.grounded ? 0 : 0.22 + Math.abs(p.vy) * 0.01);
        attr.setXYZ(row * (cols + 1) + col,
          u * (0.44 + t * 0.2) - m.turn * free * 0.09 + wave * free,
          0.68 - t * 1.72 + Math.abs(u) * free * 0.09 + Math.sin(m.time * 4 - t * 6) * free * m.speed * 0.002,
          -0.27 - t * 0.15 - free * flare + Math.cos(u * Math.PI * 5) * 0.035 * t + wave * free);
      }
    }
    attr.needsUpdate = true; geometry.computeVertexNormals();
  });
  return <group>
    <mesh name="hero-flowing-cloak" geometry={geometry} material={HERO_FABRIC.outer} castShadow receiveShadow frustumCulled={false} />
    <mesh position={[0, 0.66, -0.015]} rotation-x={0.1} material={HERO_FABRIC.lining} castShadow><cylinderGeometry args={[0.29, 0.46, 0.22, 10, 1, true]} /></mesh>
  </group>;
}