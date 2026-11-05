import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ISLAND, TOWNS, TOWN_NAMES, WORLD_R, heightAt } from "./sim/world";
import { RULES, createGame, emptyInput, step, type GameState } from "./sim/game";
import WorldScene from "./WorldScene";
import Camp from "./Camp";
import Enemies from "./Enemies";
import { PALETTE } from "./Models";

const game: GameState = createGame();
const keys: Record<string, boolean> = {};
const pressed = { jump: false, attack: false, interact: false, hop: false };
let blockHeld = false;
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __game: GameState }).__game = game;

function Stepper({ paused, onTick }: { paused: boolean; onTick: () => void }) {
  const { camera, gl } = useThree();
  const cam = useRef({ yaw: 0, pitch: 0.35, dist: 12 });
  const hero = useRef<THREE.Group>(null);
  const sword = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const acc = useRef(0);
  const arm = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null), legR = useRef<THREE.Mesh>(null);
  const walk = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const kd = (e: KeyboardEvent) => {
      if (!keys[e.code]) {
        if (e.code === "Space") pressed.jump = true;
        if (e.code === "KeyE") pressed.interact = true;
        if (e.code === "KeyF") pressed.hop = true;
      }
      keys[e.code] = true;
    };
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    const down = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) { el.requestPointerLock?.(); return; }
      if (e.button === 0 && !e.ctrlKey) pressed.attack = true;
      else blockHeld = true;
    };
    const up = () => (blockHeld = false);
    const ctx = (e: Event) => { e.preventDefault(); blockHeld = true; };
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement !== el) return;
      cam.current.yaw -= e.movementX * 0.004;
      cam.current.pitch = Math.max(-0.2, Math.min(1.3, cam.current.pitch + e.movementY * 0.004));
    };
    const wheel = (e: WheelEvent) => (cam.current.dist = Math.max(4, Math.min(40, cam.current.dist + e.deltaY * 0.02)));
    addEventListener("keydown", kd); addEventListener("keyup", ku);
    el.addEventListener("mousedown", down); addEventListener("mouseup", up); el.addEventListener("contextmenu", ctx);
    addEventListener("pointermove", move); el.addEventListener("wheel", wheel);
    return () => {
      removeEventListener("keydown", kd); removeEventListener("keyup", ku);
      el.removeEventListener("mousedown", down); removeEventListener("mouseup", up); el.removeEventListener("contextmenu", ctx);
      removeEventListener("pointermove", move); el.removeEventListener("wheel", wheel);
    };
  }, [gl]);

  useFrame((_, d) => {
    game.paused = paused;
    const c = cam.current;
    const i = emptyInput();
    i.forward = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
    i.strafe = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    i.yaw = c.yaw; i.sprint = !!keys["ShiftLeft"]; i.block = blockHeld;
    i.jump = pressed.jump; i.attack = pressed.attack; i.interact = pressed.interact;
    i.hop = pressed.hop || (pressed.jump && !game.player.grounded);
    pressed.jump = pressed.attack = pressed.interact = pressed.hop = false;
    step(game, i, d);
    const p = game.player;
    if (hero.current) { hero.current.position.set(p.x, p.y, p.z); hero.current.rotation.y = p.rot; }
    const isMoving = (i.forward !== 0 || i.strafe !== 0) && !paused;
    if (isMoving) walk.current += Math.min(d, 0.05) * 11;
    const sw = isMoving && p.grounded ? Math.sin(walk.current) * 0.6 : 0;
    if (legL.current) legL.current.rotation.x = sw;
    if (legR.current) legR.current.rotation.x = -sw;
    if (arm.current) {
      // swing: raised overhead -> slashed down-forward
      const t = p.attack > 0 ? 1 - p.attack / 0.32 : -1;
      if (t >= 0) { arm.current.rotation.x = -2.6 + t * 3.0; arm.current.rotation.z = 0.4 - t * 0.8; arm.current.rotation.y = 0; }
      else if (p.blocking) { arm.current.rotation.x = -1.5; arm.current.rotation.z = 0; arm.current.rotation.y = -1.2; }
      else { arm.current.rotation.x = 0.35 - sw * 0.4; arm.current.rotation.z = 0.15; arm.current.rotation.y = 0; }
    }
    void sword;
    const t = new THREE.Vector3(p.x, p.y + 2, p.z);
    camera.position.set(t.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, t.y + Math.sin(c.pitch) * c.dist, t.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
    camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 1);
    camera.lookAt(t);
    if (sun.current) {
      sun.current.position.set(p.x + 60, p.y + 120, p.z + 40);
      sun.current.target.position.set(p.x, p.y, p.z);
      sun.current.target.updateMatrixWorld();
    }
    acc.current += d;
    if (acc.current > 1 / 30) { acc.current = 0; onTick(); }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.2} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-far={400} shadow-bias={-0.0005} />
      <group ref={hero}>
        {/* sleek low-poly hero: cloak, head, hood, legs, sword arm */}
        <mesh position-y={1.6} castShadow><cylinderGeometry args={[0.35, 0.6, 1.3, 6]} /><meshStandardMaterial color="#5b7fa3" flatShading /></mesh>
        <mesh position-y={2.55} castShadow><icosahedronGeometry args={[0.35, 0]} /><meshStandardMaterial color="#e8c9a8" flatShading /></mesh>
        <mesh position-y={2.75} castShadow><coneGeometry args={[0.42, 0.6, 6]} /><meshStandardMaterial color="#7a5a3c" flatShading /></mesh>
        <mesh ref={legL} position={[-0.18, 0.5, 0]} castShadow><boxGeometry args={[0.22, 0.9, 0.22]} /><meshStandardMaterial color="#3e3a36" flatShading /></mesh>
        <mesh ref={legR} position={[0.18, 0.5, 0]} castShadow><boxGeometry args={[0.22, 0.9, 0.22]} /><meshStandardMaterial color="#3e3a36" flatShading /></mesh>
        <mesh position={[-0.45, 1.75, 0]} rotation-z={-0.2} castShadow><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial color="#5b7fa3" flatShading /></mesh>
        {/* sword arm pivots at the shoulder; blade sits in the fist */}
        <group ref={arm} position={[0.48, 2.05, 0]}>
          <mesh position-y={-0.35} castShadow><boxGeometry args={[0.16, 0.7, 0.16]} /><meshStandardMaterial color="#5b7fa3" flatShading /></mesh>
          <mesh position-y={-0.72} castShadow><icosahedronGeometry args={[0.11, 0]} /><meshStandardMaterial color="#e8c9a8" flatShading /></mesh>
          <mesh ref={sword} position={[0, -0.72, 0.75]} castShadow><boxGeometry args={[0.06, 0.12, 1.3]} /><meshStandardMaterial color={PALETTE.metal} metalness={0.6} roughness={0.3} /></mesh>
          <mesh position={[0, -0.72, 0.1]}><boxGeometry args={[0.32, 0.06, 0.06]} /><meshStandardMaterial color={PALETTE.gold} /></mesh>
        </group>
      </group>
    </>
  );
}

const MAP_EXT = WORLD_R;
let mapImg: HTMLCanvasElement | null = null;
function getMapImage() {
  if (mapImg) return mapImg;
  const N = 320, c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * 2 * MAP_EXT - MAP_EXT, z = (j / N) * 2 * MAP_EXT - MAP_EXT;
    const h = heightAt(x, z), k = (j * N + i) * 4;
    const col = h < -22 ? [130, 180, 201] : h > 120 ? [200, 196, 190] : [232 - h * 0.3, 234 - h * 0.25, 226 - h * 0.4];
    img.data.set([col[0]!, col[1]!, col[2]!, 255], k);
  }
  ctx.putImageData(img, 0, 0);
  mapImg = c;
  return c;
}
const toMap = (v: number, S: number) => ((v + MAP_EXT) / (2 * MAP_EXT)) * S;
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
    const img = getMapImage(), S = 140, view = 400;
    const loop = () => {
      const ctx = ref.current?.getContext("2d");
      if (ctx) {
        const p = game.player, px = toMap(p.x, img.width), pz = toMap(p.z, img.height), v = (view / (2 * MAP_EXT)) * img.width;
        ctx.clearRect(0, 0, S, S);
        ctx.drawImage(img, px - v, pz - v, v * 2, v * 2, 0, 0, S, S);
        drawArrow(ctx, S / 2, S / 2, p.rot);
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={140} height={140} className="pointer-events-none absolute right-4 top-4 rounded-full border-2 border-border shadow-lg" />;
}
function FullMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!, S = 520;
    ctx.drawImage(getMapImage(), 0, 0, S, S);
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "#3e3a36";
    TOWNS.forEach(([tx, tz], i) => ctx.fillText(TOWN_NAMES[i] ?? "", toMap(tx, S), toMap(tz, S)));
    ctx.fillText("Tutorial Isle", toMap(ISLAND[0], S), toMap(ISLAND[1], S) - 14);
    drawArrow(ctx, toMap(game.player.x, S), toMap(game.player.z, S), game.player.rot);
  }, []);
  return <canvas ref={ref} width={520} height={520} className="max-h-[60vh] max-w-full rounded-md border border-border" />;
}

function Hud() {
  const p = game.player;
  return (
    <>
      <div className="pointer-events-none absolute bottom-6 left-4 w-56 space-y-1">
        <div className="text-xs font-semibold text-foreground">Health</div>
        <div className="h-3 overflow-hidden rounded-full border border-border bg-background/60">
          <div className="h-full bg-destructive" style={{ width: `${(p.hp / RULES.health) * 100}%` }} />
        </div>
        {p.stamina < RULES.stamina && (
          <div className="h-2 overflow-hidden rounded-full border border-border bg-background/60">
            <div className="h-full bg-primary" style={{ width: `${(p.stamina / RULES.stamina) * 100}%` }} />
          </div>
        )}
        {game.boots && <div className="text-xs text-foreground">Winged Boots · F (or Space mid-air) to hop</div>}
      </div>
      {game.messageTime > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-1/4 -translate-x-1/2 rounded-md bg-background/70 px-4 py-2 text-lg font-semibold text-foreground">{game.message}</div>
      )}
    </>
  );
}

export default function Game() {
  const [menu, setMenu] = useState(false);
  const [, setTick] = useState(0);
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
      <Canvas shadows camera={{ fov: 60, near: 0.5, far: 12000 }}>
        <color attach="background" args={[PALETTE.sky]} />
        <fog attach="fog" args={[PALETTE.fog, 250, 3000]} />
        <hemisphereLight args={["#ffffff", "#c8c2b8", 0.9]} />
        <Environment>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} color="#bcd" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <WorldScene />
        <Physics paused={menu}>
          <Suspense fallback={null}>
            <Camp game={game} />
          </Suspense>
          <Enemies game={game} />
        </Physics>
        <Stepper paused={menu} onTick={() => setTick((t) => t + 1)} />
      </Canvas>
      <MiniMap />
      <Hud />
      <div className="pointer-events-none absolute left-4 top-4 max-w-xs rounded-md bg-background/70 px-3 py-2 text-xs text-foreground">
        Click to look · WASD move · Shift sprint · Space jump · Left-click attack · Right/two-finger click block · E interact · Esc map
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
