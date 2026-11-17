// Small helpers shared by everything that draws.
import * as THREE from './vendor/three.module.js';

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// Move a towards b so that it gets `rate` of the way there every second, whatever the frame rate.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
export function dampAngle(a, b, rate, dt) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}

export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
// A repeatable random number generator, so the town looks the same every time.
export function seeded(seed) {
  let s = Math.floor(seed * 4294967296) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function grid(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(grid(ix, iz), grid(ix + 1, iz), u), lerp(grid(ix, iz + 1), grid(ix + 1, iz + 1), u), v);
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
export function distToLine(px, pz, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  }
  return best;
}

// ---- materials and shapes --------------------------------------------------------------------
const mats = new Map();
export function mat(color, extra) {
  const key = `${color}|${extra ? JSON.stringify(extra) : ''}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
}
export function part(geometry, color, pos, extra) {
  const m = new THREE.Mesh(geometry, typeof color === 'object' && color.isMaterial ? color : mat(color, extra));
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const ball = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
export const cone = (r, h, sides = 6, ...more) => new THREE.ConeGeometry(r, h, sides, ...more);
export const tube = (r1, r2, h, sides = 6, ...more) => new THREE.CylinderGeometry(r1, r2, h, sides, ...more);

// Join several shapes into one, each moved into place first. One shape is one thing to draw.
export function joined(pieces) {
  const all = [];
  for (const [geometry, matrix] of pieces) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    all.push(g.attributes.position.array);
  }
  const out = new Float32Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) { out.set(a, at); at += a.length; }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(out, 3));
  merged.computeVertexNormals();
  return merged;
}
export function placed(x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// Push every corner of a shape about a little, so rocks and mounds do not look machined.
export function roughen(geometry, amount, seed = 0.5) {
  const pos = geometry.attributes.position;
  const moved = new Map();
  const rnd = seeded(seed);
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) moved.set(key, [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount]);
    const d = moved.get(key);
    pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// ---- the sun, worked out the same way the town works it out -----------------------------------
const LAT = 52.37, LON = 4.90;
// The town's own short day: a whole day and night in `dayMinutes` of real time, light from 6 to 18.
// The same sums as the town program, so the app, the website and his mind agree.
export function townHour(dayMinutes, when = new Date()) {
  const length = dayMinutes * 60;
  return ((when.getTime() / 1000) % length) / length * 24;
}
// shiftS: when his town follows the laptop's clock, the town sends how far to move the Dutch sun
// (sky.shift_s), so the sun here stands where it does in his mind.
export function sunNow(when = new Date(), dayMinutes = 0, shiftS = 0) {
  if (shiftS) when = new Date(when.getTime() + shiftS * 1000);
  if (dayMinutes > 0) {
    const hour = townHour(dayMinutes, when);
    const angle = 2 * Math.PI * (hour - 6) / 24;          // rises in the east at 6, south at noon, sets west at 18
    return { elevation: 50 * Math.sin(angle), azimuth: Math.PI / 2 + angle, hourAngle: angle - Math.PI / 2 };
  }
  const start = Date.UTC(when.getUTCFullYear(), 0, 0);
  const day = Math.floor((when.getTime() - start) / 86400000);
  const hours = when.getUTCHours() + when.getUTCMinutes() / 60 + when.getUTCSeconds() / 3600;
  const decl = (-23.44 * Math.cos((2 * Math.PI / 365) * (day + 10))) * Math.PI / 180;
  const lat = LAT * Math.PI / 180;
  const ha = (15 * (hours + LON / 15 - 12)) * Math.PI / 180;
  const elev = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha));
  // Compass direction of the sun, measured from north, turning east.
  const az = Math.atan2(-Math.sin(ha), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
  return { elevation: elev * 180 / Math.PI, azimuth: az, hourAngle: ha };
}
// offsetMin: the clock his town follows, as minutes from UTC (sky.offset_min), so a visitor
// anywhere sees his time, not their own.
export function clockInTown(when = new Date(), dayMinutes = 0, offsetMin = null) {
  if (dayMinutes > 0) {
    const hour = townHour(dayMinutes, when);
    return `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}`;
  }
  if (offsetMin !== null && offsetMin !== undefined) {
    const d = new Date(when.getTime() + offsetMin * 60000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(when);
  } catch { return ''; }
}

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
