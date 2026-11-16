import data from './data.js';

let onState = null;
const link = { mode: 'asleep', role: 'none', practice: false, welcome: null, web: true, asOf: data.asOf };
window.town = {
  onState: (fn) => { onState = fn; setTimeout(() => fn(structuredClone(data.view)), 0); },
  onLink: () => {},
  link: async () => link,
  ask: async () => ({ ok: false, text: 'This page is only a picture of the town. Nothing here reaches him.' }),
  move: () => {},
  mind: async () => data.mind,
  settings: async () => ({ name: 'Visitor', gpu: '', gpuNow: 'web', smooth: true, sharp: true, web: true }),
  restart: async () => {},
  open: async (slug) => { window.open(slug ? `../${encodeURIComponent(slug)}/` : '../', '_blank', 'noopener'); return true; },
};
await import('./app.js');
