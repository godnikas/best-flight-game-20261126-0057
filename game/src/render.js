// Skylark Run — canvas rendering: sky, terrain, rings, runway, plane.
// Everything is drawn from code (no image assets): the terrain is filled
// from the world's height function, the plane is a built-up vector shape,
// and the light comes from the mission's sky palette.

import { VIEW_W, VIEW_H, SKIES } from './config.js';
import { ridgeHeight } from './world.js';

// Camera: metres of world per screen pixel. The plane sits left of centre
// so the pilot can see the ring and the runway coming.
export const SCALE = 0.92; // px per metre, horizontally
export const ALT_SCALE = 0.92; // px per metre, vertically

export function createCamera() {
  return { x: 0, shake: 0, shakeT: 0 };
}

export function cameraFor(camera, plane, dt) {
  const targetX = plane.x - 300 / SCALE;
  camera.x += (targetX - camera.x) * Math.min(1, dt * 2.2);
  if (camera.shakeT > 0) {
    camera.shakeT -= dt;
    camera.shake = (Math.random() - 0.5) * 7 * camera.shakeT;
  } else {
    camera.shake = 0;
  }
  return camera;
}

// World x -> screen x, world altitude -> screen y.
function sx(camera, x) {
  return (x - camera.x) * SCALE;
}
function sy(alt) {
  return VIEW_H - 170 - alt * ALT_SCALE;
}

function drawSky(ctx, sky, time, storm) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.55, sky.mid);
  g.addColorStop(1, sky.low);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun or moon.
  const sunX = sky.sunX * VIEW_W;
  const sunY = sky.sunY * VIEW_H;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
  glow.addColorStop(0, sky.sun);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = sky.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, storm ? 22 : 30, 0, Math.PI * 2);
  ctx.fill();
  // Haze band above the horizon.
  ctx.fillStyle = sky.haze;
  ctx.fillRect(0, VIEW_H - 260, VIEW_W, 120);
  void time;
}

function drawClouds(ctx, world, camera, sky) {
  ctx.fillStyle = sky.cloud;
  for (const c of world.clouds) {
    const cx = sx(camera, c.x) % (VIEW_W + 400);
    const x = cx < -200 ? cx + VIEW_W + 400 : cx;
    const y = c.y * 0.9 + 30;
    ctx.beginPath();
    ctx.ellipse(x, y, c.s, c.s * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(x + c.s * 0.5, y + 6, c.s * 0.6, c.s * 0.26, 0, 0, Math.PI * 2);
    ctx.ellipse(x - c.s * 0.5, y + 8, c.s * 0.55, c.s * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRidge(ctx, camera, seed) {
  ctx.fillStyle = 'rgba(90, 110, 150, 0.45)';
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  for (let px = 0; px <= VIEW_W; px += 16) {
    const wx = camera.x + px / SCALE;
    ctx.lineTo(px, sy(ridgeHeight(wx, seed) * 0.9) + 40);
  }
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  ctx.fill();
}

function groundColor(zoneKind, storm) {
  if (storm) {
    return { sea: '#1d2f45', field: '#2c3d33', islands: '#2c4636', mountains: '#3a4150', city: '#33302e' };
  }
  return {
    sea: '#2f7fb8', field: '#5da24a', islands: '#4d9a4a',
    mountains: '#6b7a72', city: '#8a8578',
  }[zoneKind];
}

function drawTerrain(ctx, world, camera, storm) {
  const colors = groundColor('field', storm);
  // Sea: a flat blue band under everything, so the water reads even
  // where the terrain dips below sea level.
  ctx.fillStyle = storm ? '#1d2f45' : '#2f7fb8';
  ctx.fillRect(0, sy(0), VIEW_W, VIEW_H - sy(0));
  // Animated swell lines on the water.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  const now = performance.now() / 1000;
  for (let i = 0; i < 5; i++) {
    const y = sy(0) + 14 + i * 16;
    ctx.beginPath();
    for (let px = 0; px <= VIEW_W; px += 24) {
      const wx = camera.x + px / SCALE;
      const yy = y + Math.sin(wx / 90 + now * 1.4 + i * 2) * 3;
      if (px === 0) ctx.moveTo(px, yy);
      else ctx.lineTo(px, yy);
    }
    ctx.stroke();
  }

  // The land itself, one filled silhouette from the height function.
  ctx.beginPath();
  ctx.moveTo(0, VIEW_H);
  const step = 6;
  let lastKind = null;
  for (let px = 0; px <= VIEW_W; px += step) {
    const wx = camera.x + px / SCALE;
    ctx.lineTo(px, sy(world.groundHeight(wx)));
    lastKind = world.zoneAt(wx).kind;
  }
  void lastKind;
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.closePath();
  // Paint in zone-coloured strips so sea, grass, rock and town differ.
  ctx.save();
  ctx.clip();
  for (const zone of world.zones) {
    const x0 = sx(camera, zone.from);
    const x1 = sx(camera, zone.to);
    if (x1 < -50 || x0 > VIEW_W + 50) continue;
    ctx.fillStyle = groundColor(zone.kind, storm);
    ctx.fillRect(x0, 0, x1 - x0, VIEW_H);
  }
  // Snow caps on the high ground.
  ctx.fillStyle = storm ? '#5a6a80' : '#eef3f6';
  for (let px = 0; px <= VIEW_W; px += step) {
    const wx = camera.x + px / SCALE;
    const h = world.groundHeight(wx);
    if (h > 150) {
      ctx.fillRect(px, sy(h), step + 1, sy(h - 6) - sy(h));
    }
  }
  // The river through the city zone.
  const rx = sx(camera, world.riverX);
  if (rx > -40 && rx < VIEW_W + 40) {
    ctx.fillStyle = storm ? '#274b63' : '#4aa3d8';
    ctx.beginPath();
    ctx.moveTo(rx - 26, VIEW_H);
    ctx.lineTo(rx - 26, sy(world.groundHeight(world.riverX - 26)));
    ctx.quadraticCurveTo(rx, sy(10), rx + 26, sy(world.groundHeight(world.riverX + 26)));
    ctx.lineTo(rx + 26, VIEW_H);
    ctx.closePath();
    ctx.fill();
  }
  // City buildings with lit windows.
  for (const b of world.buildings) {
    const bx = sx(camera, b.x);
    if (bx < -80 || bx > VIEW_W + 80) continue;
    const bw = b.w * SCALE;
    const bh = b.h * ALT_SCALE;
    const by = sy(b.y);
    ctx.fillStyle = storm ? '#23272f' : '#5d5648';
    ctx.fillRect(bx, by - bh, bw, bh);
    ctx.fillStyle = '#ffd98a';
    const lit = Math.floor(b.lit * 5);
    for (let w = 0; w < lit; w++) {
      const wx = bx + 4 + ((w * 13) % Math.max(8, bw - 10));
      const wy = by - bh + 6 + ((w * 17) % Math.max(8, bh - 12));
      ctx.fillRect(wx, wy, 4, 5);
    }
  }
  ctx.restore();

  // Beach line where land meets sea.
  ctx.strokeStyle = storm ? 'rgba(220,230,240,0.35)' : 'rgba(245, 230, 170, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let beachOpen = false;
  for (let px = 0; px <= VIEW_W; px += step) {
    const wx = camera.x + px / SCALE;
    const h = world.groundHeight(wx);
    if (h > -2 && h < 8) {
      const y = sy(h);
      if (!beachOpen) {
        ctx.moveTo(px, y);
        beachOpen = true;
      } else {
        ctx.lineTo(px, y);
      }
    } else {
      beachOpen = false;
    }
  }
  ctx.stroke();
}

function drawRunway(ctx, world, camera, storm) {
  const r = world.runway;
  const x0 = sx(camera, r.x);
  const x1 = sx(camera, r.x + r.length);
  if (x1 < -60 || x0 > VIEW_W + 60) return;
  const y = sy(r.y);
  // Strip.
  ctx.fillStyle = storm ? '#3a3f47' : '#3c3f45';
  ctx.fillRect(x0, y - 10, x1 - x0, 12);
  // Centreline dashes.
  ctx.fillStyle = '#f5f5f5';
  for (let d = x0 + 20; d < x1 - 20; d += 46) {
    ctx.fillRect(d, y - 6, 26, 3);
  }
  // Threshold bars and the number 09.
  ctx.fillStyle = '#f5f5f5';
  for (let i = 0; i < 4; i++) ctx.fillRect(x0 + 8 + i * 12, y - 9, 6, 3);
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('09', x0 + 60, y - 14);
  // Edge lights, warm and lit.
  for (let d = x0; d <= x1; d += 52) {
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(d, y - 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Windsock on a pole beside the threshold.
  const wx = x0 - 26;
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx, y);
  ctx.lineTo(wx, y - 44);
  ctx.stroke();
  ctx.fillStyle = '#ff6b35';
  ctx.beginPath();
  ctx.moveTo(wx, y - 44);
  ctx.lineTo(wx + 34, y - 38);
  ctx.lineTo(wx, y - 32);
  ctx.closePath();
  ctx.fill();
  // A small hangar and a windsock-lit beacon past the strip.
  ctx.fillStyle = storm ? '#2c313a' : '#7a6a52';
  ctx.fillRect(x1 + 30, y - 34, 64, 34);
  ctx.fillStyle = storm ? '#3a4152' : '#a33';
  ctx.beginPath();
  ctx.moveTo(x1 + 30, y - 34);
  ctx.lineTo(x1 + 62, y - 52);
  ctx.lineTo(x1 + 94, y - 34);
  ctx.closePath();
  ctx.fill();
}

function drawRings(ctx, world, camera, time) {
  for (const ring of world.rings) {
    const x = sx(camera, ring.x);
    if (x < -120 || x > VIEW_W + 120) continue;
    const y = sy(ring.alt);
    const r = ring.radius * SCALE;
    const pulse = 1 + Math.sin(time * 2.4 + ring.index) * 0.05;
    const rr = r * pulse;
    ctx.save();
    ctx.translate(x, y);
    // The ring reads as a torus seen at a slight angle: an ellipse.
    ctx.scale(1, 0.86);
    if (ring.passed) {
      ctx.strokeStyle = 'rgba(120, 255, 150, 0.9)';
      ctx.lineWidth = 7;
      ctx.shadowColor = '#5dff8a';
      ctx.shadowBlur = 18;
    } else {
      ctx.strokeStyle = '#ffb347';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#ff9a1f';
      ctx.shadowBlur = 16;
    }
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, rr - 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Ring number above the hoop, and a chevron pointing the way.
    ctx.fillStyle = ring.passed ? '#7dff9e' : '#ffffff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(ring.index), x, y - rr - 12);
    if (!ring.passed) {
      ctx.fillStyle = 'rgba(255, 179, 71, 0.9)';
      ctx.beginPath();
      ctx.moveTo(x + rr + 26, y);
      ctx.lineTo(x + rr + 10, y - 9);
      ctx.lineTo(x + rr + 10, y + 9);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// The Skylark: a single-engine prop plane drawn in profile, built up
// from fuselage, wing, tail, canopy and a spinning prop disc.
function drawPlane(ctx, plane, camera) {
  const x = sx(camera, plane.x);
  const y = sy(plane.alt) + camera.shake;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-plane.pitch * 0.9 + plane.roll * 0.12);
  const s = 1.28;
  ctx.scale(s, s);
  // Propeller blur disc and spinner.
  ctx.fillStyle = 'rgba(40, 40, 48, 0.28)';
  ctx.beginPath();
  ctx.ellipse(34, 0, 5, 26 + Math.sin(t * 40) * 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b2f36';
  ctx.beginPath();
  ctx.arc(34, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  // Tail.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-34, -2);
  ctx.lineTo(-46, -22);
  ctx.lineTo(-38, -22);
  ctx.lineTo(-26, -4);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const body = ctx.createLinearGradient(0, -14, 0, 12);
  body.addColorStop(0, '#f4f6f8');
  body.addColorStop(0.5, '#e8b64c');
  body.addColorStop(1, '#c23b2e');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.quadraticCurveTo(20, -13, -6, -11);
  ctx.quadraticCurveTo(-30, -9, -38, -2);
  ctx.quadraticCurveTo(-30, 8, -8, 10);
  ctx.quadraticCurveTo(18, 11, 36, 0);
  ctx.closePath();
  ctx.fill();
  // Wing (low wing, swept back a touch).
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-4, 2);
  ctx.lineTo(-18, 30);
  ctx.lineTo(-8, 32);
  ctx.lineTo(12, 6);
  ctx.closePath();
  ctx.fill();
  // Canopy, lit from inside.
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath();
  ctx.moveTo(4, -10);
  ctx.quadraticCurveTo(12, -18, 20, -10);
  ctx.quadraticCurveTo(12, -7, 4, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath();
  ctx.moveTo(8, -13);
  ctx.lineTo(14, -13);
  ctx.lineTo(10, -9);
  ctx.closePath();
  ctx.fill();
  // Landing gear.
  if (plane.gearDown) {
    ctx.strokeStyle = '#2b2f36';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, 10);
    ctx.lineTo(-8, 22);
    ctx.moveTo(12, 10);
    ctx.lineTo(12, 22);
    ctx.stroke();
    ctx.fillStyle = '#1c1e22';
    ctx.beginPath();
    ctx.arc(-8, 24, 5, 0, Math.PI * 2);
    ctx.arc(12, 24, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Navigation lights: red left, green right, white strobe blinking.
  const blink = Math.sin(t * 6) > 0.4;
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-36, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34e07a';
  ctx.beginPath();
  ctx.arc(30, 2, 3, 0, Math.PI * 2);
  ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-40, -20, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(ctx, particles, camera) {
  for (const p of particles) {
    const x = sx(camera, p.x);
    const y = sy(p.alt);
    if (x < -20 || x > VIEW_W + 20) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRain(ctx, storm, time) {
  if (!storm) return;
  ctx.strokeStyle = 'rgba(180, 200, 230, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const rx = ((i * 173 + time * 420) % (VIEW_W + 60)) - 30;
    const ry = (i * 97 + time * 900) % (VIEW_H + 40);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 6, ry + 18);
  }
  ctx.stroke();
  // Occasional lightning wash.
  const flash = Math.sin(time * 0.7) > 0.985;
  if (flash) {
    ctx.fillStyle = 'rgba(220, 230, 255, 0.18)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

// Full frame: sky, clouds, ridge, terrain, runway, rings, plane, fx.
export function renderFrame(ctx, game, dt) {
  const { world, plane, camera, particles } = game;
  const sky = SKIES[world.mission.sky];
  const time = game.time;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawSky(ctx, sky, time, world.mission.storm);
  drawClouds(ctx, world, camera, sky);
  drawRidge(ctx, camera, world.mission.seed);
  drawTerrain(ctx, world, camera, world.mission.storm);
  drawRunway(ctx, world, camera, world.mission.storm);
  drawRings(ctx, world, camera, time);
  drawParticles(ctx, particles, camera);
  if (!plane.crashed) drawPlane(ctx, plane, camera);
  drawRain(ctx, world.mission.storm, time);
  void dt;
}
