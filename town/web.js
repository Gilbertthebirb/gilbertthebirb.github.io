import data from './data.js';

let now = data, onState = null, onLink = null;
const describe = () => ({ mode: 'asleep', role: 'none', practice: false, welcome: null, web: true, live: Boolean(now.live), asOf: now.asOf });
window.town = {
  onState: (fn) => { onState = fn; setTimeout(() => fn(structuredClone(now.view)), 0); },
  onLink: (fn) => { onLink = fn; },
  link: async () => describe(),
  ask: async () => ({ ok: false, text: 'This page is only a picture of the town. Nothing here reaches him.' }),
  move: () => {},
  mind: async () => now.mind,
  settings: async () => ({ name: 'Visitor', gpu: '', gpuNow: 'web', smooth: true, sharp: true, web: true }),
  restart: async () => {},
  open: async (slug) => { window.open(slug ? `../${encodeURIComponent(slug)}/` : '../', '_blank', 'noopener'); return true; },
};
// While he is awake the picture is redrawn every few minutes. Look for a newer one now and then.
setInterval(async () => {
  if (document.hidden) return;
  try {
    const fresh = (await import(`./data.js?at=${Math.floor(Date.now() / 60000)}`)).default;
    if (fresh.asOf === now.asOf) return;
    now = fresh;
    if (onLink) onLink(describe());
    if (onState) onState(structuredClone(now.view));
  } catch { /* offline, or between two versions: try again next time */ }
}, 90000);
await import('./app.js');
