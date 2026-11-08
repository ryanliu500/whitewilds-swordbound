import { updateShield } from './shield';
import { canFollowGround, turnTowards, walkableSlope } from './locomotion';
import { COMBAT, chooseAttack, comboIndexOf, isLaunch, isSlash, moveSpeedFactor, thrustSpeed, type MoveKind } from './combat';
import { createRagdoll, hitRagdoll, partPos, stepRagdoll, type Ragdoll, type V3 } from './ragdoll';
import { CAMP,CHEST,OBSTACLES,SPAWN,TOWER,WATER_Y,WORLD_R,heightAt,surfaceAt } from './world';
export const RULES={speed:14,sprint:2.2,jump:12,gravity:28,hopCooldown:.65,hopSpeed:24,health:100,stamina:30};
export type Enemy={id:number;kind:'guard'|'boss'|'sniper';x:number;y:number;z:number;hp:number;maxHp:number;rot:number;vx:number;vz:number;stun:number;cooldown:number;death:number;impulse:number};
/** guard = Q held; attack = click this frame; attackHeld = mouse button still down. */
export type Input={forward:number;strafe:number;yaw:number;sprint:boolean;jump:boolean;attack:boolean;attackHeld:boolean;guard:boolean;interact:boolean;hop:boolean};
export const emptyInput=():Input=>({forward:0,strafe:0,yaw:0,sprint:false,jump:false,attack:false,attackHeld:false,guard:false,interact:false,hop:false});
export type Move={kind:MoveKind;t:number;hits:number[];tick:number};
const newMove=(kind:MoveKind='none'):Move=>({kind,t:0,hits:[],tick:0});
function freshPlayer(){return {...SPAWN,vy:0,rot:Math.PI,grounded:true,hp:RULES.health,stamina:RULES.stamina,swimming:false,blocking:false,shieldTime:0,sword:0,move:newMove(),combo:0,comboTimer:0,kx:0,kz:0,ragdoll:false,dead:false,down:0,rest:0,tumble:0,hopCooldown:0,hopTime:0,invulnerable:0,climbing:false,rag:null as Ragdoll|null};}
export function createGame(){return {player:freshPlayer(),enemies:[[-15,12,'guard'],[15,6,'guard'],[-20,-13,'guard'],[0,-5,'boss'],[25,-12,'sniper']].map(([x,z,kind],i)=>({id:i,kind,x:CAMP.x+Number(x),z:CAMP.z+Number(z),y:kind==='sniper'?TOWER.y:CAMP.y,hp:kind==='boss'?150:kind==='sniper'?50:75,maxHp:kind==='boss'?150:kind==='sniper'?50:75,rot:0,vx:0,vz:0,stun:0,cooldown:1+i*.4,death:0,impulse:0} as Enemy)),bolts:[] as {x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number}[],boots:false,doorOpen:false,paused:false,time:0,message:'',messageTime:0,deaths:0,gameOver:0,gameOverText:''};}
export type GameState=ReturnType<typeof createGame>;
export function say(g:GameState,message:string){g.message=message;g.messageTime=4;}
function move(g:GameState,x:number,z:number){const p=g.player;const blocked=(a:number,b:number)=>OBSTACLES.some(o=>(!o.door||!g.doorOpen)&&p.y<o.y+o.h&&p.y+2>o.y&&Math.abs(a-o.x)<o.hx+.55&&Math.abs(b-o.z)<o.hz+.55);if(Math.hypot(x,z)>WORLD_R-50)return;if(!blocked(x,p.z))p.x=x;if(!blocked(p.x,z))p.z=z;}
export function jump(g:GameState){const p=g.player;if(!p.grounded||p.swimming)return false;p.vy=RULES.jump;p.grounded=false;return true;}
export function hop(g:GameState){const p=g.player;if(!g.boots||p.grounded||p.hopCooldown>0)return false;p.vy=Math.min(0,p.vy);p.hopTime=.3;p.hopCooldown=RULES.hopCooldown;return true;}
const busy=(p:GameState['player'])=>p.ragdoll||p.move.kind==='getup'||g_over(p);
const g_over=(p:GameState['player'])=>p.dead;

function startGameOver(g:GameState,text:string){if(g.gameOver>0)return;g.gameOver=COMBAT.gameOverSeconds;g.gameOverText=text;}
function respawn(g:GameState){Object.assign(g.player,freshPlayer(),{invulnerable:2});g.deaths++;g.gameOver=0;}

export function startRagdoll(g:GameState,dirX:number,dirZ:number,impulse:number){const p=g.player;p.ragdoll=true;p.down=0;p.rest=0;p.kx=dirX*impulse*1.1;p.kz=dirZ*impulse*1.1;p.vy=Math.max(4,impulse*.55);p.grounded=false;p.climbing=false;p.blocking=false;p.move=newMove();p.rag=createRagdoll(p.x,p.y,p.z,p.rot,[p.kx,p.vy,p.kz]);}

/** impulse ≈ how hard the hit throws you; isLaunch() hits (and all fatal hits) ragdoll, others knock back. */
export function damagePlayer(g:GameState,damage:number,ex:number,ez:number,impulse=8){const p=g.player;if(p.ragdoll&&p.rag){const d=Math.max(.01,Math.hypot(p.x-ex,p.z-ez));hitRagdoll(p.rag,ex,p.y+1.5,ez,[(p.x-ex)/d*impulse,impulse*.3,(p.z-ez)/d*impulse]);return;}if(p.invulnerable>0||p.ragdoll||p.dead)return;let dx=p.x-ex,dz=p.z-ez;const n=Math.max(.01,Math.hypot(dx,dz));dx/=n;dz/=n;const facing=-(Math.sin(p.rot)*dx+Math.cos(p.rot)*dz)>0.2;
  if(p.blocking&&facing){p.kx=dx*impulse*.35;p.kz=dz*impulse*.35;p.shieldTime=COMBAT.shieldStow;say(g,'Blocked');return;}
  p.hp=Math.max(0,p.hp-damage);p.invulnerable=.65;
  if(p.hp===0){p.dead=true;startRagdoll(g,dx,dz,Math.max(impulse,9));return;}
  if(isLaunch(impulse))startRagdoll(g,dx,dz,impulse);else{p.kx=dx*impulse;p.kz=dz*impulse;if(p.move.kind!=='thrust')p.move=newMove();}}

function strike(g:GameState,range:number,arc:number,damage:number,push:number,once=true){const p=g.player,m=p.move;for(const e of g.enemies){if(e.hp<=0||(once&&m.hits.includes(e.id)))continue;const dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);if(d>range||Math.abs(e.y-p.y)>3)continue;if(arc>-1&&(dx*Math.sin(p.rot)+dz*Math.cos(p.rot))/Math.max(d,.01)<arc)continue;m.hits.push(e.id);e.hp=Math.max(0,e.hp-damage);e.stun=.85;e.vx=dx/Math.max(d,.1)*push;e.vz=dz/Math.max(d,.1)*push;e.impulse++;if(e.hp===0)e.death=g.time;}g.doorOpen=g.enemies.some(e=>e.kind==='boss'&&e.hp===0);}

/** Starts an attack using the priority jump slash > sprint thrust > ground combo. */
export function attack(g:GameState,sprinting:boolean){const p=g.player,m=p.move;if(p.swimming||p.climbing||busy(p))return false;
  const chainable=m.kind==='none'||(isSlash(m.kind)&&m.t>=COMBAT.durations[m.kind]!*COMBAT.chainAt);if(!chainable)return false;
  const next=isSlash(m.kind)?(comboIndexOf(m.kind)+1)%4:(p.comboTimer>0?p.combo:0);
  const kind=chooseAttack(!p.grounded,sprinting,next);p.move=newMove(kind);p.sword=COMBAT.swordStow;
  if(isSlash(kind))p.combo=(comboIndexOf(kind)+1)%4;if(kind==='jump')p.vy=Math.max(p.vy,5);return true;}

function updateMove(g:GameState,i:Input,dt:number,sprinting:boolean){const p=g.player,m=p.move;if(m.kind==='none')return;m.t+=dt;const dur=COMBAT.durations[m.kind]??Infinity;const D=COMBAT.damage;
  if(isSlash(m.kind)){if(m.kind==='spin'){if(m.t>dur*.3&&m.t<dur*.75)strike(g,5,-1,D.spin!,16);}else if(m.t>dur*.32)strike(g,4.8,-.2,D[m.kind]!,12);}
  if(m.kind==='jump'&&p.grounded){p.move=newMove('jumpLand');strike(g,5.2,-1,D.jumpLand!,18);return;}
  if(m.kind==='thrustWind'&&m.t>=dur){p.move=i.attackHeld&&sprinting?newMove('thrust'):newMove('thrustEnd');return;}
  if(m.kind==='thrust'){m.tick-=dt;if(m.tick<=0){m.hits=[];m.tick=COMBAT.thrustTick;}strike(g,5.5,.5,D.thrust!,10);if(!i.attackHeld||!i.sprint){p.move=newMove('thrustEnd');}return;}
  if(m.t>=dur){if(isSlash(m.kind))p.comboTimer=COMBAT.comboWindow;p.move=newMove();}}

function ragdollWorld(g:GameState){return {ground:(x:number,z:number,y:number)=>{const s=surfaceAt(x,z,y);return s<WATER_Y-1.5?Math.max(s,WATER_Y-1.6):s;},
  push:(q:V3,r:number)=>{for(const o of OBSTACLES){if(o.door&&g.doorOpen)continue;if(q[1]>o.y+o.h+r||q[1]<o.y-r)continue;const ox=Math.abs(q[0]-o.x)-o.hx-r,oz=Math.abs(q[2]-o.z)-o.hz-r;if(ox<0&&oz<0){if(ox>oz)q[0]=o.x+Math.sign(q[0]-o.x)*(o.hx+r);else q[2]=o.z+Math.sign(q[2]-o.z)*(o.hz+r);}}
    for(const e of g.enemies){if(e.hp<=0||q[1]<e.y-r||q[1]>e.y+2.6+r)continue;const dx=q[0]-e.x,dz=q[2]-e.z,d=Math.hypot(dx,dz),R=.9+r;if(d<R&&d>1e-4){q[0]=e.x+dx/d*R;q[2]=e.z+dz/d*R;}}}};}

/** Jointed ragdoll until every part comes to rest (or the 6s watchdog), then get up — or game over if dead. */
function updateRagdoll(g:GameState,dt:number){const p=g.player;p.down+=dt;
  if(!p.rag)p.rag=createRagdoll(p.x,p.y,p.z,p.rot,[p.kx,p.vy,p.kz]);
  stepRagdoll(p.rag,ragdollWorld(g),dt);
  const pel=partPos(p.rag,'pelvis'),ch=partPos(p.rag,'chest');p.x=pel[0];p.z=pel[2];p.y=Math.max(surfaceAt(p.x,p.z,pel[1]),pel[1]-1.36);
  p.tumble=Math.atan2(Math.hypot(ch[0]-pel[0],ch[2]-pel[2]),ch[1]-pel[1]);p.rest=p.rag.still;
  const settled=p.rag.still>.5||p.down>=COMBAT.ragdollWatchdog;
  if(!settled)return;
  if(p.dead){startGameOver(g,'Felled in battle. The shadows claim you.');return;}
  p.ragdoll=false;p.rag=null;p.y=surfaceAt(p.x,p.z,p.y+1);p.vy=0;p.kx=p.kz=0;p.grounded=true;p.move=newMove('getup');p.invulnerable=1.6;}

export function interact(g:GameState){const p=g.player;if(Math.hypot(p.x-CHEST.x,p.z-CHEST.z)<6){if(!g.doorOpen){say(g,'The seal holds. Defeat the fortress guardian.');return;}if(!g.boots){g.boots=true;say(g,'Winged Boots acquired · The wind will carry you forward.');}}}

export function step(g:GameState,i:Input,delta:number){if(g.paused)return;const dt=Math.min(delta,.05),p=g.player;g.time+=dt;g.messageTime=Math.max(0,g.messageTime-dt);
  if(g.gameOver>0){g.gameOver-=dt;if(g.gameOver<=0){respawn(g);return;}if(p.ragdoll&&!p.swimming)updateRagdoll(g,dt);return;}
  for(const k of ['hopCooldown','hopTime','invulnerable','comboTimer'] as const)p[k]=Math.max(0,p[k]-dt);
  if(p.comboTimer===0&&p.move.kind==='none')p.combo=0;
  if(p.ragdoll){updateRagdoll(g,dt);updateEnemies(g,dt);return;}
  const locked=p.move.kind==='getup';
  const canGuard=i.guard&&!p.swimming&&!p.climbing&&!locked&&(p.move.kind==='none'||isSlash(p.move.kind));
  if(canGuard&&p.move.kind!=='none')p.move=newMove();
  p.shieldTime=updateShield(p.shieldTime,canGuard,dt);p.blocking=canGuard;
  p.sword=p.swimming||p.climbing?0:Math.max(0,p.sword-dt);
  const fx=-Math.sin(i.yaw),fz=-Math.cos(i.yaw);let dx=fx*i.forward-fz*i.strafe,dz=fz*i.forward+fx*i.strafe;const len=Math.hypot(dx,dz);
  if(len>0&&!locked&&p.move.kind!=='jumpLand'){dx/=len;dz/=len;p.rot=turnTowards(p.rot,Math.atan2(dx,dz),dt*(p.move.kind.startsWith('thrust')?.35:1));}
  const sprinting=i.sprint&&len>0&&p.grounded&&!p.blocking;
  const ladder=Math.abs(p.x-TOWER.x)<1.8&&Math.abs(p.z-(TOWER.z+2))<2&&p.y<TOWER.y+1;
  if(ladder&&(i.forward||p.climbing)&&p.move.kind==='none'){p.climbing=true;p.sword=0;p.vy=0;p.x=TOWER.x;p.z=TOWER.z+2;p.y=Math.max(CAMP.y,Math.min(TOWER.y,p.y+i.forward*6*dt));p.grounded=false;if(p.y>=TOWER.y){p.climbing=false;p.grounded=true;p.z=TOWER.z+1;}if(p.y===CAMP.y&&i.forward<0)p.climbing=false;}
  if(!p.climbing){
    const wasGrounded=p.grounded,oldX=p.x,oldZ=p.z,oldGround=surfaceAt(p.x,p.z,p.y);
    if(!locked&&p.move.kind==='none'){if(i.jump)jump(g);if(i.hop)hop(g);}
    const mk=p.move.kind;let sp=p.swimming?6:RULES.speed*(i.sprint?RULES.sprint:1)*(p.blocking?.45:1);
    if(mk==='thrustWind')sp=len>0?COMBAT.sprintSpeed:0;else if(mk==='thrust')sp=thrustSpeed(p.move.t);else sp*=moveSpeedFactor(mk);
    const fwdDrive=mk==='thrust'||mk==='thrustWind';if(fwdDrive){dx=Math.sin(p.rot);dz=Math.cos(p.rot);if(mk==='thrust')sp=Math.max(sp,0);}
    // lunge: slashes step into the swing
    let lunge=0;if(isSlash(mk)){const u=p.move.t/COMBAT.durations[mk]!;lunge=u>.15&&u<.45?6:0;}
    const boost=p.hopTime>0?RULES.hopSpeed:0;
    move(g,p.x+(dx*sp+Math.sin(p.rot)*(boost+lunge)+p.kx)*dt,p.z+(dz*sp+Math.cos(p.rot)*(boost+lunge)+p.kz)*dt);
    const kf=Math.exp(-6*dt);p.kx*=kf;p.kz*=kf;
    let ground=surfaceAt(p.x,p.z,p.y);
    const distance=Math.hypot(p.x-oldX,p.z-oldZ);
    const walkable=ground===TOWER.y||walkableSlope(heightAt,p.x,p.z);
    if(wasGrounded&&ground>p.y+0.08&&!walkable){p.x=oldX;p.z=oldZ;ground=oldGround;}
    p.swimming=ground<WATER_Y-1.5&&p.y<WATER_Y+1;
    if(p.swimming){p.y=WATER_Y-1.6;p.vy=0;p.grounded=false;p.stamina-=dt;p.sword=0;p.blocking=false;if(p.move.kind!=='none')p.move=newMove();}
    else {
      if(canFollowGround(wasGrounded,p.vy,oldGround,ground,distance,walkable)){p.y=ground;p.vy=0;p.grounded=true;p.hopCooldown=0;}
      else{
        p.vy-=RULES.gravity*dt*(p.move.kind==='jump'&&p.vy<0?1.6:1);p.y+=p.vy*dt;
        if(p.y<=ground){p.y=ground;p.vy=0;p.grounded=walkable;p.hopCooldown=0;
          if(!walkable){const gx=(heightAt(p.x+.3,p.z)-heightAt(p.x-.3,p.z))/.6,gz=(heightAt(p.x,p.z+.3)-heightAt(p.x,p.z-.3))/.6,n=Math.max(.01,Math.hypot(gx,gz));move(g,p.x-gx/n*8*dt,p.z-gz/n*8*dt);p.y=surfaceAt(p.x,p.z,p.y);}
        }else p.grounded=false;
      }
      p.stamina=Math.min(RULES.stamina,p.stamina+dt*6);
    }
  }
  if(i.attack&&!p.blocking)attack(g,sprinting);
  updateMove(g,i,dt,sprinting);
  if(i.interact&&!locked)interact(g);
  updateEnemies(g,dt);
  if(p.stamina<=0){p.dead=true;startGameOver(g,'The sea takes your strength. Returned to shore.');}
}

function updateEnemies(g:GameState,dt:number){const p=g.player;
  for(const e of g.enemies){if(e.hp<=0)continue;e.cooldown-=dt;e.stun=Math.max(0,e.stun-dt);if(e.stun>0){e.x+=e.vx*dt;e.z+=e.vz*dt;e.vx*=Math.exp(-5*dt);e.vz*=Math.exp(-5*dt);continue;}if(p.ragdoll||p.dead)continue;const dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);e.rot=Math.atan2(dx,dz);if(e.kind==='sniper'){if(d<100&&Math.abs(p.y-e.y)<20&&e.cooldown<=0){const dy=p.y+1.2-(e.y+1.6),n=Math.hypot(dx,dy,dz);g.bolts.push({x:e.x,y:e.y+1.6,z:e.z,vx:dx/n*32,vy:dy/n*32,vz:dz/n*32,life:4});e.cooldown=2.3;}continue;}if(d<38&&Math.abs(p.y-e.y)<5){if(d>2.5){e.x+=dx/d*5*dt;e.z+=dz/d*5*dt;e.y=heightAt(e.x,e.z);}else if(e.cooldown<=0){const boss=e.kind==='boss';damagePlayer(g,boss?22:12,e.x,e.z,boss?18:7);e.cooldown=boss?1.4:1.8;}}}
  g.bolts=g.bolts.filter(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.life-=dt;if(!p.ragdoll&&Math.hypot(b.x-p.x,b.y-p.y-1,b.z-p.z)<1.2){damagePlayer(g,14,b.x-b.vx,b.z-b.vz,5);return false;}return b.life>0&&b.y>heightAt(b.x,b.z);});
}
