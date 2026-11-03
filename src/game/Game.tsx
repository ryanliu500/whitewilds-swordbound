import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// World is ~6km across (half-ish of a BOTW/RDR2 style map, scaled for web).
const WORLD_R = 3500; // playable radius
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
export const ISLAND: [number, number] = [Math.cos(2.2) * 3250, Math.sin(2.2) * 3250];
const WATER_Y = -25, SWIM = 6, STAMINA_MAX = 30;
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
  // starter island off the coast, beyond the mountain gap
  const di = Math.hypot(x - ISLAND[0], z - ISLAND[1]);
  if (di < 240) h = Math.max(h, Math.min(45, -45 + (1 - di / 240) * 160) + noise(x / 30, z / 30) * 4);
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
const player = { x: ISLAND[0], z: ISLAND[1], rot: 0, stamina: STAMINA_MAX, swimming: false, drowned: 0 };

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
      const sp = player.swimming ? SWIM : SPEED * (keys["ShiftLeft"] ? SPRINT : 1);
      const nx = g.position.x + dir.x * sp * dt, nz = g.position.z + dir.z * sp * dt;
      if (Math.hypot(nx, nz) < WORLD_R - 50) { g.position.x = nx; g.position.z = nz; }
      g.rotation.y = Math.atan2(dir.x, dir.z);
      walk.current += dt * sp * 0.8;
    }
    const ground = heightAt(g.position.x, g.position.z);
    player.swimming = ground < WATER_Y - 1.5;
    g.position.y = player.swimming ? WATER_Y - 1.6 : ground;
    player.stamina = player.swimming ? player.stamina - dt : Math.min(STAMINA_MAX, player.stamina + dt * 6);
    if (player.stamina <= 0) {
      g.position.set(ISLAND[0], heightAt(ISLAND[0], ISLAND[1]), ISLAND[1]);
      player.stamina = STAMINA_MAX; player.drowned = performance.now();
    }
    player.x = g.position.x; player.z = g.position.z; player.rot = g.rotation.y;
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
      <group ref={group} position={[ISLAND[0], 0, ISLAND[1]]}>
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

const MAP_EXT = 3600; // map covers -MAP_EXT..MAP_EXT
const TOWN_NAMES = ["Capital", "Eastmere", "Westbrook", "Southvale", "Northhold"];
let mapImg: HTMLCanvasElement | null = null;
function getMapImage() {
  if (mapImg) return mapImg;
  const N = 320, c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * 2 * MAP_EXT - MAP_EXT, z = (j / N) * 2 * MAP_EXT - MAP_EXT;
    const h = heightAt(x, z), k = (j * N + i) * 4;
    let col: number[];
    if (h < -22) col = [159, 196, 214];
    else if (h > 120) col = [200, 196, 190].map((v) => Math.min(255, v + (h - 120) * 0.15));
    else col = [232 - h * 0.3, 234 - h * 0.25, 226 - h * 0.4];
    img.data.set([col[0]!, col[1]!, col[2]!, 255], k);
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = "#8a7b6c";
  for (const [tx, tz, s] of TOWNS) {
    ctx.beginPath();
    ctx.arc(((tx + MAP_EXT) / (2 * MAP_EXT)) * N, ((tz + MAP_EXT) / (2 * MAP_EXT)) * N, (450 * s + 60) / (2 * MAP_EXT) * N, 0, Math.PI * 2);
    ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
  }
  mapImg = c;
  return c;
}
function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-rot);
  ctx.fillStyle = "#c0392b"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(6, -6); ctx.lineTo(0, -3); ctx.lineTo(-6, -6); ctx.closePath();
  ctx.stroke(); ctx.fill(); ctx.restore();
}

function MiniMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const img = getMapImage(), S = 160, view = 500;
    const loop = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) {
        const px = ((player.x + MAP_EXT) / (2 * MAP_EXT)) * img.width, pz = ((player.z + MAP_EXT) / (2 * MAP_EXT)) * img.height;
        const v = (view / (2 * MAP_EXT)) * img.width;
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, px - v, pz - v, v * 2, v * 2, 0, 0, S, S);
        drawArrow(ctx, S / 2, S / 2, player.rot);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={160} height={160} className="pointer-events-none absolute right-4 top-4 rounded-full border-2 border-border shadow-lg" />;
}

function FullMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!, S = 560, img = getMapImage();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, S, S);
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#3e3a36";
    TOWNS.forEach(([tx, tz], i) => ctx.fillText(TOWN_NAMES[i] ?? "", ((tx + MAP_EXT) / (2 * MAP_EXT)) * S, ((tz + MAP_EXT) / (2 * MAP_EXT)) * S + 4));
    drawArrow(ctx, ((player.x + MAP_EXT) / (2 * MAP_EXT)) * S, ((player.z + MAP_EXT) / (2 * MAP_EXT)) * S, player.rot);
  }, []);
  return <canvas ref={ref} width={560} height={560} className="max-h-[70vh] max-w-full rounded-md border border-border" />;
}

function StaminaHud() {
  const bar = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null), msg = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const f = player.stamina / STAMINA_MAX;
      if (bar.current) { bar.current.style.width = f * 100 + "%"; bar.current.style.opacity = f < 0.3 ? "0.6" : "1"; }
      if (wrap.current) wrap.current.style.opacity = f < 1 ? "1" : "0";
      if (msg.current) msg.current.style.opacity = performance.now() - player.drowned < 3000 ? "1" : "0";
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div ref={wrap} className="pointer-events-none absolute bottom-8 left-1/2 h-3 w-64 -translate-x-1/2 overflow-hidden rounded-full border border-border bg-background/60 transition-opacity">
        <div ref={bar} className="h-full bg-primary" />
      </div>
      <div ref={msg} className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 text-2xl font-semibold text-foreground opacity-0 transition-opacity">
        You drowned. The sea is too wide to swim…
      </div>
    </>
  );
}

export default function Game() {
  const [menu, setMenu] = useState(false);
  const wasLocked = useRef(false);
  useEffect(() => {
    const plc = () => {
      const locked = !!document.pointerLockElement;
      if (!locked && wasLocked.current) setMenu(true);
      wasLocked.current = locked;
    };
    const kd = (e: KeyboardEvent) => { if (e.code === "Escape" && !document.pointerLockElement) setMenu((m) => !m); };
    document.addEventListener("pointerlockchange", plc); addEventListener("keydown", kd);
    return () => { document.removeEventListener("pointerlockchange", plc); removeEventListener("keydown", kd); };
  }, []);
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
      <MiniMap />
      <StaminaHud />
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-background/70 px-3 py-2 text-xs text-foreground">
        Click to look · WASD move · Shift sprint · Scroll zoom · Esc menu & map
      </div>
      {menu && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 p-4 backdrop-blur-sm">
          <h2 className="text-2xl font-semibold text-foreground">Paused</h2>
          <FullMap />
          <button onClick={() => setMenu(false)} className="rounded-md bg-primary px-6 py-2 text-primary-foreground">Resume</button>
        </div>
      )}
    </div>
  );
}
