// Everyone who moves: Gilbert, his three neighbours, and visitors.
import * as THREE from './vendor/three.module.js';
import { clamp, lerp, damp, dampAngle, hash, mat, part, box, ball, cone, tube, roughen } from './util.js';
import { heightAt, CREEK } from './land.js';

function shadow(radius) {
  const s = part(new THREE.CircleGeometry(radius, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.03;
  s.renderOrder = 2;
  return s;
}

// ---- Gilbert ----------------------------------------------------------------------------------
// He faces +z. Everything hangs off `body`, so the whole bird can tip, crouch and bob.
export function makeKiwi() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const BROWN = 0x6f4e34, BROWN_DARK = 0x5a3f2a, BEAK = 0xe8d5aa, LEG = 0xb89668;
  const torso = part(roughen(ball(0.5, 2), 0.05, 0.4), BROWN, [0, 0.62, -0.03]);
  torso.scale.set(0.84, 0.86, 1.08);
  const rump = part(roughen(ball(0.36, 1), 0.05, 0.7), BROWN_DARK, [0, 0.6, -0.34]);
  rump.scale.set(0.9, 0.95, 1);
  body.add(torso, rump);
  const neck = new THREE.Group();                      // tips the head and beak down to the ground
  neck.position.set(0, 0.74, 0.3);
  const head = part(ball(0.2, 1), BROWN, [0, 0.14, 0.14]);
  const beak = part(cone(0.036, 0.62, 5), BEAK, [0, 0.07, 0.56]);
  beak.rotation.x = Math.PI / 2 + 0.2;
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = part(ball(0.026, 0), 0x0c0a08, [side * 0.135, 0.2, 0.24]);
    eyes.push(eye);
    neck.add(eye);
    for (let i = 0; i < 2; i++) {                      // whiskers at the base of the beak
      const w = part(tube(0.004, 0.004, 0.16, 3), 0x2a2018, [side * 0.1, 0.1 + i * 0.03, 0.32]);
      w.rotation.set(0.3, 0, side * (1.0 + i * 0.25));
      neck.add(w);
    }
  }
  neck.add(head, beak);
  body.add(neck);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, 0.34, 0.02);
    leg.add(part(tube(0.035, 0.03, 0.34, 5), LEG, [0, -0.17, 0]));
    leg.add(part(box(0.11, 0.035, 0.22), LEG, [0, -0.33, 0.06]));
    legs.push(leg);
    root.add(leg);
  }
  root.add(shadow(0.5));
  return { root, body, neck, legs, eyes, phase: 0, look: 0, lookAt: 0, lookTimer: 1, dip: 0, crouch: 0, tip: 0,
    pos: new THREE.Vector2(0, 0), heading: 0, speed: 0, blink: 0, startle: 0 };
}

// What his traits and feelings do to the way he carries himself. `self` is the text of self.md.
export function gaitFrom(selfText, feeling, needs) {
  const lines = (selfText || '').toLowerCase();
  const has = (re) => re.test(lines);
  const g = { careful: has(/\b(quiet|shy|careful|cautious|wary|timid|gentle|unprepared|unsure)\b/),
    restless: has(/\b(restless|curious|busy|quick|eager|nosy|fidget\w*)\b/),
    bold: has(/\b(bold|brave|proud|stubborn|sure)\b/),
    calm: has(/\b(calm|slow|patient|peaceful|still|steady|sleepy)\b/) };
  const mood = (feeling && feeling.mood) || 0, energy = (feeling && feeling.energy) || 0;
  const nerves = (needs && needs.nerves) || 0, weary = (needs && needs.weariness) || 0;
  g.cadence = clamp(1 + energy * 0.35 + (g.restless ? 0.18 : 0) - (g.calm ? 0.14 : 0) - weary * 0.25, 0.55, 1.6);
  g.stride = clamp(1 - (g.careful ? 0.2 : 0) + (g.bold ? 0.12 : 0) + mood * 0.1, 0.6, 1.3);       // short steps when careful
  g.bounce = clamp(0.5 + mood * 0.5 + energy * 0.3, 0.1, 1.2);
  g.headHigh = clamp(mood * 0.16 + (g.bold ? 0.12 : 0) - (g.careful ? 0.08 : 0) - weary * 0.2, -0.3, 0.3);
  g.glances = clamp(0.35 + nerves * 1.4 + (g.restless ? 0.4 : 0) - (g.calm ? 0.2 : 0), 0.1, 2.4);   // looks about per few seconds
  g.tremble = clamp((nerves - 0.5) * 2, 0, 1);
  g.droop = clamp((weary - 0.6) * 2.5, 0, 1);
  g.words = ['careful', 'restless', 'bold', 'calm'].filter((k) => g[k]);
  return g;
}

const STILL = new Set(['probe', 'sniff', 'keep', 'leave_be', 'greet', 'call_out', 'wade', 'hide', 'nap', 'tidy',
  'check_letterbox', 'read', 'tinker', 'pin_note', 'sit', 'ask_for_sleep', 'drink', 'explore', 'scavenge', 'pick_up',
  'put_down', 'dance', 'watch', 'wish']);

// Move and pose him for this frame. `bird` is the town's word on him; `extra` is where things are.
export function animateKiwi(k, bird, gait, dt, t, extra) {
  const doing = bird.asleep ? 'asleep' : (bird.doing || 'idle');
  // Where to draw him. The town gives one point per place; a few actions look better a step away.
  let tx = bird.pos[0], tz = bird.pos[1], face = null;
  if ((doing === 'asleep' || doing === 'nap') && extra.city) { /* in the city he sleeps where he is */ }
  else if (doing === 'asleep' || doing === 'nap') { tx = 0; tz = 0.35; face = 0.5; }
  else if (doing === 'tinker') { tx = extra.shedInside[0]; tz = extra.shedInside[1]; face = Math.PI; }
  else if (doing === 'wade') { tx = -26.4; tz = 8.4; face = -1.2; }
  else if (doing === 'tidy') { tx = -1.4 + Math.sin(t * 0.5) * 0.5; tz = 0.6; face = -1.9; }
  else if (doing === 'check_letterbox') face = Math.atan2(4.6 - tx, -2.8 - tz);
  else if (doing === 'read') face = Math.atan2(-19.0 - tx, -22.8 - tz);
  else if (doing === 'pin_note') face = Math.atan2(10.4 - tx, 13.2 - tz);
  else if ((doing === 'greet' || doing === 'sniff') && extra.nearest) face = Math.atan2(extra.nearest[0] - tx, extra.nearest[1] - tz);
  else if (doing === 'hide') { tx += 0.9; tz -= 0.4; }
  else if (doing === 'explore') {                       // a little way out past the edge, and back
    const far = Math.hypot(tx, tz) || 1, out = (extra.city ? 16 : 5.5) * Math.sin(Math.min(1, (t % 60) / 60) * Math.PI);
    if (extra.city) tz += out; else { tx += tx / far * out; tz += tz / far * out; }
  } else if (doing === 'drink' && Math.hypot(tx + 24, tz - 8) < 2) { tx = -25.6; tz = 8.3; face = -1.2; }
  else if (doing === 'drink' && Math.hypot(tx - 16, tz + 9) < 2) { tx = 13.9; tz = -10.2; face = 2.6; }
  else if (doing === 'drink' && Math.hypot(tx + 22, tz - 47) < 2) { tx = -22.8; tz = 48.4; face = 0; }
  else if (doing === 'scavenge') face = Math.atan2(43.2 - tx, 8.6 - tz);
  else if (doing === 'wish') { tx = 0.9; tz = 0.1; face = Math.PI + 0.5; }
  else if (doing === 'watch' && extra.nearest) face = Math.atan2(extra.nearest[0] - tx, extra.nearest[1] - tz);
  else if (doing === 'dance') face = k.heading + dt * 2.4;

  const before = k.pos.clone();
  const far = Math.hypot(tx - k.pos.x, tz - k.pos.y);
  if (far > 14) k.pos.set(tx, tz);                       // he was moved (woke at home, new connection)
  else { k.pos.x = damp(k.pos.x, tx, 4.5, dt); k.pos.y = damp(k.pos.y, tz, 4.5, dt); }
  const moved = k.pos.distanceTo(before);
  k.speed = damp(k.speed, dt > 0 ? moved / dt : 0, 6, dt);
  const walking = k.speed > 0.12 && !STILL.has(doing) && doing !== 'asleep';
  if (face === null && moved > 0.002) face = Math.atan2(k.pos.x - before.x, k.pos.y - before.y);
  if (face === null && bird.heading !== undefined && doing === 'walk_to') face = bird.heading * Math.PI / 180;
  if (face !== null) k.heading = dampAngle(k.heading, face, walking ? 5 : 3.5, dt);

  // Targets for the pose; everything eases towards them.
  let dip = 0.05 - gait.headHigh, crouch = 0, tip = 0, legSwing = 0, bob = 0, shake = gait.tremble * 0.012, eye = 1;
  if (walking) {
    k.phase += k.speed * dt * 6.4 * gait.cadence / gait.stride;
    legSwing = Math.sin(k.phase) * 0.75 * gait.stride;
    bob = Math.abs(Math.sin(k.phase)) * 0.045 * gait.bounce;
    tip = 0.1 + gait.droop * 0.12;
    dip += Math.sin(k.phase * 2) * 0.05 + (Math.sin(t * 0.9) > 0.86 ? 0.5 : 0);       // now and then he taps the ground as he goes
  } else if (doing === 'probe') { tip = 0.42; dip = 1.02 + Math.sin(t * 7) * 0.12 + Math.sin(t * 1.3) * 0.08; }
  else if (doing === 'sniff') { tip = 0.3; dip = 0.75 + Math.sin(t * 9) * 0.03; }
  else if (doing === 'keep' || doing === 'leave_be') { tip = 0.3; dip = 0.8 * Math.abs(Math.sin(t * 2.2)); }
  else if (doing === 'greet') { dip = 0.25 + Math.sin(t * 5) * 0.3; bob = Math.abs(Math.sin(t * 5)) * 0.03; }
  else if (doing === 'call_out') { tip = -0.5; dip = -0.75 + Math.sin(t * 16) * 0.04; }
  else if (doing === 'wade') { crouch = 0.12; tip = 0.05; dip = 0.2 + Math.sin(t * 0.8) * 0.1; }
  else if (doing === 'hide') { crouch = 0.3; tip = 0.2; dip = 0.9; shake += 0.01; }
  else if (doing === 'nap' || doing === 'asleep') { crouch = 0.3; tip = 0.12; dip = 1.25; eye = 0.1; }
  else if (doing === 'tidy') { dip = 0.5 + Math.sin(t * 3) * 0.4; legSwing = Math.sin(t * 5) * 0.3; }
  else if (doing === 'check_letterbox' || doing === 'pin_note') { tip = -0.35; dip = -0.55 + Math.sin(t * 4) * 0.08; }
  else if (doing === 'read') { tip = -0.1; dip = 0.1; k.lookAt = 0.5; }
  else if (doing === 'tinker') { tip = -0.2; dip = 0.1 + Math.max(0, Math.sin(t * 6)) * 0.5; }
  else if (doing === 'sit') { crouch = 0.24; dip = 0.15; }
  else if (doing === 'drink') { tip = 0.4; dip = 0.95 + Math.max(0, Math.sin(t * 2.2)) * -0.9; }
  else if (doing === 'scavenge') { tip = 0.35; dip = 0.85 + Math.sin(t * 8) * 0.15; legSwing = Math.sin(t * 6) * 0.25; }
  else if (doing === 'pick_up' || doing === 'put_down') { tip = 0.35; dip = 0.95; }
  else if (doing === 'dance') { bob = Math.abs(Math.sin(t * 6)) * 0.12; legSwing = Math.sin(t * 12) * 0.6; dip = Math.sin(t * 6) * 0.25; }
  else if (doing === 'watch') { dip = -0.12; crouch = 0.08; k.lookAt = 0; }
  else if (doing === 'wish') { tip = -0.15; dip = -0.2 + Math.sin(t * 9) * 0.12; k.lookAt = Math.sin(t * 9) * 0.15; }
  else if (doing === 'explore') { legSwing = Math.sin(t * 7) * 0.6; bob = Math.abs(Math.sin(t * 7)) * 0.03; dip = 0.15 + (Math.sin(t * 0.9) > 0.7 ? 0.5 : 0); }
  else if (doing === 'ask_for_sleep') { crouch = 0.1; dip = 0.7 + Math.sin(t * 1.5) * 0.15; eye = 0.4; }
  else { dip += gait.droop * 0.5; eye = gait.droop > 0.6 ? 0.5 : 1; }

  // Looking about. Nervous and restless birds do it more.
  if (doing === 'idle' || walking || doing === 'sit') {
    k.lookTimer -= dt * gait.glances;
    if (k.lookTimer <= 0) { k.lookTimer = 0.8 + Math.random() * 2.2; k.lookAt = (Math.random() - 0.5) * 1.5 * (walking ? 0.5 : 1); }
  } else if (doing !== 'read') k.lookAt = 0;
  k.look = damp(k.look, k.lookAt, gait.tremble > 0.3 ? 14 : 6, dt);
  k.blink -= dt;
  if (k.blink < -0.12) k.blink = 2 + Math.random() * 4;
  if (k.blink < 0) eye = Math.min(eye, 0.1);

  if (bird.startled && t - bird.startled < 0.5) { k.startle = 1; }
  k.startle = damp(k.startle, 0, 4, dt);
  k.dip = damp(k.dip, dip, 7, dt);
  k.crouch = damp(k.crouch, crouch, 5, dt);
  k.tip = damp(k.tip, tip, 5, dt);
  const breathe = Math.sin(t * (doing === 'asleep' || doing === 'nap' ? 1.1 : 2.2)) * 0.012;

  const ground = heightAt(k.pos.x, k.pos.y);
  const inWater = doing === 'wade' ? -0.22 : 0;
  k.root.position.set(k.pos.x + (Math.random() - 0.5) * shake, Math.max(ground, -0.6) + inWater, k.pos.y + (Math.random() - 0.5) * shake);
  k.root.rotation.y = k.heading;
  k.body.position.y = bob - k.crouch + k.startle * 0.25;
  k.body.rotation.x = k.tip;
  k.body.rotation.z = walking ? Math.sin(k.phase) * 0.06 * gait.bounce : 0;
  k.body.scale.set(1 + breathe, 1 + breathe, 1);
  k.neck.rotation.x = k.dip;
  k.neck.rotation.y = k.look;
  k.legs[0].rotation.x = legSwing;
  k.legs[1].rotation.x = -legSwing;
  const fold = k.crouch > 0.15 ? 1 - (k.crouch - 0.15) * 2.4 : 1;
  for (const leg of k.legs) leg.scale.y = clamp(fold, 0.35, 1);
  for (const e of k.eyes) e.scale.y = damp(e.scale.y, eye, 20, dt);
  return { doing, walking, head: new THREE.Vector3(k.pos.x, k.root.position.y + 1.25 - k.crouch, k.pos.y) };
}

// ---- the neighbours ---------------------------------------------------------------------------
function makeWeka(feathers = 0x8a5a36) {                  // Mabel: stocky, upright, into everything
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const torso = part(roughen(ball(0.36, 1), 0.04, 0.3), feathers, [0, 0.52, 0]);
  torso.scale.set(0.85, 0.95, 1.2);
  body.add(torso);
  const tail = part(cone(0.16, 0.42, 4), 0x5c3c26, [0, 0.62, -0.46]);
  tail.rotation.x = -Math.PI / 2 - 0.6;
  body.add(tail);
  const neck = new THREE.Group();
  neck.position.set(0, 0.74, 0.3);
  neck.add(part(tube(0.1, 0.14, 0.26, 6), 0x8a5a36, [0, 0.06, 0]));
  neck.add(part(ball(0.13, 1), 0x9a6a42, [0, 0.24, 0.05]));
  const beak = part(cone(0.045, 0.24, 4), 0xb5563a, [0, 0.22, 0.24]);
  beak.rotation.x = Math.PI / 2 + 0.15;
  neck.add(beak);
  for (const side of [-1, 1]) neck.add(part(ball(0.022, 0), 0x7a1c12, [side * 0.09, 0.28, 0.12]));
  body.add(neck);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.13, 0.3, 0);
    leg.add(part(tube(0.03, 0.028, 0.3, 5), 0xa85a3a, [0, -0.15, 0]));
    leg.add(part(box(0.1, 0.03, 0.2), 0xa85a3a, [0, -0.29, 0.05]));
    legs.push(leg); root.add(leg);
  }
  root.add(shadow(0.38));
  return { root, body, neck, legs, tail, kind: 'weka', offset: [1.5, 0.9] };
}

function makeTuatara() {                                 // Old Tuck: hardly moves
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const SKIN = 0x7a8a66, SPINE = 0xd8d2b8;
  const torso = part(roughen(ball(0.3, 1), 0.03, 0.5), SKIN, [0, 0.2, 0]);
  torso.scale.set(0.8, 0.55, 1.7);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.22, 0.5);
  const skull = part(ball(0.16, 1), SKIN, [0, 0, 0.1]);
  skull.scale.set(0.9, 0.7, 1.3);
  head.add(skull);
  for (const side of [-1, 1]) head.add(part(ball(0.03, 0), 0x1a1408, [side * 0.1, 0.06, 0.16]));
  body.add(head);
  const tail = part(cone(0.13, 0.95, 5), SKIN, [0, 0.15, -0.9]);
  tail.rotation.x = -Math.PI / 2;
  body.add(tail);
  for (let i = 0; i < 9; i++) body.add(part(cone(0.03, 0.09, 3), SPINE, [0, 0.38 - Math.abs(i - 3) * 0.012, 0.42 - i * 0.14]));
  for (const side of [-1, 1]) for (const z of [0.3, -0.3]) {
    const leg = part(box(0.22, 0.06, 0.08), SKIN, [side * 0.28, 0.07, z]);
    leg.rotation.y = side * 0.4;
    body.add(leg);
  }
  root.add(shadow(0.5));
  return { root, body, neck: head, legs: [], kind: 'tuatara', offset: [-1.2, 1.4] };
}

function makeFantail() {                                 // Pip: cannot keep still
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const torso = part(ball(0.11, 1), 0x8a7a5a, [0, 0, 0]);
  torso.scale.set(0.9, 0.9, 1.25);
  body.add(torso);
  body.add(part(ball(0.075, 1), 0x4a4038, [0, 0.07, 0.12]));
  const beak = part(cone(0.015, 0.06, 4), 0x1a1a1a, [0, 0.07, 0.2]);
  beak.rotation.x = Math.PI / 2;
  body.add(beak);
  body.add(part(box(0.1, 0.02, 0.02), 0xf0ece0, [0, 0.11, 0.17]));           // the white eyebrow
  const fan = [];
  for (let i = -2; i <= 2; i++) {
    const f = part(cone(0.04, 0.3, 3), i % 2 ? 0x2f2a26 : 0xf0ece0, [0, 0.03, -0.12]);
    f.geometry = f.geometry.clone().translate(0, 0.15, 0);
    f.rotation.set(-Math.PI / 2 + 0.5, 0, 0);
    f.rotation.y = i * 0.3;
    f.scale.z = 0.3;
    fan.push(f); body.add(f);
  }
  const wings = [];
  for (const side of [-1, 1]) {
    const w = part(cone(0.07, 0.24, 3), 0x5a5046, [side * 0.08, 0.02, 0]);
    w.geometry = w.geometry.clone().translate(0, 0.12, 0);
    w.rotation.z = -side * Math.PI / 2;
    w.scale.z = 0.25;
    wings.push(w); body.add(w);
  }
  root.add(shadow(0.14));
  return { root, body, neck: null, legs: [], wings, fan, kind: 'fantail', offset: [0.4, -1.3] };
}

function makeHeron() {                                   // Odile: tall, grey, very still
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  for (const side of [-1, 1]) body.add(part(tube(0.025, 0.025, 1.3, 4), 0x5a5a48, [side * 0.1, 0.65, 0]));
  const torso = part(roughen(ball(0.34, 1), 0.04, 0.2), 0x8f99a6, [0, 1.5, -0.05]);
  torso.scale.set(0.8, 0.9, 1.5);
  body.add(torso);
  const neck = new THREE.Group();
  neck.position.set(0, 1.7, 0.35);
  neck.add(part(tube(0.05, 0.07, 0.8, 5), 0xa8b0bb, [0, 0.38, 0.05]), part(ball(0.11, 1), 0xe0e4ea, [0, 0.82, 0.1]));
  const beak = part(cone(0.035, 0.42, 4), 0xd8a840, [0, 0.8, 0.38]);
  beak.rotation.x = Math.PI / 2;
  neck.add(beak);
  body.add(neck);
  root.add(shadow(0.4));
  return { root, body, neck, legs: [], kind: 'tuatara', offset: [1.6, -1.1] };
}

function makeRat() {                                     // Bram: low, quick, brown
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const torso = part(roughen(ball(0.28, 1), 0.03, 0.8), 0x6a5444, [0, 0.26, 0]);
  torso.scale.set(0.8, 0.8, 1.5);
  body.add(torso);
  const neck = new THREE.Group();
  neck.position.set(0, 0.32, 0.36);
  neck.add(part(cone(0.15, 0.36, 6), 0x6a5444, [0, 0, 0.12]));
  neck.children[0].rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) neck.add(part(ball(0.07, 0), 0xc9a0a0, [side * 0.11, 0.13, 0.0]), part(ball(0.02, 0), 0x0c0a08, [side * 0.07, 0.05, 0.18]));
  body.add(neck);
  const tail = part(cone(0.035, 0.8, 4), 0xc9a0a0, [0, 0.14, -0.75]);
  tail.rotation.x = -Math.PI / 2;
  body.add(tail);
  root.add(shadow(0.32));
  return { root, body, neck, legs: [], kind: 'tuatara', offset: [-1.2, 0.9] };
}

export function makeResident(key) {
  const r = key === 'mabel' ? makeWeka() : key === 'tuck' ? makeTuatara() : key === 'odile' ? makeHeron()
    : key === 'bram' ? makeRat() : key === 'kettle' ? makeWeka(0x3a4a8a) : makeFantail();
  Object.assign(r, { pos: new THREE.Vector2(999, 999), heading: hash(key) * 6, phase: hash(key) * 10, speed: 0, seed: hash(key) * 100 });
  return r;
}

export function animateResident(r, where, dt, t) {
  const tx = where[0] + r.offset[0], tz = where[1] + r.offset[1];
  const before = r.pos.clone();
  if (Math.hypot(tx - r.pos.x, tz - r.pos.y) > 30) r.pos.set(tx, tz);
  else { r.pos.x = damp(r.pos.x, tx, 3, dt); r.pos.y = damp(r.pos.y, tz, 3, dt); }
  const moved = r.pos.distanceTo(before);
  r.speed = damp(r.speed, dt > 0 ? moved / dt : 0, 5, dt);
  if (moved > 0.003) r.heading = dampAngle(r.heading, Math.atan2(r.pos.x - before.x, r.pos.y - before.y), 4, dt);
  const ground = heightAt(r.pos.x, r.pos.y);
  const s = t + r.seed;
  if (r.kind === 'fantail') {
    // Never on the ground for long: loops and darts around wherever Pip is meant to be.
    const loop = 1.1 + Math.sin(s * 0.37) * 0.5;
    const x = r.pos.x + Math.cos(s * 1.7) * loop + Math.sin(s * 3.1) * 0.3, z = r.pos.y + Math.sin(s * 1.3) * loop;
    const y = ground + 1.1 + Math.sin(s * 2.3) * 0.45 + Math.sin(s * 5.1) * 0.1;
    r.root.children[r.root.children.length - 1].position.y = 0.03 - y + ground;      // the shadow stays on the ground
    r.root.rotation.y = Math.atan2(-Math.sin(s * 1.7) * 1.7 * loop, Math.cos(s * 1.3) * 1.3 * loop);
    r.root.position.set(x, y, z);
    const flap = Math.sin(s * 34) * 0.9;
    r.wings[0].rotation.x = flap; r.wings[1].rotation.x = flap;
    r.wings[0].rotation.z = Math.PI / 2 - flap * 0.5; r.wings[1].rotation.z = -Math.PI / 2 + flap * 0.5;
    r.fan.forEach((f, i) => { f.rotation.y = (i - 2) * (0.24 + Math.sin(s * 2.1) * 0.1); });
    return new THREE.Vector3(x, y + 0.35, z);
  }
  r.root.position.set(r.pos.x, ground, r.pos.y);
  r.root.rotation.y = r.heading;
  if (r.kind === 'weka') {
    const walking = r.speed > 0.1;
    if (walking) r.phase += r.speed * dt * 8;
    const swing = walking ? Math.sin(r.phase) * 0.7 : 0;
    r.legs[0].rotation.x = swing; r.legs[1].rotation.x = -swing;
    r.body.position.y = walking ? Math.abs(Math.sin(r.phase)) * 0.03 : 0;
    const peck = !walking && Math.sin(s * 0.6) > 0.55 ? Math.abs(Math.sin(s * 6)) * 1.0 : 0;     // looks under things
    r.neck.rotation.x = damp(r.neck.rotation.x, peck + (walking ? Math.sin(r.phase * 2) * 0.12 : 0), 12, dt);
    r.neck.rotation.y = walking ? 0 : Math.sin(s * 0.9) * 0.6;
    r.tail.rotation.x = -Math.PI / 2 - 0.6 + Math.sin(s * 9) * (Math.sin(s * 0.8) > 0.7 ? 0.25 : 0.02);
    return new THREE.Vector3(r.pos.x, ground + 1.25, r.pos.y);
  }
  r.root.position.y = ground + (Math.hypot(where[0] - 28, where[1] - 26) < 3 ? 0.55 : 0);       // he likes a warm stone
  r.neck.rotation.x = -0.15 - Math.max(0, Math.sin(s * 0.13)) * 0.2;
  r.neck.rotation.y = Math.sin(s * 0.21) * 0.25;
  r.body.scale.y = 1 + Math.sin(s * 0.9) * 0.02;
  return new THREE.Vector3(r.pos.x, r.root.position.y + 0.7, r.pos.y);
}

// ---- visitors ---------------------------------------------------------------------------------
const CLOAKS = [0x7a4a6a, 0x3f6f8f, 0x8a6a2a, 0x4f7a4a, 0x8a4a3a, 0x5a5a8a, 0x2f7a72];

export function makeVisitor(name, mine) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const cloak = CLOAKS[Math.floor(hash(name || 'visitor') * CLOAKS.length)];
  body.add(part(cone(0.46, 1.25, 7), cloak, [0, 0.66, 0]));
  body.add(part(ball(0.19, 1), 0xd9b99a, [0, 1.36, 0.02]));
  const hood = part(cone(0.27, 0.42, 7), cloak, [0, 1.5, -0.04]);
  hood.rotation.x = -0.25;
  body.add(hood);
  body.add(part(box(0.5, 0.1, 0.34), cloak, [0, 1.16, 0]));
  const arm = new THREE.Group();                         // one arm holds a lantern out
  arm.position.set(0.3, 1.1, 0.1);
  const sleeve = part(tube(0.035, 0.035, 0.5, 5), cloak, [0.08, -0.12, 0.18]);
  sleeve.rotation.set(1.0, 0, -0.3);
  arm.add(sleeve);
  arm.add(part(tube(0.006, 0.006, 0.22, 3), 0x2a2a2a, [0.17, -0.36, 0.38]));
  const glow = new THREE.MeshBasicMaterial({ color: 0x5a4a2a });
  arm.add(part(box(0.12, 0.16, 0.12), glow, [0.17, -0.54, 0.38]));
  arm.add(part(cone(0.11, 0.07, 4), 0x2a2a2a, [0.17, -0.43, 0.38]));
  body.add(arm);
  let light = null;
  if (mine) {
    light = new THREE.PointLight(0xffc27a, 0, 11, 1.5);
    light.position.set(0.5, 0.7, 0.5);
    root.add(light);
  }
  root.add(shadow(0.45));
  return { root, body, arm, glow, light, pos: new THREE.Vector2(0, 0), heading: 0, phase: 0, speed: 0, name };
}

export function animateVisitor(v, dt, t, night) {
  if (v.speed > 0.2) v.phase += v.speed * dt * 3.2;
  v.body.position.y = v.speed > 0.2 ? Math.abs(Math.sin(v.phase)) * 0.06 : Math.sin(t * 1.6) * 0.008;
  v.body.rotation.x = clamp(v.speed * 0.03, 0, 0.14);
  v.body.rotation.z = v.speed > 0.2 ? Math.sin(v.phase) * 0.04 : 0;
  v.arm.rotation.x = Math.sin(v.phase) * 0.12;
  v.root.position.set(v.pos.x, Math.max(heightAt(v.pos.x, v.pos.y), -0.42), v.pos.y);
  v.root.rotation.y = v.heading;
  const flicker = 0.9 + Math.sin(t * 11 + v.pos.x) * 0.05 + Math.sin(t * 6.7) * 0.05;
  v.glow.color.setHex(night > 0.25 ? 0xffd89a : 0x6a5a3a);
  if (v.light) v.light.intensity = night * 6.5 * flicker;
  return new THREE.Vector3(v.pos.x, v.root.position.y + 1.95, v.pos.y);
}

export { CREEK };
