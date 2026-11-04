import { Suspense, useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import { RigidBody, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Model, PALETTE as P } from './Models';
import type { Enemy, GameState } from './sim/game';

function Joint({a,b,anchorA,anchorB}:{a:React.RefObject<RapierRigidBody|null>;b:React.RefObject<RapierRigidBody|null>;anchorA:[number,number,number];anchorB:[number,number,number]}){useSphericalJoint(a,b,[anchorA,anchorB]);return null;}
function Ragdoll({enemy:e}:{enemy:Enemy}){
 const torso=useRef<RapierRigidBody>(null),head=useRef<RapierRigidBody>(null),la=useRef<RapierRigidBody>(null),ra=useRef<RapierRigidBody>(null),ll=useRef<RapierRigidBody>(null),rl=useRef<RapierRigidBody>(null);
 useEffect(()=>{torso.current?.applyImpulse({x:e.vx*.5,y:3,z:e.vz*.5},true);torso.current?.applyTorqueImpulse({x:1,y:.3,z:.6},true);},[e]);
 const parts=[{ref:torso,pos:[0,1.35,0],size:[.7,.8,.45]},{ref:head,pos:[0,2,0],size:[.45,.45,.45]},{ref:la,pos:[-.6,1.35,0],size:[.25,.7,.25]},{ref:ra,pos:[.6,1.35,0],size:[.25,.7,.25]},{ref:ll,pos:[-.23,.55,0],size:[.3,.8,.3]},{ref:rl,pos:[.23,.55,0],size:[.3,.8,.3]}];
 return <>{parts.map((p,i)=><RigidBody key={i} ref={p.ref} position={[e.x+(p.pos[0]??0),e.y+(p.pos[1]??0),e.z]} colliders="cuboid" mass={i===0?2:.5} linearDamping={.6} angularDamping={.8}><mesh castShadow><boxGeometry args={p.size as [number,number,number]}/><meshStandardMaterial color={P.dark} flatShading/></mesh></RigidBody>)}
 <Joint a={torso} b={head} anchorA={[0,.45,0]} anchorB={[0,-.24,0]}/><Joint a={torso} b={la} anchorA={[-.4,.25,0]} anchorB={[.15,.25,0]}/><Joint a={torso} b={ra} anchorA={[.4,.25,0]} anchorB={[-.15,.25,0]}/><Joint a={torso} b={ll} anchorA={[-.23,-.4,0]} anchorB={[0,.4,0]}/><Joint a={torso} b={rl} anchorA={[.23,-.4,0]} anchorB={[0,.4,0]}/></>;
}
export default function Enemies({game}:{game:GameState}){return <>{game.enemies.map(e=>e.hp<=0||e.stun>0?<Ragdoll key={`${e.id}-${e.impulse}`} enemy={e}/>:<group key={e.id} position={[e.x,e.y,e.z]} rotation-y={e.rot}>
 <Suspense fallback={null}><group rotation-z={Math.sin(Math.floor(game.time*8+e.id))* .025}><Model kind="hero" height={e.kind==='boss'?3.3:2.5} dark animation={Math.hypot(e.x-game.player.x,e.z-game.player.z)<38&&e.kind!=='sniper'?'walk':'idle'}/></group></Suspense>
 <mesh position={[0,e.kind==='boss'?2.6:2,.32]}><boxGeometry args={[.32,.07,.04]}/><meshBasicMaterial color={P.fracture}/></mesh>
 <mesh position={[.7,1.4,.2]} rotation-z={-.5}><boxGeometry args={[.09,1.4,.09]}/><meshStandardMaterial color={e.kind==='sniper'?P.wood:P.dark}/></mesh>
 {Math.hypot(e.x-game.player.x,e.z-game.player.z)<65&&<Html position={[0,e.kind==='boss'?3.7:2.9,0]} center distanceFactor={22} style={{pointerEvents:'none'}}><div className="enemy-health"><span>{e.kind==='boss'?'RIFT GUARDIAN':e.kind==='sniper'?'WATCHER':'HOLLOW'}</span><progress max={e.maxHp} value={e.hp}/></div></Html>}
 </group>)}{game.bolts.map((b,i)=><mesh key={'bolt'+i} position={[b.x,b.y,b.z]}><sphereGeometry args={[.18,5,5]}/><meshBasicMaterial color={P.fracture}/></mesh>)}</>;}