// Renderer, camera, controls, sky and lights.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { G } from '../data.js';
export function createCore(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#e9a888', 2200, 9000);

  const camera = new THREE.PerspectiveCamera(48, 1, 2, 30000);
  const HOME_POS = G(39.9425, -75.1935).setY(430), HOME_TGT = G(39.9560, -75.1730).setY(70);
  camera.position.copy(HOME_POS);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(HOME_TGT); controls.enableDamping = true; controls.dampingFactor = .08;
  controls.maxPolarAngle = Math.PI / 2.1; controls.minDistance = 40; controls.maxDistance = 7000;

  const hemi = new THREE.HemisphereLight('#f6c29a', '#3e4f3a', .55); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffb27a', .95); sun.castShadow = true;
  const big = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048; sun.shadow.mapSize.set(big, big);
  Object.assign(sun.shadow.camera, { left: -2900, right: 2900, top: 2900, bottom: -2900, near: 10, far: 9000 });
  sun.shadow.bias = -.0004; sun.shadow.normalBias = 1.5; scene.add(sun);
  sun.target.position.copy(G(39.9575, -75.1760)); scene.add(sun.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < 600 ? 62 : 48; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize); resize();

  return { renderer, scene, camera, controls, hemi, sun, HOME_POS, HOME_TGT };
}
