// New York's landmarks: hand-shaped silhouettes (Empire State, Chrysler, One WTC, Flatiron,
// Woolworth, St Patrick's, Rockefeller Center, plus generic caps) on the shared facade materials.
// Ported from the NYC City Model (js/scene/landmarks.js). Data: data/nyc/landmarks.json.
// The Empire State and Chrysler crowns take the skyline-light colour scheme (materials.js).
import * as THREE from 'three';
import { winMat, bx, reps, litMats, addDisplay } from '../materials.js';

/** a crown material that glows after dark in the skyline colour scheme */
function crownMat(color, o = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .3, metalness: .5, emissive: '#eef4ff', emissiveIntensity: 0 }, o));
  m.userData.lit = .55; litMats.push(m); addDisplay(hex => m.emissive.set(hex));
  return m;
}

function part(g, geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material); m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
}
function group(scene, f) {
  const g = new THREE.Group(); g.position.set(f.x, 0, f.z); g.rotation.y = f.ry || 0; scene.add(g); return g;
}
function facade(f, width, height) {
  return winMat(f.color || "#b8aa91", ...reps(width, height), 1, f.kind || "stone");
}
function box(g, f, w, d, y0, y1, x=0) {
  if (y1 <= y0) return;
  part(g, bx(w, y1-y0, d), facade(f, w, y1-y0), x, (y0+y1)/2, 0);
}
function taperSquare(g, f, w0, w1, d0, d1, y0, y1, material) {
  const h=y1-y0, geo=new THREE.CylinderGeometry(w1/Math.SQRT2,h? w0/Math.SQRT2:w0/2,h,4,1,false);
  // (constructor arguments: radiusTop, radiusBottom, height)
  geo.rotateY(Math.PI/4); part(g,geo,material || facade(f,Math.max(w0,w1),h),0,(y0+y1)/2,0);
}
function needle(g, f, x, z, y0, y1, radius, color="#9c9d9b") {
  const m=new THREE.MeshStandardMaterial({color,roughness:.34,metalness:.55});
  part(g,new THREE.CylinderGeometry(radius*.16,radius,y1-y0,8),m,x,(y0+y1)/2,z);
}
function tiers(g,f, profile) {
  for (const [w,d,y0,y1] of profile) box(g,f,w,d,y0,y1);
}
function flatironGeometry(w,d,h) {
  // Triangular plan tapering to a rounded-corner-like point at the Broadway end.
  const x=w/2, z=d/2, pts=[[-x,z],[x,z],[0,-z]];
  const p=new Float32Array([
    pts[0][0],0,pts[0][1], pts[1][0],0,pts[1][1], pts[2][0],0,pts[2][1],
    pts[0][0],h,pts[0][1], pts[1][0],h,pts[1][1], pts[2][0],h,pts[2][1],
  ]);
  const geo=new THREE.BufferGeometry(); geo.setAttribute("position",new THREE.Float32BufferAttribute(p,3));
  geo.setIndex([0,2,1,3,4,5,0,1,4,0,4,3,1,2,5,1,5,4,2,0,3,2,3,5]);
  geo.computeVertexNormals(); return geo;
}
function octagonTiers(g,f,centerY,topY,base) {
  const mat=crownMat("#c7c5bd",{roughness:.28,metalness:.62});
  const steps=[[base,0],[base*.82,.25],[base*.63,.48],[base*.45,.68],[base*.29,.84],[base*.16,.94]];
  for(let i=0;i<steps.length-1;i++){
    const [r0,t0]=steps[i],[r1,t1]=steps[i+1],y0=centerY+(topY-centerY)*t0,y1=centerY+(topY-centerY)*t1;
    part(g,new THREE.CylinderGeometry(r1,r0,y1-y0,8,1),mat,0,(y0+y1)/2,0);
  }
  // Light ribs catch the warm dusk without turning the crown into a solid cone.
  const ribMat=new THREE.MeshStandardMaterial({color:"#e3e0d6",roughness:.24,metalness:.68});
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4, r=base*.69, h=topY-centerY;
    const rib=part(g,new THREE.BoxGeometry(.9,h,.9),ribMat,Math.sin(a)*r,centerY+h/2,Math.cos(a)*r); rib.rotation.y=a;
  }
}

function buildFeature(scene,f) {
  if(f.id==="brooklyn_bridge") return; // bridge is drawn from OSM's bridge-tagged road geometry
  const g=group(scene,f), w=f.w||30,d=f.d||30,h=Math.max(1,f.h||20),cap=f.cap||"";
  if(f.id==="empire_state"){
    // The 443 m total includes the antenna; the crown and mast stay within that height.
    tiers(g,f,[[w,d,0,.69*h],[.82*w,.82*d,.69*h,.79*h],[.66*w,.66*d,.79*h,.85*h],[.50*w,.50*d,.85*h,.90*h],[.34*w,.34*d,.90*h,.925*h]]);
    const cream=crownMat("#d7d0c1",{roughness:.72,metalness:0});
    part(g,new THREE.ConeGeometry(.24*Math.min(w,d),.055*h,8),cream,0,.9525*h,0);
    needle(g,f,0,0,.98*h,h,Math.max(1,w*.012),"#b6b3ad"); return;
  }
  if(f.id==="chrysler"){
    // Limestone shaft with the signature silver, nested Art Deco crown and needle.
    box(g,f,w,d,0,.73*h); box(g,f,.82*w,.82*d,.73*h,.79*h);
    const crownY=.79*h, crownTop=.94*h, rad=.31*Math.min(w,d);
    octagonTiers(g,f,crownY,crownTop,rad);
    needle(g,f,0,0,crownTop,h,Math.max(1,w*.012),"#c7c5bd"); return;
  }
  if(f.id==="one_wtc"){
    // Four-sided faceted tower tapers to a small crown; antenna reaches the true 541 m top.
    taperSquare(g,f,w,.72*w,d,.72*d,0,.77*h);
    box(g,f,.72*w,.72*d,.77*h,.80*h);
    const metal=new THREE.MeshStandardMaterial({color:"#aebac4",roughness:.3,metalness:.38});
    needle(g,f,0,0,.80*h,h,Math.max(1,w*.018),"#98a8b5"); return;
  }
  if(f.id==="flatiron"){
    const mat=facade(f,w,h); part(g,flatironGeometry(w,d,h*.9),mat,0,0,0);
    box(g,f,w*.86,d*.78,.90*h,.97*h); return;
  }
  if(f.id==="woolworth"){
    tiers(g,f,[[w,d,0,.70*h],[.78*w,.78*d,.70*h,.82*h],[.62*w,.62*d,.82*h,.90*h]]);
    const pale=new THREE.MeshStandardMaterial({color:"#bdb49f",roughness:.8});
    part(g,new THREE.ConeGeometry(.28*Math.min(w,d),.09*h,4),pale,0,.945*h,0); needle(g,f,0,0,.99*h,h,1.5,"#8e8a80"); return;
  }
  if(f.id==="st_patrick"){
    box(g,f,w,d,0,.40*h);
    box(g,f,.76*w,.73*d,.40*h,.53*h);
    const towerW=Math.max(12,w*.16), towerD=Math.max(12,d*.16);
    for(const sx of [-1,1]){
      const x=sx*w*.30; box(g,f,towerW,towerD,.48*h,.88*h,x); box(g,f,towerW*.72,towerD*.72,.88*h,.92*h,x);
      const cone=new THREE.MeshStandardMaterial({color:"#d1c9b9",roughness:.72});
      part(g,new THREE.ConeGeometry(towerW*.48,.08*h,4),cone,x,.96*h,0);
    }
    return;
  }
  if(cap==="wedge") { part(g,flatironGeometry(w,d,h*.78),facade(f,w,h*.78),0,0,0); box(g,f,w*.9,d*.8,.78*h,h); return; }
  if(["museum","terminal"].includes(cap)){
    box(g,f,w,d,.0,.48*h); box(g,f,.84*w,.84*d,.48*h,.72*h); box(g,f,.69*w,.69*d,.72*h,.84*h);
    const roof=new THREE.MeshStandardMaterial({color:"#b8ad98",roughness:.84});
    part(g,new THREE.BoxGeometry(.73*w,.025*h,.73*d),roof,0,.86*h,0);
    if(cap==="terminal"){
      const col=new THREE.MeshStandardMaterial({color:"#d3c5a9",roughness:.78});
      for(let i=-3;i<=3;i++) part(g,new THREE.CylinderGeometry(Math.max(1,w*.009),Math.max(1,w*.009),.16*h,8),col,i*w*.095,.08*h,d*.36);
    }
    return;
  }
  if(cap==="arena"){
    box(g,f,w,d,0,.60*h);
    const roof=new THREE.MeshStandardMaterial({color:"#7d8488",roughness:.72,metalness:.16});
    part(g,new THREE.CylinderGeometry(Math.min(w,d)*.46,Math.min(w,d)*.49,.36*h,32,1),roof,0,.78*h,0); return;
  }
  if(f.id==="rockefeller"){
    tiers(g,f,[[w,d,0,.74*h],[.78*w,.88*d,.74*h,.86*h],[.61*w,.74*d,.86*h,.92*h]]);
    box(g,f,.42*w,.56*d,.92*h,.965*h); needle(g,f,0,0,.965*h,h,1.6,"#aab8c1"); return;
  }
  if(cap==="slab") { box(g,f,w,d,0,h); return; }
  if(cap==="gothic"){
    tiers(g,f,[[w,d,0,.70*h],[.82*w,.82*d,.70*h,.82*h],[.65*w,.65*d,.82*h,.91*h]]);
    const pale=new THREE.MeshStandardMaterial({color:f.color||"#b8aa91",roughness:.78});
    part(g,new THREE.ConeGeometry(.29*Math.min(w,d),.09*h,4),pale,0,.955*h,0); return;
  }
  box(g,f,w,d,0,h);
}

export function buildLandmarks(scene,data) {
  const features=data.features||[];
  for(const f of features) buildFeature(scene,f);
  // `data.labels` is the one source of visible feature labels. Do not also synthesize
  // one from every feature: that created duplicate text at all 14 named sites.
  const labels=(data.labels||[]).map(l=>({text:l.t||l.name,pos:new THREE.Vector3(l.x,l.y||24,l.z)}));
  return {labels,features};
}
