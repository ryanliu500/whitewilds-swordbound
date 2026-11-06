import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAMP, ISLAND, hash, heightAt } from "./sim/world";
function noise2(x: number, z: number) { const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz); const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1); return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; }
import type { GameState as Game } from "./sim/game";

/** Full day length in real seconds. */
export const DAY_SECONDS = 720;
/** Shared clock: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export const clock = { t: 0.32 };
const WATER_Y = -25;

type Key = { t: number; zenith: string; horizon: string; fog: string; sun: string; sunI: number; amb: number };
const KEYS: Key[] = [
  { t: 0.0, zenith: "#050a1f", horizon: "#1b2547", fog: "#16203a", sun: "#9fb4ff", sunI: 0.35, amb: 0.25 },
  { t: 0.22, zenith: "#1a2650", horizon: "#e9a07e", fog: "#c99a8c", sun: "#ffb48a", sunI: 0.9, amb: 0.45 },
  { t: 0.3, zenith: "#3f8fd6", horizon: "#ffe0bf", fog: "#e8dcca", sun: "#ffe4c0", sunI: 1.8, amb: 0.65 },
  { t: 0.5, zenith: "#2f86d8", horizon: "#cfe7f6", fog: "#c8e2f4", sun: "#fff8ec", sunI: 2.2, amb: 0.75 },
  { t: 0.7, zenith: "#3a7cc4", horizon: "#ffd29a", fog: "#efd2a8", sun: "#ffd39a", sunI: 1.8, amb: 0.65 },
  { t: 0.78, zenith: "#2a2f66", horizon: "#ff7a4a", fog: "#c9786a", sun: "#ff8a52", sunI: 1.0, amb: 0.45 },
  { t: 0.86, zenith: "#080d26", horizon: "#2a2850", fog: "#1d2240", sun: "#9fb4ff", sunI: 0.35, amb: 0.25 },
  { t: 1.0, zenith: "#050a1f", horizon: "#1b2547", fog: "#16203a", sun: "#9fb4ff", sunI: 0.35, amb: 0.25 },
];
const ca = new THREE.Color(), cb = new THREE.Color();
function sample(t: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]!.t < t) i++;
  const a = KEYS[i]!, b = KEYS[i + 1]!, f = THREE.MathUtils.smoothstep(t, a.t, b.t);
  const mix = (x: string, y: string) => ca.set(x).lerp(cb.set(y), f).clone();
  return { zenith: mix(a.zenith, b.zenith), horizon: mix(a.horizon, b.horizon), fog: mix(a.fog, b.fog), sun: mix(a.sun, b.sun), sunI: a.sunI + (b.sunI - a.sunI) * f, amb: a.amb + (b.amb - a.amb) * f };
}

const skyVert = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position.z = gl_Position.w; }`;
const skyFrag = `uniform vec3 uZenith,uHorizon,uSunDir,uSunColor; uniform float uNight; varying vec3 vDir;
float h3(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){ vec3 d=normalize(vDir); float e=clamp(d.y,0.,1.);
 vec3 col=mix(uHorizon,uZenith,pow(e,.55)); if(d.y<0.) col=mix(uHorizon,uHorizon*.8,clamp(-d.y*4.,0.,1.));
 float s=max(dot(d,uSunDir),0.); col+=uSunColor*(pow(s,8.)*.35+pow(s,64.)*.6)*(1.-uNight*.7); col+=uSunColor*smoothstep(.9994,.9997,s)*3.*(1.-uNight);
 float m=max(dot(d,-uSunDir),0.); col+=vec3(.85,.9,1.)*smoothstep(.9990,.9993,m)*uNight*1.5+vec3(.4,.5,.8)*pow(m,32.)*.25*uNight;
 vec3 g=floor(d*420.); float st=step(.9975,h3(g))*smoothstep(.0,.25,d.y); col+=vec3(st)*uNight*(.6+.4*sin(h3(g+1.)*40.));
 gl_FragColor=vec4(col,1.);
 #include <colorspace_fragment>
}`;

const oceanVert = `uniform float uTime; varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;
vec3 wave(vec2 dir,float amp,float len,float spd,vec3 p,inout vec3 tg,inout vec3 bn){ float k=6.2831/len; vec2 d=normalize(dir); float f=k*(dot(d,p.xz)-spd*uTime); float a=amp; 
 tg+=vec3(-d.x*d.x*(a*k)*sin(f),d.x*(a*k)*cos(f),-d.x*d.y*(a*k)*sin(f)); bn+=vec3(-d.x*d.y*(a*k)*sin(f),d.y*(a*k)*cos(f),-d.y*d.y*(a*k)*sin(f));
 return vec3(d.x*a*cos(f),a*sin(f),d.y*a*cos(f)); }
void main(){ vec3 p=(modelMatrix*vec4(position,1.)).xyz; vec3 tg=vec3(1,0,0),bn=vec3(0,0,1); vec3 o=vec3(0);
 o+=wave(vec2(1,.3),1.1,90.,6.,p,tg,bn); o+=wave(vec2(-.4,1),.7,52.,5.,p,tg,bn); o+=wave(vec2(.7,-.6),.35,23.,3.4,p,tg,bn); o+=wave(vec2(-.9,-.2),.18,11.,2.4,p,tg,bn);
 p+=o; vCrest=o.y; vNormal2=normalize(cross(bn,tg)); vWorld=p; gl_Position=projectionMatrix*viewMatrix*vec4(p,1.); }`;
const oceanFrag = `uniform vec3 uSunDir,uSunColor,uSky,uHorizon,uFog,uDeep,uShallow; uniform vec2 uIsland; uniform float uTime,uFogNear,uFogFar,uNight; varying vec3 vWorld; varying vec3 vNormal2; varying float vCrest;
void main(){ vec3 n=normalize(vNormal2+vec3(sin(vWorld.x*.9+uTime*2.)*.04,0.,cos(vWorld.z*.8+uTime*1.7)*.04)); vec3 v=normalize(cameraPosition-vWorld);
 float fres=.03+.97*pow(1.-max(dot(n,v),0.),5.); float shore=1.-smoothstep(380.,620.,distance(vWorld.xz,uIsland));
 vec3 body=mix(uDeep,uShallow,shore*.85+clamp(vCrest*.15,0.,.3)); vec3 refl=mix(uHorizon,uSky,clamp(reflect(-v,n).y*2.,0.,1.));
 vec3 col=mix(body,refl,fres); vec3 h=normalize(uSunDir+v); float spec=pow(max(dot(n,h),0.),220.)*4.+pow(max(dot(n,h),0.),24.)*.25; col+=uSunColor*spec*(1.-uNight*.85);
 col+=vec3(1.)*smoothstep(1.05,1.6,vCrest)*.45; col*=mix(1.,.45,uNight);
 float dist=length(cameraPosition-vWorld); col=mix(col,uFog,smoothstep(uFogNear,uFogFar,dist)); gl_FragColor=vec4(col,1.);
 #include <colorspace_fragment>
}`;

export function SkyAndSun({ game, paused }: { game: Game; paused: boolean }) {
  const { scene, camera } = useThree();
  const sky = useRef<THREE.Mesh>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ocean = useRef<THREE.Mesh>(null);
  const skyMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() }, uNight: { value: 0 } } }), []);
  const oceanMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: oceanVert, fragmentShader: oceanFrag, fog: false,
    uniforms: { uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uFog: { value: new THREE.Color() },
      uDeep: { value: new THREE.Color("#0b3a66") }, uShallow: { value: new THREE.Color("#2fc2c0") }, uIsland: { value: new THREE.Vector2(ISLAND[0], ISLAND[1]) }, uFogNear: { value: 400 }, uFogFar: { value: 4000 }, uNight: { value: 0 } } }), []);
  const oceanGeo = useMemo(() => { const g = new THREE.PlaneGeometry(3000, 3000, 160, 160); g.rotateX(-Math.PI / 2); return g; }, []);
  const far = useMemo(() => { const g = new THREE.PlaneGeometry(30000, 30000, 1, 1); g.rotateX(-Math.PI / 2); return g; }, []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, d) => {
    if (!paused) clock.t = (clock.t + Math.min(d, 0.1) / DAY_SECONDS) % 1;
    const a = (clock.t - 0.25) * Math.PI * 2;
    dir.set(Math.cos(a) * 0.8, Math.sin(a), 0.45).normalize();
    const c = sample(clock.t);
    const night = THREE.MathUtils.clamp(-dir.y * 4 + 0.2, 0, 1);
    const p = game.player;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = skyMat.uniforms as any;
    u.uZenith.value.copy(c.zenith); u.uHorizon.value.copy(c.horizon); u.uSunDir.value.copy(dir); u.uSunColor.value.copy(c.sun); u.uNight.value = night;
    sky.current?.position.copy(camera.position);
    if (scene.fog) (scene.fog as THREE.Fog).color.copy(c.fog);
    if (sun.current) {
      const light = dir.y > -0.05 ? dir : dir.clone().negate(); // moonlight at night
      sun.current.position.set(p.x + light.x * 200, p.y + Math.max(light.y, 0.15) * 200, p.z + light.z * 200);
      sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld();
      sun.current.color.copy(c.sun); sun.current.intensity = c.sunI;
    }
    if (hemi.current) { hemi.current.intensity = c.amb; hemi.current.color.copy(c.zenith).lerp(new THREE.Color("#ffffff"), 0.55); hemi.current.groundColor.copy(c.fog).multiplyScalar(0.6); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const o = oceanMat.uniforms as any;
    o.uTime.value = state.clock.elapsedTime; o.uSunDir.value.copy(dir); o.uSunColor.value.copy(c.sun); o.uSky.value.copy(c.zenith); o.uHorizon.value.copy(c.horizon); o.uFog.value.copy(c.fog); o.uNight.value = night;
    if (ocean.current) ocean.current.position.set(Math.round(camera.position.x / 12) * 12, WATER_Y, Math.round(camera.position.z / 12) * 12);
  });

  return (
    <>
      <mesh ref={sky} renderOrder={-1} frustumCulled={false} material={skyMat}><sphereGeometry args={[9000, 32, 16]} /></mesh>
      <hemisphereLight ref={hemi} args={["#ffffff", "#c8c2b8", 0.9]} />
      <directionalLight ref={sun} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-90} shadow-camera-right={90} shadow-camera-top={90} shadow-camera-bottom={-90}
        shadow-camera-near={1} shadow-camera-far={500} shadow-bias={-0.0004} shadow-normalBias={0.04} />
      <mesh ref={ocean} geometry={oceanGeo} material={oceanMat} frustumCulled={false} />
      <mesh geometry={far} position-y={WATER_Y - 1.5} material={oceanMat} />
    </>
  );
}

/** TOTK-style meadow: curved two-tone blades in dense clumps with layered wind. */
export function Meadow() {
  const mat = useRef<THREE.Material & { userData: { shader?: { uniforms: Record<string, { value: number }> } } }>(null);
  const mesh = useMemo(() => {
    const SEG = 4, W = 0.16, BLADES = 7;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const root = new THREE.Color("#79a552"), tip = new THREE.Color("#f2f0b0");
    for (let k = 0; k < BLADES; k++) {
      const ang = (k / BLADES) * 6.28 + hash(k, 3), r = 0.12 + hash(k, 4) * 0.35, ox = Math.cos(ang) * r, oz = Math.sin(ang) * r;
      const yaw = hash(k, 5) * 6.28, cy = Math.cos(yaw), sy = Math.sin(yaw), tall = 0.7 + hash(k, 6) * 0.5, base = pos.length / 3;
      for (let s = 0; s <= SEG; s++) {
        const h = s / SEG, w = W * (1 - h * 0.9), bend = h * h * 0.4 * tall;
        for (const sx of [-w, w]) { pos.push(ox + sx * cy + bend * sy, h * tall, oz - sx * sy + bend * cy); }
        const cc = root.clone().lerp(tip, Math.pow(h, 1.2));
        col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
        if (s < SEG) { const b = base + s * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    // normals pointing up give soft, sunlit grass instead of dark edge-on blades
    const n = geo.getAttribute("normal"); for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0.3);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const list: THREE.Matrix4[] = [], tints: THREE.Color[] = [];
    const tintA = new THREE.Color("#ffffff"), tintB = new THREE.Color("#c9dba0");
    for (let i = 0; i < 60000 && list.length < 14000; i++) {
      const x = ISLAND[0] + (hash(i, 51) - 0.5) * 860, z = ISLAND[1] + (hash(i, 52) - 0.5) * 860;
      const dc = Math.hypot(x - ISLAND[0], z - ISLAND[1]);
      if (dc > 405 || Math.abs(x - ISLAND[0] - Math.sin((z - ISLAND[1]) / 70) * 8) < 6 || Math.hypot(x - CAMP.x, z - CAMP.z) < 60) continue;
      const patch = noise2(x / 55, z / 55) * 0.7 + noise2(x / 13, z / 13) * 0.3;
      if (patch < 0.48) continue;
      const y = heightAt(x, z); if (y < -22) continue;
      const hgt = 0.55 + (patch - 0.48) * 2.2 + hash(i, 53) * 0.5;
      q.setFromAxisAngle(up, hash(i, 54) * 6.28);
      list.push(m.compose(v.set(x, y - 0.05, z), q, sc.set(1.4 + hash(i, 55) * 0.8, hgt * 1.3, 1.4 + hash(i, 55) * 0.8)).clone());
      tints.push(tintA.clone().lerp(tintB, hash(i, 56)));
    }
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms["uTime"] = { value: 0 };
      material.userData["shader"] = shader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n normal = normalize(vNormal);");
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
        float hh = position.y * position.y;
        float gust = sin(uTime*0.9 + ip.x*0.035 + ip.z*0.02)*0.5+0.5;
        float sway = sin(uTime*1.8 + ip.x*0.12 + ip.z*0.09)*(0.18+gust*0.35) + sin(uTime*5.3 + ip.x*1.7)*0.05;
        vec3 wdir = (inverse(mat3(instanceMatrix)) * vec3(0.8,0.,0.6));
        transformed += wdir * sway * hh;
        transformed.y -= abs(sway) * hh * 0.15;`);
    };
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, tints[i]!); });
    im.receiveShadow = true; im.frustumCulled = false;
    (mat as { current: unknown }).current = material;
    return im;
  }, []);
  useFrame((s) => { const sh = mat.current?.userData.shader; if (sh?.uniforms["uTime"]) sh.uniforms["uTime"].value = s.clock.elapsedTime; });
  return <primitive object={mesh} />;
}
