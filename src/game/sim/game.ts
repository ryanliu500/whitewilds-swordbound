import { updateShield } from './shield';
import { canFollowGround, turnTowards, walkableSlope } from './locomotion';
import { CAMP,CHEST,OBSTACLES,SPAWN,TOWER,WATER_Y,WORLD_R,heightAt,surfaceAt } from './world';
export const RULES={speed:14,sprint:2.2,jump:12,gravity:28,hopCooldown:.65,hopSpeed:24,health:100,stamina:30,attackDamage:25,attackCooldown:.42};
export type Enemy={id:number;kind:'guard'|'boss'|'sniper';x:number;y:number;z:number;hp:number;maxHp:number;rot:number;vx:number;vz:number;stun:number;cooldown:number;death:number;impulse:number};
export type Input={forward:number;strafe:number;yaw:number;sprint:boolean;jump:boolean;attack:boolean;block:boolean;interact:boolean;hop:boolean;shield:boolean};
export const emptyInput=():Input=>({forward:0,strafe:0,yaw:0,sprint:false,jump:false,attack:false,block:false,interact:false,hop:false,shield:false});
export function createGame(){return {player:{...SPAWN,vy:0,rot:Math.PI,grounded:true,hp:RULES.health,stamina:RULES.stamina,swimming:false,blocking:false,shieldTime:0,attack:0,attackCooldown:0,hopCooldown:0,hopTime:0,invulnerable:0,climbing:false},enemies:[[-15,12,'guard'],[15,6,'guard'],[-20,-13,'guard'],[0,-5,'boss'],[25,-12,'sniper']].map(([x,z,kind],i)=>({id:i,kind,x:CAMP.x+Number(x),z:CAMP.z+Number(z),y:kind==='sniper'?TOWER.y:CAMP.y,hp:kind==='boss'?150:kind==='sniper'?50:75,maxHp:kind==='boss'?150:kind==='sniper'?50:75,rot:0,vx:0,vz:0,stun:0,cooldown:1+i*.4,death:0,impulse:0} as Enemy)),bolts:[] as {x:number;y:number;z:number;vx:number;vy:number;vz:number;life:number}[],boots:false,doorOpen:false,paused:false,time:0,message:'',messageTime:0,deaths:0};}
export type GameState=ReturnType<typeof createGame>;
export function say(g:GameState,message:string){g.message=message;g.messageTime=4;}
function move(g:GameState,x:number,z:number){const p=g.player;const blocked=(a:number,b:number)=>OBSTACLES.some(o=>(!o.door||!g.doorOpen)&&p.y<o.y+o.h&&p.y+2>o.y&&Math.abs(a-o.x)<o.hx+.55&&Math.abs(b-o.z)<o.hz+.55);if(Math.hypot(x,z)>WORLD_R-50)return;if(!blocked(x,p.z))p.x=x;if(!blocked(p.x,z))p.z=z;}
export function jump(g:GameState){const p=g.player;if(!p.grounded||p.swimming)return false;p.vy=RULES.jump;p.grounded=false;return true;}
export function hop(g:GameState){const p=g.player;if(!g.boots||p.grounded||p.hopCooldown>0)return false;p.vy=Math.min(0,p.vy);p.hopTime=.3;p.hopCooldown=RULES.hopCooldown;return true;}
export function damagePlayer(g:GameState,damage:number,ex:number,ez:number){const p=g.player;if(p.invulnerable>0)return;const facing=(Math.sin(p.rot)*(ex-p.x)+Math.cos(p.rot)*(ez-p.z))>0;if(p.blocking&&facing){say(g,'Blocked');return;}p.hp=Math.max(0,p.hp-damage);p.invulnerable=.65;}
export function attack(g:GameState){const p=g.player;if(p.attackCooldown>0||p.swimming||p.climbing)return false;p.attack=.32;p.attackCooldown=RULES.attackCooldown;for(const e of g.enemies){const dx=e.x-p.x,dz=e.z-p.z,d=Math.hypot(dx,dz);if(e.hp<=0||d>4.8||Math.abs(e.y-p.y)>3||((dx*Math.sin(p.rot)+dz*Math.cos(p.rot))/Math.max(d,.01))<-.2)continue;e.hp=Math.max(0,e.hp-RULES.attackDamage);e.stun=.85;e.vx=dx/Math.max(d,.1)*12;e.vz=dz/Math.max(d,.1)*12;e.impulse++;if(e.hp===0)e.death=g.time;}g.doorOpen=g.enemies.some(e=>e.kind==='boss'&&e.hp===0);return true;}
export function interact(g:GameState){const p=g.player;if(Math.hypot(p.x-CHEST.x,p.z-CHEST.z)<6){if(!g.doorOpen){say(g,'The seal holds. Defeat the fortress guardian.');return;}if(!g.boots){g.boots=true;say(g,'Winged Boots acquired · The wind will carry you forward.');}}}
export function step(g:GameState,i:Input,delta:number){if(g.paused)return;const dt=Math.min(delta,.05),p=g.player;g.time+=dt;g.messageTime=Math.max(0,g.messageTime-dt);for(const k of ['attack','attackCooldown','hopCooldown','hopTime','invulnerable'] as const)p[k]=Math.max(0,p[k]-dt);p.shieldTime=updateShield(p.shieldTime,i.shield,i.block&&!p.swimming,dt);p.blocking=i.block&&!p.swimming&&p.shieldTime>0;
  const fx=-Math.sin(i.yaw),fz=-Math.cos(i.yaw);let dx=fx*i.forward-fz*i.strafe,dz=fz*i.forward+fx*i.strafe;const len=Math.hypot(dx,dz);if(len>0){dx/=len;dz/=len;p.rot=turnTowards(p.rot,Math.atan2(dx,dz),dt);}
 const ladder=Math.abs(p.x-TOWER.x)<1.8&&Math.abs(p.z-(TOWER.z+2))<2&&p.y<TOWER.y+1;
 if(ladder&&(i.forward||p.climbing)){p.climbing=true;p.vy=0;p.x=TOWER.x;p.z=TOWER.z+2;p.y=Math.max(CAMP.y,Math.min(TOWER.y,p.y+i.forward*6*dt));p.grounded=false;if(p.y>=TOWER.y){p.climbing=false;p.grounded=true;p.z=TOWER.z+1;}if(p.y===CAMP.y&&i.forward<0)p.climbing=false;}
  if(!p.climbing){
    const wasGrounded=p.grounded,oldX=p.x,oldZ=p.z,oldGround=surfaceAt(p.x,p.z,p.y);
    if(i.jump)jump(g);if(i.hop)hop(g);
    const sp=p.swimming?6:RULES.speed*(i.sprint?RULES.sprint:1)*(p.blocking?.45:1),boost=p.hopTime>0?RULES.hopSpeed:0;
    move(g,p.x+(dx*sp+Math.sin(p.rot)*boost)*dt,p.z+(dz*sp+Math.cos(p.rot)*boost)*dt);
    let ground=surfaceAt(p.x,p.z,p.y);
    const distance=Math.hypot(p.x-oldX,p.z-oldZ);
    const walkable=ground===TOWER.y||walkableSlope(heightAt,p.x,p.z);
    // Do not climb sheer faces via the old upward penetration clamp.
    if(wasGrounded&&ground>p.y+0.08&&!walkable){p.x=oldX;p.z=oldZ;ground=oldGround;}
    p.swimming=ground<WATER_Y-1.5&&p.y<WATER_Y+1;
    if(p.swimming){p.y=WATER_Y-1.6;p.vy=0;p.grounded=false;p.stamina-=dt;}
    else {
      if(canFollowGround(wasGrounded,p.vy,oldGround,ground,distance,walkable)){
        p.y=ground;p.vy=0;p.grounded=true;p.hopCooldown=0;
      }else{
        p.vy-=RULES.gravity*dt;p.y+=p.vy*dt;
        if(p.y<=ground){p.y=ground;p.vy=0;p.grounded=walkable;p.hopCooldown=0;
          if(!walkable){const gx=(heightAt(p.x+.3,p.z)-heightAt(p.x-.3,p.z))/.6,gz=(heightAt(p.x,p.z+.3)-heightAt(p.x,p.z-.3))/.6,n=Math.max(.01,Math.hypot(gx,gz));move(g,p.x-gx/n*8*dt,p.z-gz/n*8*dt);p.y=surfaceAt(p.x,p.z,p.y);}
        }else p.grounded=false;
      }
      p.stamina=Math.min(RULES.stamina,p.stamina+dt*6);
    }
  }
 if(i.attack)attack(g);if(i.interact)interact(g);
 for(const e of g.enemies){if(e.hp<=0)continue;e.cooldown-=dt;e.stun=Math.max(0,e.stun-dt);if(e.stun>0){e.x+=e.vx*dt;e.z+=e.vz*dt;e.vx*=Math.exp(-5*dt);e.vz*=Math.exp(-5*dt);continue;}const dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz);e.rot=Math.atan2(dx,dz);if(e.kind==='sniper'){if(d<100&&Math.abs(p.y-e.y)<20&&e.cooldown<=0){const dy=p.y+1.2-(e.y+1.6),n=Math.hypot(dx,dy,dz);g.bolts.push({x:e.x,y:e.y+1.6,z:e.z,vx:dx/n*32,vy:dy/n*32,vz:dz/n*32,life:4});e.cooldown=2.3;}continue;}if(d<38&&Math.abs(p.y-e.y)<5){if(d>2.5){e.x+=dx/d*5*dt;e.z+=dz/d*5*dt;e.y=heightAt(e.x,e.z);}else if(e.cooldown<=0){damagePlayer(g,e.kind==='boss'?22:12,e.x,e.z);e.cooldown=e.kind==='boss'?1.4:1.8;}}}
 g.bolts=g.bolts.filter(b=>{b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.life-=dt;if(Math.hypot(b.x-p.x,b.y-p.y-1,b.z-p.z)<1.2){damagePlayer(g,14,b.x-b.vx,b.z-b.vz);return false;}return b.life>0&&b.y>heightAt(b.x,b.z);});
 if(p.hp<=0||p.stamina<=0){const felled=p.hp<=0;Object.assign(p,{...SPAWN,vy:0,hp:RULES.health,stamina:RULES.stamina,grounded:true,swimming:false,climbing:false,invulnerable:2});g.deaths++;say(g,felled?'Felled in battle. The shadows claim you.':'The sea takes your strength. Returned to shore.');}
}