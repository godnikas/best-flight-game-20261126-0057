// Skylark Run — the world: terrain, rings and the runway.
// Terrain is a deterministic function of distance, built from a seeded
// random generator so every run of a mission flies the same coastline.
// The route is a chain of zones: home field, sea, islands, mountains, a
// river city, then the destination runway.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1-D value noise from a seeded table, for hills and sea swell.
function makeNoise(rand, points, spacing) {
  const table = [];
  for (let i = 0; i < points; i++) table.push(rand() * 2 - 1);
  return function at(x) {
    const fx = x / spacing;
    const i = Math.floor(fx);
    const f = fx - i;
    const a = table[((i % points) + points) % points];
    const b = table[(((i + 1) % points) + points) % points];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

// A zone is a stretch of the route with its own ground character.
function buildZones(mission, rand) {
  const total = mission.distance + 1600;
  const zones = [];
  const push = (from, to, kind) => zones.push({ from, to, kind });
  push(0, 900, 'field');
  let x = 900;
  const seaEnd = Math.min(total * 0.42, x + 2600 + rand() * 1200);
  push(x, seaEnd, 'sea');
  x = seaEnd;
  const isleEnd = Math.min(total * 0.62, x + 1400 + rand() * 900);
  push(x, isleEnd, 'islands');
  x = isleEnd;
  const mtnEnd = Math.min(total * 0.8, x + 1500 + rand() * 800);
  push(x, mtnEnd, 'mountains');
  x = mtnEnd;
  push(x, total - 700, 'city');
  push(total - 700, total, 'field');
  return zones;
}

export function createWorld(mission) {
  const rand = mulberry32(mission.seed);
  const zones = buildZones(mission, rand);
  const hills = makeNoise(rand, 64, 420);
  const detail = makeNoise(rand, 128, 90);
  const total = mission.distance + 1600;

  // The destination runway: flat, at the end of the route.
  const runway = {
    x: mission.distance,
    length: 620,
    y: 26, // ground height at the strip
    heading: 90,
  };

  // Ground height in metres above sea level at distance x.
  function groundHeight(x) {
    if (x < 0) return 26;
    // The runway sits on graded flat ground, with a clear approach.
    if (x >= runway.x - 120 && x <= runway.x + runway.length + 120) return 26;
    if (x > total) return 26;
    const zone = zones.find((z) => x >= z.from && x < z.to) ?? zones[zones.length - 1];
    const t = (x - zone.from) / Math.max(1, zone.to - zone.from);
    switch (zone.kind) {
      case 'field':
        return 26 + hills(x) * 4 + detail(x) * 2;
      case 'sea':
        // Open water, with a swell that never rises above the beach.
        return -6 + Math.sin(x / 260) * 2 + hills(x) * 1.5;
      case 'islands': {
        // Two or three green humps rising out of the sea.
        const bump = Math.max(0, Math.sin(t * Math.PI * 2.6)) ** 1.4;
        return -6 + bump * 34 + hills(x) * 5;
      }
      case 'mountains':
        return 30 + Math.max(0, hills(x)) * 150 + Math.max(0, detail(x)) * 26;
      case 'city':
        // A river valley town: low ground, one river crossing.
        return 24 + hills(x) * 6 + detail(x) * 2;
      default:
        return 26;
    }
  }

  function zoneAt(x) {
    return zones.find((z) => x >= z.from && x < z.to) ?? zones[zones.length - 1];
  }

  // The river cuts the city zone once, east of its middle.
  const cityZone = zones.find((z) => z.kind === 'city');
  const riverX = cityZone ? cityZone.from + (cityZone.to - cityZone.from) * 0.55 : total * 0.7;

  // Rings hang in the sky along the route, one per gap, at varied heights.
  const rings = [];
  const gap = mission.distance / (mission.rings + 1);
  for (let i = 0; i < mission.rings; i++) {
    const x = gap * (i + 1) + (rand() - 0.5) * gap * 0.4;
    const ground = groundHeight(x);
    const alt = Math.max(ground + 90, 110 + rand() * 160);
    rings.push({
      index: i + 1,
      x,
      alt,
      radius: 42,
      passed: false,
      flash: 0, // counts down after being flown through
    });
  }

  // City buildings, placed once and drawn from the same seed.
  const buildings = [];
  if (cityZone) {
    let bx = cityZone.from + 120;
    while (bx < cityZone.to - 160) {
      const w = 26 + rand() * 42;
      const h = 26 + rand() * 74;
      const g = groundHeight(bx + w / 2);
      buildings.push({ x: bx, w, h, y: g, lit: rand() });
      bx += w + 14 + rand() * 46;
    }
  }

  // Clouds drift slowly and wrap around the camera.
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: rand() * (total + 2000),
      y: 40 + rand() * 260,
      s: 60 + rand() * 130,
      speed: 3 + rand() * 6,
    });
  }

  return {
    mission,
    zones,
    total,
    runway,
    riverX,
    rings,
    buildings,
    clouds,
    groundHeight,
    zoneAt,
    // A ring counts when the plane's nose crosses its plane within its radius.
    ringDistance(plane) {
      return null;
    },
  };
}

// Height of the far mountain silhouette, drawn behind the terrain.
export function ridgeHeight(x, seed) {
  const n = makeNoise(mulberry32(seed + 77), 32, 900);
  return 60 + Math.max(0, n(x)) * 190;
}
