// Tidewater, the city down the tram line. Built only when someone first looks at it.
// Its own origin is the tram square; the town program keeps it far to the east on the shared map.
import * as THREE from './vendor/three.module.js';
import { seeded, mat, part, box, ball, cone, tube, roughen } from './util.js';

const STONE = 0x6f747c, WOOD = 0x7a6248, WOOD_DARK = 0x4a3a2c, DARK = 0x14100e;
export const CITY_SPOTS = {
  square: [0, 0], market: [14, -6], fountain: [6, 10], chandlery: [22, 8], mender: [-12, -8], bandstand: [-6, 18],
  window: [16, 22], arcade: [28, -10], garden: [-22, 14], pier: [-4, 29], tower: [-20, -20], loft: [10, 27],
};
const SHORE = 31;                               // south of this line is water

function sign(text, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = Math.round(256 * height / width);
  const g = canvas.getContext('2d');
  g.fillStyle = '#e9e0c8'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#20180c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 40px Georgia, serif';
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map: texture }));
}

function ground() {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(240, 240, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const flat = geo.toNonIndexed(), pos = flat.attributes.position;
  const colors = new Float32Array(pos.count * 3), rnd = seeded(0.71), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const inGarden = Math.hypot(x + 22, z - 14) < 9.5;
    c.setHex(inGarden ? 0x4f7a45 : STONE).offsetHSL(0, 0, (rnd() - 0.5) * (inGarden ? 0.06 : 0.05));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  g.add(new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  const sea = part(new THREE.PlaneGeometry(260, 130), new THREE.MeshLambertMaterial({ color: 0x1f3a4a, emissive: 0x06141c, transparent: true, opacity: 0.94 }), [0, 0.12, SHORE + 65]);
  sea.rotation.x = -Math.PI / 2;
  g.add(sea);
  g.add(part(box(260, 1.2, 1.2), 0x565a60, [0, 0.2, SHORE]));                  // the quay wall
  return g;
}

export function buildCity() {
  const group = new THREE.Group();
  const lit = [];                              // materials that glow after dark
  const glow = (dim, bright) => { const m = new THREE.MeshBasicMaterial({ color: dim }); lit.push([m, dim, bright]); return m; };
  const add = (...nodes) => group.add(...nodes);
  const rnd = seeded(0.57);
  add(ground());

  // Houses: plain blocks with a few windows, kept clear of the places and the water.
  const clear = (x, z, r) => Object.values(CITY_SPOTS).every((p) => Math.hypot(x - p[0], z - p[1]) > r) && z < SHORE - 6;
  const walls = [0x8a7460, 0x77686a, 0x6a7078, 0x8f8068, 0x705f58];
  let made = 0;
  for (let i = 0; i < 400 && made < 46; i++) {
    const x = (rnd() - 0.5) * 150, z = -70 + rnd() * 96;
    const w = 6 + rnd() * 6, d = 6 + rnd() * 6, h = 4 + rnd() * 7;
    if (!clear(x, z, 10 + Math.max(w, d) / 2) || Math.abs(x) < 4) continue;      // the tram line runs north out of the square
    made++;
    const house = new THREE.Group();
    house.add(part(box(w, h, d), walls[made % 5], [0, h / 2, 0]));
    house.add(part(box(w + 0.6, 0.5, d + 0.6), 0x3e3a40, [0, h + 0.25, 0]));
    const pane = glow(0x2a2a30, rnd() < 0.7 ? 0xffd08a : 0x9ac0e0);
    for (let f = 0; f < 4; f++) {
      const along = f % 2 ? d : w, n = Math.floor(along / 2.4);
      for (let k = 0; k < n; k++) for (let y = 2.2; y < h - 1; y += 2.6) {
        if (rnd() < 0.45) continue;
        const win = part(box(0.9, 1.1, 0.08), pane, [0, 0, 0]);
        const off = -along / 2 + (k + 0.5) * (along / n);
        if (f === 0) win.position.set(off, y, d / 2 + 0.03);
        else if (f === 2) win.position.set(off, y, -d / 2 - 0.03);
        else { win.rotation.y = Math.PI / 2; win.position.set((f === 1 ? 1 : -1) * (w / 2 + 0.03), y, off); }
        house.add(win);
      }
    }
    house.position.set(x, 0, z);
    add(house);
  }

  // Street lamps.
  const lampGlow = glow(0x4a4030, 0xffd9a0);
  for (const [x, z] of [[4, -4], [-5, 6], [11, 3], [18, 14], [-14, 4], [0, 26], [24, -2], [-10, -16], [8, 28], [-16, 22]]) {
    add(part(tube(0.07, 0.1, 3.4, 6), 0x2a2a2e, [x, 1.7, z]), part(ball(0.2, 1), lampGlow, [x, 3.5, z]));
  }
  const lights = [[4, 3.4, -4], [18, 3.4, 14], [0, 3.4, 26]].map((p) => { const l = new THREE.PointLight(0xffc27a, 0, 26, 1.4); l.position.set(...p); add(l); return l; });

  // The tram square: rails north out of town, the tram, and the name of the place.
  for (const x of [-0.7, 0.7]) add(part(box(0.12, 0.08, 120), 0x3a3a3e, [x - 2.5, 0.05, -58]));
  for (let z = -4; z > -116; z -= 2.2) add(part(box(2.2, 0.06, 0.3), WOOD_DARK, [-2.5, 0.03, z]));
  const tram = new THREE.Group();
  tram.add(part(box(2.2, 0.5, 5.2), 0x6a4a3a, [0, 0.75, 0]), part(box(2.2, 1.5, 1.6), 0x3f5f6a, [0, 1.75, -1.7]));
  for (const z of [-1.6, 1.6]) for (const x of [-0.95, 0.95]) { const w = part(tube(0.38, 0.38, 0.14, 9), 0x2a2a2e, [x, 0.38, z]); w.rotation.z = Math.PI / 2; tram.add(w); }
  for (const [x, z] of [[-0.5, 0.6], [0.5, 1.4], [0, 0.2]]) tram.add(part(box(0.8, 0.7, 0.8), 0x9a7a4a, [x, 1.35, z]));
  tram.add(part(box(0.3, 0.3, 0.1), glow(0x3a3020, 0xffe0a0), [0, 1.9, -2.52]));
  tram.position.set(-2.5, 0, -5);
  add(tram);
  for (const x of [-6, 1]) add(part(tube(0.1, 0.12, 4.2, 6), WOOD_DARK, [x, 2.1, -9]));
  const name = sign('TIDEWATER', 6.4, 1.1);
  name.position.set(-2.5, 4.3, -8.92);
  add(part(box(7, 1.3, 0.12), WOOD_DARK, [-2.5, 4.3, -9]), name);

  // The night market: stalls under awnings.
  const awnings = [0xb5443a, 0x3f7f8f, 0xc49a3a, 0x6b7fb5];
  [[12, -8], [16, -8], [12, -3.5], [16.5, -3.5]].forEach(([x, z], i) => {
    add(part(box(2.6, 0.9, 1.5), WOOD, [x, 0.45, z]));
    for (const dx of [-1.2, 1.2]) for (const dz of [-0.7, 0.7]) add(part(tube(0.05, 0.05, 2.3, 5), WOOD_DARK, [x + dx, 1.15, z + dz]));
    const roof = part(box(3.1, 0.1, 2.0), awnings[i], [x, 2.35, z]);
    roof.rotation.x = 0.16;
    add(roof, part(ball(0.12, 0), glow(0x4a3a20, 0xffc878), [x, 1.9, z]));
    for (let k = 0; k < 4; k++) add(part(ball(0.13, 0), [0xc26a4a, 0xd8c8a0, 0x7dba52, 0xe0b030][(i + k) % 4], [x - 0.9 + k * 0.6, 0.98, z]));
  });

  // The fountain.
  add(part(tube(2.3, 2.5, 0.6, 12), 0x8d938f, [6, 0.3, 13.6]), part(tube(0.35, 0.5, 1.6, 8), 0x8d938f, [6, 1.2, 13.6]),
    part(tube(0.9, 0.3, 0.25, 10), 0x8d938f, [6, 2.0, 13.6]));
  const pool = part(tube(2.05, 2.05, 0.08, 12), new THREE.MeshLambertMaterial({ color: 0x4f97a8, emissive: 0x0b2a38, transparent: true, opacity: 0.85 }), [6, 0.58, 13.6]);
  add(pool);

  // The chandlery and the mending shop: small shops with something to see through the front.
  const shop = (x, z, turn, wall, show) => {
    const s = new THREE.Group();
    s.add(part(box(6, 3.4, 4.5), wall, [0, 1.7, -2.6]), part(box(6.6, 0.4, 5.1), 0x3e3a40, [0, 3.6, -2.6]));
    s.add(part(box(1.2, 2.1, 0.1), DARK, [-1.6, 1.05, -0.32]), part(box(2.4, 1.4, 0.1), glow(0x2a2620, 0xffd08a), [1.2, 1.5, -0.32]));
    show(s);
    s.position.set(x, 0, z); s.rotation.y = turn;
    add(s);
  };
  shop(22, 8, -Math.PI / 2, 0x6a5a48, (s) => {
    for (let k = 0; k < 4; k++) { const coil = part(new THREE.TorusGeometry(0.28, 0.07, 5, 9), [0x4a3a2a, 0xb0b6bc, 0xb87333, 0x4a3a2a][k], [0.4 + k * 0.5, 2.5, -0.2]); s.add(coil); }
    s.add(part(box(1.6, 0.7, 0.6), WOOD, [1.2, 0.35, 0.3]), part(tube(0.3, 0.3, 0.5, 8), 0x55606a, [-2.6, 0.25, 0.3]));
  });
  shop(-12, -8, Math.PI / 2, 0x5f6670, (s) => {
    s.add(part(box(2.0, 0.1, 0.6), 0xa58a5e, [1.2, 0.95, -0.9]), part(cone(0.22, 0.25, 7), 0x3f7f8f, [1.9, 1.5, -0.9]));
  });

  // The bandstand.
  add(part(tube(3.2, 3.4, 0.5, 8), 0x8a7a68, [-6, 0.25, 22.5]), part(cone(3.8, 1.5, 8), 0x3f6f5a, [-6, 3.95, 22.5]));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add(part(tube(0.07, 0.07, 2.8, 5), 0xe9e0c8, [-6 + Math.cos(a) * 2.9, 1.9, 22.5 + Math.sin(a) * 2.9])); }
  for (let i = 0; i < 4; i++) add(part(cone(0.3, 1.0, 6), [0x7a4a6a, 0x3f6f8f, 0x8a6a2a, 0x4f7a4a][i], [-6.9 + i * 0.6, 1.0, 22.5 + (i % 2) * 0.5]));
  add(part(ball(0.16, 0), glow(0x4a3a20, 0xffc878), [-6, 3.0, 22.5]));

  // The lit window: a wall with one big bright pane.
  add(part(box(9, 6, 0.8), 0x4a4650, [16, 3, 25.4]));
  const screen = new THREE.MeshBasicMaterial({ color: 0x8090a0 });
  add(part(box(5.4, 3.2, 0.1), screen, [16, 2.6, 24.95]));

  // The arcade: a covered passage, brighter than anywhere.
  add(part(box(7, 0.4, 16), 0x3e3a40, [28, 4.4, -10]), part(box(6.2, 0.1, 15.4), glow(0x5a5648, 0xfff2d0), [28, 4.15, -10]));
  for (const z of [-17, -12, -8, -3]) for (const x of [24.8, 31.2]) add(part(box(0.4, 4.4, 0.4), 0x8a8478, [x, 2.2, z]));
  for (const z of [-15, -10, -5]) add(part(box(0.2, 1.6, 1.8), glow(0x3a3440, [0xff8a70, 0x70d0ff, 0xffe070][(z + 15) / 5]), [31.5, 1.8, z]));

  // The garden: railings, beds, a tree.
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; if (i === 6 || i === 7) continue; add(part(tube(0.04, 0.04, 1.0, 4), 0x2a2a2e, [-22 + Math.cos(a) * 9.6, 0.5, 14 + Math.sin(a) * 9.6])); }
  for (const [x, z, s] of [[-25, 11, 1.6], [-19, 17, 1.3], [-24, 18, 1.1]]) { const bed = part(roughen(ball(s, 1), 0.2, s), 0x3a2e24, [x, 0.05, z]); bed.scale.y = 0.18; add(bed); for (let k = 0; k < 5; k++) add(part(cone(0.12, 0.4, 5), [0xd86a7a, 0xe0c040, 0xf0f0e0][k % 3], [x + Math.cos(k * 1.3) * s * 0.6, 0.35, z + Math.sin(k * 1.3) * s * 0.6])); }
  add(part(tube(0.22, 0.3, 2.6, 6), WOOD_DARK, [-21, 1.3, 12]));
  const crown = part(roughen(ball(2.4, 1), 0.5, 0.3), 0x386e3c, [-21, 3.9, 12]);
  add(crown);

  // The pier, out over the water.
  add(part(box(3.2, 0.2, 26), WOOD, [-4, 0.75, 44]));
  for (let z = 33; z <= 56; z += 4.5) for (const x of [-5.4, -2.6]) add(part(tube(0.16, 0.18, 2.2, 6), WOOD_DARK, [x, 0.1, z]));
  add(part(tube(0.08, 0.1, 1.0, 5), WOOD_DARK, [-5.3, 1.35, 56.5]), part(ball(0.14, 0), glow(0x4a3a20, 0xffc878), [-5.3, 1.95, 56.5]));

  // The clock tower and its steps.
  add(part(box(5, 16, 5), 0x6a6460, [-25, 8, -25]), part(cone(4.2, 3.2, 4), 0x3e3a40, [-25, 17.6, -25]));
  const face = part(tube(1.5, 1.5, 0.1, 14), glow(0x8a8474, 0xfff2d0), [-25, 12.5, -22.45]);
  face.rotation.x = Math.PI / 2;
  add(face);
  for (let i = 0; i < 6; i++) add(part(box(3.2, 0.35, 0.8), 0x8a8478, [-21.6, 0.18 + i * 0.35, -24.5 + i * 0.8]));

  // The net loft: a shed on stilts by the water.
  for (const x of [8.3, 11.7]) for (const z of [22.3, 25.1]) add(part(tube(0.12, 0.14, 1.4, 5), WOOD_DARK, [x, 0.7, z]));
  add(part(box(4.2, 0.15, 3.6), WOOD, [10, 1.45, 23.7]), part(box(4.2, 1.9, 0.12), 0x6b5a46, [10, 2.45, 22.0]));
  for (const x of [7.95, 12.05]) add(part(box(0.12, 1.9, 3.6), 0x6b5a46, [x, 2.45, 23.7]));
  const roof = part(box(4.8, 0.12, 4.2), 0x4a5560, [10, 3.5, 23.8]);
  roof.rotation.x = 0.14;
  add(roof);
  const nets = part(roughen(ball(1, 1), 0.3, 0.6), 0x5a6a5a, [10.3, 1.7, 23.4]);
  nets.scale.set(1.5, 0.4, 1.1);
  add(nets, part(box(1.2, 0.1, 1.6), WOOD, [10, 0.75, 26.0]));

  const update = (night, t) => {
    const on = night > 0.3;
    for (const [m, dim, bright] of lit) m.color.setHex(on ? bright : dim);
    lights.forEach((l, i) => { l.intensity = night * 14 * (0.93 + Math.sin(t * 9 + i) * 0.04); });
    screen.color.setHSL((t * 0.07) % 1, 0.25, 0.45 + Math.sin(t * 3.1) * 0.18 + (Math.sin(t * 11) > 0.8 ? 0.15 : 0));
    pool.position.y = 0.58 + Math.sin(t * 2) * 0.01;
  };
  return { group, update };
}
