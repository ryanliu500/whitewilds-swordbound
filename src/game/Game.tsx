import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// World is ~6km across (half-ish of a BOTW/RDR2 style map, scaled for web).
const WORLD_R = 3000; // playable radius
const MOUNTAIN_R = 2700;
const SPEED = 14;
const SPRINT = 2.2;

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const TOWNS: [number, number, number][] = [
  [0, 0, 1], // main city [x, z, scale]
  [900, -700, 0.35],
  [-1100, 500, 0.3],
  [600, 1300, 0.3],
  [-700, -1400, 0.25],
];
export function heightAt(x: number, z: number) {
  const r = Math.hypot(x, z);
  let h = noise(x / 400, z / 400) * 60 + noise(x / 150, z / 150) * 15 - 20;
  for (const [tx, tz, s] of TOWNS) {
    const d = Math.hypot(x - tx, z - tz) / (500 * s + 150);
    if (d < 1) h *= d * d; // flatten towns
  }
  if (r > MOUNTAIN_R - 600) {
    const t = (r - (MOUNTAIN_R - 600)) / 600;
    const ang = Math.atan2(z, x);
    const gap = Math.cos(ang - 2.2) > 0.9; // coastline opening to the ocean
    if (gap) h = h * (1 - Math.min(t, 1)) - Math.min(t, 1.5) * 60;
    else h += Math.sin(Math.min(t, 1) * Math.PI) * (350 + noise(ang * 8, 1) * 350);
  }
  if (r > MOUNTAIN_R) h -= (r - MOUNTAIN_R) * 0.5;
  return h;
}

function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(WORLD_R * 2.4, WORLD_R * 2.4, 160, 160);
    g.rotateX(-Math.PI / 2);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    return ng;
  }, []);
  return (
    <mesh geometry={geo} receiveShadow castShadow>
      <meshStandardMaterial color="#f4f2ee" flatShading roughness={1} />
    </mesh>
  );
}

function Ocean() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-25}>
      <planeGeometry args={[20000, 20000]} />
      <meshStandardMaterial color="#9fc4d6" roughness={0.3} />
    </mesh>
  );
}

function Instanced({ items, geo, color }: { items: THREE.Matrix4[]; geo: THREE.BufferGeometry; color: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    items.forEach((m, i) => ref.current!.setMatrixAt(i, m));
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow receiveShadow>
      <meshStandardMaterial color={color} flatShading />
    </instancedMesh>
  );
}

function Settlements() {
  const data = useMemo(() => {
    const houses: THREE.Matrix4[] = [], roofs: THREE.Matrix4[] = [], trunks: THREE.Matrix4[] = [], leaves: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler();
    let seed = 1;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [tx, tz, s] of TOWNS) {
      const n = Math.floor(400 * s * s + 12);
      const rad = 450 * s + 60;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * rad;
        const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
        const city = s === 1 && d < 200;
        const w = 6 + rnd() * 8, hgt = city ? 10 + rnd() * 40 : 4 + rnd() * 4;
        const y = heightAt(x, z);
        e.set(0, Math.round(rnd() * 4) * (Math.PI / 2) + (s === 1 ? 0 : rnd()), 0);
        q.setFromEuler(e);
        houses.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + hgt / 2, z), q, new THREE.Vector3(w, hgt, w)));
        roofs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + hgt + 2, z), q, new THREE.Vector3(w * 0.8, 4, w * 0.8)));
      }
    }
    for (let i = 0; i < 900; i++) {
      // forests in clumps
      const ca = Math.floor(i / 30) * 2.4, cd = 600 + (Math.floor(i / 30) % 7) * 250;
      const x = Math.cos(ca) * cd + (rnd() - 0.5) * 220, z = Math.sin(ca) * cd + (rnd() - 0.5) * 220;
      const y = heightAt(x, z);
      if (y < -10 || TOWNS.some(([tx, tz, s]) => Math.hypot(x - tx, z - tz) < 450 * s + 80)) continue;
      const sc = 0.7 + rnd() * 0.8;
      trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 2 * sc, z), q.identity(), new THREE.Vector3(sc, sc, sc)));
      leaves.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + 7 * sc, z), q, new THREE.Vector3(sc, sc, sc)));
    }
    return { houses, roofs, trunks, leaves };
  }, []);
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roof = useMemo(() => new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4), []);
  const trunk = useMemo(() => new THREE.CylinderGeometry(0.4, 0.6, 4, 5), []);
  const leaf = useMemo(() => new THREE.ConeGeometry(3, 8, 6), []);
  return (
    <>
      <Instanced items={data.houses} geo={box} color="#ffffff" />
      <Instanced items={data.roofs} geo={roof} color="#c9b8a6" />
      <Instanced items={data.trunks} geo={trunk} color="#a08a74" />
      <Instanced items={data.leaves} geo={leaf} color="#b9cdb0" />
    </>
  );
}

const keys: Record<string, boolean> = {};

function Player() {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null), legR = useRef<THREE.Mesh>(null);
  const { camera, gl } = useThree();
  const cam = useRef({ yaw: 0, pitch: 0.35, dist: 12 });
  const sun = useRef<THREE.DirectionalLight>(null);
  const walk = useRef(0);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => (keys[e.code] = true);
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    const el = gl.domElement;
    const click = () => el.requestPointerLock?.();
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement !== el && e.buttons === 0) return;
      cam.current.yaw -= e.movementX * 0.004;
      cam.current.pitch = Math.max(-0.2, Math.min(1.3, cam.current.pitch + e.movementY * 0.004));
    };
    const wheel = (e: WheelEvent) => (cam.current.dist = Math.max(4, Math.min(60, cam.current.dist + e.deltaY * 0.02)));
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    el.addEventListener("click", click); addEventListener("pointermove", move); el.addEventListener("wheel", wheel);
    return () => {
      removeEventListener("keydown", kd); removeEventListener("keyup", ku);
      el.removeEventListener("click", click); removeEventListener("pointermove", move); el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((_, d) => {
    const dt = Math.min(d, 0.05);
    const g = group.current!;
    const c = cam.current;
    const f = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    const s = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dir = fwd.multiplyScalar(f).add(right.multiplyScalar(s));
    if (dir.lengthSq() > 0) {
      dir.normalize();
      const sp = SPEED * (keys["ShiftLeft"] ? SPRINT : 1);
      const nx = g.position.x + dir.x * sp * dt, nz = g.position.z + dir.z * sp * dt;
      if (Math.hypot(nx, nz) < WORLD_R - 100 && heightAt(nx, nz) > -22) { g.position.x = nx; g.position.z = nz; }
      g.rotation.y = Math.atan2(dir.x, dir.z);
      walk.current += dt * sp * 0.8;
    }
    g.position.y = heightAt(g.position.x, g.position.z);
    const sw = Math.sin(walk.current) * 0.6 * (dir.lengthSq() > 0 ? 1 : 0);
    legL.current!.rotation.x = sw; legR.current!.rotation.x = -sw;
    const target = g.position.clone().add(new THREE.Vector3(0, 2, 0));
    camera.position.set(
      target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist,
      target.y + Math.sin(c.pitch) * c.dist,
      target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist,
    );
    const minY = heightAt(camera.position.x, camera.position.z) + 1;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.lookAt(target);
    if (sun.current) {
      sun.current.position.set(g.position.x + 80, g.position.y + 150, g.position.z + 60);
      sun.current.target.position.copy(g.position);
      sun.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} shadow-camera-far={500} shadow-bias={-0.0005} />
      <group ref={group} position={[0, 0, 300]}>
        {/* low-poly hero: cloak, head, hood, legs, sword */}
        <mesh position-y={1.6} castShadow><cylinderGeometry args={[0.35, 0.6, 1.3, 6]} /><meshStandardMaterial color="#5b7fa3" flatShading /></mesh>
        <mesh position-y={2.55} castShadow><icosahedronGeometry args={[0.35, 0]} /><meshStandardMaterial color="#e8c9a8" flatShading /></mesh>
        <mesh position-y={2.75} castShadow><coneGeometry args={[0.42, 0.6, 6]} /><meshStandardMaterial color="#7a5a3c" flatShading /></mesh>
        <mesh ref={legL} position={[-0.18, 0.95, 0]} castShadow><boxGeometry args={[0.22, 0.9, 0.22]} /><meshStandardMaterial color="#3e3a36" flatShading /></mesh>
        <mesh ref={legR} position={[0.18, 0.95, 0]} castShadow><boxGeometry args={[0.22, 0.9, 0.22]} /><meshStandardMaterial color="#3e3a36" flatShading /></mesh>
        <mesh position={[0, 1.9, -0.4]} rotation-z={0.6} castShadow><boxGeometry args={[0.08, 1.4, 0.04]} /><meshStandardMaterial color="#cfd6dc" metalness={0.6} /></mesh>
      </group>
    </>
  );
}

export default function Game() {
  return (
    <div className="relative h-screen w-screen" data-scene-ready>
      <Canvas shadows camera={{ fov: 60, near: 0.5, far: 9000 }}>
        <color attach="background" args={["#eef1f4"]} />
        <fog attach="fog" args={["#eef1f4", 300, 2600]} />
        <hemisphereLight args={["#ffffff", "#c8c2b8", 1.1]} />
        <Terrain />
        <Ocean />
        <Settlements />
        <Player />
      </Canvas>
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background/70 px-3 py-2 text-xs text-foreground">
        Click to look · WASD move · Shift sprint · Scroll zoom · Esc release mouse
      </div>
    </div>
  );
}
