// The land itself: ground, creek, paths, and everything that grows.
import * as THREE from './vendor/three.module.js';
import { clamp, lerp, smooth, noise, seeded, distToLine, mat, ball, cone, tube, roughen, joined, placed } from './util.js';

// Where the fixed places are (metres; x east, z south). The town server owns the real list;
// this copy is only for laying out scenery.
export const SPOTS = {
  burrow: [0, 0], shed: [16, -9], creek: [-24, 8], lookout: [28, 26], board: [9, 13], letterbox: [5.7, -2.5],
  post: [-18, -22], lane: [36, -12], moss: [-12, 20], log: [14, 24], drift: [5, -22],
  fence: [-3, -46], culvert: [-22, 47], heap: [41, 7], halt: [2, 57], hollow: [30, -34],
};
export const GATE = [3, 38];
export const STUMP = [3.4, 2.6];             // where his journal lies open
export const CREEK = [[-40, -96], [-36, -60], [-33, -40], [-29, -18], [-27, 2], [-26, 10], [-22, 26], [-24, 44], [-19, 66], [-15, 98]];
export const PATHS = [
  [[0, 1.5], [4, 7], [9, 12]], [[0, 1.5], [8, -3], [15, -7.5]], [[0, 1.5], [-3, -7], [-6.5, -14]],
  [[-6.5, -14], [-12, -18], [-17, -21.5]], [[-6.5, -14], [0, -19], [5, -21]],
  [[0, 1.5], [-10, 4], [-18, 7], [-23, 8]], [[9, 12], [12, 18], [14, 22.5]], [[14, 22.5], [21, 25], [26.5, 25.5]],
  [[9, 12], [-2, 17], [-11, 19.5]], [[15, -7.5], [25, -10], [36, -12], [66, -12]], [[9, 12], [6, 25], [3, 37], [2, 48], [2, 57]],
  [[-6.5, -14], [-5, -30], [-3, -45]], [[-11, 19.5], [-16, 33], [-20.5, 45.5]], [[16, -7], [28, 0], [40, 6]], [[17, -11], [24, -22], [29.5, -31]],
];

function nearestSpot(x, z) {
  let best = Infinity;
  for (const key in SPOTS) best = Math.min(best, Math.hypot(x - SPOTS[key][0], z - SPOTS[key][1]));
  return Math.min(best, Math.hypot(x - GATE[0], z - GATE[1]));
}
export function nearestPath(x, z) {
  let best = Infinity;
  for (const p of PATHS) best = Math.min(best, distToLine(x, z, p));
  return best;
}
export const creekDistance = (x, z) => distToLine(x, z, CREEK);

// The city is flat. While someone is looking at it, the ground is level everywhere.
let level = false;
export function setLevel(on) { level = on; }

// The new maps (redo_app.js) reshape the ground east along Hut Lane and add the open ground past the
// town's edge. Once they are drawn they set the shape here, so everything stands on the ground as drawn.
let shape = null;
export function setShape(f) { shape = f; }
export function heightAt(x, z) {
  if (level) return 0;
  return shape ? shape(x, z) : landHeight(x, z);
}
export function landHeight(x, z) {
  if (level) return 0;
  const r = Math.hypot(x, z);
  const dc = creekDistance(x, z);
  const rim = smooth(58, 104, r) * smooth(2, 16, dc);            // hills all round, with a gap for the creek
  const lane = smooth(0, 9, Math.abs(z + 12)) + (x < 30 ? 1 : 0);  // Hut Lane runs out through the hills
  let y = (noise(x * 0.07 + 3, z * 0.07 + 7) - 0.5) * 0.8 * smooth(3, 10, nearestSpot(x, z)) * smooth(0.6, 3.5, nearestPath(x, z));
  y += (rim * rim * 17 + rim * (noise(x * 0.035 + 20, z * 0.035) - 0.3) * 9) * clamp(lane);
  y -= (1 - smooth(0.6, 4.2, dc)) * 0.75;
  return y;
}

const C = (hex) => new THREE.Color(hex);
const GRASS_A = C(0x3f6b3a), GRASS_B = C(0x5d8c46), FOREST = C(0x2c4a30), DIRT = C(0x8a7455), MUD = C(0x6b5d47),
  BED = C(0x47584f), MOSS = C(0x79b04c), LEAF_A = C(0xa0683a), LEAF_B = C(0xc08a3e), ROCKY = C(0x5c6a57);

function groundColor(x, z, y, out) {
  const n = noise(x * 0.21, z * 0.21), n2 = noise(x * 0.9 + 40, z * 0.9);
  const r = Math.hypot(x, z);
  out.copy(GRASS_A).lerp(GRASS_B, n * 0.8 + n2 * 0.2);
  out.lerp(FOREST, smooth(44, 66, r + (n - 0.5) * 14) * 0.85);
  out.lerp(ROCKY, smooth(7, 16, y) * 0.7);
  const dm = Math.hypot(x - SPOTS.moss[0], z - SPOTS.moss[1]);
  out.lerp(MOSS, (1 - smooth(2.5, 6.5, dm + (n2 - 0.5) * 2)) * 0.9);
  const dd = Math.hypot(x - SPOTS.drift[0], z - SPOTS.drift[1]);
  if (dd < 7) out.lerp(n2 > 0.5 ? LEAF_A : LEAF_B, (1 - smooth(2.5, 6, dd + (n - 0.5) * 2)) * 0.9);
  const dp = nearestPath(x, z) + (n2 - 0.5) * 0.7;
  out.lerp(DIRT, (1 - smooth(0.7, 1.7, dp)) * 0.9);
  const dc = creekDistance(x, z);
  out.lerp(MUD, (1 - smooth(2.0, 4.2, dc + (n2 - 0.5))) * 0.85);
  out.lerp(BED, 1 - smooth(1.0, 2.2, dc));
  return out;
}

function buildGround() {
  const size = 230, cells = 150;
  const geometry = new THREE.PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  const flat = geometry.toNonIndexed();
  const pos = flat.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    groundColor(x, z, y, c);
    const shade = 0.93 + noise(x * 1.7, z * 1.7) * 0.14;        // each facet a touch different
    for (let k = 0; k < 3; k++) colors.set([c.r * shade, c.g * shade, c.b * shade], (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function buildCreek() {
  const pts = [];
  for (let i = 0; i < CREEK.length - 1; i++) {                    // more points, so the bends are bends
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      pts.push([lerp(CREEK[i][0], CREEK[i + 1][0], t), lerp(CREEK[i][1], CREEK[i + 1][1], t)]);
    }
  }
  pts.push(CREEK[CREEK.length - 1]);
  const verts = [];
  const edge = (i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1;
    const w = 1.9 + noise(i * 0.4, 3) * 0.9;
    return [[pts[i][0] - dz / len * w, pts[i][1] + dx / len * w], [pts[i][0] + dz / len * w, pts[i][1] - dx / len * w]];
  };
  const Y = -0.36;
  for (let i = 0; i < pts.length - 1; i++) {
    const [l0, r0] = edge(i), [l1, r1] = edge(i + 1);
    verts.push(l0[0], Y, l0[1], r0[0], Y, r0[1], l1[0], Y, l1[1], r0[0], Y, r0[1], r1[0], Y, r1[1], l1[0], Y, l1[1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geometry.computeVertexNormals();
  const water = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    color: 0x4f97a8, emissive: 0x0b2a38, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  water.renderOrder = 1;
  return water;
}

// ---- things that grow ------------------------------------------------------------------------
function frondCrown() {
  // A ring of drooping fronds, as on a tree fern. Each frond is two thin triangles with a bend.
  const v = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, wide = 0.26;
    const cx = Math.cos(a), cz = Math.sin(a), px = -cz * wide, pz = cx * wide;
    const mid = [cx * 0.95, 0.28, cz * 0.95], tip = [cx * 2.0, -0.38, cz * 2.0];
    v.push(0, 0, 0, mid[0] + px, mid[1], mid[2] + pz, mid[0] - px, mid[1], mid[2] - pz);
    v.push(mid[0] + px, mid[1], mid[2] + pz, tip[0], tip[1], tip[2], mid[0] - px, mid[1], mid[2] - pz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}
function tuft() {
  const v = [];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.3, lean = 0.12 + (i % 2) * 0.1;
    const cx = Math.cos(a), cz = Math.sin(a);
    v.push(cx * 0.05 - cz * 0.045, 0, cz * 0.05 + cx * 0.045, cx * 0.05 + cz * 0.045, 0, cz * 0.05 - cx * 0.045,
      cx * lean * 1.6, 0.3 + (i % 3) * 0.09, cz * lean * 1.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

function scatter(group, colliders) {
  const rnd = seeded(0.4217);
  const kinds = { fernTrunk: [], fernCrown: [], leafTrunk: [], leafCrown: [], pineTrunk: [], pineCrown: [],
    fern: [], rock: [], tuft: [] };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const put = (list, x, y, z, sx, sy, sz, ry, color, rx = 0) => {
    e.set(rx, ry, 0); q.setFromEuler(e);
    list.push({ m: m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)), color });
  };
  const clearOf = (x, z, spot, pathGap, creekGap) => nearestSpot(x, z) > spot && nearestPath(x, z) > pathGap
    && creekDistance(x, z) > creekGap && !(Math.abs(z + 12) < 9 && x > 30);
  const green = (base, spread) => new THREE.Color(base).offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * spread);

  for (let gx = -108; gx <= 108; gx += 5.2) {
    for (let gz = -108; gz <= 108; gz += 5.2) {
      const x = gx + (rnd() - 0.5) * 4.6, z = gz + (rnd() - 0.5) * 4.6, r = Math.hypot(x, z);
      const chance = r < 44 ? 0.07 : r < 60 ? 0.42 : 0.85;
      const pick = rnd(), roll = rnd();
      if (roll > chance || !clearOf(x, z, 8, 2.6, 4.5) || r > 112) continue;
      const y = heightAt(x, z) - 0.1, turn = rnd() * 6.28;
      if (pick < 0.42) {
        const h = 2.2 + rnd() * 2.6, s = 0.9 + rnd() * 0.7;
        put(kinds.fernTrunk, x, y + h / 2, z, 1, h, 1, turn, new THREE.Color(0x4a3a2c).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
        put(kinds.fernCrown, x, y + h, z, s, s, s, turn, green(0x3f8a45, 0.1));
      } else if (pick < 0.78) {
        const h = 1.8 + rnd() * 1.8, s = 1.5 + rnd() * 1.5;
        put(kinds.leafTrunk, x, y + h / 2, z, 1.2, h, 1.2, turn, new THREE.Color(0x5a4634));
        put(kinds.leafCrown, x, y + h + s * 0.55, z, s, s * (0.75 + rnd() * 0.3), s, turn, green(0x386e3c, 0.1));
      } else {
        const s = 1.1 + rnd() * 1.2;
        put(kinds.pineTrunk, x, y + s * 1.1, z, 1, s * 2.2, 1, turn, new THREE.Color(0x4f3d30));
        put(kinds.pineCrown, x, y + s * 1.5, z, s, s, s, turn, green(0x2a5a40, 0.08));
      }
      if (r < 66) colliders.push({ x, z, r: 0.5 });
    }
  }
  for (let i = 0; i < 420; i++) {
    const a = rnd() * 6.28, r = 6 + Math.sqrt(rnd()) * 78, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!clearOf(x, z, 4.5, 1.6, 2.6)) continue;
    const s = 0.28 + rnd() * 0.4;
    put(kinds.fern, x, heightAt(x, z) + 0.12 * s, z, s, s * 1.2, s, rnd() * 6.28, green(0x4c9a4a, 0.14));
  }
  for (let i = 0; i < 90; i++) {
    const a = rnd() * 6.28, r = 5 + Math.sqrt(rnd()) * 85, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearestSpot(x, z) < 4 || nearestPath(x, z) < 1.5) continue;
    const s = 0.25 + rnd() * rnd() * 1.3;
    put(kinds.rock, x, heightAt(x, z) + s * 0.2, z, s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s, rnd() * 6.28,
      new THREE.Color(0x777f7c).offsetHSL(0, 0, (rnd() - 0.5) * 0.12), rnd() * 0.5);
  }
  for (let i = 0; i < 900; i++) {
    const a = rnd() * 6.28, r = 2.5 + Math.sqrt(rnd()) * 60, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearestPath(x, z) < 1.2 || creekDistance(x, z) < 2.2 || nearestSpot(x, z) < 2) continue;
    const s = 0.7 + rnd() * 0.9;
    put(kinds.tuft, x, heightAt(x, z), z, s, s, s, rnd() * 6.28, green(0x6a9a4c, 0.16));
  }

  const pine = joined([[cone(1.0, 1.5, 6), placed(0, 0, 0)], [cone(0.8, 1.3, 6), placed(0, 0.8, 0)], [cone(0.55, 1.1, 6), placed(0, 1.6, 0)]]);
  const shapes = {
    fernTrunk: tube(0.11, 0.17, 1, 5), fernCrown: frondCrown(), leafTrunk: tube(0.12, 0.2, 1, 5),
    leafCrown: roughen(ball(1, 1), 0.34, 0.31), pineTrunk: tube(0.1, 0.17, 1, 5), pineCrown: pine,
    fern: frondCrown(), rock: roughen(ball(1, 0), 0.3, 0.77), tuft: tuft(),
  };
  const white = new THREE.Color(0xffffff);
  for (const key in kinds) {
    const list = kinds[key];
    if (!list.length) continue;
    const twoSided = key === 'fernCrown' || key === 'fern' || key === 'tuft';
    const material = new THREE.MeshLambertMaterial({ color: white, flatShading: true, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
    const inst = new THREE.InstancedMesh(shapes[key], material, list.length);
    list.forEach((it, i) => { inst.setMatrixAt(i, it.m); inst.setColorAt(i, it.color); });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }
}

export function buildLand() {
  const group = new THREE.Group();
  const colliders = [];
  group.add(buildGround());
  const water = buildCreek();
  group.add(water);
  scatter(group, colliders);
  // A few stones in the creek where he wades.
  const rnd = seeded(0.618);
  for (let i = 0; i < 14; i++) {
    const t = rnd(), k = 2 + Math.floor(rnd() * 5);
    const x = lerp(CREEK[k][0], CREEK[k + 1][0], t) + (rnd() - 0.5) * 3.4, z = lerp(CREEK[k][1], CREEK[k + 1][1], t);
    const s = 0.18 + rnd() * 0.35;
    const stone = new THREE.Mesh(roughen(ball(s, 0), s * 0.35, rnd()), mat(0x8a918c));
    stone.position.set(x, -0.42 + s * 0.4, z);
    stone.scale.y = 0.6;
    group.add(stone);
  }
  return { group, water, colliders };
}
