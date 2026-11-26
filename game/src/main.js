// Skylark Run — the game itself: states, the loop, scoring, missions.
// A sortie runs menu -> briefing -> flying -> landed / crashed, with a
// results card and a restart. The loop is a fixed-step simulation over a
// requestAnimationFrame render, so the plane flies the same on any machine.

// Show a load or runtime error on the page itself, never silently.
window.addEventListener('error', (event) => {
  const el = document.getElementById('error');
  if (el) {
    el.hidden = false;
    el.textContent = `Error: ${event.message}`;
  }
});

import { MISSIONS, FIELD, SCORE, KEYS_HELP, VIEW_W, VIEW_H } from './config.js';
import { createInput } from './input.js';
import { createWorld } from './world.js';
import { createPlane, stepFlight, stepRollout, checkRing } from './physics.js';
import { createCamera, cameraFor, renderFrame } from './render.js';
import { drawHud, formatTime } from './hud.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();
const params = new URLSearchParams(location.search);
const shot = params.get('shot'); // menu | cover | ring | landing | results

const game = {
  state: 'menu', // menu | briefing | flying | paused | landed | crashed
  missionIndex: 0,
  world: null,
  plane: null,
  camera: createCamera(),
  particles: [],
  score: 0,
  ringsPassed: 0,
  timeLeft: 0,
  missionTime: 0,
  time: 0,
  banner: '',
  bannerT: 0,
  message: '',
  messageT: 0,
  messageColor: '#ffffff',
  lastRingAt: 0,
  gusts: 0,
  result: null,
  menuHover: 0,
};

function loadMission(index) {
  const mission = MISSIONS[index];
  game.missionIndex = index;
  game.world = createWorld(mission);
  game.plane = createPlane(mission);
  game.camera = createCamera();
  game.particles = [];
  game.score = 0;
  game.ringsPassed = 0;
  game.missionTime = 0;
  game.timeLeft = mission.rings * 75 + 240;
  game.banner = `${mission.name} — ${mission.tagline}`;
  game.bannerT = 4;
  game.message = '';
  game.result = null;
  game.gusts = 0;
}

function setBanner(text, seconds = 3) {
  game.banner = text;
  game.bannerT = seconds;
}

function setMessage(text, color = '#ffffff', seconds = 2.4) {
  game.message = text;
  game.messageColor = color;
  game.messageT = seconds;
}

function burst(x, alt, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (0.3 + Math.random() * 0.7) * speed;
    game.particles.push({
      x: x + Math.cos(a) * 8,
      alt: alt + Math.sin(a) * 8,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.7 + Math.random() * 0.7,
      maxLife: 1.4,
      size: 2 + Math.random() * 4,
      color,
    });
  }
}

function updateParticles(dt) {
  for (const p of game.particles) {
    p.x += p.vx * dt;
    p.alt += p.vy * dt;
    p.vy -= 12 * dt;
    p.life -= dt;
  }
  game.particles = game.particles.filter((p) => p.life > 0);
  // Exhaust puffs behind the plane while flying.
  const plane = game.plane;
  if (game.state === 'flying' && !plane.crashed && plane.throttle > 0.25 && Math.random() < 0.5) {
    game.particles.push({
      x: plane.x - 42, alt: plane.alt + (Math.random() - 0.5) * 6,
      vx: -14, vy: (Math.random() - 0.5) * 4, life: 0.5, maxLife: 0.5,
      size: 2.5, color: 'rgba(200, 210, 220, 0.7)',
    });
  }
}

function finishLanding() {
  const plane = game.plane;
  const mission = game.world.mission;
  const fuelBonus = Math.round(plane.fuel * SCORE.fuelBonusPerUnit);
  const smooth = !plane.bellyLanding && Math.abs(plane.verticalSpeed) < 3 ? SCORE.smoothLandingBonus : 0;
  const total = SCORE.landing + fuelBonus + smooth + SCORE.missionBonus;
  game.score += total;
  audio.landingFanfare();
  game.result = {
    kind: 'landed',
    title: 'MISSION COMPLETE',
    lines: [
      `Landed on runway 09 — ${game.ringsPassed} of ${mission.rings} rings`,
      `Landing +${SCORE.landing}   Fuel bonus +${fuelBonus}${smooth ? `   Smooth landing +${smooth}` : ''}`,
      `Mission bonus +${SCORE.missionBonus}`,
    ],
    score: game.score,
  };
  game.state = 'landed';
  setMessage('Wheels down — welcome home, Skylark.', '#7dff9e', 4);
}

function finishCrash(kind) {
  const plane = game.plane;
  game.camera.shakeT = 0.6;
  burst(plane.x, plane.alt, '#ff7a3d', 42, 90);
  burst(plane.x, plane.alt, '#3a3f47', 30, 60);
  burst(plane.x, plane.alt, '#ffd98a', 18, 120);
  audio.crashThud();
  const why = kind === 'sea'
    ? 'Ditched in the sea — the Skylark floats, but the sortie is over.'
    : 'Terrain strike — the mountains always win that argument.';
  game.result = {
    kind: 'crashed',
    title: 'SORTIE LOST',
    lines: [why, `Rings passed: ${game.ringsPassed} of ${game.world.mission.rings}`],
    score: game.score,
  };
  game.state = 'crashed';
  setMessage(kind === 'sea' ? 'Ditched in the sea!' : 'Terrain strike!', '#ff6b5e', 4);
}

function stepGame(dt, inp) {
  const plane = game.plane;
  const world = game.world;
  const mission = world.mission;

  game.time += dt;
  game.missionTime += dt;
  game.timeLeft = Math.max(0, game.timeLeft - dt);
  if (game.bannerT > 0) game.bannerT -= dt;
  if (game.bannerT <= 0) game.banner = '';
  if (game.messageT > 0) game.messageT -= dt;
  if (game.messageT <= 0) game.message = '';

  // Gusts in a storm: a slow sine plus jitter, stronger in the storm mission.
  const gustBase = mission.storm ? 7 : mission.wind * 0.4;
  game.gusts = Math.sin(game.time * 0.6) * gustBase + Math.sin(game.time * 2.3) * gustBase * 0.4;

  if (inp.pressed.has('mute')) {
    const muted = audio.toggleMute();
    setMessage(muted ? 'Sound off' : 'Sound on', '#cfe6ff', 1.2);
  }
  if (inp.pressed.has('restart')) {
    loadMission(game.missionIndex);
    game.state = 'flying';
    return;
  }

  if (game.state === 'paused') {
    if (inp.pressed.has('pause') || inp.pressed.has('confirm')) game.state = 'flying';
    return;
  }
  if (inp.pressed.has('pause')) {
    game.state = 'paused';
    return;
  }

  // Gear and flaps.
  if (inp.pressed.has('gear')) {
    plane.gearDown = !plane.gearDown;
    audio.click();
    setMessage(plane.gearDown ? 'Gear down — three greens' : 'Gear up', '#cfe6ff', 1.4);
  }
  if (inp.pressed.has('flaps')) {
    plane.flaps = !plane.flaps;
    audio.click();
    setMessage(plane.flaps ? 'Flaps down' : 'Flaps up', '#cfe6ff', 1.4);
  }

  const prevX = plane.x;
  stepFlight(plane, inp, dt, mission.wind, game.gusts, world);
  stepRollout(plane, dt, world);
  cameraFor(game.camera, plane, dt);
  updateParticles(dt);

  // Rings: crossing one scores, with a speed bonus for a quick chain.
  for (const ring of world.rings) {
    const hit = checkRing(plane, prevX, ring);
    if (hit) {
      const sinceLast = game.missionTime - game.lastRingAt;
      const bonus = sinceLast < 25 ? Math.round(SCORE.ringTimeBonus * (1 - sinceLast / 25)) : 0;
      game.score += SCORE.ring + bonus;
      game.ringsPassed += 1;
      game.lastRingAt = game.missionTime;
      game.timeLeft += 20;
      burst(ring.x, ring.alt, '#ffd98a', 26, 70);
      audio.ringChime();
      setMessage(`Ring ${ring.index} — +${SCORE.ring + bonus}`, '#ffd98a', 1.8);
      if (game.ringsPassed === mission.rings) {
        setBanner('All rings clear — bring her home to runway 09', 4);
      }
    }
    if (ring.flash > 0) ring.flash = Math.max(0, ring.flash - dt * 2);
  }

  // Landing prompt as the strip comes into view.
  const dist = world.runway.x - plane.x;
  if (dist < 1400 && dist > 0 && !plane.gearDown && plane.alt < 260) {
    setBanner('Runway ahead — gear down (G), slow down, land gently', 0.1);
  }

  if (plane.landed && game.state === 'flying') finishLanding();
  if (plane.crashed && game.state === 'flying') finishCrash(plane.crashKind);

  if (game.timeLeft <= 0 && game.state === 'flying' && !plane.landed) {
    game.result = {
      kind: 'crashed',
      title: 'OUT OF TIME',
      lines: ['The clock ran out before the landing.', `Rings passed: ${game.ringsPassed} of ${mission.rings}`],
      score: game.score,
    };
    game.state = 'crashed';
    setMessage('Out of time!', '#ff6b5e', 3);
  }

  // Engine sound follows throttle and speed.
  audio.update(plane.throttle, plane.speed, game.state === 'flying');
}

// ---- Screens ---------------------------------------------------------

function drawMenu(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#1c2f52');
  g.addColorStop(0.6, '#3f6ea6');
  g.addColorStop(1, '#e8a56a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Decorative skyline silhouette and a little Skylark crossing it.
  ctx.fillStyle = 'rgba(20, 30, 48, 0.55)';
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  for (let x = 0; x <= VIEW_W; x += 40) {
    ctx.lineTo(x, VIEW_H - 120 - Math.sin(x / 130) * 46 - Math.cos(x / 57) * 22);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.arc(VIEW_W - 180, 120, 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  ctx.fillText('SKYLARK RUN', VIEW_W / 2, 150);
  ctx.shadowBlur = 0;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillStyle = '#ffe9c4';
  ctx.fillText('A small plane, a long coastline, and rings in the sky.', VIEW_W / 2, 186);

  // Mission cards.
  const cardW = 360;
  const cardH = 190;
  const gap = 20;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (VIEW_W - totalW) / 2;
  const y0 = 236;
  MISSIONS.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const selected = i === game.menuHover;
    ctx.fillStyle = selected ? 'rgba(255, 217, 138, 0.92)' : 'rgba(12, 20, 34, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x, y0, cardW, cardH, 14);
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffffff' : 'rgba(140, 200, 255, 0.4)';
    ctx.lineWidth = selected ? 3 : 1;
    ctx.stroke();
    const fg = selected ? '#1c2f52' : '#ffffff';
    const sub = selected ? '#4a5a75' : '#cfe6ff';
    ctx.fillStyle = fg;
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText(m.name, x + cardW / 2, y0 + 44);
    ctx.fillStyle = sub;
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText(`${m.rings} rings  ·  ${(m.distance / 1000).toFixed(1)} km`, x + cardW / 2, y0 + 70);
    ctx.fillText(`Fuel ${m.fuel}%  ·  Wind ${m.wind} m/s`, x + cardW / 2, y0 + 90);
    ctx.font = '400 14px system-ui, sans-serif';
    wrapText(ctx, m.briefing, x + 20, y0 + 114, cardW - 40, 19, sub);
    ctx.fillStyle = selected ? '#c23b2e' : '#ffd98a';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillText(selected ? '▶  PRESS ENTER TO FLY' : 'Click to select', x + cardW / 2, y0 + cardH - 18);
  });

  // Controls card.
  ctx.fillStyle = 'rgba(12, 20, 34, 0.8)';
  ctx.beginPath();
  ctx.roundRect(VIEW_W / 2 - 330, 458, 660, 150, 12);
  ctx.fill();
  ctx.fillStyle = '#8fc8ff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('HOW TO FLY', VIEW_W / 2 - 306, 486);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  KEYS_HELP.slice(0, 5).forEach(([k, v], i) => {
    ctx.fillText(`${k} — ${v}`, VIEW_W / 2 - 306, 512 + i * 20);
  });
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Fly every ring, watch the fuel, land on runway 09. Mouse: hold and drag to steer, wheel for throttle.', VIEW_W / 2, 640);
  ctx.fillStyle = '#8fa8c4';
  ctx.font = '400 12px system-ui, sans-serif';
  ctx.fillText('Skylark Run — an original game. No network, no accounts, just flying.', VIEW_W / 2, 664);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, color) {
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawBriefing(ctx) {
  const m = MISSIONS[game.missionIndex];
  ctx.fillStyle = 'rgba(10, 16, 28, 0.82)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd98a';
  ctx.font = '700 40px system-ui, sans-serif';
  ctx.fillText(m.name.toUpperCase(), VIEW_W / 2, 200);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(m.tagline, VIEW_W / 2, 240);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '400 17px system-ui, sans-serif';
  wrapText(ctx, m.briefing, VIEW_W / 2 - 320, 290, 640, 26, '#cfe6ff');
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText('Press ENTER or click to take off', VIEW_W / 2, 460);
  ctx.fillStyle = '#8fc8ff';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillText('↑ ↓ pitch   ·   ← → throttle   ·   G gear   ·   mouse steers too', VIEW_W / 2, 496);
}

function drawResults(ctx) {
  const r = game.result;
  if (!r) return;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 620;
  const h = 300;
  const x = VIEW_W / 2 - w / 2;
  const y = VIEW_H / 2 - h / 2;
  ctx.fillStyle = 'rgba(12, 20, 34, 0.95)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = r.kind === 'landed' ? '#7dff9e' : '#ff6b5e';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = r.kind === 'landed' ? '#7dff9e' : '#ff6b5e';
  ctx.font = '700 36px system-ui, sans-serif';
  ctx.fillText(r.title, VIEW_W / 2, y + 58);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 17px system-ui, sans-serif';
  r.lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, y + 102 + i * 28));
  ctx.fillStyle = '#ffd98a';
  ctx.font = '700 30px system-ui, sans-serif';
  ctx.fillText(`SCORE  ${r.score.toLocaleString()}`, VIEW_W / 2, y + 196);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText('Press R to fly again — ENTER for the next sortie', VIEW_W / 2, y + 244);
}

// ---- Screenshot staging -----------------------------------------------
// ?shot= pins the game to a readable moment so screenshots are real
// renders of the game code, not a posed mock-up.
function applyShotMode() {
  if (!shot) return;
  if (shot === 'menu') {
    game.state = 'menu';
    return;
  }
  loadMission(0);
  game.state = 'flying';
  const plane = game.plane;
  const world = game.world;
  if (shot === 'cover') {
    // Mid-course over the islands: a ring ahead, green islands and the
    // coastline below, the runway still a long way off.
    plane.x = world.rings[3].x - 420;
    plane.alt = world.rings[3].alt + 26;
    plane.speed = 62;
    plane.throttle = 0.72;
    plane.pitch = -0.06;
  } else if (shot === 'ring') {
    plane.x = world.rings[1].x - 260;
    plane.alt = world.rings[1].alt;
    plane.speed = 66;
    plane.throttle = 0.78;
    plane.pitch = 0.02;
  } else if (shot === 'landing') {
    plane.x = world.runway.x - 700;
    plane.alt = 82;
    plane.speed = 42;
    plane.throttle = 0.3;
    plane.gearDown = true;
    plane.pitch = -0.1;
    setBanner('Runway ahead — gear down, slow down, land gently', 99);
  } else if (shot === 'results') {
    plane.x = world.runway.x + 120;
    plane.alt = world.runway.y + 2;
    plane.speed = 0;
    plane.landed = true;
    plane.onGround = true;
    game.score = 3120;
    game.ringsPassed = 8;
    game.result = {
      kind: 'landed',
      title: 'MISSION COMPLETE',
      lines: ['Landed on runway 09 — 8 of 8 rings', 'Landing +500   Fuel bonus +312   Smooth landing +300', 'Mission bonus +400'],
      score: 3120,
    };
    game.state = 'landed';
  }
  cameraFor(game.camera, plane, 1);
  game.camera.x = plane.x - 300 / 0.92;
}

// ---- Main loop ---------------------------------------------------------

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  const inp = input.poll();
  // The plane's screen row, for mouse steering.
  if (game.plane) {
    const screenY = VIEW_H - 170 - game.plane.alt * 0.92;
    input.setPlaneScreenY(screenY);
  }

  // Menu / briefing navigation (click or Enter).
  if (game.state === 'menu') {
    if (inp.pressed.has('confirm') || inp.pressed.has('click')) {
      // Pick a mission card by pointer, else the highlighted one.
      if (inp.pointerActive && inp.pointerY > 236 && inp.pointerY < 426) {
        const cardW = 360;
        const gap = 20;
        const totalW = cardW * 3 + gap * 2;
        const x0 = (VIEW_W - totalW) / 2;
        const idx = Math.floor((inp.pointerX - x0) / (cardW + gap));
        if (idx >= 0 && idx < 3) game.menuHover = idx;
      }
      audio.ensure();
      audio.click();
      loadMission(game.menuHover);
      game.state = 'briefing';
    }
    if (inp.pressed.has('up') || inp.pressed.has('down')) {
      game.menuHover = (game.menuHover + 1) % 3;
    }
    drawMenu(ctx);
    return;
  }
  if (game.state === 'briefing') {
    if (inp.pressed.has('confirm') || inp.pressed.has('click')) {
      audio.ensure();
      game.state = 'flying';
      setMessage('Rotate! Climb away, Skylark.', '#7dff9e', 2.5);
    }
    drawBriefing(ctx);
    return;
  }

  // Flying / paused / landed / crashed: fixed-step simulation.
  acc += dt;
  while (acc >= STEP) {
    if (game.state === 'flying' || game.state === 'paused') stepGame(STEP, inp);
    acc -= STEP;
    // Consume one-shot presses once per frame, not once per step.
    inp.pressed.clear();
  }
  if (game.state === 'landed' || game.state === 'crashed') {
    if (inp.pressed.has('restart')) {
      loadMission(game.missionIndex);
      game.state = 'flying';
    } else if (inp.pressed.has('confirm')) {
      loadMission((game.missionIndex + 1) % MISSIONS.length);
      game.state = 'briefing';
    }
  }

  renderFrame(ctx, game, dt);
  drawHud(ctx, game);
  if (game.state === 'landed' || game.state === 'crashed') drawResults(ctx);
  // Keep the canvas focused so the keyboard works without a click.
  if (document.activeElement !== canvas) canvas.focus({ preventScroll: true });
}

// Boot.
loadMission(0);
applyShotMode();
if (!shot) game.state = 'menu';
requestAnimationFrame(frame);
