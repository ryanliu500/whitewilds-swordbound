import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { heightAt } from "./sim/world";
import type { GameState } from "./sim/game";
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
  shirt: new THREE.MeshStandardMaterial({ color: "#d8cfb8", flatShading: true }),
  skin: new THREE.MeshStandardMaterial({ color: "#e8c9a8", flatShading: true }),
  hair: new THREE.MeshStandardMaterial({ color: "#d9b25a", flatShading: true }),
  pants: new THREE.MeshStandardMaterial({ color: "#e9e2cf", flatShading: true }),
  boot: new THREE.MeshStandardMaterial({ color: "#5a3b26", flatShading: true }),
  belt: new THREE.MeshStandardMaterial({ color: "#4a3020", flatShading: true }),
  metal: new THREE.MeshStandardMaterial({ color: "#cfd8e0", metalness: 0.7, roughness: 0.25, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: "#c9a23a", metalness: 0.6, roughness: 0.35, flatShading: true }),
  shield: new THREE.MeshStandardMaterial({ color: "#6b4a2e", flatShading: true }),
  eye: new THREE.MeshStandardMaterial({ color: "#1d3b5c", flatShading: true }),
};

type G = THREE.Group | null | undefined;
type Keys = "root"|"pelvis"|"spine"|"head"|"shL"|"elL"|"shR"|"elR"|"blade"|"flapF"|"flapB"|"flapL"|"flapR"|"shield"|"hipL"|"kneeL"|"ankleL"|"hipR"|"kneeR"|"ankleR";
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

export default function Hero({ game }: { game: GameState }) {
  const r = useRef({} as Record<Keys, THREE.Group>);
  const set = (k: Keys) => (o: THREE.Group | null) => { if (o) r.current[k] = o; };
  const st = useRef({ phase: 0, prevX: NaN, prevZ: NaN, speed: 0, fwd: 0, wasGrounded: true, land: 0, landK: 0, pelvis: 0, lean: 0, combo: 0, lastAttack: 0, footL: 0, footR: 0, t: 0, airT: 0 });
  const shieldPose = useRef({ amount: 0, hiding: false });

  useFrame((_, delta) => {
    const g = r.current, s = st.current, p = game.player;
    const dt = Math.min(delta, 0.05);
    s.t += dt;
    const root = g.root; if (!root) return;
    if (game.paused) return;
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
    shield.position.x = 0.12 - (1 - unfold) * 0.18;
    root.userData['shieldAmount'] = spose.amount;

    // --- velocity from motion ---
    if (Number.isNaN(s.prevX)) { s.prevX = p.x; s.prevZ = p.z; }
    const vx = (p.x - s.prevX) / Math.max(dt, 1e-4), vz = (p.z - s.prevZ) / Math.max(dt, 1e-4);
    s.prevX = p.x; s.prevZ = p.z;
    const sp = Math.min(Math.hypot(vx, vz), 60);
    s.speed = game.paused ? 0 : damp(s.speed, sp > 60 ? 0 : sp, 12, dt);
    const fwdDot = Math.sin(p.rot) * vx + Math.cos(p.rot) * vz;
    s.fwd = damp(s.fwd, fwdDot, 10, dt);
    const moving = s.speed > 0.8;
    const run = THREE.MathUtils.clamp(s.speed / 14, 0, 1);
    const sprint = THREE.MathUtils.clamp((s.speed - 16) / 12, 0, 1);

    // --- landing impact ---
    if (p.grounded && !s.wasGrounded && s.airT > 0.12) { s.land = 1; s.landK = THREE.MathUtils.clamp(s.airT * 0.9, 0.25, 1); }
    s.airT = p.grounded ? 0 : s.airT + dt;
    s.wasGrounded = p.grounded;
    s.land = Math.max(0, s.land - dt * 3.2);
    const landDip = Math.sin(s.land * Math.PI) * 0.45 * s.landK;

    // --- attack combo (alternates R->L, L->R, overhead) ---
    if (p.attack > 0.3 && s.t - s.lastAttack > 0.2) { s.combo = s.t - s.lastAttack < 0.9 ? (s.combo + 1) % 3 : 0; s.lastAttack = s.t; }
    const atk = p.attack > 0 ? 1 - p.attack / 0.32 : -1; // 0..1 during swing

    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.rot;

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
    const guardCrouch = p.blocking ? 0.16 : 0;
    const targetPelvis = Math.min(0, lowest) - landDip - guardCrouch - bob + breathe - (moving ? 0.05 * run : 0.03);
    s.pelvis = damp(s.pelvis, targetPelvis, 16, dt);
    pelvis.position.y = HIP_Y + s.pelvis;

    const applyLeg = (hip: G, knee: G, ankle: G, t: { fz: number; up: number }, foot: number, side: 1 | -1) => {
      if (!hip || !knee || !ankle) return;
      const dy = foot + FOOT_H + t.up - (HIP_Y + s.pelvis);
      const sol = solveLeg(t.fz, dy);
      hip.rotation.x = sol.hip; knee.rotation.x = sol.knee;
      hip.rotation.z = side * 0.04;
      const footPitch = onTerrain && t.up < 0.05 ? -Math.atan(slopeAt(side * HIP_X, t.fz)) : (t.up > 0.05 ? 0.35 : 0);
      ankle.rotation.x = footPitch - (sol.hip + sol.knee);
    };
    applyLeg(g.hipL, g.kneeL, g.ankleL, L, s.footL, 1);
    applyLeg(g.hipR, g.kneeR, g.ankleR, R, s.footR, -1);

    // --- torso: lean, counter-rotation, slope tilt ---
    const leanT = (moving ? 0.08 * run + 0.22 * sprint : 0) + (p.blocking ? 0.12 : 0) + landDip * 0.5 + (p.swimming ? 0.9 : 0);
    s.lean = damp(s.lean, leanT, 8, dt);
    const twist = moving && p.grounded ? -Math.sin(s.phase) * 0.12 * (0.5 + run) : 0;
    let atkTwist = 0;
    if (atk >= 0 && s.combo < 2) { const dir = s.combo === 0 ? 1 : -1; atkTwist = dir * lerp(0.9, -1.0, easeOut(atk)); }
    pelvis.rotation.y = -twist * 0.5;
    spine.rotation.set(s.lean + (atk >= 0 && s.combo === 2 ? lerp(-0.25, 0.4, easeOut(atk)) : 0), twist + atkTwist, 0);
    head.rotation.set(-s.lean * 0.6 + (p.swimming ? -0.7 : 0), -(twist + atkTwist) * 0.6, 0);

    // --- arms ---
    const armSwing = moving && p.grounded ? Math.sin(s.phase) * lerp(0.35, 0.9, run) : 0;
    // left arm (shield)
    let lx = -armSwing, lz = 0.18, le = -0.35 - run * 0.6, ly = 0;
    if (p.blocking) { lx = -1.35; ly = 0.6; lz = 0.25; le = -1.3; }
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
    if (atk >= 0) {
      const e = easeOut(atk);
      if (s.combo === 2) { rx = lerp(-2.9, -0.4, e); rz = -0.1; re = lerp(-0.3, -0.1, e); ry = 0; }
      else { const dir = s.combo === 0 ? 1 : -1; rx = -1.45; ry = 0; rz = dir * lerp(-1.3, 1.1, e) - 0.2; re = -0.25; }
      shR.rotation.set(rx, ry, rz); elR.rotation.x = re;
    } else {
      if (p.blocking) { rx = -0.7; rz = -0.35; re = -1.0; }
      else if (!p.grounded && !p.swimming && !p.climbing) { rx = -0.5; rz = -0.9; re = -0.4; }
      else if (p.swimming) { rx = -1.2 + Math.sin(s.t * 6 + Math.PI) * 0.9; rz = -0.6; re = -0.4; }
      else if (p.climbing) { rx = -2.6 + Math.sin(s.t * 6 + Math.PI) * 0.4; rz = -0.1; re = -0.6; }
      else if (!moving) { rx = 0.05 - breathe * 3; rz = -0.14; re = -0.3; }
      shR.rotation.set(damp(shR.rotation.x, rx, 14, dt), damp(shR.rotation.y, ry, 14, dt), damp(shR.rotation.z, rz, 14, dt));
      elR.rotation.x = damp(elR.rotation.x, re, 14, dt);
    }
    // blade points forward during swing, rests angled down/back otherwise
    blade.rotation.x = atk >= 0 ? 0 : damp(blade.rotation.x, p.blocking ? 0.2 : 0.9, 10, dt);

    // --- tunic flaps follow thighs and velocity ---
    const hipAvg = (hipL.rotation.x + hipR.rotation.x) / 2;
    flapF.rotation.x = Math.min(0, Math.min(hipL.rotation.x, hipR.rotation.x)) * 0.7 - 0.05;
    flapB.rotation.x = Math.max(0.05, s.speed * 0.02 + (!p.grounded ? 0.5 : 0) + hipAvg * -0.2);
    flapL.rotation.z = -0.08 - (!p.grounded ? 0.3 : 0) - s.speed * 0.004;
    flapR.rotation.z = 0.08 + (!p.grounded ? 0.3 : 0) + s.speed * 0.004;
  });

  const leg = (side: 1 | -1) => (
    <group ref={set(side === 1 ? "hipL" : "hipR")} position={[side * HIP_X, 0, 0]}>
      <Box s={[0.24, THIGH, 0.26]} p={[0, -THIGH / 2, 0]} m={M.pants} />
      <group ref={set(side === 1 ? "kneeL" : "kneeR")} position={[0, -THIGH, 0]}>
        <Box s={[0.2, 0.14, 0.2]} p={[0, 0, 0.02]} m={M.pants} />
        <Box s={[0.21, SHIN * 0.55, 0.23]} p={[0, -SHIN * 0.3, 0]} m={M.pants} />
        <Box s={[0.23, SHIN * 0.5, 0.25]} p={[0, -SHIN * 0.75, 0]} m={M.boot} />
        <group ref={set(side === 1 ? "ankleL" : "ankleR")} position={[0, -SHIN, 0]}>
          <Box s={[0.24, FOOT_H, 0.42]} p={[0, -FOOT_H / 2, 0.08]} m={M.boot} />
        </group>
      </group>
    </group>
  );

  const armR = (
    <group ref={set("shR")} position={[-0.42, 0.62, 0]}>
      <Box s={[0.2, 0.2, 0.2]} m={M.tunic} />
      <Box s={[0.16, UPPER_ARM, 0.16]} p={[0, -UPPER_ARM / 2, 0]} m={M.shirt} />
      <group ref={set("elR")} position={[0, -UPPER_ARM, 0]}>
        <Box s={[0.15, FOREARM, 0.15]} p={[0, -FOREARM / 2, 0]} m={M.shirt} />
        <Box s={[0.18, 0.14, 0.18]} p={[0, -FOREARM + 0.06, 0]} m={M.belt} />
        <group position={[0, -FOREARM - 0.06, 0]}>
          <mesh material={M.skin} castShadow><icosahedronGeometry args={[0.09, 0]} /></mesh>
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
      <Box s={[0.2, 0.2, 0.2]} m={M.tunic} />
      <Box s={[0.16, UPPER_ARM, 0.16]} p={[0, -UPPER_ARM / 2, 0]} m={M.shirt} />
      <group ref={set("elL")} position={[0, -UPPER_ARM, 0]}>
        <Box s={[0.15, FOREARM, 0.15]} p={[0, -FOREARM / 2, 0]} m={M.shirt} />
        <mesh position={[0, -FOREARM - 0.05, 0]} material={M.skin} castShadow><icosahedronGeometry args={[0.09, 0]} /></mesh>
        {/* shield strapped to the forearm */}
        <group ref={set('shield')} name="hero-shield" visible={false} scale={0} position={[0.12, -FOREARM * 0.55, 0.05]} rotation-z={Math.PI / 2}>
          <mesh rotation-x={Math.PI / 2} material={M.shield} castShadow><cylinderGeometry args={[0.38, 0.38, 0.06, 7]} /></mesh>
          <mesh position-y={0.04} rotation-x={Math.PI / 2} material={M.metal} castShadow><cylinderGeometry args={[0.1, 0.1, 0.05, 6]} /></mesh>
        </group>
      </group>
    </group>
  );

  return (
    <group ref={set("root")}>
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
          <mesh position-y={0.74} material={M.skin} castShadow><cylinderGeometry args={[0.09, 0.11, 0.16, 6]} /></mesh>
          {armR}{armL}
          <group ref={set("head")} position-y={0.86}>
            <mesh position-y={0.18} material={M.skin} castShadow><icosahedronGeometry args={[0.27, 1]} /></mesh>
            <Hood />
            <Box s={[0.07, 0.08, 0.02]} p={[0.1, 0.2, 0.25]} m={M.eye} />
            <Box s={[0.07, 0.08, 0.02]} p={[-0.1, 0.2, 0.25]} m={M.eye} />
          </group>
        </group>
      </group>
    </group>
  );
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3); }
