import { useAnimations, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import hero from '@/assets/models/hero.glb.asset.json';
import tree from '@/assets/models/tree.glb.asset.json';
import tent from '@/assets/models/tent.glb.asset.json';
import fire from '@/assets/models/campfire-pit.glb.asset.json';
import chest from '@/assets/models/chest.glb.asset.json';
import fence from '@/assets/models/fence-fortified.glb.asset.json';
import structure from '@/assets/models/structure.glb.asset.json';

export const ASSETS={hero:hero.url,tree:tree.url,tent:tent.url,fire:fire.url,chest:chest.url,fence:fence.url,structure:structure.url};
Object.values(ASSETS).forEach(url=>useGLTF.preload(url));
export const PALETTE={ground:'#f1f2ea',trail:'#c5c6b8',grass:'#a3be85',wood:'#746657',woodLight:'#ac9578',dark:'#171b20',fracture:'#8bdad5',sky:'#6fb8e8',fog:'#c8e2f4',water:'#82b4c9',white:'#ffffff',metal:'#cad4d7',gold:'#edcc76',ember:'#ff9b4a',stone:'#b9c2bc'};
export function Model({kind,height=2,dark=false,animation='idle',...props}:{kind:keyof typeof ASSETS;height?:number;dark?:boolean;animation?:string;position?:[number,number,number];rotation?:[number,number,number]}){
 const {scene,animations}=useGLTF(ASSETS[kind]);const ref=useRef<THREE.Group>(null);
 const object=useMemo(()=>{const s=clone(scene),box=new THREE.Box3().setFromObject(s),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const scale=height/Math.max(size.y,.01);s.scale.setScalar(scale);s.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);s.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;if(dark)o.material=new THREE.MeshStandardMaterial({color:PALETTE.dark,roughness:.7,flatShading:true});}});return s;},[scene,height,dark]);
 const {actions}=useAnimations(animations,ref);
 useEffect(()=>{const a=actions[animation];a?.reset().fadeIn(.15).play();return()=>{a?.fadeOut(.15);};},[actions,animation]);
 return <group {...props} ref={ref}><primitive object={object}/></group>;
}