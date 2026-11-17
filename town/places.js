// The places in town and the things that lie about in it.
import * as THREE from './vendor/three.module.js';
import { hash, seeded, mat, part, box, ball, cone, tube, roughen } from './util.js';
import { SPOTS, GATE, STUMP, heightAt } from './land.js';

const WOOD = 0x7a6248, WOOD_DARK = 0x5a4634, CREAM = 0xe9e0c8, DARK = 0x14100e;
const ROOFS = [0xa8503c, 0x3f7f8f, 0xc49a3a, 0x6b7fb5, 0x8a5a9a, 0x4f8f5a, 0xc26a4a, 0x7a8a3a];

function textPlane(text, width, height, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = Math.max(32, Math.round(256 * height / width));
  const g = canvas.getContext('2d');
  g.fillStyle = opts.back || '#d9c9a0';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = opts.ink || '#2a2018';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = opts.size || 44;
  g.font = `600 ${size}px Georgia, serif`;
  while (g.measureText(text).width > canvas.width - 24 && size > 14) { size -= 2; g.font = `600 ${size}px Georgia, serif`; }
  g.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map: texture }));
}

function at(group, x, z, lift = 0) {
  group.position.set(x, heightAt(x, z) + lift, z);
  return group;
}

function mushroom(x, z, s, cap = 0xb5523a) {
  const g = new THREE.Group();
  g.add(part(tube(0.03 * s, 0.04 * s, 0.14 * s, 5), 0xe8dfc8, [0, 0.07 * s, 0]));
  g.add(part(cone(0.1 * s, 0.09 * s, 6), cap, [0, 0.18 * s, 0]));
  g.position.set(x, 0, z);
  return g;
}

// ---- small things: what he finds, keeps, and is left ------------------------------------------
export function itemMesh(name) {
  const n = name.toLowerCase();
  const g = new THREE.Group();
  const add = (geometry, color, pos, rot) => { const p = part(geometry, color, pos); if (rot) p.rotation.set(...rot); g.add(p); return p; };
  if (n.includes('letter')) { add(box(0.22, 0.02, 0.15), CREAM, [0, 0.01, 0]); add(box(0.06, 0.022, 0.04), 0xb5443a, [0, 0.012, 0]); }
  else if (n.includes('button')) add(tube(0.08, 0.08, 0.025, 8), 0xc9a24a, [0, 0.015, 0]);
  else if (n.includes('bottle cap')) add(tube(0.08, 0.09, 0.035, 9), 0x3f6fc0, [0, 0.02, 0]);
  else if (n.includes('snail')) add(roughen(ball(0.09, 1), 0.02), 0xc8b08a, [0, 0.08, 0]);
  else if (n.includes('shell') && n.includes('walnut')) add(new THREE.SphereGeometry(0.09, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0x7a5632, [0, 0, 0], [Math.PI, 0, 0]).position.y = 0.09;
  else if (n.includes('shell')) add(cone(0.08, 0.18, 6), 0xf0c8c0, [0, 0.05, 0], [1.3, 0, 0]);
  else if (n.includes('marble')) add(ball(0.06, 1), 0x58b07a, [0, 0.06, 0]);
  else if (n.includes('bead')) add(ball(0.045, 1), 0xbfe6f0, [0, 0.045, 0]);
  else if (n.includes('peg')) add(box(0.04, 0.03, 0.18), 0xc9a878, [0, 0.015, 0]);
  else if (n.includes('stone') || n.includes('pebble')) { add(roughen(ball(0.08, 0), 0.02), n.includes('black') ? 0x2a2a2e : 0x8f9692, [0, 0.04, 0]).scale.y = 0.55; if (n.includes('striped')) add(tube(0.082, 0.082, 0.012, 7), 0xf0f0ea, [0, 0.04, 0]); }
  else if (n.includes('key')) { add(box(0.02, 0.015, 0.14), 0x8a5a3a, [0, 0.01, 0.03]); add(new THREE.TorusGeometry(0.035, 0.012, 4, 7), 0x8a5a3a, [0, 0.01, -0.07], [Math.PI / 2, 0, 0]); }
  else if (n.includes('feather')) add(cone(0.04, 0.26, 3), 0x9aa0a8, [0, 0.01, 0], [Math.PI / 2, 0, 0]).scale.x = 0.25;
  else if (n.includes('spoon')) { add(box(0.015, 0.012, 0.15), 0xc0c4c8, [0, 0.01, 0]); add(ball(0.035, 0), 0xc0c4c8, [0, 0.012, 0.1]).scale.y = 0.4; }
  else if (n.includes('domino')) add(box(0.07, 0.02, 0.14), 0xf2efe6, [0, 0.01, 0]);
  else if (n.includes('china')) add(cone(0.08, 0.02, 3), 0xdfe8f6, [0, 0.01, 0]);
  else if (n.includes('acorn')) { add(ball(0.05, 1), 0xa87a3a, [0, 0.05, 0]).scale.y = 1.25; add(cone(0.055, 0.045, 6), 0x5a4632, [0, 0.105, 0]); }
  else if (n.includes('ribbon')) add(box(0.04, 0.008, 0.26), 0xc0392f, [0, 0.01, 0], [0, 0.5, 0]);
  else if (n.includes('coin')) add(tube(0.06, 0.06, 0.012, 9), 0xb87333, [0, 0.008, 0]);
  else if (n.includes('thimble')) add(tube(0.04, 0.05, 0.08, 7), 0xaab0b6, [0, 0.04, 0]);
  else if (n.includes('pine cone')) add(roughen(cone(0.06, 0.15, 7), 0.02), 0x6a4a30, [0, 0.075, 0]);
  else if (n.includes('pencil')) { add(tube(0.012, 0.012, 0.16, 5), 0xe0b030, [0, 0.012, 0], [Math.PI / 2, 0, 0]); add(cone(0.012, 0.03, 5), 0x3a3028, [0, 0.012, 0.095], [Math.PI / 2, 0, 0]); }
  else if (n.includes('bell')) { add(cone(0.05, 0.08, 7), 0xd4b040, [0, 0.05, 0]); add(ball(0.015, 0), 0xd4b040, [0, 0.095, 0]); }
  else if (n.includes('twine')) add(new THREE.TorusGeometry(0.07, 0.022, 5, 9), 0x4a3a2a, [0, 0.025, 0], [Math.PI / 2, 0, 0]);
  else if (n.includes('wire')) add(new THREE.TorusGeometry(0.08, 0.008, 4, 10), 0xb0b6bc, [0, 0.02, 0], [Math.PI / 2, 0, 0]);
  else if (n.includes('tin')) add(box(0.16, 0.012, 0.16), 0xc8ccd0, [0, 0.01, 0], [0.12, 0.4, 0]);
  else if (n.includes('cork')) add(tube(0.035, 0.04, 0.08, 7), 0xc9a36a, [0, 0.04, 0]);
  else if (n.includes('bark')) add(tube(0.05, 0.05, 0.2, 6, 1, true, 0, 4), mat(0x6a4a30, { side: THREE.DoubleSide }), [0, 0.05, 0], [Math.PI / 2, 0, 0]);
  else if (n.includes('jar lid')) add(tube(0.075, 0.075, 0.02, 10), 0x3f6fc0, [0, 0.012, 0]);
  else if (n.includes('wooden bead')) add(ball(0.05, 1), 0xc9a878, [0, 0.05, 0]);
  else if (n.includes('sailcloth')) add(box(0.2, 0.01, 0.15), 0x9aa0a0, [0, 0.01, 0], [0.1, 0.3, 0.05]);
  else add(box(0.1, 0.06, 0.1), 0x9a8a7a, [0, 0.03, 0]);
  g.scale.setScalar(1.9);                    // a little larger than life, or nobody would see them
  return g;
}

// ---- the fixed places -------------------------------------------------------------------------
function burrow(h) {
  const g = at(new THREE.Group(), 0, 0);
  const mound = part(roughen(ball(1, 2), 0.16, 0.2), 0x4c6b3c, [0, 0.25, -3.0]);
  mound.scale.set(3.0, 1.75, 2.9);
  g.add(mound);
  const mouth = part(new THREE.CircleGeometry(0.78, 9), new THREE.MeshBasicMaterial({ color: DARK }), [0, 0.52, -0.2]);
  mouth.rotation.x = -0.3; mouth.scale.y = 0.9;
  g.add(mouth);
  for (const side of [-1, 1]) {                       // the fern root he lives under
    const root = part(new THREE.TorusGeometry(0.95, 0.13, 5, 7, Math.PI * 0.62), WOOD_DARK, [side * 0.12, 0.08, -0.1]);
    root.rotation.set(-0.35, 0, side > 0 ? 0.05 : Math.PI * 0.38);
    g.add(root);
  }
  const trunk = part(tube(0.2, 0.3, 2.3, 6), 0x4a3a2c, [0.9, 2.5, -3.3]);
  trunk.rotation.z = -0.12;
  g.add(trunk);
  h.fronds = [];
  const frond = (x, y, z, s, turn) => {
    const v = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), px = -cz * 0.26, pz = cx * 0.26;
      v.push(0, 0, 0, cx * 0.95 + px, 0.28, cz * 0.95 + pz, cx * 0.95 - px, 0.28, cz * 0.95 - pz,
        cx * 0.95 + px, 0.28, cz * 0.95 + pz, cx * 2.0, -0.4, cz * 2.0, cx * 0.95 - px, 0.28, cz * 0.95 - pz);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
    geometry.computeVertexNormals();
    const m = part(geometry, mat(0x3f8f48, { side: THREE.DoubleSide }), [x, y, z]);
    m.scale.setScalar(s); m.rotation.y = turn;
    g.add(m); h.fronds.push(m);
  };
  frond(1.05, 3.7, -3.3, 1.5, 0.3);
  frond(-1.6, 1.5, -1.6, 0.55, 1.1);
  frond(2.2, 0.5, -0.9, 0.5, 2.0);
  // The shelf: a flat stone by the door where the things he has kept are set out.
  const shelf = part(roughen(ball(1, 1), 0.2, 0.9), 0x8d938f, [-2.5, 0.12, 0.2]);
  shelf.scale.set(1.25, 0.2, 0.75);
  g.add(shelf);
  h.shelf = new THREE.Group();
  h.shelf.position.set(-2.5, 0.31, 0.2);
  g.add(h.shelf);
  return g;
}

function stump(h) {
  const g = at(new THREE.Group(), STUMP[0], STUMP[1]);
  g.add(part(tube(0.42, 0.5, 0.5, 8), WOOD_DARK, [0, 0.25, 0]));
  g.add(part(tube(0.4, 0.4, 0.02, 8), 0xb99a6a, [0, 0.505, 0]));
  const book = new THREE.Group();
  book.add(part(box(0.5, 0.03, 0.36), 0x6a3a2a, [0, 0, 0]));
  for (const side of [-1, 1]) {
    const page = part(box(0.23, 0.035, 0.32), 0xf3ecd8, [side * 0.12, 0.03, 0]);
    page.rotation.z = side * -0.12;
    book.add(page);
  }
  book.position.set(0, 0.54, 0); book.rotation.y = 0.5;
  g.add(book);
  h.book = book;
  return g;
}

function shed(h) {
  const g = at(new THREE.Group(), 16, -11.4);
  g.add(part(box(4.2, 0.12, 3.4), WOOD, [0, 0.06, 0]));
  g.add(part(box(4.2, 2.3, 0.12), 0x8a7050, [0, 1.2, -1.64]));
  for (const side of [-1, 1]) g.add(part(box(0.12, 2.3, 3.4), 0x80684a, [side * 2.04, 1.2, 0]));
  const roof = part(box(4.9, 0.12, 4.2), 0x9a4a3a, [0, 2.55, 0.1]);
  roof.rotation.x = 0.16;
  g.add(roof);
  for (const side of [-1, 1]) g.add(part(box(0.12, 2.2, 0.12), WOOD_DARK, [side * 2.04, 1.1, 1.64]));
  // The workbench, against the back wall.
  g.add(part(box(2.6, 0.1, 0.8), 0xa58a5e, [0, 0.72, -1.15]));
  for (const x of [-1.2, 1.2]) g.add(part(box(0.1, 0.7, 0.7), WOOD_DARK, [x, 0.36, -1.15]));
  g.add(part(box(0.5, 0.06, 0.36), 0xf3ecd8, [-0.6, 0.8, -1.15]));
  g.add(part(box(0.4, 0.04, 0.3), 0xe6dcc0, [-0.56, 0.85, -1.12]));
  g.add(part(tube(0.05, 0.05, 0.3, 6), 0x3a3a40, [0.9, 0.92, -1.3]));
  g.add(part(cone(0.2, 0.22, 7), 0x3f7f8f, [0.9, 1.15, -1.3]));
  h.shedLampGlow = new THREE.MeshBasicMaterial({ color: 0x33271a });
  g.add(part(ball(0.07, 1), h.shedLampGlow, [0.9, 1.05, -1.3]));
  h.shedLight = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
  h.shedLight.position.set(0.9, 1.3, -1.0);
  g.add(h.shedLight);
  g.add(part(tube(0.22, 0.26, 0.4, 7), 0x6b5038, [-1.3, 0.3, 0.6]));         // a stool
  g.add(part(box(0.7, 0.6, 0.6), 0x7c6a4c, [2.9, 0.3, 1.2]));                // a crate outside
  g.add(part(tube(0.34, 0.3, 0.8, 8), 0x5f4a36, [-2.8, 0.4, 1.0]));          // and a barrel
  h.shedInside = [16, -12.0];                 // where he stands when he is at the bench
  return g;
}

function board(h) {
  const g = at(new THREE.Group(), 10.4, 13.2);
  g.rotation.y = -Math.PI / 2;                 // the face looks west, towards where he stands
  for (const x of [-0.8, 0.8]) g.add(part(tube(0.07, 0.09, 2.1, 6), WOOD_DARK, [x, 1.05, 0]));
  g.add(part(box(1.9, 1.15, 0.08), 0x9a7c52, [0, 1.35, 0]));
  const lid = part(box(2.2, 0.08, 0.5), 0x6b4a3a, [0, 2.05, 0.1]);
  lid.rotation.x = 0.25;
  g.add(lid);
  h.paper = part(box(0.62, 0.5, 0.02), 0xf5eeda, [-0.2, 1.42, 0.06]);
  h.paper.rotation.z = 0.05;
  g.add(h.paper);
  g.add(part(ball(0.03, 0), 0xb5443a, [-0.2, 1.63, 0.08]));
  return g;
}

function letterbox(h) {
  const g = at(new THREE.Group(), -8.1, -15.3);
  g.rotation.y = Math.PI / 3;
  g.add(part(tube(0.06, 0.08, 1.15, 6), WOOD_DARK, [0, 0.58, 0]));
  g.add(part(box(0.42, 0.34, 0.62), 0xb5443a, [0, 1.3, 0]));
  const top = part(tube(0.21, 0.21, 0.62, 8, 1, false, 0, Math.PI), 0xa03a32, [0, 1.47, 0]);
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  g.add(top);
  g.add(part(box(0.3, 0.03, 0.02), DARK, [0, 1.36, 0.32]));
  h.flag = new THREE.Group();                  // up when a letter is waiting
  h.flag.add(part(box(0.03, 0.34, 0.03), 0xe8e0d0, [0, 0.17, 0]));
  h.flag.add(part(box(0.03, 0.14, 0.2), 0xf0c040, [0, 0.3, 0.1]));
  h.flag.position.set(0.23, 1.22, -0.1);
  g.add(h.flag);
  return g;
}

function signalPost(h) {
  const g = at(new THREE.Group(), -19.0, -22.8);
  g.add(part(tube(0.09, 0.14, 6.4, 6), WOOD_DARK, [0, 3.2, 0]));
  g.add(part(box(1.8, 0.1, 0.1), WOOD_DARK, [0, 5.6, 0]));
  for (const x of [-0.75, 0, 0.75]) g.add(part(tube(0.05, 0.07, 0.16, 6), 0xcfe0e0, [x, 5.74, 0]));
  h.postGlow = new THREE.MeshBasicMaterial({ color: 0x2a3a3a });
  g.add(part(ball(0.1, 1), h.postGlow, [0, 6.5, 0]));
  const ear = part(cone(0.22, 0.34, 7, 1, true), mat(0xb98a3a, { side: THREE.DoubleSide }), [0.26, 0.95, 0.22]);
  ear.rotation.set(1.9, 0, -0.6);               // the horn he puts his head to
  g.add(ear);
  g.add(part(tube(0.015, 0.015, 4.7, 4), 0x3a3a3a, [0.1, 3.3, 0.1]));
  const wires = [];
  for (const x of [-0.75, 0.75]) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = [x + (-60) * t, 5.8 + 12 * t - Math.sin(t * Math.PI) * 4, -70 * t];
      if (i > 0 && i < 10) wires.push(...p);
      wires.push(...p);
    }
  }
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wires), 3));
  g.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x1c2224 })));
  return g;
}

function lookout() {
  const g = at(new THREE.Group(), 30.6, 28.2);
  const rock = part(roughen(ball(1, 1), 0.3, 0.13), 0x7f8783, [0, 1.3, 0]);
  rock.scale.set(3.3, 2.5, 3.0);
  g.add(rock);
  const rnd = seeded(0.21);
  for (let i = 0; i < 6; i++) {
    const s = 0.4 + rnd() * 0.8, a = rnd() * 6.28;
    const r = part(roughen(ball(s, 0), s * 0.3, rnd()), 0x868d89, [Math.cos(a) * 3.6, s * 0.35, Math.sin(a) * 3.4]);
    r.scale.y = 0.6;
    g.add(r);
  }
  return g;
}

function mossyBank() {
  const g = at(new THREE.Group(), -13.4, 21.4);
  const bank = part(roughen(ball(1, 2), 0.18, 0.61), 0x7dba52, [0, 0.05, 0]);
  bank.scale.set(3.4, 0.75, 2.5);
  g.add(bank);
  const rnd = seeded(0.37);
  for (let i = 0; i < 7; i++) {
    const one = mushroom((rnd() - 0.5) * 5.5, (rnd() - 0.5) * 4, 1 + rnd(), i % 2 ? 0xd8c8a0 : 0xb5523a);
    one.position.y = 0.42 - rnd() * 0.25;
    g.add(one);
  }
  return g;
}

function fallenLog() {
  const g = at(new THREE.Group(), 15.4, 25.8);
  g.rotation.y = 0.5;
  const trunk = part(tube(0.78, 0.9, 5.4, 8, 1, true), mat(0x5d4532, { side: THREE.DoubleSide }), [0, 0.72, 0]);
  trunk.rotation.z = Math.PI / 2;
  g.add(trunk);
  for (const end of [-1, 1]) {
    const ring = part(new THREE.RingGeometry(0.5, end > 0 ? 0.9 : 0.78, 8), mat(0xb39468, { side: THREE.DoubleSide }), [end * 2.7, 0.72, 0]);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    const dark = part(new THREE.CircleGeometry(0.5, 8), new THREE.MeshBasicMaterial({ color: DARK, side: THREE.DoubleSide }), [end * 2.55, 0.72, 0]);
    dark.rotation.y = Math.PI / 2;
    g.add(dark);
  }
  for (const [x, s] of [[-1.4, 0.7], [0.3, 0.9], [1.6, 0.5]]) {
    const moss = part(roughen(ball(s, 1), 0.1, s), 0x6fae4c, [x, 1.38, 0.1]);
    moss.scale.set(1, 0.3, 0.8);
    g.add(moss);
  }
  const stub = part(tube(0.12, 0.2, 0.9, 6), 0x5d4532, [0.9, 1.5, -0.3]);
  stub.rotation.x = -0.5;
  g.add(stub);
  g.add(mushroom(-0.6, 1.0, 1.6, 0xd8c8a0), mushroom(2.0, 1.1, 1.3), mushroom(-2.2, -1.0, 1.4));
  return g;
}

function leafDrift() {
  const g = at(new THREE.Group(), 5.6, -23.2);
  const rnd = seeded(0.52);
  const leafy = [0xa0683a, 0xc08a3e, 0x8a5a30, 0xb5722f];
  for (let i = 0; i < 6; i++) {
    const s = 0.7 + rnd() * 1.1;
    const heap = part(roughen(ball(s, 1), s * 0.22, rnd()), leafy[i % 4], [(rnd() - 0.5) * 4.4, s * 0.12, (rnd() - 0.5) * 3.4]);
    heap.scale.y = 0.38;
    g.add(heap);
  }
  const leaf = new THREE.InstancedMesh(cone(0.11, 0.02, 3), new THREE.MeshLambertMaterial({ flatShading: true }), 70);
  const m = new THREE.Matrix4(), color = new THREE.Color();
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 6.5;
    m.makeRotationY(rnd() * 6.28).setPosition(Math.cos(a) * r, 0.05 + rnd() * 0.04, Math.sin(a) * r);
    leaf.setMatrixAt(i, m);
    leaf.setColorAt(i, color.setHex(leafy[i % 4]));
  }
  g.add(leaf);
  return g;
}

function laneSign() {
  const g = at(new THREE.Group(), 34.2, -9.6);
  g.add(part(tube(0.07, 0.09, 2.2, 6), WOOD_DARK, [0, 1.1, 0]));
  const sign = textPlane('Hut Lane', 1.5, 0.42);
  sign.position.set(0.55, 1.85, 0.06);
  const back = part(box(1.56, 0.48, 0.05), 0x7a6248, [0.55, 1.85, 0.02]);
  g.add(back, sign);
  g.rotation.y = -0.5;
  return g;
}

function gate(h) {
  const g = at(new THREE.Group(), GATE[0], GATE[1] + 1.8);
  for (const x of [-1.5, 1.5]) g.add(part(tube(0.11, 0.14, 2.7, 6), WOOD_DARK, [x, 1.35, 0]));
  g.add(part(box(3.5, 0.16, 0.2), WOOD_DARK, [0, 2.72, 0]));
  for (let i = 1; i <= 5; i++) {                         // a low fence either side
    for (const side of [-1, 1]) {
      const x = side * (1.5 + i * 1.5);
      g.add(part(tube(0.06, 0.07, 1.0, 5), WOOD, [x, 0.5 + heightAt(GATE[0] + x, GATE[1] + 1.8) - heightAt(GATE[0], GATE[1] + 1.8), 0]));
    }
  }
  for (const side of [-1, 1]) for (const y of [0.45, 0.8]) g.add(part(box(7.4, 0.06, 0.06), WOOD, [side * 5.2, y, 0]));
  g.add(part(tube(0.01, 0.01, 0.5, 4), 0x2a2a2a, [0, 2.4, 0]));
  h.gateGlow = new THREE.MeshBasicMaterial({ color: 0x4a3a20 });
  g.add(part(box(0.2, 0.26, 0.2), h.gateGlow, [0, 2.05, 0]));
  g.add(part(cone(0.2, 0.12, 4), 0x2a2a2a, [0, 2.24, 0]));
  h.gateLight = new THREE.PointLight(0xffc27a, 0, 12, 1.6);
  h.gateLight.position.set(0, 2.0, 0.2);
  g.add(h.gateLight);
  return g;
}

function brokenFence() {
  const g = at(new THREE.Group(), -3, -48.2);
  const rnd = seeded(0.83);
  for (let i = -6; i <= 6; i++) {
    if (i === 0 || i === 1) continue;                    // the gap he goes out through
    const post = part(tube(0.07, 0.09, 1.2, 5), WOOD_DARK, [i * 1.7, 0.55 + heightAt(-3 + i * 1.7, -48.2) - heightAt(-3, -48.2), 0]);
    post.rotation.z = (rnd() - 0.5) * (Math.abs(i) < 3 ? 0.7 : 0.15);
    g.add(post);
  }
  for (const [x, w, tilt] of [[-6.8, 6.6, 0.02], [7.0, 6.6, -0.03]]) {
    for (const y of [0.5, 0.9]) { const rail = part(box(w, 0.07, 0.06), WOOD, [x, y, 0]); rail.rotation.z = tilt; g.add(rail); }
  }
  const fallen = part(box(3.2, 0.07, 0.06), WOOD, [0.9, 0.12, 0.5]);
  fallen.rotation.set(0, 0.5, 0.05);
  g.add(fallen);
  return g;
}

function culvert() {
  const g = at(new THREE.Group(), -22.6, 51.5);
  const bank = part(roughen(ball(1, 2), 0.14, 0.44), 0x4c6b3c, [0, 0.3, 0.6]);
  bank.scale.set(7.5, 1.9, 2.4);
  g.add(bank);
  const ring = part(new THREE.TorusGeometry(1.25, 0.18, 6, 12), 0x8d938f, [0, 0.55, -1.75]);
  g.add(ring);
  g.add(part(new THREE.CircleGeometry(1.25, 12), new THREE.MeshBasicMaterial({ color: DARK, side: THREE.DoubleSide }), [0, 0.55, -1.7]));
  return g;
}

function scrapHeap() {
  const g = at(new THREE.Group(), 43.2, 8.6);
  const rnd = seeded(0.29);
  const rusty = [0x8a5a3a, 0x6f6f72, 0x9a7a4a, 0x55606a, 0x7a4a36];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * 6.28, r = rnd() * 1.9, y = 0.15 + (1.9 - r) * 0.42 * rnd();
    const kind = i % 4, s = 0.3 + rnd() * 0.55;
    const piece = kind === 0 ? part(box(s, s * 0.6, s * 1.3), rusty[i % 5], [Math.cos(a) * r, y, Math.sin(a) * r])
      : kind === 1 ? part(tube(s * 0.4, s * 0.4, s * 1.4, 7), rusty[i % 5], [Math.cos(a) * r, y, Math.sin(a) * r])
        : kind === 2 ? part(roughen(ball(s * 0.6, 0), 0.12, rnd()), rusty[i % 5], [Math.cos(a) * r, y, Math.sin(a) * r])
          : part(box(s * 1.6, 0.05, s), rusty[i % 5], [Math.cos(a) * r, y, Math.sin(a) * r]);
    piece.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(piece);
  }
  const wheel = part(new THREE.TorusGeometry(0.55, 0.08, 5, 10), 0x3a3a3e, [-1.9, 0.5, 0.6]);
  wheel.rotation.set(0.3, 0.9, 0);
  g.add(wheel);
  return g;
}

function echoHollow() {
  // A half ring of rock around a bare floor. Built because he wished his call would come back.
  const g = at(new THREE.Group(), 30, -36);
  const rnd = seeded(0.47);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.05 + 0.9 * i / 10), s = 1.6 + rnd() * 1.2;
    const rock = part(roughen(ball(s, 1), s * 0.3, rnd()), 0x7d8480, [Math.cos(a) * 6.5, s * 0.75, -Math.sin(a) * 6.5]);
    rock.scale.set(1, 1.6 + rnd() * 0.8, 0.9);
    g.add(rock);
  }
  const floor = part(new THREE.CircleGeometry(5.6, 12), 0x8a7a62, [0, 0.04, -1.5]);
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  return g;
}

function tramHalt() {
  const g = at(new THREE.Group(), 4.6, 57.5);
  g.add(part(box(2.2, 0.3, 5), WOOD, [0, 0.15, 0]));                       // a platform of sleepers
  for (const x of [1.9, 3.3]) g.add(part(box(0.12, 0.08, 60), 0x3a3a3e, [x, 0.05, 24]));
  for (let z = -4; z < 54; z += 2.2) g.add(part(box(2.2, 0.06, 0.3), WOOD_DARK, [2.6, 0.03, z]));
  g.add(part(tube(0.07, 0.09, 2.4, 6), WOOD_DARK, [-0.8, 1.2, -2.2]));
  const board = textPlane('TRAM', 1.1, 0.4);
  board.position.set(-0.8, 2.2, -2.13);
  g.add(part(box(1.2, 0.5, 0.06), 0x7a6248, [-0.8, 2.2, -2.2]), board);
  return g;
}

function hut(slug, title, pos, online) {
  const g = at(new THREE.Group(), pos[0], pos[1]);
  const facing = pos[1] > SPOTS.lane[1] ? Math.PI : 0;       // every door opens onto the lane
  g.rotation.y = facing;
  g.add(part(tube(1.55, 1.7, 1.7, 6), 0xd8c9a4, [0, 0.85, 0]));
  g.add(part(cone(2.25, 1.4, 6), ROOFS[Math.floor(hash(slug) * ROOFS.length)], [0, 2.4, 0]));
  g.add(part(box(0.62, 1.1, 0.1), WOOD_DARK, [0, 0.55, 1.42]));
  const glow = new THREE.MeshBasicMaterial({ color: 0x3a3428 });
  const pane = part(box(0.44, 0.4, 0.06), glow, [0.95, 1.05, 1.12]);
  pane.rotation.y = Math.PI / 3;
  g.add(pane);
  const sign = textPlane(title, 1.5, 0.4, { size: 40 });
  sign.position.set(0, 0.62, 2.1);
  sign.rotation.x = -0.35;
  g.add(part(tube(0.05, 0.06, 0.6, 5), WOOD_DARK, [0, 0.3, 2.05]), sign);
  g.userData = { slug, glow, online };
  return g;
}

export function buildPlaces(scene) {
  const h = { huts: new Map(), objects: new Map(), kept: '' };
  const all = new THREE.Group();
  all.add(burrow(h), stump(h), shed(h), board(h), letterbox(h), signalPost(h), lookout(), mossyBank(), fallenLog(),
    leafDrift(), laneSign(), gate(h), brokenFence(), culvert(), scrapHeap(), tramHalt(), echoHollow());
  h.hutGroup = new THREE.Group();
  h.objectGroup = new THREE.Group();
  all.add(h.hutGroup, h.objectGroup);
  scene.add(all);
  h.root = all;

  // Things a visitor cannot walk through.
  h.colliders = [{ x: 0, z: -3.0, r: 2.7 }, { x: 16, z: -12.6, r: 1.9 }, { x: 14.1, z: -11.2, r: 0.5 }, { x: 17.9, z: -11.2, r: 0.5 },
    { x: 30.6, z: 28.2, r: 3.3 }, { x: 10.4, z: 13.2, r: 0.9 }, { x: -8.1, z: -15.3, r: 0.45 }, { x: -19, z: -22.8, r: 0.45 },
    { x: 15.4, z: 25.8, r: 1.1 }, { x: 13.4, z: 24.7, r: 1.0 }, { x: 17.4, z: 26.9, r: 1.0 }, { x: STUMP[0], z: STUMP[1], r: 0.6 },
    { x: -2.5, z: 0.2, r: 0.9 }, { x: GATE[0] - 1.5, z: GATE[1] + 1.8, r: 0.3 }, { x: GATE[0] + 1.5, z: GATE[1] + 1.8, r: 0.3 },
    { x: 43.2, z: 8.6, r: 2.0 }, { x: 30, z: -42, r: 3.0 }, { x: 24, z: -39, r: 2.0 }, { x: 36, z: -39, r: 2.0 }, { x: -22.6, z: 52.1, r: 2.2 }];
  h.hutColliders = [];

  h.syncHuts = (places, projects) => {
    const want = Object.entries(places).filter(([, p]) => p.hut);
    const key = want.map(([k, p]) => `${k}:${p.name}:${Boolean((projects[p.hut] || {}).pages)}`).join('|');
    if (key === h.hutKey) return;
    h.hutKey = key;
    h.hutGroup.clear(); h.huts.clear(); h.hutColliders = [];
    for (const [, p] of want) {
      const info = projects[p.hut] || {};
      const one = hut(p.hut, String(info.title || p.hut).slice(0, 28), p.pos, Boolean(info.pages));
      h.hutGroup.add(one); h.huts.set(p.hut, one);
      h.hutColliders.push({ x: p.pos[0], z: p.pos[1], r: 1.9 });
    }
  };

  h.syncKept = (names) => {
    const key = names.join('|');
    if (key === h.kept) return;
    h.kept = key;
    h.shelf.clear();
    names.slice(-8).forEach((name, i) => {
      const item = itemMesh(name);
      item.position.set(-0.85 + (i % 4) * 0.55, 0, -0.2 + Math.floor(i / 4) * 0.42);
      item.rotation.y = hash(name) * 6.28;
      h.shelf.add(item);
    });
  };

  h.syncObjects = (objects) => {
    const seen = new Set();
    for (const o of objects) {
      seen.add(o.id);
      let node = h.objects.get(o.id);
      if (!node || node.userData.state !== o.state) {
        if (node) h.objectGroup.remove(node);
        if (o.state === 'buried') {
          node = part(roughen(ball(0.3, 0), 0.08, hash(o.id)), 0x6a5540);
          node.scale.y = 0.3;
        } else {
          node = itemMesh(o.name);
          const ring = part(new THREE.RingGeometry(0.2, 0.26, 12), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), [0, 0.02, 0]);
          ring.rotation.x = -Math.PI / 2;
          node.add(ring);
          node.userData.ring = ring;
        }
        node.userData.state = o.state;
        node.position.set(o.pos[0], heightAt(o.pos[0], o.pos[1]) + (o.state === 'buried' ? 0.02 : 0.03), o.pos[1]);
        h.objects.set(o.id, node);
        h.objectGroup.add(node);
      }
    }
    for (const [id, node] of h.objects) if (!seen.has(id)) { h.objectGroup.remove(node); h.objects.delete(id); }
  };

  // Lamps and flags that follow what is going on. `night` is 0 by day and 1 in full dark.
  h.update = (state, night, t) => {
    const bird = state.bird || {};
    const up = (state.letters_waiting || 0) > 0 ? -Math.PI / 2 : 0;
    h.flag.rotation.x += (up - h.flag.rotation.x) * 0.1;
    h.paper.visible = Boolean(state.board && state.board.text);
    const working = bird.doing === 'tinker' || Boolean(state.bench);
    const flicker = 0.92 + Math.sin(t * 13) * 0.04 + Math.sin(t * 7.3) * 0.04;
    h.shedLight.intensity = working ? 9 * flicker * (0.5 + night * 0.5) : 0;
    h.shedLampGlow.color.setHex(working ? 0xffd9a0 : 0x33271a);
    const listening = bird.doing === 'read';
    h.postGlow.color.setHex(listening ? (Math.sin(t * 6) > 0 ? 0x9affd0 : 0x2f6a58) : (Math.sin(t * 0.8) > 0.97 ? 0x6ad0b0 : 0x24403a));
    h.gateLight.intensity = night * 7 * flicker;
    h.gateGlow.color.setHex(night > 0.3 ? 0xffd08a : 0x4a3a20);
    for (const one of h.huts.values()) one.userData.glow.color.setHex(one.userData.online && night > 0.3 ? 0xffd08a : 0x3a3428);
    for (const node of h.objects.values()) if (node.userData.ring) node.userData.ring.material.opacity = 0.3 + Math.sin(t * 3) * 0.2;
    h.book.rotation.z = Math.sin(t * 0.7) * 0.01;
  };
  return h;
}
