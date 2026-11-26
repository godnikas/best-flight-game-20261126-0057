// Skylark Run — the flight model.
// A light, honest arcade model: throttle sets thrust, pitch sets climb,
// lift needs speed, and the ground (or the sea) always wins an argument.
// All state lives in one plain object so the game loop can snapshot it.

import { PLANE, GRAVITY } from './config.js';

export function createPlane(mission) {
  return {
    x: 0,
    alt: 120, // metres above sea level
    speed: 55, // m/s
    pitch: 0, // radians, positive = nose up
    throttle: 0.62,
    fuel: mission.fuel,
    gearDown: false,
    flaps: false,
    verticalSpeed: 0,
    heading: 90, // magnetic heading, degrees; the route runs due east
    stalled: false,
    crashed: false,
    landed: false,
    onGround: false,
    roll: 0,
  };
}

// One fixed step of flight. dt is seconds, input is the polled snapshot,
// wind is the mission's headwind in m/s, gusts is the current gust in m/s.
export function stepFlight(plane, input, dt, wind, gusts, world) {
  if (plane.crashed || plane.landed) return;

  // Throttle: keys move it steadily, the wheel steps it in notches.
  plane.throttle += input.throttleKeys * PLANE.throttleRate * dt;
  plane.throttle += input.wheelDelta * 0.06;
  plane.throttle = Math.max(0, Math.min(1, plane.throttle));

  // Pitch follows the stick, eased so the nose never snaps.
  const targetPitch = input.pitch * 0.42;
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, dt * 3.2);
  plane.roll = -input.pitch * 0.35;

  // Air brake and flaps trade speed for control.
  const brakeDrag = input.brake ? 14 : 0;
  const flapDrag = plane.flaps ? 6 : 0;

  // Thrust versus drag: the plane accelerates toward its trim speed.
  const trimSpeed = 22 + plane.throttle * 72 - (plane.flaps ? 8 : 0);
  const drag = 0.55 + brakeDrag * 0.02 + flapDrag * 0.02;
  plane.speed += (trimSpeed - plane.speed) * Math.min(1, dt * drag * 0.9);
  plane.speed -= (wind + gusts) * dt * 0.12;

  // Lift: climb comes from pitch times speed; below stall speed the
  // wing gives up and the nose drops no matter what the stick says.
  plane.stalled = plane.speed < PLANE.stallSpeed;
  let climb = Math.sin(plane.pitch) * plane.speed;
  if (plane.stalled) {
    climb = -PLANE.sinkRate * 1.8;
    plane.pitch += (plane.pitch > 0 ? -1 : 1) * dt * 0.4;
  }
  // Idle throttle sinks; full throttle climbs even level.
  climb += (plane.throttle - 0.55) * 8;
  plane.verticalSpeed += (climb - plane.verticalSpeed) * Math.min(1, dt * 2.4);
  plane.alt += plane.verticalSpeed * dt;

  // Forward motion, slowed by headwind.
  plane.x += Math.max(0, plane.speed - wind * 0.35 - gusts * 0.2) * dt;

  // Heading wanders a touch with the wind, as a real compass would.
  plane.heading = 90 + Math.sin(plane.x / 900) * 1.5 + gusts * 0.4;

  // Fuel: throttle drinks it, idle sips it.
  const burn = PLANE.idleBurn + plane.throttle * plane.throttle * PLANE.fuelBurn;
  plane.fuel = Math.max(0, plane.fuel - burn * dt);
  if (plane.fuel <= 0 && plane.throttle > 0.15) {
    plane.throttle = Math.max(0, plane.throttle - dt * 0.5);
  }

  // The ground: touching it fast is a crash, touching it slow on the
  // runway with the gear down is a landing, anywhere else is a ditching.
  const ground = world.groundHeight(plane.x);
  const runway = world.runway;
  // The graded flat ground before the threshold counts as the strip's
  // overrun: a gentle touchdown there is a landing, not a crash.
  const onRunway = plane.x >= runway.x - 120 && plane.x <= runway.x + runway.length;
  if (plane.alt <= ground + 2) {
    plane.alt = ground + 2;
    const vertical = Math.abs(plane.verticalSpeed);
    const gentle = vertical < 4.5 && plane.speed < PLANE.gearSpeedLimit + 12;
    if (onRunway && plane.gearDown && gentle && plane.speed < 52) {
      plane.landed = true;
      plane.onGround = true;
      plane.verticalSpeed = 0;
    } else if (onRunway && !plane.gearDown && gentle && plane.speed < 40) {
      // A belly landing on the strip: it counts, but it costs the bonus.
      plane.landed = true;
      plane.onGround = true;
      plane.verticalSpeed = 0;
      plane.bellyLanding = true;
    } else {
      plane.crashed = true;
      plane.crashKind = ground < 2 ? 'sea' : 'terrain';
    }
  }

  // Flying into the drink below sea level is the same as hitting ground.
  if (plane.alt < 2 && !plane.crashed && !plane.landed) {
    plane.crashed = true;
    plane.crashKind = 'sea';
  }
}

// Rolling out after touchdown: bleed speed on the strip.
export function stepRollout(plane, dt, world) {
  if (!plane.landed) return;
  plane.speed = Math.max(0, plane.speed - 22 * dt);
  plane.x += plane.speed * dt;
  const runway = world.runway;
  if (plane.x > runway.x + runway.length + 120) {
    plane.speed = 0;
  }
}

// Did the nose just cross a ring's plane inside its circle?
// Returns the ring when crossed this step, else null.
export function checkRing(plane, prevX, ring) {
  if (ring.passed) return null;
  if (prevX < ring.x && plane.x >= ring.x) {
    const dy = Math.abs(plane.alt - ring.alt);
    if (dy < ring.radius) {
      ring.passed = true;
      ring.flash = 1;
      return ring;
    }
  }
  return null;
}
