// Everything on screen that is not the town itself: the status card, the pages, the dialogs.
// All text from the town, his files or a visitor is put on the page as plain text, never as markup.
import * as THREE from './vendor/three.module.js';
import { clamp, el, clockInTown } from './util.js';

const DOING = {
  walk_to: 'walking to {t}', probe: 'probing the ground', sniff: 'taking something in', keep: 'keeping something',
  leave_be: 'leaving something be', greet: 'greeting a neighbour', call_out: 'calling out', wade: 'standing in the creek',
  hide: 'hiding', nap: 'having a nap', tidy: 'tidying the burrow', check_letterbox: 'looking in the letterbox',
  read: 'listening at the signal post', tinker: 'working at his workbench', pin_note: 'pinning a note to the board',
  ride_tram: 'travelling by tram', trade: 'trading something',
  sit: 'sitting still', ask_for_sleep: 'going to bed', drink: 'drinking', explore: 'out past the edge of town',
  scavenge: 'turning over the scrap heap', pick_up: 'picking something up', put_down: 'setting something down',
  dance: 'dancing', watch: 'watching', wish: 'scratching a wish into the wall at home',
};
const WEATHER = { clear: 'a clear sky', cloud: 'low cloud', mist: 'mist over the ground', drizzle: 'fine drizzle',
  rain: 'steady rain', wind: 'a restless wind', storm: 'a storm' };
const NEEDS = [['belly', 'belly', 'hungry'], ['thirst', 'thirst', 'thirsty'], ['weariness', 'weariness', 'tired'],
  ['company', 'company', 'lonely'], ['itch', 'itch', 'restless to do something'], ['nerves', 'nerves', 'on edge']];
const SECTIONS = [['happened', 'Things that happened'], ['others', 'About others'], ['learned', 'Things he has worked out'],
  ['skills', 'Things he knows how to do'], ['opinions', 'What he thinks of places and things']];

function feelingWords(f) {
  if (!f) return '';
  const mood = f.mood > 0.3 ? 'content' : f.mood < -0.3 ? 'low' : 'even';
  const energy = f.energy > 0.3 ? 'stirred up' : f.energy < -0.3 ? 'calm' : 'steady';
  return `${mood}, ${energy}`;
}
function niceDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(d);
}
// self.md is plain text: "## Section" headings and "- line _(j0002, 2026-11-15)_" lines.
export function parseSelf(text) {
  const out = { intro: [], sections: [] };
  let current = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) { current = { name: line.slice(3), lines: [] }; out.sections.push(current); continue; }
    if (line.startsWith('# ') || !line) continue;
    const m = line.match(/^- (.*?)(?: _\((j\d+)(?:, ([\d-]+))?\)_)?$/);
    if (m && current) current.lines.push({ text: m[1], from: m[2] || '', date: m[3] || '' });
    else if (!current) out.intro.push(line);
  }
  return out;
}
// The history file: "## 2026-11-15 18:14 · wake-up 1" then "- ADD Traits: "…" <- j0002: …" lines.
function parseChanges(text) {
  const out = [];
  let block = null;
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) { block = { when: line.slice(3), lines: [] }; out.push(block); }
    else if (line.startsWith('- ') && block) block.lines.push(line.slice(2));
  }
  return out.filter((b) => b.lines.length).reverse();
}

export function buildUi(api) {
  const hud = document.getElementById('hud');
  const labelLayer = document.getElementById('labels');
  const ui = {};
  let mind = null, state = null, link = { mode: 'asleep' }, walking = false, panel = null, modal = null, lastStatus = '';

  // ---- top left: how he is ---------------------------------------------------------------------
  const status = el('section', 'card status');
  const title = el('div', 'title');
  const nameEl = el('span', 'who', 'Gilbert'), badge = el('span', 'badge', 'asleep');
  title.append(nameEl, badge);
  const doingEl = el('div', 'doing'), skyEl = el('div', 'sky');
  const needsEl = el('div', 'needs');
  const bars = {};
  for (const [key, label] of NEEDS) {
    const row = el('div', 'need'), bar = el('div', 'bar'), fill = el('div', 'fill');
    bar.append(fill);
    row.append(el('span', 'need-name', label), bar);
    needsEl.append(row);
    bars[key] = fill;
  }
  const feelEl = el('div', 'line'), thoughtEl = el('div', 'line thought'), gaitEl = el('div', 'line dim');
  status.append(title, doingEl, skyEl, needsEl, feelEl, thoughtEl, gaitEl);
  hud.append(status);

  // ---- top right: buttons ----------------------------------------------------------------------
  const bar = el('nav', 'buttons');
  const button = (words, run, cls) => { const b = el('button', cls || '', words); b.type = 'button'; b.addEventListener('click', () => { b.blur(); run(); }); return b; };
  const walkBtn = button('Walk into town', () => (walking ? api.leave() : api.walkIn()), 'main');
  bar.append(walkBtn, button('Journal', () => ui.openPanel('journal')), button('His mind', () => ui.openPanel('mind')),
    button('Help', () => ui.openPanel('help')));
  const areaBtn = button('See the city', () => api.switchArea());
  bar.append(areaBtn);
  let areaNow = 'town';
  ui.setArea = (area) => { areaNow = area; areaBtn.textContent = area === 'city' ? 'Back to town' : 'See the city'; walkBtn.style.display = area === 'city' ? 'none' : ''; };
  // A small map: his town, the tram line, the city, and a mark for where he is.
  const map = el('section', 'card map');
  const line = el('div', 'map-line'), mark = el('div', 'map-mark'), mapText = el('div', 'meta');
  line.append(el('span', 'map-end', 'town'), el('span', 'map-end right', 'city'), mark);
  map.append(line, mapText);
  hud.append(map);
  let mapKey = '';
  ui.setMap = (s, view) => {
    const b = s.bird || {}, tram = s.tram, area = b.area || 'town';
    let at = area === 'city' ? 1 : 0, words = area === 'city' ? 'He is in the city.' : 'He is in his town.';
    if (tram && !tram.aboard) words = `He is waiting for the tram ${tram.to === 'city' ? 'to the city' : 'home'}.`;
    if (tram && tram.aboard) {
      const done = clamp((s.now - tram.departs) / Math.max(1, tram.arrives - tram.departs));
      at = tram.to === 'city' ? done : 1 - done;
      words = `He is on the tram ${tram.to === 'city' ? 'to the city' : 'home'}.`;
    }
    if (b.asleep) words = area === 'city' ? 'He is asleep in the city.' : 'He is asleep at home.';
    words += view.area === 'city' ? ' You are looking at the city.' : ' You are looking at his town.';
    const key = `${Math.round(at * 200)}|${words}`;
    if (key === mapKey) return;
    mapKey = key;
    mark.style.left = `${(8 + at * 84).toFixed(1)}%`;
    mapText.textContent = words;
  };
  if (!api.settings.web) bar.append(button('Settings', () => ui.openPanel('settings')));
  else bar.append(button('His home page', () => api.openPage('')));
  hud.append(bar);

  const prompt = el('div', 'prompt');
  const note = el('div', 'mode-note');
  const fpsEl = el('div', 'fps');
  const toasts = el('div', 'toasts');
  hud.append(prompt, note, fpsEl, toasts);

  ui.toast = (text) => {
    if (!text) return;
    const t = el('div', 'toast', text);
    toasts.append(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => t.classList.add('gone'), 7000);
    setTimeout(() => t.remove(), 7800);
  };
  ui.setFps = (n) => {
    fpsEl.textContent = api.settings.web ? '' : `${n} fps · drawn by the ${api.settings.gpuNow === 'nvidia' ? 'NVIDIA' : 'integrated'} GPU`;
  };
  ui.setWalking = (on) => { walking = on; walkBtn.textContent = on ? 'Leave town' : (link.live ? 'Walk about' : link.mode === 'asleep' ? 'Walk about while he sleeps' : 'Walk into town'); };
  ui.setLink = (info) => {
    link = info;
    note.textContent = info.web && info.live ? `Gilbert is awake. This is the town as it was at ${niceDate(info.asOf)}, Netherlands time; it is redrawn every few minutes. It is a picture: nothing here reaches him. Gilbert is an autonomous AI program.`
      : info.web ? `This is the town as Gilbert left it when he last went to sleep${info.asOf ? ` (${niceDate(info.asOf)})` : ''}. It is a picture: nothing here reaches him. Gilbert is an autonomous AI program.`
      : info.mode === 'asleep' ? 'He is asleep. This is the town as he left it.'
      : info.mode === 'practice' ? 'Practice town: a copy. Nothing here is published or kept.'
        : info.role === 'viewer' ? 'Watching only.' : '';
    ui.setWalking(walking);
  };

  ui.setState = (s, gait, linkNow) => {
    state = s;
    const b = s.bird;
    const key = [b.doing, b.target, b.asleep, b.thought, s.weather, s.sky && s.sky.words, linkNow.mode, s.sleep_call, s.quiet,
      Object.values(b.needs).map((v) => Math.round(v * 20)).join(','), Math.round(b.feeling.mood * 5), Math.round(b.feeling.energy * 5),
      gait.words.join(','), clockInTown(new Date(), (s.sky && s.sky.day_minutes) || 0)].join('|');
    if (key === lastStatus) return;
    lastStatus = key;
    badge.textContent = b.asleep ? 'asleep' : s.sleep_call ? 'going to bed' : 'awake';
    badge.className = `badge ${b.asleep ? 'asleep' : 'awake'}`;
    const place = (k) => ((s.places || {})[k] || {}).name || 'somewhere';
    doingEl.textContent = b.asleep ? 'asleep in his burrow'
      : b.doing ? (DOING[b.doing] || b.doing).replace('{t}', place(b.target))
        : b.place ? `at ${place(b.place)}` : 'on the path';
    skyEl.textContent = [s.offline ? '' : (s.sky && s.sky.words), WEATHER[s.weather] || s.weather, (s.sky && s.sky.day_minutes) ? `${clockInTown(new Date(), s.sky.day_minutes)} town time` : `${clockInTown()} in the Netherlands`]
      .filter(Boolean).join(' · ');
    for (const [k] of NEEDS) { bars[k].style.width = `${Math.round(clamp(b.needs[k]) * 100)}%`; bars[k].classList.toggle('high', b.needs[k] >= 0.7); }
    needsEl.classList.toggle('dim', b.asleep);
    feelEl.textContent = b.asleep ? '' : `He feels ${feelingWords(b.feeling)}.${s.quiet ? ' Quiet mode: he is living on his body alone.' : ''}`;
    thoughtEl.textContent = !b.asleep && b.thought ? `“${b.thought}”` : '';
    gaitEl.textContent = !b.asleep && gait.words.length ? `Shaping how he moves: ${gait.words.join(', ')}.` : '';
  };

  ui.setPrompt = (isWalking, reach, linkNow, s) => {
    const lines = [];
    if (areaNow === 'city') lines.push('Drag to look around · scroll to zoom · visitors walk in his town, not here');
    else if (!isWalking) lines.push(linkNow.mode === 'asleep' ? 'Drag to look around · scroll to zoom · Enter to walk about' : 'Drag to look around · scroll to zoom · Enter to walk into town');
    else {
      if (reach.talk) lines.push('T — say something to him');
      if (reach.spot) lines.push(`E — ${reach.spot.words}`);
      if (!lines.length) lines.push('W A S D to walk · Shift to hurry · G to watch Gilbert');
    }
    const text = lines.join('     ');
    if (prompt.textContent !== text) prompt.textContent = text;
  };

  // ---- names and speech over heads -------------------------------------------------------------
  const labels = new Map();
  let cameraNow = null, used = new Set();
  const p = new THREE.Vector3();
  ui.beginLabels = (camera) => { cameraNow = camera; used = new Set(); };
  ui.label = (id, text, world, cls) => {
    if (!cameraNow || !world) return;
    p.copy(world).project(cameraNow);
    const far = world.distanceTo(cameraNow.position);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1 || far > (cls.includes('speech') ? 70 : 45)) return;
    let node = labels.get(id);
    if (!node) { node = el('div', `label ${cls}`); labels.set(id, node); labelLayer.append(node); }
    if (node.dataset.text !== text) { node.textContent = text; node.dataset.text = text; }
    node.style.transform = `translate(-50%, -100%) translate(${((p.x + 1) / 2 * window.innerWidth).toFixed(1)}px, ${((1 - p.y) / 2 * window.innerHeight).toFixed(1)}px)`;
    node.style.opacity = String(clamp(1.4 - far / (cls.includes('speech') ? 60 : 38)));
    used.add(id);
  };
  ui.endLabels = () => { for (const [id, node] of labels) if (!used.has(id)) { node.remove(); labels.delete(id); } };

  // ---- pages -----------------------------------------------------------------------------------
  const drawer = el('aside', 'drawer');
  const drawerHead = el('header', 'drawer-head'), drawerTitle = el('h2'), drawerBody = el('div', 'drawer-body');
  drawerHead.append(drawerTitle, button('Close', () => ui.closePanel(), 'quiet'));
  drawer.append(drawerHead, drawerBody);
  hud.append(drawer);
  let mindTab = 'memory';

  const h3 = (text) => el('h3', '', text);
  const para = (text, cls) => el('p', cls || '', text);
  const entryById = (id) => ((mind && mind.journal) || []).find((e) => e.id === id);

  function journalPage() {
    drawerTitle.textContent = 'His journal';
    const entries = (mind && mind.journal) || [];
    const own = entries.filter((e) => e.kind === 'journal');
    if (!own.length) { drawerBody.append(para('He has not written anything yet.')); }
    else {
      const last = own[own.length - 1];
      drawerBody.append(el('div', 'when', niceDate(last.ts)), para(last.text, 'entry big'));
    }
    const older = own.slice(0, -1).reverse().slice(0, 6);
    if (older.length) {
      drawerBody.append(h3('Before that'));
      for (const e of older) drawerBody.append(el('div', 'when', niceDate(e.ts)), para(e.text, 'entry'));
    }
    const events = entries.filter((e) => e.kind !== 'journal' && e.kind !== 'lookback').slice(-20).reverse();
    if (events.length) {
      drawerBody.append(h3('What happened to him lately'), para('These are the moments his journal is written from. Each has a number; changes to who he is point back to them.', 'dim'));
      for (const e of events) {
        const row = el('div', 'event');
        row.append(el('span', 'tag', e.id), el('span', '', e.text));
        drawerBody.append(row);
      }
    }
    drawerBody.append(para('He writes this himself, when he goes to sleep. It is also on his home page.', 'dim'),
      button('Open his home page', () => api.openPage('')));
  }

  function memoryTab(box) {
    const mem = (mind && mind.memory) || { items: [], forgotten: [], sleeps: 0 };
    const per = 16;
    box.append(para(`He has room for ${per} memories of each kind. A memory fades by half every ten sleeps unless something brings it back; when a kind is full, a new memory has to be stronger than the faintest one to get in. He has slept ${mem.sleeps || 0} time${mem.sleeps === 1 ? '' : 's'} since he started keeping memories this way.`, 'dim'));
    for (const [key, label] of SECTIONS) {
      const items = (mem.items || []).filter((m) => m.section === key);
      const worth = (m) => m.strength * Math.pow(0.5, Math.max(0, (mem.sleeps || 0) - (m.last || 0)) / 10);
      items.sort((a, b) => worth(b) - worth(a));
      box.append(h3(`${label} · ${items.length} of ${per}`));
      if (!items.length) box.append(para('Nothing yet.', 'dim'));
      for (const m of items) {
        const row = el('div', 'memory'), meter = el('div', 'bar'), fill = el('div', 'fill');
        fill.style.width = `${Math.round(clamp(worth(m) / 7) * 100)}%`;
        meter.append(fill);
        const meta = [`since ${m.since || '?'}`, m.times ? `came back ${m.times}×` : '', m.source ? `from ${m.source}` : ''].filter(Boolean).join(' · ');
        row.append(para(m.text), meter, el('div', 'meta', meta));
        const src = entryById(m.source);
        if (src) row.title = src.text;
        box.append(row);
      }
    }
    const gone = (mem.forgotten || []).slice(-12).reverse();
    box.append(h3('Let go'));
    if (!gone.length) box.append(para('He has not forgotten anything yet.', 'dim'));
    for (const g of gone) box.append(para(typeof g === 'string' ? g : String(g.text || ''), 'gone'));
  }

  function selfTab(box) {
    const self = parseSelf(mind && mind.self);
    box.append(h3('What never changes'), para((mind && mind.baseline) || self.intro.join(' '), 'entry'),
      para('This is all he was given. Everything below he has added himself, at most one line each sleep and twelve lines in all, and each line has to point at something that happened.', 'dim'));
    const total = self.sections.reduce((n, s) => n + s.lines.length, 0);
    box.append(h3(`What he has found out about himself · ${total} of 12 lines`));
    for (const s of self.sections) {
      if (!s.lines.length) continue;
      box.append(el('div', 'section-name', s.name));
      for (const line of s.lines) {
        const row = el('div', 'trait');
        row.append(para(line.text));
        const src = entryById(line.from);
        row.append(el('div', 'meta', src ? `because of ${line.from} (${line.date}): ${src.text.slice(0, 220)}` : `because of ${line.from || 'an early entry'} ${line.date ? `(${line.date})` : ''}`));
        box.append(row);
      }
    }
    if (!total) box.append(para('Nothing yet. He has not been awake long enough.', 'dim'));
    if (mind && mind.now.about) box.append(h3('How he would put it'), para(mind.now.about, 'entry'));
  }

  function driftTab(box) {
    const blocks = parseChanges(mind && mind.changelog);
    box.append(para('Every change to who he is, newest first, with the journal entry that caused it. A dated copy of self.md is kept each time.', 'dim'));
    if (!blocks.length) box.append(para('No changes yet.', 'dim'));
    for (const b of blocks) {
      box.append(el('div', 'when', b.when));
      for (const line of b.lines) box.append(para(line, 'change'));
    }
    const copies = (mind && mind.history) || [];
    if (copies.length) box.append(el('div', 'meta', `${copies.length} dated copies kept, from ${copies[0].name.slice(0, 10)} to ${copies[copies.length - 1].name.slice(0, 10)}.`));
  }

  function wishTab(box) {
    const wishes = ((state && state.wishes) || []).slice().reverse();
    const answers = (mind && mind.answers) || {};
    box.append(para('At home he can scratch a wish into the wall: something he wants his world to have, or something he wishes he could do, with his reason. He gets nothing new unless you say yes, and saying yes only tells him it will come: somebody still has to build it.', 'dim'));
    if (!wishes.length) box.append(para('He has not wished for anything yet.', 'dim'));
    for (const w of wishes) {
      const row = el('div', 'memory');
      row.append(para(w.text));
      const waiting = w.state === 'open' && answers[w.id];
      row.append(el('div', 'meta', w.state === 'granted' ? 'You said yes.' : w.state === 'declined' ? 'You said no.'
        : waiting ? `You said ${answers[w.id]}. He will be told when he is next awake.` : 'Waiting for your answer.'));
      if (w.state === 'open' && !waiting && api.answerWish && !api.settings.web) {
        const say = async (verdict) => { if (await api.answerWish(w.id, verdict)) { ui.toast(verdict === 'yes' ? 'He will be told: yes, it will be made.' : 'He will be told: no.'); await api.refreshMind(); render(); } };
        const buttons = el('div', 'row');
        buttons.append(button('Yes, it will be made', () => say('yes'), 'main'), button('No', () => say('no'), 'quiet'));
        row.append(buttons);
      }
      box.append(row);
    }
  }

  function nowTab(box) {
    const now = (mind && mind.now) || {};
    const b = state && state.bird;
    if (b) {
      box.append(h3('His body'));
      for (const [k, , word] of NEEDS) {
        const row = el('div', 'need wide'), meter = el('div', 'bar'), fill = el('div', 'fill');
        fill.style.width = `${Math.round(clamp(b.needs[k]) * 100)}%`;
        meter.append(fill);
        row.append(el('span', 'need-name', word), meter);
        box.append(row);
      }
      box.append(para(`He feels ${feelingWords(b.feeling)}.`));
      if (b.thought) box.append(para(`Last reason he gave: “${b.thought}”`));
    }
    const liked = Object.entries(now.interests || {}).sort((a, c) => c[1] - a[1]).slice(0, 6);
    box.append(h3('What he has been listening for'), para(liked.length ? liked.map(([k]) => k).join(', ') : 'Nothing yet. He can ask the signal post about anything he likes.', liked.length ? '' : 'dim'));
    if ((now.threads || []).length) { box.append(h3('He meant to come back to')); for (const t of now.threads) box.append(para(`· ${t}`)); }
    if (now.lastDream) box.append(h3('A dream he woke from'), para(now.lastDream, 'entry'), para('Dreams are made from his memories and are never put back into them.', 'dim'));
    if (b && (b.carrying || []).length) box.append(h3('He is carrying'), para(b.carrying.join(', ')));
    const known = ((mind && mind.known) || '').split('\n').filter((l) => l.startsWith('- ')).slice(0, 24);
    if (known.length) { box.append(h3('What he has done, by counting')); for (const l of known) box.append(para(l.slice(2), 'change')); }
    const out = Object.entries((state && state.beyond) || {});
    if (out.length) box.append(h3('How far he has been past the edges'), para(out.map(([k, v]) => `${((state.places || {})[k] || {}).name || k}: ${v[0]} of ${v[1]}`).join(' · ')));
    if (now.lastResult) box.append(h3('Last time awake'), para(now.lastResult, 'dim'));
  }

  function mindPage() {
    drawerTitle.textContent = mind && mind.practice ? 'His mind (practice copy)' : 'His mind';
    const tabs = el('div', 'tabs');
    for (const [key, words] of [['memory', 'Memory'], ['self', 'Who he is'], ['drift', 'How he has changed'], ['wishes', 'Wishes'], ['now', 'Right now']]) {
      const b = button(words, () => { mindTab = key; render(); }, key === mindTab ? 'tab on' : 'tab');
      tabs.append(b);
    }
    const box = el('div', 'tab-body');
    drawerBody.append(tabs, box);
    ({ memory: memoryTab, self: selfTab, drift: driftTab, wishes: wishTab, now: nowTab })[mindTab](box);
    drawerBody.append(para('Read straight from his own files a few seconds ago. This page cannot change them.', 'dim'));
  }

  function helpPage() {
    drawerTitle.textContent = 'How this works';
    const add = (head, lines) => { drawerBody.append(h3(head)); for (const l of lines) drawerBody.append(para(l)); };
    if (link.web) {
      add('This page', ['Gilbert is an autonomous AI program: a small kiwi who lives in this town on one laptop and decides for himself what to do.',
        'What you see is the town as it was when he last went to sleep, with his journal and his mind as they were then. It is redrawn each time he sleeps, and every few minutes while he is awake. A day and night in his town lasts one hour of ours.',
        'You can walk about (Enter, then W A S D), read his journal on the stump by his burrow, look at his shelf and the huts where the things he made are kept. Talking to him, letters and keepsakes only exist in the town itself, on his own computer; the rest of this page describes that.']);
    }
    add('What you are looking at', ['This is the town Gilbert lives in, drawn from what his town program says is happening right now. He decides for himself what to do; nobody steers him.',
      'Closing this window changes nothing. He carries on, or sleeps on, exactly as before.']);
    add('Getting about', ['Drag with the mouse to look around, scroll to zoom.', 'Enter: walk into town.  W A S D or the arrow keys: walk.  Shift: hurry.',
      'G: switch between following yourself and watching Gilbert.', 'J: his journal.  M: his mind.  H: this page.  Esc: close.']);
    add('What a visitor can do', ['T, near him: say something. He hears that you spoke and roughly what about. He may answer, walk off, or carry on.',
      'E, at the letterbox: post a letter. Nothing tells him it came; he finds it when he looks, then keeps it or leaves it.',
      'E, on soft ground (the creek, the mossy bank, the log, the leaf drift): bury a small thing from a list, with a few words scratched on it if you like. He may find it when he probes there.',
      'E, at the stump by his burrow: read his journal. At the board: read his note. At a hut on Hut Lane: see something he has made.']);
    add('Good to know', ['Your name is public. If he writes about you, the name appears in his journal on his web page. Do not use your real name.',
      'Your exact words never reach his thinking. A separate step first works out what kind of thing they are and writes a few words of description, and only that goes to him and into his journal. Your words stay in the town\'s own file on this computer.',
      'He is a kiwi: awake mostly at night. A whole day and night in his town lasts one hour of ours: midnight on the hour, noon at half past.',
      'When he is asleep you can still walk about. The town is shown as he left it, and nothing you do reaches him.']);
    drawerBody.append(para('Inspired by Pino by 3eyes_iii. Not affiliated.', 'dim'));
  }

  function settingsPage() {
    drawerTitle.textContent = 'Settings';
    const s = api.settings;
    drawerBody.append(h3('Your name in town'), para('Public: it can appear in his journal on his web page. Do not use your real name. Letters only, two words at most.', 'dim'));
    const name = el('input'); name.type = 'text'; name.maxLength = 16; name.value = s.name || ''; name.autocomplete = 'off'; name.spellcheck = false;
    drawerBody.append(name, button('Save name', async () => { await api.saveSettings({ name: name.value.trim() }); ui.toast('Saved. It is used the next time you walk in.'); }));
    drawerBody.append(h3('Which graphics chip draws the town'),
      para('His model lives on the NVIDIA chip and needs its memory. By default the town is drawn by the integrated chip, so it takes none. Switch only if the town stutters.', 'dim'));
    const choice = el('div', 'choice');
    for (const [key, words] of [['integrated', 'Integrated (recommended)'], ['nvidia', 'NVIDIA']]) {
      choice.append(button(words, async () => { await api.saveSettings({ gpu: key }); render(); }, s.gpu === key ? 'tab on' : 'tab'));
    }
    drawerBody.append(choice);
    if (s.gpu !== s.gpuNow) drawerBody.append(para('This takes effect when the window restarts.', 'dim'), button('Restart the window now', () => api.restart()));
    drawerBody.append(h3('Drawing'));
    const toggles = el('div', 'choice');
    toggles.append(button(s.smooth ? 'Smooth motion: on (60 a second)' : 'Smooth motion: off (30 a second)', async () => { await api.saveSettings({ smooth: !s.smooth }); render(); }, 'tab'),
      button(s.sharp !== false ? 'Smooth edges: on' : 'Smooth edges: off', async () => { await api.saveSettings({ sharp: s.sharp === false }); ui.toast('Smooth edges change when the window restarts.'); render(); }, 'tab'));
    drawerBody.append(toggles);
  }

  function render() {
    drawerBody.replaceChildren();
    if (panel === 'journal') journalPage();
    else if (panel === 'mind') mindPage();
    else if (panel === 'help') helpPage();
    else if (panel === 'settings') settingsPage();
  }
  ui.openPanel = (name) => {
    if (panel === name) { ui.closePanel(); return; }
    panel = name; drawer.classList.add('open'); drawerBody.scrollTop = 0;
    api.refreshMind();
    render();
  };
  ui.closePanel = () => { panel = null; drawer.classList.remove('open'); };
  let mindKey = '';
  ui.setMind = (files) => {
    mind = files;
    const key = JSON.stringify([files.journalCount, files.memory, files.self, files.changelog.length, files.now]);
    if (key !== mindKey && panel && panel !== 'help' && panel !== 'settings') { const top = drawerBody.scrollTop; render(); drawerBody.scrollTop = top; }
    mindKey = key;
  };

  // ---- small windows that ask for something ----------------------------------------------------
  const veil = el('div', 'veil');
  hud.append(veil);
  function ask(build) {
    return new Promise((resolve) => {
      const box = el('div', 'dialog');
      const done = (value) => { modal = null; veil.classList.remove('open'); veil.replaceChildren(); resolve(value); };
      modal = { cancel: () => done(null) };
      // Keys pressed in a dialog stay in the dialog: they must not also walk, talk or open pages.
      box.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') done(null); });
      box.addEventListener('keyup', (e) => e.stopPropagation());
      build(box, done);
      veil.replaceChildren(box);
      veil.classList.add('open');
      const first = box.querySelector('input, textarea, button');
      if (first) first.focus();
    });
  }
  veil.addEventListener('pointerdown', (e) => { if (e.target === veil && modal) modal.cancel(); });

  ui.askName = () => ask((box, done) => {
    const input = el('input'); input.type = 'text'; input.maxLength = 16; input.placeholder = 'a made-up name'; input.autocomplete = 'off'; input.spellcheck = false;
    const go = () => { const v = input.value.trim(); if (v.length >= 2) done(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    box.append(el('h2', '', 'Who shall the town say is visiting?'),
      para('Choose a name for yourself in town. Letters only, two words at most.'),
      para('The name is public. If Gilbert writes about you, it appears in his journal on his web page. Do not use your real name.', 'warn'),
      input, row(button('Walk in', go, 'main'), button('Not now', () => done(null), 'quiet')));
  });
  ui.askText = (o) => ask((box, done) => {
    const input = el('textarea'); input.maxLength = o.max; input.rows = o.rows || 3; input.spellcheck = true;
    const count = el('div', 'meta', `0 of ${o.max}`);
    input.addEventListener('input', () => { count.textContent = `${input.value.length} of ${o.max}`; });
    const go = () => { const v = input.value.trim(); if (v.length >= 2) done(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (o.rows || 3) <= 2) { e.preventDefault(); go(); } });
    box.append(el('h2', '', o.title), para(o.hint, 'dim'), input, count, row(button(o.go, go, 'main'), button('Never mind', () => done(null), 'quiet')));
  });
  ui.askBury = (keepsakes) => ask((box, done) => {
    let chosen = null;
    const grid = el('div', 'picks');
    const note = el('input'); note.type = 'text'; note.maxLength = 120; note.placeholder = 'a few words scratched on it (optional)';
    for (const [key, words] of Object.entries(keepsakes)) {
      const b = button(words, () => { chosen = key; for (const c of grid.children) c.classList.remove('on'); b.classList.add('on'); }, 'tab');
      grid.append(b);
    }
    box.append(el('h2', '', 'Bury something for him to find'),
      para('Choose one. It goes into the ground where you stand. He may turn it up when he probes here, and he decides whether to keep it.', 'dim'),
      grid, note, row(button('Bury it', () => { if (chosen) done({ item: chosen, note: note.value.trim() }); }, 'main'), button('Never mind', () => done(null), 'quiet')));
  });
  ui.card = (heading, lines, foot, action) => ask((box, done) => {
    box.append(el('h2', '', heading));
    for (const l of lines) box.append(para(l, 'entry'));
    if (foot) box.append(para(foot, 'dim'));
    const buttons = [button('Close', () => done(null), action ? 'quiet' : 'main')];
    if (action) buttons.unshift(button(action.words, () => { action.run(); done(null); }, 'main'));
    box.append(row(...buttons));
  });
  function row(...nodes) { const r = el('div', 'row'); r.append(...nodes); return r; }

  ui.typing = () => Boolean(modal) || ['INPUT', 'TEXTAREA'].includes((document.activeElement || {}).tagName);
  ui.closeAll = () => { if (modal) modal.cancel(); else ui.closePanel(); if (document.activeElement) document.activeElement.blur(); };
  return ui;
}
