// New York's East River bridges, hand-built: Brooklyn (stone towers, cables and suspenders),
// Manhattan and Williamsburg (steel towers; the Williamsburg's stiffening truss) and the
// Queensboro cantilever. Ported from the NYC City Model (js/scene/bridges.js). The OSM decks of
// these four are left out of the street data (tools/nyc/import_nyc.py), so nothing is drawn twice.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Bridge centrelines in the NYC frame (metres), anchored to the mapped approaches and shorelines.
const groups = {
  deck: [], steel: [], cable: [], stone: []
};
const mats = {
  deck: new THREE.MeshStandardMaterial({ color:'#595c5d', roughness:.86, side: THREE.DoubleSide }),
  steel: new THREE.MeshStandardMaterial({ color:'#777f83', roughness:.48, metalness:.62 }),
  cable: new THREE.MeshStandardMaterial({ color:'#b7b7ad', roughness:.42, metalness:.68 }),
  stone: new THREE.MeshStandardMaterial({ color:'#b9aa8f', roughness:.94 })
};
const specs = [
  {id:'Brooklyn Bridge',a:[-1690,3674],b:[-485,4944],towers:[[-1196,4199],[-882,4528]],height:43,towerH:84,width:25,type:'brooklyn'},
  {id:'Manhattan Bridge',a:[-904,3340],b:[-195,5040],height:45,towerH:98,width:28,type:'manhattan'},
  {id:'Williamsburg Bridge',a:[-25,3085],b:[1890,3848],height:43,towerH:94,width:31,type:'williamsburg'},
  {id:'Queensboro Bridge',a:[1865,-1675],b:[3540,-710],height:38,towerH:48,width:30,type:'queensboro'}
];
const unitY=new THREE.Vector3(0,1,0);
function makeFrame(s){const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],len=Math.hypot(dx,dz);return {a:s.a,b:s.b,dx:dx/len,dz:dz/len,nx:-dz/len,nz:dx/len,len,yaw:Math.atan2(-dz,dx)};}
function point(f,t,side,y){return [f.a[0]+(f.b[0]-f.a[0])*t+f.nx*side,y,f.a[1]+(f.b[1]-f.a[1])*t+f.nz*side];}
function deckY(s,t){const ramp=.31, u=Math.min(1,t/ramp,(1-t)/ramp);return .8+(s.height-.8)*(u*u*(3-2*u));}
function append(key,geometry,matrix){const g=geometry.clone();g.applyMatrix4(matrix);groups[key].push(g.index?g.toNonIndexed():g);}
function box(key,pos,size,yaw=0){const geo=new THREE.BoxGeometry(...size),obj=new THREE.Object3D();obj.position.set(...pos);obj.rotation.y=yaw;obj.updateMatrix();append(key,geo,obj.matrix);geo.dispose();}
function cylinder(key,a,b,r,sides=6){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),obj=new THREE.Object3D();obj.position.copy(A).add(B).multiplyScalar(.5);obj.quaternion.setFromUnitVectors(unitY,d.clone().normalize());obj.updateMatrix();const geo=new THREE.CylinderGeometry(r,r,d.length(),sides);append(key,geo,obj.matrix);geo.dispose();}
function tube(key,pts,r){const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(...p)));append(key,new THREE.TubeGeometry(curve,40,r,5,false),new THREE.Matrix4());}
function deck(s,f){const p=[],idx=[],n=40,w=s.width/2;for(let i=0;i<=n;i++){const t=i/n,y=deckY(s,t);p.push(...point(f,t,-w,y),...point(f,t,w,y));if(i<n){const k=2*i;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();groups.deck.push(g.toNonIndexed());
  for(const side of [-1,1]){for(let i=0;i<n;i++){const t=(i+.5)/n;box('steel',point(f,t,side*(w-.7),deckY(s,t)-1.4),[f.len/n,2,.8],f.yaw);}}
}
function tower(s, f, t) {
  const road = deckY(s, t), top = s.towerH;
  if (s.type === 'brooklyn') {
    const outer = s.width * .43;
    box('stone', point(f, t, 0, road / 2), [16, road, s.width + 6], f.yaw);
    for (const lateral of [-outer, 0, outer]) {
      box('stone', point(f, t, lateral, (top + road) / 2), [11, top - road, 4.6], f.yaw);
    }
    for (const side of [-1, 1]) {
      const arch = side * outer / 2;
      for (const edge of [-1, 1]) {
        cylinder('stone', point(f, t, arch + edge * outer / 2, top - 21), point(f, t, arch, top - 9), 2.3, 4);
      }
    }
    box('stone', point(f, t, 0, top - 5), [12, 9, s.width + 3], f.yaw);
    box('stone', point(f, t, 0, top), [14, 2.5, s.width + 5], f.yaw);
    return;
  }
  const side = s.width * .42;
  for (const lateral of [-side, side]) box('steel', point(f, t, lateral, top / 2), [5.2, top, 4.8], f.yaw);
  box('steel', point(f, t, 0, top - 3), [5, 5, 2 * side + 5], f.yaw);
  box('steel', point(f, t, 0, road - 2), [5, 4, 2 * side + 5], f.yaw);
  if (s.type === 'williamsburg') {
    for (const sign of [-1, 1]) cylinder('steel', point(f, t, sign * side, road + 10), point(f, t, -sign * side, top - 6), 1.15);
  } else {
    box('steel', point(f, t, 0, top - 13), [4, 2.5, 2 * side + 3], f.yaw);
  }
}
function suspension(s,f){
  let ts=s.type==='brooklyn'?[.41,.59]:s.type==='manhattan'?[.38,.62]:[.37,.615];
  if(s.towers){const dist=(x,z)=>Math.hypot(x-s.a[0],z-s.a[1])/f.len;ts=s.towers.map(p=>dist(...p));}
  for(const t of ts)tower(s,f,t);
  for(const side of [-1,1]){
    const lateral=side*s.width*.42, pts=[];
    const [west, east] = ts;
    const saddle = s.towerH - 2;
    const cableHeight = t => {
      if (t < west) return 9 + (saddle - 9) * (t / west) ** 1.3;
      if (t > east) return 9 + (saddle - 9) * ((1 - t) / (1 - east)) ** 1.3;
      const center = (2 * t - east - west) / (east - west);
      return s.height + 9 + (saddle - s.height - 9) * center ** 2;
    };
    const samples = [...Array.from({length: 33}, (_, i) => i / 32), west, east].sort((a, b) => a - b);
    for (const t of samples) pts.push(point(f, t, lateral, Math.max(deckY(s, t) + 3, cableHeight(t))));
    tube('cable',pts,.55);
    for(let i=1;i<24;i++){
      const t=i/24, road = deckY(s, t), top = cableHeight(t);
      if (top > road + 3 && ts.every(saddleAt => Math.abs(saddleAt - t) > .02))
        cylinder('cable',point(f,t,lateral,road+1),point(f,t,lateral,top),.22,5);
    }
  }
  if(s.type==='williamsburg') stiffeningTruss(s,f);
}
function stiffeningTruss(s,f){
  for(const side of [-1,1]){const lateral=side*s.width*.46,n=28;for(let i=0;i<n;i++){
    const a=.16+.68*i/n,b=.16+.68*(i+1)/n;
    const bottomA=deckY(s,a)-7,bottomB=deckY(s,b)-7,topA=deckY(s,a)+2,topB=deckY(s,b)+2;
    cylinder('steel',point(f,a,lateral,bottomA),point(f,b,lateral,bottomB),.95,5);
    cylinder('steel',point(f,a,lateral,topA),point(f,b,lateral,topB),.8,5);
    cylinder('steel',point(f,a,lateral,bottomA),point(f,b,lateral,topB),.64,5);
    cylinder('steel',point(f,b,lateral,bottomB),point(f,a,lateral,topA),.64,5);
  }}
}
function queensboro(s,f){
  const piers=[.16,.32,.56,.76,.9];
  for(const t of piers){const h=deckY(s,t)-4;box('stone',point(f,t,0,h/2),[13,h,s.width*.82],f.yaw);}
  const lower = t => deckY(s,t)-5;
  const upper = t => deckY(s,t)+6+22*Math.max(0,1-Math.min(...piers.map(p=>Math.abs(t-p)))/.12);
  for(const side of [-1,1]){const lateral=side*s.width*.46,n=34;for(let i=0;i<n;i++){
    const a=.13+.79*i/n,b=.13+.79*(i+1)/n;
    cylinder('steel',point(f,a,lateral,lower(a)),point(f,b,lateral,lower(b)),.9,5);
    cylinder('steel',point(f,a,lateral,upper(a)),point(f,b,lateral,upper(b)),.75,5);
    cylinder('steel',point(f,a,lateral,lower(a)),point(f,b,lateral,upper(b)),.68,5);
    cylinder('steel',point(f,b,lateral,lower(b)),point(f,a,lateral,upper(a)),.68,5);
  }}
}
export function buildBridges(scene){
  for(const key of Object.keys(groups))groups[key]=[];
  const spans=[];
  for(const s of specs){const f=makeFrame(s);deck(s,f);if(s.type==='queensboro')queensboro(s,f);else suspension(s,f);spans.push({id:s.id,a:[...s.a],b:[...s.b],labelHeight:Math.max(s.towerH,s.height+30)+8});}
  for(const key of Object.keys(groups))if(groups[key].length){const merged=BufferGeometryUtils.mergeGeometries(groups[key],false);const mesh=new THREE.Mesh(merged,mats[key]);mesh.name=`Curated bridge ${key}`;mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);for(const g of groups[key])g.dispose();}
  return {bridgeSpans:spans};
}
