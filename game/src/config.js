// Skylark Run — shared constants, mission definitions and tuning.
// All numbers are in game units: x in metres along the route, y in metres
// of altitude above sea level. One canvas pixel is about 1.1 metres at the
// default zoom, so the numbers below read like real flying.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const SEA_LEVEL = 0;
export const GRAVITY = 9.8;
export const KNOTS_PER_MS = 1.94384;

// The plane's home field sits at x = 0; every mission ends on a runway.
export const FIELD = {
  startX: 0,
  startAlt: 120,
  startSpeed: 55, // m/s, about 107 kt
  maxFuel: 100,
};

export const PLANE = {
  // Flight envelope: lift, drag and stall are all functions of speed.
  stallSpeed: 28, // m/s — below this the wing quits and the nose drops
  maxSpeed: 95, // m/s at full throttle, level flight
  climbRate: 14, // m/s of vertical speed at full power
  sinkRate: 6, // m/s of sink with the throttle closed
  pitchAuthority: 1.6, // radians per second of pitch input
  throttleRate: 0.55, // throttle units per second
  fuelBurn: 0.55, // fuel units per second at full throttle
  idleBurn: 0.08,
  gearSpeedLimit: 45, // m/s — gear must be down and slow to land
};

export const SCORE = {
  ring: 250,
  ringTimeBonus: 120, // bonus for passing a ring fast after the previous one
  landing: 500,
  fuelBonusPerUnit: 6,
  smoothLandingBonus: 300,
  missionBonus: 400,
};

// Three sorties with different goals, weather and fuel pressure.
export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    tagline: 'Thread 8 sky rings, then bring her home to the runway.',
    seed: 1107,
    rings: 8,
    distance: 9000, // metres to the runway threshold
    fuel: 100,
    wind: 2,
    sky: 'dawn',
    storm: false,
    briefing:
      'Morning over the archipelago. Eight rings mark the course. ' +
      'Pass every ring, keep the fuel needle out of the red, and land on runway 09.',
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    tagline: 'A long hop across open water to a far island strip.',
    seed: 2204,
    rings: 5,
    distance: 14000,
    fuel: 100,
    wind: 5,
    sky: 'noon',
    storm: false,
    briefing:
      'Open sea most of the way, then a green island with a short strip. ' +
      'Five rings guide you across. Mind the headwind — it drinks fuel.',
  },
  {
    id: 'storm-courier',
    name: 'Storm Courier',
    tagline: 'Night mail through a storm front. Ten rings, thin fuel.',
    seed: 3319,
    rings: 10,
    distance: 11000,
    fuel: 78,
    wind: 9,
    sky: 'storm',
    storm: true,
    briefing:
      'A mail run nobody else would take. Ten rings in the dark, gusts ' +
      'shoving the wings, and fuel for one careful trip. Land it clean.',
  },
];

// Palette per sky, so each mission reads as its own time of day.
export const SKIES = {
  dawn: {
    top: '#2b4a7a', mid: '#e8905a', low: '#f7c98a',
    sun: '#ffd9a0', sunX: 0.78, sunY: 0.22,
    cloud: 'rgba(255, 235, 220, 0.85)',
    haze: 'rgba(247, 201, 138, 0.25)',
  },
  noon: {
    top: '#2f7fd0', mid: '#7ec3ee', low: '#d9f0ff',
    sun: '#fff3c4', sunX: 0.82, sunY: 0.16,
    cloud: 'rgba(255, 255, 255, 0.95)',
    haze: 'rgba(217, 240, 255, 0.22)',
  },
  storm: {
    top: '#101827', mid: '#2c3a52', low: '#4a5a75',
    sun: '#c8d4e8', sunX: 0.2, sunY: 0.14,
    cloud: 'rgba(30, 38, 55, 0.9)',
    haze: 'rgba(74, 90, 117, 0.35)',
  },
};

// Difficulty-friendly key bindings, shown on the menu and the help card.
export const KEYS_HELP = [
  ['↑ / ↓  or  W / S', 'Pitch up / down'],
  ['← / →  or  A / D', 'Throttle down / up'],
  ['Mouse', 'Move to steer, wheel = throttle'],
  ['G', 'Landing gear down / up'],
  ['F', 'Flaps (slower, steadier)'],
  ['Space', 'Air brake'],
  ['P', 'Pause'],
  ['M', 'Sound on / off'],
  ['R', 'Restart the sortie'],
];
