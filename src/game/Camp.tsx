import { Suspense, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Model, PALETTE as P } from './Models';
import { CAMP,CHEST,OBSTACLES,TOWER,TREES,WALLS } from './sim/world';
import type { GameState } from './sim/game';

function Timber({position,size}:{position:[number,number,number];size:[number,number,number]}){return <mesh position={position} castShadow receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={P.wood} roughness={1}/></mesh>;}
export default function Camp({game}:{game:GameState}){
 const fenceSegments=useMemo(()=>WALLS.filter(w=>!w.door).flatMap(w=>{const alongX=w.hx>w.hz,length=alongX?w.hx*2:w.hz*2,count=Math.ceil(length/5);return Array.from({length:count},(_,i)=>({x:w.x+(alongX?(i+.5)*length/count-length/2:0),z:w.z+(!alongX?(i+.5)*length/count-length/2:0),rotation:alongX?0:Math.PI/2}));}),[]);
 return <><Suspense fallback={null}>
 {TREES.map((t,i)=><Model key={i} kind="tree" height={t.h} position={[t.x,t.y,t.z]}/>)}
 {fenceSegments.map((p,i)=><Model key={'f'+i} kind="fence" height={7} position={[p.x,CAMP.y,p.z]} rotation={[0,p.rotation,0]}/>)}
 <Model kind="tent" height={4} position={[CAMP.x-23,CAMP.y,CAMP.z-20]} rotation={[0,.35,0]}/><Model kind="tent" height={4} position={[CAMP.x+20,CAMP.y,CAMP.z+22]} rotation={[0,-1.8,0]}/>
 <Model kind="fire" height={.9} position={[CAMP.x-11,CAMP.y,CAMP.z+8]}/>
 <Model kind="chest" height={1.5} position={[CHEST.x,CHEST.y,CHEST.z]} rotation={[0,Math.PI,0]}/>
 <Model kind="structure" height={4} position={[TOWER.x,TOWER.y,TOWER.z]}/>
 </Suspense>
 {OBSTACLES.filter(o=>!o.door||!game.doorOpen).map((o,i)=><RigidBody key={'collider'+i} type="fixed" colliders={false} position={[o.x,o.y+o.h/2,o.z]}><CuboidCollider args={[o.hx,o.h/2,o.hz]}/></RigidBody>)}
 <RigidBody type="fixed" colliders={false} position={[CAMP.x,CAMP.y-1,CAMP.z]}><CuboidCollider args={[65,1,65]}/></RigidBody>
 <RigidBody type="fixed" colliders={false} position={[TOWER.x,TOWER.y-.3,TOWER.z]}><CuboidCollider args={[4.8,.3,4.8]}/></RigidBody>
 {!game.doorOpen&&<Timber position={[CAMP.x,CAMP.y+3,CAMP.z-16]} size={[15,6,1]}/>}
 {[-1,1].flatMap(a=>[-1,1].map(b=><Timber key={`${a}${b}`} position={[TOWER.x+a*4,CAMP.y+7,TOWER.z+b*4]} size={[.9,14,.9]}/>))}
 <Timber position={[TOWER.x,TOWER.y-.3,TOWER.z]} size={[9.6,.6,9.6]}/>
 {[-1,1].map(a=><Timber key={a} position={[TOWER.x+a*.85,CAMP.y+7,TOWER.z+2]} size={[.18,14,.18]}/>)}
 {Array.from({length:27},(_,i)=><Timber key={'rung'+i} position={[TOWER.x,CAMP.y+.3+i*.5,TOWER.z+2]} size={[1.7,.16,.2]}/>)}
 <Timber position={[TOWER.x,TOWER.y+1,TOWER.z-4.5]} size={[9,1.4,.2]}/>
 {[-1,1].map(a=><Timber key={'rail'+a} position={[TOWER.x+a*4.5,TOWER.y+1,TOWER.z]} size={[.2,1.4,9]}/>)}
 <mesh position={[CAMP.x-11,CAMP.y+1.2,CAMP.z+8]}><coneGeometry args={[.7,2,5]}/><meshStandardMaterial color={P.ember} emissive={P.ember} emissiveIntensity={2}/></mesh>
 <pointLight position={[CAMP.x-11,CAMP.y+2,CAMP.z+8]} color={P.ember} intensity={18} distance={14}/>
 {/* Solid frozen lightning marks the corrupted camp. */}
 {Array.from({length:9},(_,i)=><mesh key={'rift'+i} position={[CAMP.x-32+i*8,CAMP.y+2,CAMP.z-34]} rotation={[.2,i*.7,.25]}><octahedronGeometry args={[1.2,0]}/><meshStandardMaterial color={P.dark} roughness={.35}/></mesh>)}
 </>;
}