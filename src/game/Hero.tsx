import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { heightAt } from "./sim/world";
import { angleDifference } from "./sim/locomotion";
import type { GameState } from "./sim/game";
import { COMBAT } from "./sim/combat";
import { FlowingCloak, Hood, HERO_FABRIC } from './HeroGarments';

/**
 * Articulated low-poly hero (~3.0m tall, same as the old block hero).
 * Joint tree: root > pelvis > spine/chest > head, arms (shoulder > elbow > hand),
 * hips > knee > ankle, plus hinged tunic flaps. Legs use two-bone IK so feet
 * plant on sloped terrain (uphill knee bends, downhill leg extends, soles tilt).
 */

// proportions (metres)
const THIGH = 0.66, SHIN = 0.64, FOOT_H = 0.1, HIP_Y = THIGH + SHIN + FOOT_H - 0.04, HIP_X = 0.2;
const UPPER_ARM = 0.5, FOREARM = 0.46;

const M = {
  tunic: HERO_FABRIC.outer,
  tunicDark: HERO_FABRIC.lining,
  shirt: new THREE.MeshStandardMaterial({ color: "#f0eee9", flatShading: true }),
  skin: new THREE.MeshStandardMaterial({ color: "#e8c9a8", roughness: 0.85 }),
  hair: new THREE.MeshStandardMaterial({ color: "#545e64", flatShading: true }),
  pants: new THREE.MeshStandardMaterial({ color: "#e8e6df", flatShading: true }),
  boot: new THREE.MeshStandardMaterial({ color: "#b8c9cc", flatShading: true }),
  belt: new THREE.MeshStandardMaterial({ color: "#56636b", flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: "#cfd8e0", metalness: 0.7, roughness: 0.25, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: "#c9a23a", metalness: 0.6, roughness: 0.35, flatShading: true }),
  shield: new THREE.MeshStandardMaterial({ color: "#6b4a2e", flatShading: true }),
  eye: new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#00e5ff", emissiveIntensity: 3, toneMapped: false }),
};

type G = THREE.Group | null | undefined;
type Keys = "sheath"|"root"|"pelvis"|"spine"|"head"|"shL"|"elL"|"shR"|"elR"|"blade"|"flapF"|"flapB"|"flapL"|"flapR"|"shield"|"hipL"|"kneeL"|"ankleL"|"hipR"|"kneeR"|"ankleR";
const lerp = THREE.MathUtils.lerp;
const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));

/** Solve a planar two-bone leg. Returns thigh/knee rotation.x for target (forward dz, down dy<0). */
function solveLeg(dz: number, dy: number) {
  const d = Math.min(Math.hypot(dz, dy), THIGH + SHIN - 0.001);
  const phi = Math.atan2(dz, -dy);
  const alpha = Math.acos(THREE.MathUtils.clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const knee = Math.PI - Math.acos(THREE.MathUtils.clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  return { hip: -(phi + alpha), knee };
}

function Box({ s, p = [0, 0, 0], m, r }: { s: [number, number, number]; p?: [number, number, number]; m: THREE.Material; r?: [number, number, number] }) {
  return <mesh position={p} rotation={r ?? [0, 0, 0]} material={m} castShadow receiveShadow><boxGeometry args={s} /></mesh>;
}

/** Tapered muscle silhouettes preserve the existing articulated rig. */
function Limb({ length, forearm = false }: { length: number; forearm?: boolean }) {
  const geometry = useMemo(() => {
    const points = forearm
      ? [[0, 0], [0.055, 0.01], [0.072, 0.07], [0.093, length * 0.52], [0.088, length * 0.82], [0.063, length - 0.015], [0, length]]
      : [[0, 0], [0.062, 0.015], [0.083, length * 0.28], [0.112, length * 0.65], [0.115, length * 0.82], [0.075, length - 0.012], [0, length]];
    const g = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x ?? 0, y ?? 0)), 12);
    g.translate(0, -length, 0); g.scale(1, 1, 0.88);
    return g;
  }, [length, forearm]);
  return <mesh geometry={geometry} material={forearm ? M.skin : M.shirt} castShadow receiveShadow />;
}
function Hand({ side }: { side: number }) {
  return <group>
    <mesh scale={[0.075, 0.10, 0.064]} material={M.skin} castShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
    <mesh position={[side * 0.067, 0.015, 0.035]} rotation-z={side * 0.4} material={M.skin} castShadow><capsuleGeometry args={[0.028, 0.06, 4, 8]} /></mesh>
  </group>;
}

/** Render-only aim: camera pitch set by the stepper each frame (radians, + = looking up). */
export const heroAim = { pitch: 0 };

/** Sculpted lathe leg segments (thigh / shin / boot) that match the arm limbs. */
function LegSeg({ length, kind }: { length: number; kind: 'thigh' | 'shin' | 'boot' }) {
  const geometry = useMemo(() => {
    const pts = kind === 'thigh'
      ? [[0, 0], [0.1, 0.02], [0.112, length * 0.35], [0.13, length * 0.75], [0.125, length * 0.92], [0.09, length], [0, length]]
      : kind === 'shin'
      ? [[0, 0], [0.085, 0.01], [0.1, length * 0.3], [0.108, length * 0.7], [0.095, length], [0, length]]
      : [[0, 0], [0.105, 0.01], [0.112, length * 0.5], [0.12, length * 0.9], [0.11, length], [0, length]];
    const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x ?? 0, y ?? 0)), 12);
    g.translate(0, -length, 0); g.scale(1, 1, 0.92);
    return g;
  }, [length, kind]);
  return <mesh geometry={geometry} material={kind === 'boot' ? M.boot : M.pants} castShadow receiveShadow />;
}

export default function Hero({ game }: { game: GameState }) {
  const r = useRef({} as Record<Keys, THREE.Group>);
  const set = (k: Keys) => (o: THREE.Group | null) => { if (o) r.current[k] = o; };
  const st = useRef({ prevRot: NaN, turn: 0, pivot: 0, phase: 0, prevX: NaN, prevZ: NaN, speed: 0, fwd: 0, wasGrounded: true, land: 0, landK: 0, pelvis: 0, lean: 0, roll: 0, footL: 0, footR: 0, t: 0, airT: 0 });
  const shieldPose = useRef({ amount: 0, hiding: false });

  useFrame((_, delta) => {
    const g = r.current, s = st.current, p = game.player;
    const dt = Math.min(delta, 0.05);

    const root = g.root; if (!root) return;
    if (game.paused) return;
    s.t += dt;
    const { pelvis, spine, head, shL, elL, shR, elR, blade, flapF, flapB, flapL, flapR, hipL, hipR, shield } = g;
    if (!pelvis || !spine || !head || !shL || !elL || !shR || !elR || !blade || !flapF || !flapB || !flapL || !flapR || !hipL || !hipR || !shield) return;
    const reveal = p.shieldTime > 0;
    const spose = shieldPose.current;
    spose.hiding = !reveal && spose.amount > 0.005;
    spose.amount = THREE.MathUtils.clamp(spose.amount + (reveal ? 1 : -1) * dt / 0.6, 0, 1);
    shield.visible = spose.amount > 0;
    const unfold = easeOut(spose.amount);
    shield.scale.setScalar(unfold);
    shield.rotation.y = (1 - unfold) * -1.3;
    shield.position.x = 0.17 - (1 - unfold) * 0.18;
    root.userData['shieldAmount'] = spose.amount;

    // --- velocity from motion ---
    if (Number.isNaN(s.prevX)) { s.prevX = p.x; s.prevZ = p.z; }
    const vx = (p.x - s.prevX) / Math.max(dt, 1e-4), vz = (p.z - s.prevZ) / Math.max(dt, 1e-4);
    s.prevX = p.x; s.prevZ = p.z;
    const sp = Math.min(Math.hypot(vx, vz), 60);
    s.speed = game.paused ? 0 : damp(s.speed, sp > 60 ? 0 : sp, 12, dt);
    const fwdDot = Math.sin(p.rot) * vx + Math.cos(p.rot) * vz;
    s.fwd = damp(s.fwd, fwdDot, 10, dt);
    if (Number.isNaN(s.prevRot)) s.prevRot = p.rot;
    const turnRate = angleDifference(p.rot, s.prevRot) / Math.max(dt, 0.001);
    s.prevRot = p.rot;
    s.turn = damp(s.turn, THREE.MathUtils.clamp(turnRate, -9, 9), 10, dt);
    s.pivot = damp(s.pivot, p.grounded ? Math.max(0, Math.abs(s.turn) - 4) / 5 : 0, 10, dt);
    const moving = s.speed > 0.8;
    const run = THREE.MathUtils.clamp(s.speed / 14, 0, 1);
    const sprint = THREE.MathUtils.clamp((s.speed - 16) / 12, 0, 1);

    // --- landing impact ---
    if (p.grounded && !s.wasGrounded && s.airT > 0.12) { s.land = 1; s.landK = THREE.MathUtils.clamp(s.airT * 0.9, 0.25, 1); }
    s.airT = p.grounded ? 0 : s.airT + dt;
    s.wasGrounded = p.grounded;
    s.land = Math.max(0, s.land - dt * 3.2);
    const landDip = Math.sin(s.land * Math.PI) * 0.45 * s.landK;

    const P = attackPose(p.move.kind, p.move.t, p.vy);
    g.blade.visible = p.sword > 0 || P !== null;
    if (g.sheath) g.sheath.visible = !g.blade.visible;

    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.rot + (P?.spinY ?? 0);
    // ragdoll tumble / get-up: whole body rotates; lying flat then pushing up
    if (p.ragdoll) { s.roll = -p.tumble; root.rotation.x = s.roll; root.position.y += 0.4; }
    else if (p.move.kind === 'getup') { const u = Math.min(1, p.move.t / COMBAT.durations.getup!); const lie = -Math.PI / 2; s.roll = lerp(lie, 0, easeInOut(u)); root.rotation.x = s.roll; root.position.y += Math.sin(u * Math.PI) * 0.3 + (1 - u) * 0.3; }
    else root.rotation.x = 0;

    // --- terrain under each foot (relative to body ground) ---
    const onTerrain = Math.abs(p.y - heightAt(p.x, p.z)) < 0.35 && p.grounded && !p.climbing;
    const sr = Math.sin(p.rot), cr = Math.cos(p.rot);
    const gAt = (lx: number, lz: number) => {
      if (!onTerrain) return 0;
      const wx = p.x + cr * lx + sr * lz, wz = p.z - sr * lx + cr * lz;
      return THREE.MathUtils.clamp(heightAt(wx, wz) - p.y, -0.75, 0.55);
    };
    const slopeAt = (lx: number, lz: number) => (gAt(lx, lz + 0.25) - gAt(lx, lz - 0.25)) / 0.5;

    // --- gait ---
    const cadence = lerp(7, 11, run) + sprint * 2.5;
    if (moving && p.grounded) s.phase += dt * cadence * (s.fwd < -1 ? -1 : 1);
    const stride = (moving ? lerp(0.25, 0.55, run) + sprint * 0.25 : 0);
    const lift = moving ? lerp(0.18, 0.38, run) : 0;

    const legTarget = (side: 1 | -1) => {
      const ph = s.phase + (side === 1 ? 0 : Math.PI);
      let fz = Math.sin(ph) * stride;
      let up = Math.max(0, Math.cos(ph)) * lift;
      if (!moving && p.grounded) fz = side * 0.05; // relaxed stagger at idle
      if (p.blocking && p.grounded) fz = (moving ? fz * 0.4 : 0) + side * 0.32; // bladed brace: left foot forward, right back
      if (!p.grounded && !p.swimming && !p.climbing) { // airborne tuck
        const rising = p.vy > 0 ? 1 : 0.5;
        up = side === 1 ? 0.55 * rising : 0.3 * rising; fz = side === 1 ? 0.25 : -0.15;
      }
      if (p.swimming) { up = 0.15 + Math.sin(s.t * 6 + side) * 0.15; fz = Math.sin(s.t * 6 + (side === 1 ? 0 : Math.PI)) * 0.3; }
      const ground = gAt(side * HIP_X, fz);
      return { fz, ground, up };
    };
    const L = legTarget(1), R = legTarget(-1);
    s.footL = damp(s.footL, L.ground, 18, dt);
    s.footR = damp(s.footR, R.ground, 18, dt);

    // pelvis drops so the lower foot can still reach; plus crouches & bob
    const lowest = Math.min(s.footL, s.footR);
    const bob = moving && p.grounded ? Math.abs(Math.cos(s.phase)) * 0.06 * (0.5 + run) : 0;
    const breathe = !moving ? Math.sin(s.t * 2.2) * 0.012 : 0;
    const guardCrouch = (p.blocking ? 0.14 : 0) + (P?.crouch ?? 0);
    const targetPelvis = Math.min(0, lowest) - landDip - guardCrouch - bob - s.pivot * 0.07 + breathe - (moving ? 0.05 * run : 0.03);
    s.pelvis = damp(s.pelvis, targetPelvis, 16, dt);
    pelvis.position.y = HIP_Y + s.pelvis;

    const applyLeg = (hip: G, knee: G, ankle: G, t: { fz: number; up: number }, foot: number, side: 1 | -1) => {
      if (!hip || !knee || !ankle) return;
      const dy = foot + FOOT_H + t.up - (HIP_Y + s.pelvis);
      const sol = solveLeg(t.fz, dy);
      hip.rotation.x = sol.hip; knee.rotation.x = sol.knee;
      hip.rotation.z = side * (0.04 + s.pivot * 0.1);
      const footPitch = onTerrain && t.up < 0.05 ? -Math.atan(slopeAt(side * HIP_X, t.fz)) : (t.up > 0.05 ? 0.35 : 0);
      ankle.rotation.x = footPitch - (sol.hip + sol.knee);
    };
    applyLeg(g.hipL, g.kneeL, g.ankleL, L, s.footL, 1);
    applyLeg(g.hipR, g.kneeR, g.ankleR, R, s.footR, -1);

    // --- torso: lean, counter-rotation, slope tilt ---
    const leanT = (moving ? 0.08 * run + 0.22 * sprint : 0) + (p.blocking ? 0.12 : 0) + landDip * 0.5 + (p.swimming ? 0.9 : 0);
    s.lean = damp(s.lean, leanT, 8, dt);
    const twist = moving && p.grounded ? -Math.sin(s.phase) * 0.12 * (0.5 + run) : 0;
    const atkTwist = P?.twist ?? (p.blocking ? 0.35 : 0);
    if (P) s.lean = damp(s.lean, leanT + P.lean, 18, dt);
    pelvis.rotation.y = -twist * 0.5 - s.turn * 0.018;
    spine.rotation.set(s.lean + (P?.heave ?? 0), twist + atkTwist + s.turn * 0.025, -s.turn * run * 0.012);
    head.rotation.set(-s.lean * 0.6 + (p.swimming ? -0.7 : 0), -(twist + atkTwist) * 0.6 + s.turn * 0.025, s.turn * run * 0.006);

    // --- arms ---
    const armSwing = moving && p.grounded ? Math.sin(s.phase) * lerp(0.35, 0.9, run) : 0;
    // left arm (shield)
    let lx = -armSwing, lz = 0.18, le = -0.35 - run * 0.6, ly = 0;
    if (p.ragdoll) { lx = -2.2 + Math.sin(s.t * 9) * 0.5; lz = 1.2; le = -0.4; }
    else if (p.blocking) { lx = -0.55; ly = -1.0; lz = 0.12; le = -1.55; } // tucked elbow, forearm folded inward across the stomach; outer forearm (shield) faces forward
    else if (P) { lx = P.lx; lz = 0.35; le = -0.6; }
    else if (!p.grounded && !p.swimming && !p.climbing) { lx = -0.4; lz = 0.9; le = -0.3; }
    else if (p.swimming) { lx = -1.2 + Math.sin(s.t * 6) * 0.9; lz = 0.6; le = -0.4; }
    else if (p.climbing) { lx = -2.6 + Math.sin(s.t * 6) * 0.4; lz = 0.1; le = -0.6; }
    else if (!moving) { lx = 0.05 + breathe * 3; lz = 0.12; le = -0.25; }
    if (spose.hiding) { lx = -0.85; ly = -0.65; lz = 0.25; le = -1.65; }
    else if (reveal && spose.amount < 1) { lx = -1; ly = 0.3; le = -1.2; }
    shL.rotation.set(damp(shL.rotation.x, lx, 14, dt), damp(shL.rotation.y, ly, 14, dt), damp(shL.rotation.z, lz, 14, dt));
    elL.rotation.x = damp(elL.rotation.x, le, 14, dt);
    // right arm (sword)
    let rx = armSwing, rz = -0.18, re = -0.35 - run * 0.6, ry = 0;
    if (P) {
      // fast but continuous: high damping instead of snapping
      shR.rotation.set(damp(shR.rotation.x, P.rx, 30, dt), damp(shR.rotation.y, P.ry, 30, dt), damp(shR.rotation.z, P.rz, 30, dt));
      elR.rotation.x = damp(elR.rotation.x, P.re, 30, dt);
    } else {
      if (p.ragdoll) { rx = -2.2 + Math.cos(s.t * 9) * 0.5; rz = -1.2; re = -0.4; }
      else if (p.blocking) { rx = 0.25; rz = -0.45; re = -0.9; } // sword held low and back
      else if (!p.grounded && !p.swimming && !p.climbing) { rx = -0.5; rz = -0.9; re = -0.4; }
      else if (p.swimming) { rx = -1.2 + Math.sin(s.t * 6 + Math.PI) * 0.9; rz = -0.6; re = -0.4; }
      else if (p.climbing) { rx = -2.6 + Math.sin(s.t * 6 + Math.PI) * 0.4; rz = -0.1; re = -0.6; }
      else if (!moving) { rx = 0.05 - breathe * 3; rz = -0.14; re = -0.3; }
      shR.rotation.set(damp(shR.rotation.x, rx, 14, dt), damp(shR.rotation.y, ry, 14, dt), damp(shR.rotation.z, rz, 14, dt));
      elR.rotation.x = damp(elR.rotation.x, re, 14, dt);
    }
    // blade points forward during swing, rests angled down/back otherwise
    blade.rotation.x = damp(blade.rotation.x, P ? P.bx : p.blocking ? 1.2 : 0.9, P ? 30 : 10, dt);

    // --- tunic flaps follow thighs and velocity ---
    const hipAvg = (hipL.rotation.x + hipR.rotation.x) / 2;
    flapF.rotation.x = Math.min(0, Math.min(hipL.rotation.x, hipR.rotation.x)) * 0.7 - 0.05;
    flapB.rotation.x = Math.max(0.05, s.speed * 0.02 + (!p.grounded ? 0.5 : 0) + hipAvg * -0.2);
    flapL.rotation.z = -0.08 - (!p.grounded ? 0.3 : 0) - s.speed * 0.004;
    flapR.rotation.z = 0.08 + (!p.grounded ? 0.3 : 0) + s.speed * 0.004;
  });

  const leg = (side: 1 | -1) => (
    <group ref={set(side === 1 ? "hipL" : "hipR")} position={[side * HIP_X, 0, 0]}>
      <LegSeg length={THIGH} kind="thigh" />
      <group ref={set(side === 1 ? "kneeL" : "kneeR")} position={[0, -THIGH, 0]}>
        <mesh scale={[0.1, 0.1, 0.105]} position-z={0.015} material={M.pants} castShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
        <LegSeg length={SHIN * 0.5} kind="shin" />
        <group position-y={-SHIN * 0.48}><LegSeg length={SHIN * 0.52} kind="boot" /></group>
        <group ref={set(side === 1 ? "ankleL" : "ankleR")} position={[0, -SHIN, 0]}>
          <mesh position={[0, -FOOT_H / 2, 0.08]} scale={[0.12, FOOT_H / 2, 0.22]} material={M.boot} castShadow receiveShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
        </group>
      </group>
    </group>
  );

  const armR = (
    <group ref={set("shR")} position={[-0.42, 0.62, 0]}>
      <mesh scale={[0.13, 0.14, 0.12]} material={M.tunic} castShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
      <Limb length={UPPER_ARM} />
      <group ref={set("elR")} position={[0, -UPPER_ARM, 0]}>
        <mesh material={M.skin} castShadow><sphereGeometry args={[0.073, 12, 8]} /></mesh>
        <Limb length={FOREARM} forearm />
        <mesh position={[0, -FOREARM + 0.06, 0]} material={M.belt} castShadow><cylinderGeometry args={[0.064, 0.062, 0.075, 12]} /></mesh>
        <group position={[0, -FOREARM - 0.06, 0]}>
          <Hand side={-1} />
          {/* sword gripped in the fist */}
          <group ref={set("blade")}>
            <Box s={[0.05, 0.05, 0.22]} p={[0, 0, -0.02]} m={M.belt} />
            <Box s={[0.36, 0.06, 0.06]} p={[0, 0, 0.12]} m={M.gold} />
            <Box s={[0.05, 0.12, 1.25]} p={[0, 0, 0.78]} m={M.metal} />
            <mesh position={[0, 0, 1.46]} rotation-x={Math.PI / 2} material={M.metal} castShadow><coneGeometry args={[0.07, 0.16, 4]} /></mesh>
          </group>
        </group>
      </group>
    </group>
  );

  const armL = (
    <group ref={set("shL")} position={[0.42, 0.62, 0]}>
      <mesh scale={[0.13, 0.14, 0.12]} material={M.tunic} castShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
      <Limb length={UPPER_ARM} />
      <group ref={set("elL")} position={[0, -UPPER_ARM, 0]}>
        <mesh material={M.skin} castShadow><sphereGeometry args={[0.073, 12, 8]} /></mesh>
        <Limb length={FOREARM} forearm />
        <group position={[0, -FOREARM - 0.05, 0]}><Hand side={1} /></group>
        {/* shield strapped to the forearm */}
        <group ref={set('shield')} name="hero-shield" visible={false} scale={0} position={[0.17, -FOREARM * 0.55, 0]}>
          <mesh rotation-z={Math.PI / 2} material={M.shield} castShadow><cylinderGeometry args={[0.36, 0.36, 0.06, 7]} /></mesh>
          <mesh position-x={0.045} rotation-z={Math.PI / 2} material={M.metal} castShadow><cylinderGeometry args={[0.1, 0.1, 0.05, 6]} /></mesh>
        </group>
      </group>
    </group>
  );

  return (
    <group ref={set("root")} name="hero-root">
      <group ref={set("pelvis")} position-y={HIP_Y}>
        <Box s={[0.56, 0.22, 0.34]} m={M.pants} />
        <Box s={[0.6, 0.1, 0.38]} p={[0, 0.12, 0]} m={M.belt} />
        <Box s={[0.1, 0.12, 0.05]} p={[0, 0.12, 0.2]} m={M.gold} />
        {/* hinged tunic flaps */}
        <group ref={set("flapF")} position={[0, 0.08, 0.17]}><Box s={[0.5, 0.42, 0.05]} p={[0, -0.21, 0]} m={M.tunic} /></group>
        <group ref={set("flapB")} position={[0, 0.08, -0.17]}><Box s={[0.54, 0.46, 0.05]} p={[0, -0.23, 0]} m={M.tunicDark} /></group>
        <group ref={set("flapL")} position={[0.29, 0.08, 0]}><Box s={[0.05, 0.4, 0.34]} p={[0, -0.2, 0]} m={M.tunic} /></group>
        <group ref={set("flapR")} position={[-0.29, 0.08, 0]}><Box s={[0.05, 0.4, 0.34]} p={[0, -0.2, 0]} m={M.tunic} /></group>
        {leg(1)}{leg(-1)}
        <group ref={set("spine")} position-y={0.16}>
          <FlowingCloak game={game} />
          <mesh position-y={0.3} material={M.tunic} castShadow><cylinderGeometry args={[0.36, 0.28, 0.62, 6]} /></mesh>
          <Box s={[0.66, 0.16, 0.36]} p={[0, 0.6, 0]} m={M.tunic} />
          <Box s={[0.08, 0.7, 0.04]} p={[0.1, 0.32, 0.27]} r={[0, 0, 0.6]} m={M.belt} />
          {/* sheath on the back */}
          <Box s={[0.1, 0.9, 0.14]} p={[0.05, 0.35, -0.3]} r={[0, 0, 0.7]} m={M.belt} />
          <group ref={set("sheath")} position={[0.05, 0.35, -0.32]} rotation-z={0.7}>
            <Box s={[0.05, 0.22, 0.05]} p={[0, 0.56, 0]} m={M.belt} />
            <Box s={[0.36, 0.06, 0.06]} p={[0, 0.45, 0]} m={M.gold} />
          </group>
          <mesh position-y={0.74} material={HERO_FABRIC.shadow} castShadow><cylinderGeometry args={[0.09, 0.11, 0.16, 6]} /></mesh>
          {armR}{armL}
          <group ref={set("head")} position-y={0.86}>
            <mesh name="hero-face" position-y={0.18} scale={[0.92, 1.08, 0.92]} material={M.skin} castShadow><sphereGeometry args={[0.27, 20, 14]} /></mesh>
            <mesh position={[0, 0.12, 0.247]} scale={[0.046, 0.075, 0.059]} material={M.skin} castShadow><sphereGeometry args={[1, 10, 8]} /></mesh>
            <mesh position={[0, 0.01, 0.20]} scale={[0.115, 0.058, 0.045]} material={M.skin} castShadow><sphereGeometry args={[1, 12, 8]} /></mesh>
            <Box s={[0.085, 0.012, 0.018]} p={[0, 0.052, 0.247]} m={M.hair} />
            <Hood game={game} />
            <mesh name="hero-eye-left" position={[0.098, 0.2, 0.249]} scale={[0.045, 0.024, 0.014]} material={M.eye}><sphereGeometry args={[1, 12, 8]} /></mesh>
            <mesh name="hero-eye-right" position={[-0.098, 0.2, 0.249]} scale={[0.045, 0.024, 0.014]} material={M.eye}><sphereGeometry args={[1, 12, 8]} /></mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }

function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
const seg = (u: number, a: number, b: number) => THREE.MathUtils.clamp((u - a) / (b - a), 0, 1);

type Pose = { rx: number; ry: number; rz: number; re: number; bx: number; twist: number; lean: number; crouch: number; spinY: number; lx: number; heave: number };
/** Full-body keyframes per move: wind-up → arc → follow-through, all continuous in t. */
function attackPose(kind: string, t: number, vy: number): Pose | null {
  const d = COMBAT.durations[kind] ?? 1, u = t / d;
  const base: Pose = { rx: -0.3, ry: 0, rz: -0.2, re: -0.4, bx: 0, twist: 0, lean: 0, crouch: 0, spinY: 0, lx: 0.4, heave: 0 };
  const settle = 1 - easeInOut(seg(u, 0.6, 1)); // follow-through eases back to idle
  const mix = (a: Pose, w: number): Pose => ({ ...a, bx: lerp(base.bx, a.bx, w), rx: lerp(base.rx, a.rx, w), rz: lerp(base.rz, a.rz, w), re: lerp(base.re, a.re, w), twist: a.twist * w, lean: a.lean * w, crouch: a.crouch * w });
  switch (kind) {
    case 'slash1': { const k = easeInOut(seg(u, 0.12, 0.55)); // right → left horizontal crescent
      return mix({ ...base, rx: -1.45, rz: lerp(-1.6, 1.4, k), re: -0.15, bx: 1.35, twist: lerp(0.9, -1.1, k), lean: 0.18, crouch: 0.12, lx: 0.6 }, Math.max(seg(u, 0, 0.12), settle)); }
    case 'slash2': { const k = easeInOut(seg(u, 0.12, 0.55)); // low-left → high-right backhand
      return mix({ ...base, rx: lerp(-0.7, -2.4, k), rz: lerp(1.3, -1.5, k), re: -0.2, bx: 1.35, twist: lerp(-1.0, 1.0, k), lean: 0.12, crouch: 0.1, lx: 0.8 }, Math.max(seg(u, 0, 0.12), settle)); }
    case 'slash3': { const k = easeInOut(seg(u, 0.2, 0.55)); // overhead cleave with deep knee bend
      return mix({ ...base, rx: lerp(-3.1, -0.35, k), rz: -0.1, re: lerp(-0.5, -0.05, k), twist: 0.1, lean: lerp(-0.3, 0.55, k), crouch: lerp(0, 0.38, k), lx: 0.3 }, Math.max(seg(u, 0, 0.2), settle)); }
    case 'spin': { const k = easeInOut(seg(u, 0.22, 0.8)); // 360° whirl finisher
      return { ...mix({ ...base, rx: -1.55, rz: -1.55, re: -0.05, bx: 1.5, twist: lerp(1.1, 0, k), lean: 0.1, crouch: 0.2 * Math.sin(u * Math.PI) }, Math.max(seg(u, 0, 0.22), settle)), spinY: k * Math.PI * 2 };
    }
    case 'jump': return { ...base, rx: vy > 0 ? -3.0 : -2.7, rz: -0.15, re: -0.6, lean: vy > 0 ? -0.35 : 0.1, crouch: 0, lx: -0.6 };
    case 'jumpLand': { const k = easeOut(seg(u, 0, 0.18)); const rec = settle; // slam, then committed recovery
      return { ...base, rx: lerp(-2.7, -0.15, k), re: -0.05, bx: 0, lean: 0.65 * rec, crouch: 0.5 * rec, lx: lerp(0.4, 1.0, rec) }; }
    case 'thrustWind': { const k = easeInOut(seg(u, 0, 1)); // drawing the blade back while sprinting
      return { ...base, rx: lerp(-0.2, 0.75, k), rz: -0.35, re: lerp(-0.4, -1.7, k), bx: lerp(0.9, 1.45, k), lean: 0.4 * k, crouch: 0.12 * k, twist: 0.45 * k, lx: 0.5 }; }
    case 'thrust': { const tired = seg(t, COMBAT.thrustDecel, COMBAT.thrustDecel + COMBAT.thrustFatigue); // forward lunge, then heaving
      return { ...base, rx: -1.5 + tired * 0.35 - heroAim.pitch, rz: -0.05, re: 0, bx: 1.45, lean: 0.6 - tired * 0.15, crouch: 0.18 + tired * 0.12, twist: -0.25, lx: 0.9, heave: Math.sin(t * 7) * 0.09 * tired }; }
    case 'thrustEnd': { const k = easeInOut(seg(u, 0, 1)); // straightening out of the lean
      return { ...base, rx: lerp(-1.5, base.rx, k), re: lerp(0, base.re, k), bx: lerp(1.45, 0.9, k), lean: 0.6 * (1 - k), crouch: 0.2 * (1 - k), twist: -0.25 * (1 - k), lx: lerp(0.9, 0.2, k), heave: Math.sin(t * 6) * 0.06 * (1 - k) }; }
    default: return null;
  }
}
