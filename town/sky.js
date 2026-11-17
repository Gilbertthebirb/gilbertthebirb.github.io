// Sky, light and weather. Day and night follow the Dutch sun, at the hours of the clock his town follows.
import * as THREE from './vendor/three.module.js';
import { clamp, lerp, smooth, seeded, sunNow } from './util.js';
import { SPOTS, heightAt } from './land.js';

const C = (hex) => new THREE.Color(hex);
const TOP_NIGHT = C(0x0a1228), TOP_DAY = C(0x4f9be0), LOW_NIGHT = C(0x1c2a44), LOW_DAY = C(0xbfe2f4),
  GLOW = C(0xf2955a), GREY = C(0x8f9aa6), GREY_NIGHT = C(0x202a38);
const WEATHER = {
  clear: { cloud: 0, rain: 0, mist: 0, wind: 0.1 }, cloud: { cloud: 0.6, rain: 0, mist: 0, wind: 0.2 },
  mist: { cloud: 0.4, rain: 0, mist: 1, wind: 0 }, drizzle: { cloud: 0.8, rain: 0.3, mist: 0.2, wind: 0.2 },
  rain: { cloud: 1, rain: 1, mist: 0.15, wind: 0.4 }, wind: { cloud: 0.4, rain: 0, mist: 0, wind: 1 },
  storm: { cloud: 1, rain: 1.6, mist: 0.1, wind: 1 },
};

export function buildSky(scene) {
  const s = { cloud: 0, rain: 0, mist: 0, wind: 0, flash: 0, night: 0 };

  // The dome: one colour overhead, another at the horizon, blended by height.
  const domeGeo = new THREE.SphereGeometry(520, 24, 12);
  const domeColors = new Float32Array(domeGeo.attributes.position.count * 3);
  domeGeo.setAttribute('color', new THREE.BufferAttribute(domeColors, 3));
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  scene.add(dome);
  const top = new THREE.Color(), low = new THREE.Color(), tmp = new THREE.Color();
  let domeKey = '';
  const paintDome = () => {
    const key = top.getHexString() + low.getHexString();
    if (key === domeKey) return;
    domeKey = key;
    const pos = domeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const h = clamp(pos.getY(i) / 520);
      tmp.copy(low).lerp(top, Math.pow(h, 0.55));
      domeColors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    domeGeo.attributes.color.needsUpdate = true;
  };

  const rnd = seeded(0.913);
  const starPos = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const a = rnd() * Math.PI * 2, e = Math.asin(0.06 + rnd() * 0.94);
    starPos.set([Math.cos(a) * Math.cos(e) * 480, Math.sin(e) * 480, Math.sin(a) * Math.cos(e) * 480], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  stars.renderOrder = -9;
  scene.add(stars);

  const disc = (radius, color) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, depthWrite: false }));
    m.renderOrder = -8;
    scene.add(m);
    return m;
  };
  const sun = disc(16, 0xfff0c0), moon = disc(11, 0xe8eef8);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1);
  const beam = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, beam, beam.target);
  scene.fog = new THREE.Fog(0x8fb8d8, 60, 200);

  // Rain: short streaks in a box that follows the camera.
  const DROPS = 900;
  const rainPos = new Float32Array(DROPS * 6), rainSeed = new Float32Array(DROPS * 3);
  for (let i = 0; i < DROPS; i++) rainSeed.set([rnd() * 60 - 30, rnd() * 26, rnd() * 60 - 30], i * 3);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xbcd4e6, transparent: true, opacity: 0.45, depthWrite: false }));
  rain.frustumCulled = false; rain.visible = false;
  scene.add(rain);

  // Small lights in the dark: glow-worms under the bank, by the log and along the creek.
  const SPARKS = 46;
  const sparkPos = new Float32Array(SPARKS * 3), sparkHome = [];
  const homes = [SPOTS.moss, SPOTS.log, SPOTS.creek, [-23, 24], [-27, -4], SPOTS.drift];
  for (let i = 0; i < SPARKS; i++) {
    const home = homes[i % homes.length];
    sparkHome.push([home[0] + (rnd() - 0.5) * 9, home[1] + (rnd() - 0.5) * 9, rnd() * 10, 0.25 + rnd() * 1.3]);
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xc8ffb0, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(sparks);

  const fogColor = new THREE.Color();
  s.update = (weather, camera, dt, t, forcedSun, dayMinutes = 0, shiftS = 0) => {
    const now = sunNow(new Date(), dayMinutes, shiftS);
    const elevation = forcedSun === null || forcedSun === undefined ? now.elevation : forcedSun;
    const day = smooth(-7, 9, elevation);
    const dusk = clamp(1 - Math.abs(elevation - 1) / 11);
    const want = WEATHER[weather] || WEATHER.cloud;
    for (const k of ['cloud', 'rain', 'mist', 'wind']) s[k] = lerp(s[k], want[k], clamp(dt * 0.4));
    s.night = 1 - day;
    s.day = day;
    if (weather === 'storm' && Math.random() < dt * 0.12) s.flash = 1;
    s.flash = Math.max(0, s.flash - dt * 3.5);

    top.copy(TOP_NIGHT).lerp(TOP_DAY, day);
    low.copy(LOW_NIGHT).lerp(LOW_DAY, day).lerp(GLOW, dusk * 0.55 * (1 - s.cloud * 0.6));
    tmp.copy(GREY_NIGHT).lerp(GREY, day);
    top.lerp(tmp, s.cloud * 0.75); low.lerp(tmp, s.cloud * 0.6);
    if (s.flash > 0) { top.lerp(C(0xdfe8ff), s.flash * 0.7); low.lerp(C(0xdfe8ff), s.flash * 0.7); }
    paintDome();
    dome.position.copy(camera.position);
    stars.position.copy(camera.position);
    stars.rotation.y = t * 0.002;
    stars.material.opacity = clamp((1 - day * 1.6) * (1 - s.cloud * 0.85));

    // The sun in the sky. North is -z, east is +x.
    const az = now.azimuth, el = elevation * Math.PI / 180;
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const moonDir = new THREE.Vector3(-sunDir.x * 0.7 + 0.25, Math.max(0.45, -sunDir.y * 0.9 + 0.2), -sunDir.z * 0.7 + 0.2).normalize();
    sun.position.copy(camera.position).addScaledVector(sunDir, 470); sun.lookAt(camera.position);
    moon.position.copy(camera.position).addScaledVector(moonDir, 470); moon.lookAt(camera.position);
    sun.material.opacity = clamp((elevation + 4) / 6) * (1 - s.cloud * 0.8);
    moon.material.opacity = clamp(1 - day * 1.5) * (1 - s.cloud * 0.7);

    const lightDir = day > 0.35 ? sunDir.clone().setY(Math.max(sunDir.y, 0.2)) : moonDir;
    beam.position.copy(lightDir).multiplyScalar(100);
    beam.color.copy(C(0x9db6e8)).lerp(C(0xfff0d4), day).lerp(GLOW, dusk * 0.5);
    beam.intensity = lerp(1.3, 2.3, day) * (1 - s.cloud * 0.45) + s.flash * 3;
    hemi.color.copy(C(0x5f7fc4)).lerp(C(0xcfe6ff), day);
    hemi.groundColor.copy(C(0x1c2a30)).lerp(C(0x5a6a4a), day);
    hemi.intensity = lerp(1.7, 1.7, day) + s.flash * 2;

    fogColor.copy(low).lerp(top, 0.15);
    scene.fog.color.copy(fogColor);
    scene.fog.near = lerp(lerp(45, 70, day), 6, s.mist * 0.9) * (1 - s.rain * 0.15);
    scene.fog.far = lerp(lerp(170, 230, day), 55, s.mist * 0.9) * (1 - s.rain * 0.12);

    rain.visible = s.rain > 0.03;
    if (rain.visible) {
      const count = Math.min(DROPS, Math.floor(DROPS * s.rain / 1.6));
      const fall = 17, slant = s.wind * 5;
      for (let i = 0; i < count; i++) {
        const y = 26 - ((rainSeed[i * 3 + 1] + t * fall) % 26);
        const x = camera.position.x + rainSeed[i * 3] + (26 - y) * slant * 0.05;
        const z = camera.position.z + rainSeed[i * 3 + 2];
        rainPos.set([x, y, z, x - slant * 0.03, y + 0.4, z], i * 6);
      }
      rainGeo.setDrawRange(0, count * 2);
      rainGeo.attributes.position.needsUpdate = true;
      rain.material.opacity = 0.16 + day * 0.14;
    }

    sparks.material.opacity = (s.inCity ? 0 : 1) * clamp((s.night - 0.5) * 2) * (0.55 + Math.sin(t * 1.7) * 0.25) * (1 - s.rain * 0.5);
    if (sparks.material.opacity > 0.01) {
      for (let i = 0; i < SPARKS; i++) {
        const h = sparkHome[i];
        const x = h[0] + Math.sin(t * 0.21 + h[2]) * 1.6, z = h[1] + Math.cos(t * 0.17 + h[2] * 1.7) * 1.6;
        sparkPos.set([x, heightAt(x, z) + h[3] + Math.sin(t * 0.6 + h[2]) * 0.25, z], i * 3);
      }
      sparkGeo.attributes.position.needsUpdate = true;
    }
    return s;
  };
  return s;
}
