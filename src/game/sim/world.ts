export const WORLD_R = 5200;
export const WATER_Y = -25;
export const ISLAND: [number, number] = [Math.cos(2.2) * 4200, Math.sin(2.2) * 4200];
export const ISLAND_RADIUS = 480;
export const TOWNS: [number, number, number][] = [[0,0,1],[900,-700,.35],[-1100,500,.3],[600,1300,.3],[-700,-1400,.25]];
export const TOWN_NAMES = ['Capital','Eastmere','Westbrook','Southvale','Northhold'];
export const CAMP = { x: ISLAND[0], z: ISLAND[1]-100, y: 92 };
export const TOWER = { x: CAMP.x+25, z: CAMP.z-12, y: CAMP.y+14 };
export const CHEST = { x: CAMP.x, z: CAMP.z-26, y: CAMP.y };
export function hash(x:number,z:number) { const s=Math.sin(x*127.1+z*311.7)*43758.5453; return s-Math.floor(s); }
function noise(x:number,z:number) { const a=Math.floor(x),b=Math.floor(z),u=(x-a)**2*(3-2*(x-a)),v=(z-b)**2*(3-2*(z-b));return hash(a,b)*(1-u)*(1-v)+hash(a+1,b)*u*(1-v)+hash(a,b+1)*(1-u)*v+hash(a+1,b+1)*u*v; }
export function heightAt(x:number,z:number) {
 const dx=x-ISLAND[0],dz=z-ISLAND[1],di=Math.hypot(dx,dz);
 if(di<ISLAND_RADIUS+50) {
  const coast=1-Math.min(1,di/ISLAND_RADIUS);
  const base=-40+Math.min(1,coast*3)*65;
  const hill=70*Math.exp(-(dx*dx/24000+(dz+100)**2/36000));
  const rolling=14*Math.sin(dx/65)*Math.sin(dz/80)*Math.min(1,coast*4);
  const h=base+hill+rolling;
  const d=Math.hypot(dx,dz+100);
  const flat=Math.max(0,Math.min(1,(65-d)/20));
  return h*(1-flat)+CAMP.y*flat;
 }
 const r=Math.hypot(x,z); let h=noise(x/400,z/400)*60+noise(x/150,z/150)*15-20;
 for(const [tx,tz,s] of TOWNS){const d=Math.hypot(x-tx,z-tz)/(500*s+150);if(d<1)h*=d*d;}
 if(r>2100){const t=(r-2100)/600,ang=Math.atan2(z,x),gap=Math.cos(ang-2.2)>.9;if(gap)h=h*(1-Math.min(t,1))-Math.min(t,1.5)*60;else h+=Math.sin(Math.min(t,1)*Math.PI)*(350+noise(ang*8,1)*350);}
 if(r>2700)h-=(r-2700)*.5;return h;
}
export const SPAWN = {x:ISLAND[0],z:ISLAND[1]+220,y:heightAt(ISLAND[0],ISLAND[1]+220)};
export const TREES=Array.from({length:45},(_,i)=>{const a=hash(i,2)*Math.PI*2,r=100+hash(i,4)*230;const x=ISLAND[0]+Math.cos(a)*r,z=ISLAND[1]+Math.sin(a)*r;return {x,z,y:heightAt(x,z),h:8+hash(i,9)*5};}).filter(t=>Math.hypot(t.x-CAMP.x,t.z-CAMP.z)>68 && Math.abs(t.x-ISLAND[0])>10);
export type Obstacle={x:number;z:number;hx:number;hz:number;y:number;h:number;door?:boolean};
export const WALLS:Obstacle[]=[{x:CAMP.x-40,z:CAMP.z,hx:1,hz:40,y:CAMP.y,h:7},{x:CAMP.x+40,z:CAMP.z,hx:1,hz:40,y:CAMP.y,h:7},{x:CAMP.x,z:CAMP.z-40,hx:40,hz:1,y:CAMP.y,h:7},...[-24,24].map(o=>({x:CAMP.x+o,z:CAMP.z+40,hx:16,hz:1,y:CAMP.y,h:7})),{x:CAMP.x-8,z:CAMP.z-26,hx:1,hz:10,y:CAMP.y,h:6},{x:CAMP.x+8,z:CAMP.z-26,hx:1,hz:10,y:CAMP.y,h:6},{x:CAMP.x,z:CAMP.z-16,hx:8,hz:.7,y:CAMP.y,h:6,door:true}];
export const OBSTACLES:Obstacle[]=[...WALLS,...TREES.map(t=>({x:t.x,z:t.z,hx:.65,hz:.65,y:t.y,h:t.h})),...[-1,1].flatMap(a=>[-1,1].map(b=>({x:TOWER.x+a*4,z:TOWER.z+b*4,hx:.45,hz:.45,y:CAMP.y,h:14})))];
export function surfaceAt(x:number,z:number,y:number){if(Math.abs(x-TOWER.x)<4.8&&Math.abs(z-TOWER.z)<4.8&&y>=TOWER.y-.4)return TOWER.y;return heightAt(x,z);}