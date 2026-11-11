// Time of day: the real sun position over the city (CITY.sun) for today's date, and everything that
// follows from it (sky gradient, fog, sun/moon light, ambient light, stars, lit windows).
import * as THREE from 'three';
import { CITY } from '../cities.js';

const RAD = Math.PI / 180;

/** US daylight saving: second Sunday of March to first Sunday of November. */
function isDST(d) {
  const y = d.getFullYear(), nthSunday = (m, n) => { const f = new Date(y, m, 1); return 1 + ((7 - f.getDay()) % 7) + 7 * (n - 1); };
  const start = new Date(y, 2, nthSunday(2, 2), 2), end = new Date(y, 10, nthSunday(10, 1), 2);
  return d >= start && d < end;
}

/** Sun elevation and azimuth (degrees; azimuth clockwise from north) at local clock time `h`. NOAA approximation. */
export function sunAt(h, date = new Date()) {
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const g = 2 * Math.PI / 365 * (doy - 1 + (h - 12) / 24);
  const eqt = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const tz = isDST(date) ? -4 : -5;   // US Eastern time (both cities)
  const LAT = CITY.sun.lat, LON = CITY.sun.lon;
  const tst = h * 60 + eqt + 4 * LON - 60 * tz, ha = (tst / 4 - 180) * RAD, phi = LAT * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { el: el / RAD, az: az / RAD };
}

/** Clock time of sunset (sun elevation 0) today, in hours. */
export function sunsetHour(date = new Date()) {
  let h = 12; while (h < 23.9 && sunAt(h + .05, date).el > 0) h += .05;
  return h;
}

// sky colours keyed by sun elevation (deg): [elevation, top, middle, horizon, fog]
const KEYS = [
  [-18, '#03050c', '#070c1a', '#0d1428', '#0b1222'],
  [-9, '#10163a', '#2b2f5c', '#6b5677', '#4a4565'],
  [-3, '#232a5a', '#8a6a86', '#e0937a', '#b97f78'],
  [2, '#363a66', '#e98e72', '#f6c89f', '#e9a888'],      // the original dusk look
  [10, '#4d7fb8', '#d9b79b', '#f2dcc0', '#e6cdb6'],
  [25, '#5f9fd2', '#bfe0f5', '#e6f2f7', '#d4e8f2'],      // the original day look
];
const LIGHT = [ // [elevation, hemi sky, hemi ground, hemi intensity, water]
  [-18, '#34406a', '#1a1f1a', .3, '#1c2e40'],
  [-4, '#5a5580', '#2c2c28', .38, '#3d5470'],
  [2, '#f6c29a', '#3e4f3a', .55, '#62879a'],
  [25, '#e3f2ff', '#5b7a4a', .5, '#4a7684'],      // rivers read green-grey from above
];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ca = new THREE.Color(), cb = new THREE.Color();
function lerpKeys(keys, e, idx, out) {
  const k = keys.findIndex(r => r[0] > e);
  const A = keys[k < 0 ? keys.length - 1 : Math.max(0, k - 1)], B = keys[k < 0 ? keys.length - 1 : k];
  const t = A === B ? 0 : (e - A[0]) / (B[0] - A[0]);
  if (typeof A[idx] === 'number') return A[idx] + (B[idx] - A[idx]) * t;
  return out.copy(ca.set(A[idx])).lerp(cb.set(B[idx]), t);
}

/**
 * parts: { scene, sun, hemi, body, litMats, nightOnly: [Object3D], onDark(n) }
 * Returns setTime(h) and helpers.
 */
export function createSky({ scene, sun, hemi, litMats, nightOnly, onChange }) {
  let date = new Date();   // the time-of-year slider moves it (setDate)
  // sky gradient canvas, redrawn when the time changes
  const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
  const tex = new THREE.CanvasTexture(cv); scene.background = tex;
  const ctx = cv.getContext('2d');
  // stars
  const N = 1600, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 90000, Math.abs(u) * 90000 + 2000, Math.sin(a) * r * 90000], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; stars.renderOrder = -1; scene.add(stars);

  const top = new THREE.Color(), mid = new THREE.Color(), hor = new THREE.Color(), fog = new THREE.Color(), tmp = new THREE.Color();
  const dir = new THREE.Vector3();
  let hour = 12, state = { el: 0, az: 0, night: 0 };

  function setTime(h) {
    hour = ((h % 24) + 24) % 24;
    const { el, az } = sunAt(hour, date);
    lerpKeys(KEYS, el, 1, top); lerpKeys(KEYS, el, 2, mid); lerpKeys(KEYS, el, 3, hor); lerpKeys(KEYS, el, 4, fog);
    const gr = ctx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(.6, '#' + mid.getHexString()); gr.addColorStop(1, '#' + hor.getHexString());
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 2, 256); tex.needsUpdate = true;
    scene.fog.color.copy(fog); document.body.style.background = '#' + fog.getHexString();

    // key light: the sun while it is up, then the moon (fixed high in the south-west)
    const sunUp = smooth(-2, 6, el), moon = 1 - smooth(-10, -2, el);
    if (sunUp >= moon * .25) {
      dir.set(Math.cos(el * RAD) * Math.sin(az * RAD), Math.max(.06, Math.sin(el * RAD)), -Math.cos(el * RAD) * Math.cos(az * RAD)).normalize();
      sun.color.copy(tmp.set('#ff9a5c').lerp(ca.set('#ffb27a'), smooth(-1, 5, el)).lerp(cb.set('#fff6e8'), smooth(8, 30, el)));
      sun.intensity = .95 * sunUp - .15 * smooth(15, 50, el);
    } else {
      dir.set(-.45, .7, .55).normalize();
      sun.color.set('#9fb4dd'); sun.intensity = .22 * moon;
    }
    sun.position.copy(sun.target.position).addScaledVector(dir, 4000);
    hemi.color.copy(lerpKeys(LIGHT, el, 1, tmp)); hemi.groundColor.copy(lerpKeys(LIGHT, el, 2, tmp)); hemi.intensity = lerpKeys(LIGHT, el, 3);
    starMat.opacity = .9 * (1 - smooth(-14, -5, el));

    // how dark it is: 0 in daylight, about .7 at the original dusk look, 1 at night
    const night = 1 - smooth(-4, 12, el);
    litMats.forEach(m => { m.emissiveIntensity = m.userData.lit * night; });
    nightOnly.forEach(o => { o.visible = night > .35; });
    state = { el, az, night, water: '#' + lerpKeys(LIGHT, el, 4, tmp).getHexString() };
    onChange && onChange(state);
    return hour;
  }
  /** another day of the year: the sun's path (and so day length and sunset) follow it */
  function setDate(d) { date = d; api.sunset = sunsetHour(date); api.date = date; return setTime(hour); }
  const api = { setTime, setDate, getTime: () => hour, getState: () => state, sunset: sunsetHour(date), date, stars };
  return api;
}

/** "6:30 PM" */
export function formatHour(h) {
  const m = Math.round(h * 60) % 1440, hh = Math.floor(m / 60), mm = m % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}
