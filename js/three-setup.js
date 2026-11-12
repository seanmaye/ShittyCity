// three.js settings that keep the look the city was tuned with under three.js r128.
// main.js imports this first, so it runs before any module creates a colour.
import * as THREE from 'three';

// Colours are used as written (r128 had no colour management): '#ffb27a' goes to the shader
// as those numbers, not converted from sRGB to linear first. Renderers pair this with
// outputColorSpace = LinearSRGBColorSpace, so the shaded result is written to the screen as is.
THREE.ColorManagement.enabled = false;

// r128's lights were "legacy" lights: the shader multiplied every light's intensity by PI.
// three.js dropped that factor (r155), so intensities tuned for r128 are multiplied by this.
export const LIGHT = Math.PI;

// Transparent double-sided materials draw in one pass, as in r128. three.js (r150+) draws them
// twice by default, back faces then front, and flips material.side and needsUpdate on each pass,
// which sends every such object through the shader-program lookup twice a frame. The Material
// constructor assigns forceSinglePass, so this accessor covers every material, made at any time.
Object.defineProperty(THREE.Material.prototype, 'forceSinglePass', { get: () => true, set() {}, configurable: true });

/**
 * Anisotropic filtering on textures that magnify with NearestFilter (the facade windows: crisp
 * up close). r128 applied texture.anisotropy to them; three.js now skips it for nearest-magnified
 * textures, which blurs the windows on walls seen at a slant. Sets it on every such texture in
 * the scene. Call once the scene is built, before the first frame.
 */
export function restoreAnisotropy(renderer, scene) {
  if (!renderer.extensions.has('EXT_texture_filter_anisotropic')) return;
  const ext = renderer.extensions.get('EXT_texture_filter_anisotropic'), gl = renderer.getContext();
  const max = renderer.capabilities.getMaxAnisotropy(), seen = new Set();
  scene.traverse(o => {
    for (const m of [].concat(o.material || [])) for (const k in m) {
      const t = m[k];
      if (!t || !t.isTexture || seen.has(t) || t.isCubeTexture || t.isData3DTexture || t.isDataArrayTexture) continue;
      seen.add(t);
      if (t.magFilter !== THREE.NearestFilter || t.anisotropy <= 1 || !t.image) continue;
      renderer.initTexture(t);   // uploads it if need be (and unbinds it again)
      renderer.state.bindTexture(gl.TEXTURE_2D, renderer.properties.get(t).__webglTexture, gl.TEXTURE0);
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(t.anisotropy, max));
    }
  });
  renderer.state.unbindTexture();
}

/** a WebGLRenderer configured like the r128 ones the scene was tuned for */
export function makeRenderer(opts) {
  const r = new THREE.WebGLRenderer(opts);
  r.outputColorSpace = THREE.LinearSRGBColorSpace;
  return r;
}
