// Skylark Run — the HUD and the instruments.
// Everything the pilot needs is on screen: altitude, speed and heading in
// big lit digits, an artificial horizon that moves with the plane, fuel and
// throttle gauges, the ring count, the timer, and warning lights that
// actually light up. Drawn in canvas so it needs no assets.

import { VIEW_W, VIEW_H, KNOTS_PER_MS } from './config.js';

function panel(ctx, x, y, w, h, alpha = 0.82) {
  ctx.fillStyle = `rgba(12, 18, 28, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx, text, x, y, color = '#8fc8ff', size = 11) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function bigValue(ctx, text, x, y, color = '#ffffff', size = 30) {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  // A soft glow so the digits read as lit instruments.
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
}

// The artificial horizon: a ball that pitches and rolls with the plane.
function drawHorizon(ctx, cx, cy, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll * 0.6);
  const pitchPx = Math.max(-r, Math.min(r, plane.pitch * r * 1.4));
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3a7bd5';
  ctx.fillRect(-r - 2, -r * 2 - 2, r * 2 + 4, r * 2 + 2);
  ctx.fillStyle = '#8a6a3f';
  ctx.fillRect(-r - 2, 0, r * 2 + 4, r * 2 + 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  for (const off of [-28, -14, 14, 28]) {
    ctx.beginPath();
    ctx.moveTo(-14, off);
    ctx.lineTo(14, off);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed wings marker and bezel.
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - r - 6, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + r + 6, cy);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(200, 220, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  label(ctx, 'ATT', cx - 12, cy + r + 15, '#8fc8ff', 10);
}

// A round gauge with a needle: airspeed or altitude trend.
function drawDial(ctx, cx, cy, r, value, max, ticks, unit, color) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(12, 18, 28, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (const t of ticks) {
    const a = (-225 + (t / max) * 270) * (Math.PI / 180);
    const x1 = cx + Math.cos(a) * (r - 4);
    const y1 = cy + Math.sin(a) * (r - 4);
    const x2 = cx + Math.cos(a) * (r - 11);
    const y2 = cy + Math.sin(a) * (r - 11);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const a = (-225 + (Math.max(0, Math.min(max, value)) / max) * 270) * (Math.PI / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, unit, cx - 10, cy + r + 14, '#8fc8ff', 10);
}

function drawCompass(ctx, cx, y, heading) {
  const w = 300;
  const h = 26;
  panel(ctx, cx - w / 2, y, w, h, 0.7);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, y, w, h, 10);
  ctx.clip();
  const pxPerDeg = 4;
  const center = cx;
  for (let d = -40; d <= 40; d += 5) {
    const hdg = Math.round((heading + d) / 5) * 5;
    const norm = ((hdg % 360) + 360) % 360;
    const x = center + (hdg - heading) * pxPerDeg;
    if (x < cx - w / 2 || x > cx + w / 2) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y + (d % 10 === 0 ? 4 : 12));
    ctx.lineTo(x, y + h - 4);
    ctx.stroke();
    if (d % 10 === 0) {
      const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm] ?? String(norm).padStart(3, '0');
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(name, x, y + 12);
    }
  }
  ctx.restore();
  // The lubber line.
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(cx, y + 2);
  ctx.lineTo(cx - 5, y + 9);
  ctx.lineTo(cx + 5, y + 9);
  ctx.closePath();
  ctx.fill();
}

function drawFuelGauge(ctx, x, y, w, fuel, low) {
  label(ctx, 'FUEL', x, y - 6);
  panel(ctx, x, y, w, 14, 0.7);
  const frac = Math.max(0, Math.min(1, fuel / 100));
  const color = low ? (Math.sin(performance.now() / 150) > 0 ? '#ff4d3d' : '#ff8a3d') : '#4dd07a';
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, Math.max(4, (w - 4) * frac), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(fuel)}%`, x + w + 34, y + 12);
}

function drawThrottleGauge(ctx, x, y, w, throttle) {
  label(ctx, 'THR', x, y - 6);
  panel(ctx, x, y, w, 14, 0.7);
  ctx.fillStyle = '#4da3ff';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, Math.max(4, (w - 4) * throttle), 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(throttle * 100)}%`, x + w + 34, y + 12);
}

function warningLight(ctx, x, y, text, on, color) {
  ctx.fillStyle = on ? color : 'rgba(60, 70, 84, 0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = on ? '#ffffff' : '#7a8694';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 12, y + 3);
}

// The whole HUD, drawn over the game frame.
export function drawHud(ctx, game) {
  const { plane, world, score, ringsPassed, timeLeft, state } = game;
  const mission = world.mission;
  const altFt = Math.round(plane.alt * 3.28084);
  const speedKt = Math.round(plane.speed * KNOTS_PER_MS);
  const vsFpm = Math.round(plane.verticalSpeed * 196.85);
  const lowFuel = plane.fuel < 20;
  const stalled = plane.stalled;

  // Top-left: altitude, speed, vertical speed.
  panel(ctx, 14, 12, 250, 96);
  label(ctx, 'ALTITUDE', 28, 32);
  bigValue(ctx, `${altFt.toLocaleString()}`, 28, 62, stalled ? '#ff6b5e' : '#ffffff');
  label(ctx, 'FT', 210, 62, '#8fc8ff', 13);
  label(ctx, 'VERT', 28, 92);
  ctx.fillStyle = vsFpm >= 0 ? '#7dff9e' : '#ffb347';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${vsFpm >= 0 ? '+' : ''}${vsFpm} FPM`, 76, 92);

  panel(ctx, 278, 12, 250, 96);
  label(ctx, 'AIRSPEED', 292, 32);
  bigValue(ctx, `${speedKt}`, 292, 62, stalled ? '#ff6b5e' : '#ffffff');
  label(ctx, 'KT', 386, 62, '#8fc8ff', 13);
  label(ctx, 'THROTTLE', 292, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(`${Math.round(plane.throttle * 100)}%`, 378, 92);

  // Top-centre: heading compass and the route, on a dark backing so the
  // white text stays readable against bright cloud.
  panel(ctx, VIEW_W / 2 - 190, 8, 380, 84, 0.82);
  drawCompass(ctx, VIEW_W / 2, 14, plane.heading);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`HDG ${String(Math.round(plane.heading)).padStart(3, '0')}°`, VIEW_W / 2, 62);
  ctx.fillStyle = '#cfe6ff';
  ctx.font = '600 12px system-ui, sans-serif';
  const distKm = Math.max(0, (world.runway.x - plane.x) / 1000);
  ctx.fillText(`RUNWAY 09 — ${distKm.toFixed(1)} KM`, VIEW_W / 2, 80);

  // Top-right: score, rings, timer.
  panel(ctx, VIEW_W - 264, 12, 250, 96);
  label(ctx, 'SCORE', VIEW_W - 250, 32);
  bigValue(ctx, `${score.toLocaleString()}`, VIEW_W - 250, 62, '#ffd98a');
  label(ctx, 'RINGS', VIEW_W - 250, 92);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${ringsPassed} / ${mission.rings}`, VIEW_W - 196, 92);
  label(ctx, 'TIME', VIEW_W - 96, 92);
  ctx.fillText(formatTime(timeLeft), VIEW_W - 52, 92);

  // Bottom-left instrument cluster: horizon, airspeed dial, altimeter dial.
  panel(ctx, 14, VIEW_H - 128, 330, 114);
  drawHorizon(ctx, 62, VIEW_H - 72, 40, plane);
  drawDial(ctx, 158, VIEW_H - 72, 38, plane.speed, 100, [0, 25, 50, 75, 100], 'KT', '#4da3ff');
  drawDial(ctx, 248, VIEW_H - 72, 38, Math.min(600, plane.alt), 600, [0, 150, 300, 450, 600], 'ALT M', '#7dff9e');
  label(ctx, 'SKYLARK', 288, VIEW_H - 28, '#8fc8ff', 10);

  // Bottom-right: fuel, throttle, gear/flaps, warnings.
  panel(ctx, VIEW_W - 330, VIEW_H - 128, 316, 114);
  drawFuelGauge(ctx, VIEW_W - 316, VIEW_H - 106, 148, plane.fuel, lowFuel);
  drawThrottleGauge(ctx, VIEW_W - 316, VIEW_H - 72, 148, plane.throttle);
  warningLight(ctx, VIEW_W - 112, VIEW_H - 100, 'LOW FUEL', lowFuel, '#ff4d3d');
  warningLight(ctx, VIEW_W - 112, VIEW_H - 76, 'STALL', stalled, '#ff4d3d');
  warningLight(ctx, VIEW_W - 112, VIEW_H - 52, 'GEAR', plane.gearDown, '#4dd07a');
  warningLight(ctx, VIEW_W - 112, VIEW_H - 28, 'FLAPS', plane.flaps, '#4da3ff');

  // Mission banner and transient messages.
  if (game.banner) {
    ctx.fillStyle = 'rgba(12, 18, 28, 0.75)';
    ctx.font = '700 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(game.banner).width + 44;
    ctx.beginPath();
    ctx.roundRect(VIEW_W / 2 - w / 2, 118, w, 42, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(game.banner, VIEW_W / 2, 146);
  }
  if (game.message) {
    ctx.fillStyle = game.messageColor ?? '#ffffff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText(game.message, VIEW_W / 2, 190);
    ctx.shadowBlur = 0;
  }

  // Pause veil.
  if (state === 'paused') {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VIEW_W / 2, VIEW_H / 2 - 10);
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillStyle = '#cfe6ff';
    ctx.fillText('Press P to keep flying — R restarts the sortie', VIEW_W / 2, VIEW_H / 2 + 28);
  }
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
