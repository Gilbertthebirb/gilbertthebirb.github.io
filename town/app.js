// Puts the town on screen and lets one visitor walk about in it.
// Everything shown here comes from the town's state or from his files. Nothing here can change him.
import * as THREE from './vendor/three.module.js';
import { clamp, damp, dampAngle } from './util.js';
import { buildLand, heightAt, setLevel, SPOTS, GATE, STUMP } from './land.js';
import { buildCity } from './city.js';
import { buildPlaces, itemMesh } from './places.js';
import { makeKiwi, animateKiwi, gaitFrom, makeResident, animateResident, makeVisitor, animateVisitor } from './creatures.js';
import { buildSky } from './sky.js';
import { buildUi } from './ui.js';

const query = new URLSearchParams(location.search);           // test switches, e.g. ?sun=-20&weather=rain
const demo = {
  sun: query.has('sun') ? Number(query.get('sun')) : null, weather: query.get('weather'), doing: query.get('doing'),
  panel: query.get('panel'), at: query.get('at'), look: query.get('look'), fps: query.has('fps'), follow: query.has('follow'),
};

const settings = await window.town.settings();
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.sharp !== false, powerPreference: 'low-power' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 1200);

const land = buildLand();
scene.add(land.group);
const places = buildPlaces(scene);
// Which of the two areas is on screen. The city is only built the first time someone looks at it.
const view = { area: 'town', follow: true, city: null };
const cityX = () => (state && state.city_x) || 1000;
const inCityPos = (pos) => pos[0] > 500;
function showArea(area) {
  if (area === view.area) return;
  if (area === 'city' && me.active) leave();                 // visitors walk in town; the city is for watching
  view.area = area;
  if (area === 'city' && !view.city) { view.city = buildCity(); scene.add(view.city.group); }
  if (view.city) view.city.group.visible = area === 'city';
  land.group.visible = places.root.visible = area === 'town';
  setLevel(area === 'city');
  sky.inCity = area === 'city';
  cam.target.set(0, 1, 0);
  kiwi.pos.set(9999, 9999);
  syncThings();
  ui.setArea(view.area);
}
function syncThings() {
  if (!state) return;
  const city = view.area === 'city', off = city ? cityX() : 0;
  places.syncObjects((state.objects || []).filter((o) => inCityPos(o.pos) === city).map((o) => ({ ...o, pos: [o.pos[0] - off, o.pos[1]] })));
}
const sky = buildSky(scene);
const kiwi = makeKiwi();
scene.add(kiwi.root);
const residents = new Map();
const others = new Map();

let state = null;                 // the latest word from the town
let link = { mode: 'asleep', role: 'none', practice: false, welcome: null };
let mind = null;                  // his files, as last read
let gait = gaitFrom('', null, null);
const me = { active: false, online: false, vid: null, name: settings.name || '', pos: new THREE.Vector2(GATE[0], GATE[1]),
  heading: Math.PI, speed: 0, figure: null, sent: 0, myLetters: new Set(), tookSeen: null };
const cam = { yaw: 0.6, pitch: 0.42, dist: 15, target: new THREE.Vector3(0, 1, 0), watch: 'gilbert' };
const keys = new Set();

const ui = buildUi({
  switchArea: () => { view.follow = false; showArea(view.area === 'town' ? 'city' : 'town'); },
  walkIn, leave, settings,
  openPage: (slug) => window.town.open(slug),
  saveSettings: async (change) => Object.assign(settings, await window.town.settings(change)),
  restart: () => window.town.restart(),
  answerWish: (id, verdict) => window.town.wish(id, verdict),
  refreshMind,
});

// ---- word from the town -----------------------------------------------------------------------
window.town.onLink((info) => {
  const was = link.mode;
  link = info;
  if (info.mode === 'asleep') { me.online = false; me.vid = null; }
  else if (was === 'asleep' && me.active && !me.online) join();          // he woke while we were walking about
  ui.setLink(link);
  refreshMind();
});
window.town.onState((s) => {
  if (demo.doing && s.bird) { s.bird.doing = demo.doing === 'asleep' ? null : demo.doing; s.bird.asleep = demo.doing === 'asleep'; }
  if (demo.weather) s.weather = demo.weather;
  if (state && s.bird && state.bird && (s.bird.needs.nerves - state.bird.needs.nerves) > 0.1) s.bird.startled = clock;
  else if (state && state.bird && s.bird) s.bird.startled = state.bird.startled;
  state = s;
  places.syncHuts(s.places || {}, (mind && mind.projects) || {});
  places.syncKept(s.kept || []);
  syncThings();
  watchReplies(s);
});

async function refreshMind() {
  mind = await window.town.mind();
  ui.setMind(mind);
  if (state) places.syncHuts(state.places || {}, mind.projects || {});
}
setInterval(refreshMind, 5000);

function watchReplies(s) {
  // How he took what this visitor said or wrote, and what became of their letters.
  if (me.tookSeen === null) me.tookSeen = Math.max(0, ...(s.took || []).map((x) => x.t));    // old news stays old
  for (const took of s.took || []) {
    if (took.t <= me.tookSeen) continue;
    me.tookSeen = took.t;
    if (!me.name || took.by !== me.shownName) continue;
    const thing = { letter: 'He read your letter.', note: 'He found the words you scratched.', spoken: 'He heard you.' }[took.what];
    if (!thing) continue;
    ui.toast(took.kind === 'unread' ? `${thing} He could not make the words out just now.`
      : `${thing} To him it was ${took.kind}, and it felt ${took.warmth}.${took.matters ? '' : ' It did not seem to matter much to him.'}`);
  }
  for (const letter of s.letters || []) {
    if (!me.myLetters.has(letter.id)) continue;
    if (letter.state === 'kept') { ui.toast('He kept your letter. It is on his shelf.'); me.myLetters.delete(letter.id); }
    if (letter.state === 'let_go') { ui.toast('He left your letter in the box. It was not for him.'); me.myLetters.delete(letter.id); }
  }
}

// ---- walking in, and out ----------------------------------------------------------------------
async function join() {
  const reply = await window.town.ask({ type: 'visit', name: me.name });
  if (!reply.ok) { ui.toast(reply.text || 'The town would not let you in.'); return false; }
  me.online = true; me.vid = reply.you; me.shownName = reply.name;
  if (reply.pos && me.pos.distanceTo(new THREE.Vector2(reply.pos[0], reply.pos[1])) > 40) me.pos.set(reply.pos[0], reply.pos[1]);
  if (reply.name !== me.name) ui.toast(`In town you are called ${reply.name}.`);
  me.figure.name = reply.name;
  return true;
}

let arriving = false;
async function walkIn() {
  if (me.active || arriving) return;
  arriving = true;
  try { await arrive(); } finally { arriving = false; }
}

async function arrive() {
  if (!me.name) {
    const name = await ui.askName();
    if (!name) return;
    me.name = name;
    await window.town.settings({ name });
    settings.name = name;
  }
  me.figure = makeVisitor(me.name, true);
  scene.add(me.figure.root);
  me.pos.set(GATE[0], GATE[1] - 1.5);
  me.heading = Math.PI;
  me.active = true;
  cam.watch = 'me'; cam.yaw = 0; cam.pitch = 0.3; cam.dist = 9;
  me.shownName = me.name;
  if (link.mode !== 'asleep' && link.role === 'visitor') await join();
  else ui.toast(link.live ? 'You can walk about. This is a picture of the town from a few minutes ago: nothing you do here reaches him.'
    : link.mode === 'asleep' ? 'He is asleep. You can walk about, quietly. Nothing you do here reaches him.'
    : 'This window can only watch, so nobody in town can see you.');
  ui.setWalking(true);
}

async function leave() {
  if (!me.active) return;
  if (me.online) await window.town.ask({ type: 'leave' });
  scene.remove(me.figure.root);
  me.figure = null; me.active = false; me.online = false; me.vid = null;
  cam.watch = 'gilbert'; cam.dist = 15;
  ui.setWalking(false);
}

// ---- what is in reach -------------------------------------------------------------------------
function inReach() {
  const out = { talk: false, spot: null };
  if (!me.active || !state) return out;
  const d = (x, z) => Math.hypot(me.pos.x - x, me.pos.y - z);
  const bird = state.bird;
  if (me.online && !bird.asleep && d(kiwi.pos.x, kiwi.pos.y) <= 7.5) out.talk = true;
  const found = [];
  if (d(STUMP[0], STUMP[1]) < 3) found.push([d(STUMP[0], STUMP[1]), { kind: 'journal', words: 'read his journal' }]);
  if (d(10.4, 13.2) < 4) found.push([d(10.4, 13.2), { kind: 'board', words: 'read the notice board' }]);
  if (d(-2.5, 0.2) < 3) found.push([d(-2.5, 0.2), { kind: 'shelf', words: 'look at his shelf' }]);
  if (d(4.6, -2.8) < 4.6) found.push([d(4.6, -2.8) - 1, { kind: 'letter', words: me.online ? 'post a letter' : 'the letterbox (he is asleep)' }]);
  for (const [key, p] of Object.entries(state.places || {})) {
    if (p.hut && d(p.pos[0], p.pos[1]) < 5) found.push([d(p.pos[0], p.pos[1]), { kind: 'hut', slug: p.hut, words: `look into ${p.name}` }]);
    if (me.online && link.welcome && link.welcome.soft.includes(key) && d(p.pos[0], p.pos[1]) < 6.5) {
      found.push([d(p.pos[0], p.pos[1]) + 2, { kind: 'bury', words: `bury a keepsake at ${p.name}` }]);
    }
  }
  found.sort((a, b) => a[0] - b[0]);
  out.spot = found.length ? found[0][1] : null;
  return out;
}

async function use(spot) {
  if (!spot) return;
  if (spot.kind === 'journal') ui.openPanel('journal');
  else if (spot.kind === 'board') {
    const b = (state && state.board) || {};
    ui.card('The notice board', b.text ? [b.text] : ['Nothing is pinned here yet.'], b.text ? 'Pinned by Gilbert.' : '');
  } else if (spot.kind === 'shelf') {
    const kept = (state && state.kept) || [];
    ui.card('His shelf', kept.length ? kept.map((k) => `· ${k}`) : ['The shelf is empty. He has not kept anything yet.'],
      'He decides for himself what is worth keeping.');
  } else if (spot.kind === 'hut') {
    const p = (mind && mind.projects && mind.projects[spot.slug]) || {};
    ui.card(String(p.title || spot.slug), [p.description || 'Something he made.', p.note ? `Last change: ${p.note}` : ''].filter(Boolean),
      p.pages ? 'It is online.' : 'Nobody can see it yet.', p.pages ? { words: 'Open the page', run: () => window.town.open(spot.slug) } : null);
  } else if (spot.kind === 'letter') {
    if (!me.online) { ui.toast('He is asleep. Letters can be posted when he is awake.'); return; }
    const text = await ui.askText({ title: 'A letter for Gilbert', max: 400, rows: 5, go: 'Post it',
      hint: 'It goes in the box and the flag goes up. He finds it when he next looks, and decides whether to keep it. '
        + 'He is told what kind of letter it is and roughly what it is about, not your exact words.' });
    if (!text) return;
    const reply = await window.town.ask({ type: 'letter', text });
    if (reply.ok && reply.letter) me.myLetters.add(reply.letter);
    ui.toast(reply.text || 'Posted.');
  } else if (spot.kind === 'bury') {
    const pick = await ui.askBury((link.welcome && link.welcome.keepsakes) || {});
    if (!pick) return;
    ui.toast((await window.town.ask({ type: 'bury', item: pick.item, note: pick.note })).text || 'Buried.');
  }
}

async function talk() {
  const text = await ui.askText({ title: 'Say something to Gilbert', max: 200, rows: 2, go: 'Say it',
    hint: 'He hears that you spoke and what it was about. He may answer, or not. He is a bird of few words.' });
  if (!text) return;
  const reply = await window.town.ask({ type: 'speak', text });
  ui.toast(reply.text || '');
}

// ---- keys and mouse ---------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.repeat && !['w', 'a', 's', 'd'].includes(e.key.toLowerCase()) && !e.key.startsWith('Arrow')) return;
  if (ui.typing()) { if (e.key === 'Escape') ui.closeAll(); return; }
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'escape') ui.closeAll();
  else if (k === 'j') ui.openPanel('journal');
  else if (k === 'm') ui.openPanel('mind');
  else if (k === 'h' || k === '?') ui.openPanel('help');
  else if (k === 'g') { cam.watch = cam.watch === 'me' || !me.active ? 'gilbert' : 'me'; view.follow = true; }
  else if (k === 'e') { e.preventDefault(); use(inReach().spot); }
  else if (k === 't' || k === 'enter') {
    e.preventDefault();
    if (!me.active) walkIn();
    else if (inReach().talk) talk();
    else if (me.online) ui.toast('Go closer to him first.');
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag[0]) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - drag[1]) * 0.004, 0.08, 1.35);
  drag = [e.clientX, e.clientY];
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 0.89), 3.5, 60); }, { passive: true });

function moveMe(dt) {
  let fx = 0, fz = 0;
  if (!ui.typing()) {
    if (keys.has('w') || keys.has('arrowup')) fz += 1;
    if (keys.has('s') || keys.has('arrowdown')) fz -= 1;
    if (keys.has('d') || keys.has('arrowright')) fx += 1;
    if (keys.has('a') || keys.has('arrowleft')) fx -= 1;
  }
  const before = me.pos.clone();
  if (demo.follow) me.pos.set(kiwi.pos.x + 2.4, kiwi.pos.y + 2.4);      // testing: stay beside him
  if (fx || fz) {
    const len = Math.hypot(fx, fz), run = keys.has('shift') ? 5.6 : 3.3;
    const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
    const vx = (-sin * fz + cos * fx) / len, vz = (-cos * fz - sin * fx) / len;
    me.pos.x += vx * run * dt; me.pos.y += vz * run * dt;
    me.heading = dampAngle(me.heading, Math.atan2(vx, vz), 12, dt);
    cam.watch = 'me';
  }
  const edge = (link.welcome && link.welcome.edge) || 62;
  me.pos.x = clamp(me.pos.x, -edge, edge); me.pos.y = clamp(me.pos.y, -edge, edge);
  const solid = [...places.colliders, ...places.hutColliders, ...land.colliders, { x: kiwi.pos.x, z: kiwi.pos.y, r: 0.6 }];
  for (const c of solid) {                                  // nobody walks through a shed, or a kiwi
    const dx = me.pos.x - c.x, dz = me.pos.y - c.z, far = Math.hypot(dx, dz), min = c.r + 0.4;
    if (far < min && far > 0.0001) { me.pos.x = c.x + dx / far * min; me.pos.y = c.z + dz / far * min; }
  }
  me.speed = damp(me.speed, me.pos.distanceTo(before) / Math.max(dt, 0.001), 10, dt);
  Object.assign(me.figure, { heading: me.heading, speed: me.speed });
  me.figure.pos.copy(me.pos);
  const there = state && state.visitors && state.visitors[me.vid];          // where the town thinks this visitor is
  const behind = there ? Math.hypot(there.pos[0] - me.pos.x, there.pos[1] - me.pos.y) > 0.6 : false;
  if (me.online && clock - me.sent > 0.12 && (me.pos.distanceTo(before) > 0 || behind || clock - me.sent > 2)) {
    me.sent = clock;
    window.town.move([me.pos.x, me.pos.y], ((me.heading * 180 / Math.PI) % 360 + 360) % 360);
  }
}

// ---- every frame ------------------------------------------------------------------------------
let clock = 0, last = performance.now(), frames = 0, fpsAt = 0, fps = 0;
const v3 = new THREE.Vector3();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function frame(ms) {
  requestAnimationFrame(frame);
  if (!settings.smooth && ms - last < 1000 / 30 - 3) return;       // thirty frames a second is plenty for a quiet town
  const dt = Math.min(0.1, (ms - last) / 1000);
  last = ms; clock += dt;
  frames++;
  if (ms - fpsAt > 2000) { fps = Math.round(frames * 1000 / (ms - fpsAt)); frames = 0; fpsAt = ms; if (demo.fps) console.log('FPS', fps); ui.setFps(fps); }

  const night = sky.update((state && state.weather) || 'cloud', camera, dt, clock, demo.sun, (state && state.sky && state.sky.day_minutes) || 0).night;
  ui.beginLabels(camera);
  const city = view.area === 'city', off = city ? cityX() : 0;
  let birdHere = false;
  if (state && state.bird) {
    const where = state.bird.area || 'town';
    if (view.follow && !me.active && (where === 'town' || where === 'city') && where !== view.area) showArea(where);
    birdHere = where === view.area;
    kiwi.root.visible = birdHere;
    const bird = { ...state.bird, pos: [state.bird.pos[0] - off, state.bird.pos[1]] };
    gait = gaitFrom(mind && mind.self, bird.feeling, bird.needs);
    let nearest = null, best = 9;
    for (const r of residents.values()) { const far = r.pos.distanceTo(kiwi.pos); if (far < best) { best = far; nearest = [r.pos.x, r.pos.y]; } }
    for (const o of state.objects || []) {
      const far = Math.hypot(o.pos[0] - kiwi.pos.x, o.pos[1] - kiwi.pos.y);
      if (o.state !== 'buried' && far < best && !city) { best = far; nearest = o.pos; }
    }
    for (const o of others.values()) { const far = o.pos.distanceTo(kiwi.pos); if (far < Math.min(best, 6) && bird.doing === null) { nearest = [o.pos.x, o.pos.y]; } }
    if (me.active && me.online && !bird.doing && me.pos.distanceTo(kiwi.pos) < 6 && bird.said && state.now - bird.said.t < 8) nearest = [me.pos.x, me.pos.y];
    const pose = animateKiwi(kiwi, bird, gait, dt, clock, { city, shedInside: places.shedInside, nearest: bird.doing ? nearest : (nearest && bird.said && state.now - bird.said.t < 8 ? nearest : null) });
    if (birdHere) ui.label('gilbert', 'Gilbert', pose.head, 'name bird');
    const load = (bird.carrying || []).join('|');           // what he is carrying rides on his back
    if (load !== kiwi.load) {
      kiwi.load = load;
      if (kiwi.pack) kiwi.body.remove(kiwi.pack);
      kiwi.pack = new THREE.Group();
      (bird.carrying || []).forEach((name, i) => { const it = itemMesh(name); it.position.set(i ? 0.14 : -0.12, 1.05, -0.12 - i * 0.16); kiwi.pack.add(it); });
      kiwi.body.add(kiwi.pack);
    }
    if (bird.asleep && birdHere) ui.label('zzz', 'z z z', v3.copy(pose.head).setY(pose.head.y + 0.5 + Math.sin(clock) * 0.1), 'sleep');
    if (birdHere && bird.said && state.now - bird.said.t < 9 && !state.offline) ui.label('said', bird.said.text, v3.copy(pose.head).setY(pose.head.y + 0.55), 'speech');

    for (const [key, r] of Object.entries(state.residents || {})) {
      if (!residents.has(key)) { const one = makeResident(key); residents.set(key, one); scene.add(one.root); }
      const one = residents.get(key);
      one.root.visible = inCityPos(r.pos) === city;
      if (!one.root.visible) continue;
      const top = animateResident(one, [r.pos[0] - off, r.pos[1]], dt, clock);
      ui.label(`r:${key}`, r.name, top, 'name');
      if (r.said && state.now - r.said.t < 9 && !state.offline) ui.label(`rs:${key}`, r.said.text, v3.copy(top).setY(top.y + 0.4), 'speech neighbour');
    }
    const seen = new Set();
    for (const [vid, v] of Object.entries(state.visitors || {})) {
      if (vid === me.vid || city) continue;
      seen.add(vid);
      if (!others.has(vid)) { const one = makeVisitor(v.name, false); one.pos.set(v.pos[0], v.pos[1]); others.set(vid, one); scene.add(one.root); }
      const o = others.get(vid);
      const before = o.pos.clone();
      o.pos.x = damp(o.pos.x, v.pos[0], 6, dt); o.pos.y = damp(o.pos.y, v.pos[1], 6, dt);
      o.speed = damp(o.speed, o.pos.distanceTo(before) / Math.max(dt, 0.001), 8, dt);
      o.heading = dampAngle(o.heading, v.heading * Math.PI / 180, 8, dt);
      const top = animateVisitor(o, dt, clock, night);
      ui.label(`v:${vid}`, v.name, top, 'name visitor');
      if (v.said && state.now - v.said.t < 7) ui.label(`vs:${vid}`, v.said.text, v3.copy(top).setY(top.y + 0.35), 'speech visitor');
    }
    for (const [vid, o] of others) if (!seen.has(vid)) { scene.remove(o.root); others.delete(vid); }
    if (city) view.city.update(night, clock); else places.update(state, night, clock);
    ui.setState(state, gait, link);
    ui.setMap(state, view);
  }

  if (me.active) {
    moveMe(dt);
    const top = animateVisitor(me.figure, dt, clock, night);
    ui.label('me', `${me.shownName || me.name} (you)`, top, 'name visitor');
    const mine = state && state.visitors && state.visitors[me.vid];
    if (mine && mine.said && state.now - mine.said.t < 7) ui.label('mysaid', mine.said.text, v3.copy(top).setY(top.y + 0.35), 'speech visitor');
  }
  const reach = inReach();
  ui.setPrompt(me.active, reach, link, state);

  // The camera circles whoever is being watched.
  const focus = cam.watch === 'me' && me.active ? v3.set(me.pos.x, heightAt(me.pos.x, me.pos.y) + 1.3, me.pos.y)
    : birdHere ? v3.set(kiwi.pos.x, heightAt(kiwi.pos.x, kiwi.pos.y) + 0.8, kiwi.pos.y) : v3.set(0, 1, 6);
  cam.target.x = damp(cam.target.x, focus.x, 6, dt); cam.target.y = damp(cam.target.y, focus.y, 6, dt); cam.target.z = damp(cam.target.z, focus.z, 6, dt);
  if (!drag && cam.watch === 'gilbert' && !me.active) cam.yaw += dt * 0.02;       // a slow drift while only watching
  const flat = Math.cos(cam.pitch) * cam.dist;
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * flat, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * flat);
  camera.position.y = Math.max(camera.position.y, heightAt(camera.position.x, camera.position.z) + 0.7);
  camera.lookAt(cam.target);
  ui.endLabels();
  renderer.render(scene, camera);
}

if (demo.look) { const [yaw, pitch, dist] = demo.look.split(',').map(Number); Object.assign(cam, { yaw, pitch, dist }); }
ui.setLink(await window.town.link());
await refreshMind();
if (demo.at) { if (!me.name) me.name = 'Tester'; await walkIn(); const [x, z] = demo.at.split(',').map(Number); me.pos.set(x, z); }
if (query.get('area') === 'city') { view.follow = false; showArea('city'); }
if (demo.panel) ui.openPanel(demo.panel);
requestAnimationFrame(frame);
