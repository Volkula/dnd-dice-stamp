// Dice generator: builds a solid for a die with a given number of outcomes
// and reports the faces the numbers go on. Works on the manifold-3d module passed in,
// so it runs the same in the page and in a Node check.

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
// Half-size of the block the convex shapes are carved from, in units of the inscribed radius.
const BLOCK = 400;

export const MIN_OUTCOMES = 2;
export const MAX_OUTCOMES = 120;

// Settings of a single shape, shown as extra rows in the generator.
// range: a slider, a multiplier of the usual size unless said otherwise. choice: a list.
// check: a tick. count: a whole number. when: the row only matters while another option has that value.
// shows: what the row prints next to its name instead of the multiplier.
const scale = (id, labelKey, min, max) => ({ id, type: 'range', labelKey, min, max, step: 0.05, initial: 1 });
const choice = (id, labelKey, values) => ({ id, type: 'choice', labelKey, initial: values[0].id, values });
const HILT = [
  scale('gripLength', 'gen.opt.gripLength', 0.6, 1.8),
  scale('gripWidth', 'gen.opt.gripWidth', 0.6, 1.6),
  scale('guardWidth', 'gen.opt.guardWidth', 0.85, 1.6),
  scale('guardThick', 'gen.opt.guardThick', 0.5, 2.5),
];
// Two bands of numbers: the same numbers on both, or a different set on each.
const NUMBERS = [
  choice('numbers', 'gen.opt.numbers', [
    { id: 'same', key: 'gen.opt.numbers.same' },
    { id: 'split', key: 'gen.opt.numbers.split' },
  ]),
  // The share of the facets the smaller band gets.
  { id: 'share', type: 'range', labelKey: 'gen.opt.share', min: 0.25, max: 0.5, step: 0.05, initial: 0.4, shows: 'split', when: { numbers: 'split' } },
];
const POTION = [
  scale('body', 'gen.opt.body', 0.5, 2),
  choice('neck', 'gen.opt.neck', [
    { id: 'faceted', key: 'gen.opt.neck.faceted' },
    { id: 'round', key: 'gen.opt.neck.round' },
  ]),
  choice('stopper', 'gen.opt.stopper', [
    { id: 'cork', key: 'gen.opt.stopper.cork' },
    { id: 'ball', key: 'gen.opt.stopper.ball' },
    { id: 'crystal', key: 'gen.opt.stopper.crystal' },
    { id: 'none', key: 'gen.opt.stopper.none' },
  ]),
];
const SCROLL = [
  scale('rod', 'gen.opt.rod', 0.6, 2),
  choice('finial', 'gen.opt.finial', [
    { id: 'knob', key: 'gen.opt.finial.knob' },
    { id: 'cone', key: 'gen.opt.finial.cone' },
    { id: 'ball', key: 'gen.opt.finial.ball' },
  ]),
];

export const GROUPS = [
  { id: 'plain', nameKey: 'gen.group.plain' },
  { id: 'weapons', nameKey: 'gen.group.weapons' },
  { id: 'music', nameKey: 'gen.group.music' },
  { id: 'vessels', nameKey: 'gen.group.vessels' },
  { id: 'things', nameKey: 'gen.group.things' },
];

// kind: 'poly' lands on any face, 'roll' lies on its side (ends carry no number),
// 'ends' is a prism whose two ends count as faces too.
// least: the fewest faces the shape looks right with. themed: a decorative shape, not a fair one.
// round: a ball-like body cut the way the plain polyhedron is. awkward: a figure for show that
// seldom comes to rest with a number up. lopsided: the sides have no opposite ones.
// options: the settings only this shape has.
export const SHAPES = [
  { id: 'sphere', group: 'plain', nameKey: 'gen.shape.sphere', shortKey: 'gen.short.sphere', kind: 'poly', stretch: false, caps: false },
  { id: 'spindle', group: 'plain', nameKey: 'gen.shape.spindle', shortKey: 'gen.short.spindle', kind: 'poly', stretch: true, caps: false },
  { id: 'cylinder', group: 'plain', nameKey: 'gen.shape.cylinder', shortKey: 'gen.short.cylinder', kind: 'roll', least: 3, stretch: true, caps: true },
  { id: 'prism', group: 'plain', nameKey: 'gen.shape.prism', shortKey: 'gen.short.prism', kind: 'ends', stretch: true, caps: false },

  { id: 'sword', group: 'weapons', nameKey: 'gen.shape.sword', shortKey: 'gen.short.sword', kind: 'roll', least: 3, themed: true, options: HILT },
  { id: 'dagger', group: 'weapons', nameKey: 'gen.shape.dagger', shortKey: 'gen.short.dagger', kind: 'roll', least: 3, themed: true, options: HILT },
  { id: 'mace', group: 'weapons', nameKey: 'gen.shape.mace', shortKey: 'gen.short.mace', kind: 'roll', least: 4, themed: true, options: [scale('fins', 'gen.opt.flanges', 0, 1.8)] },
  { id: 'morningstar', group: 'weapons', nameKey: 'gen.shape.morningstar', shortKey: 'gen.short.morningstar', kind: 'poly', round: true, themed: true, options: [scale('fins', 'gen.opt.spikes', 0.4, 1.8)] },
  { id: 'spear', group: 'weapons', nameKey: 'gen.shape.spear', shortKey: 'gen.short.spear', kind: 'roll', least: 3, themed: true, options: [scale('shaft', 'gen.opt.shaft', 0.6, 1.5)] },
  { id: 'axe', group: 'weapons', nameKey: 'gen.shape.axe', shortKey: 'gen.short.axe', kind: 'roll', least: 4, themed: true, awkward: true, options: [scale('fins', 'gen.opt.blade', 0.6, 1.4)] },
  { id: 'hammer', group: 'weapons', nameKey: 'gen.shape.hammer', shortKey: 'gen.short.hammer', kind: 'roll', least: 4, themed: true, awkward: true, options: NUMBERS },
  { id: 'staff', group: 'weapons', nameKey: 'gen.shape.staff', shortKey: 'gen.short.staff', kind: 'roll', least: 4, themed: true },
  { id: 'wand', group: 'weapons', nameKey: 'gen.shape.wand', shortKey: 'gen.short.wand', kind: 'roll', least: 3, themed: true },
  { id: 'torch', group: 'weapons', nameKey: 'gen.shape.torch', shortKey: 'gen.short.torch', kind: 'roll', least: 4, themed: true },
  { id: 'shield', group: 'weapons', nameKey: 'gen.shape.shield', shortKey: 'gen.short.shield', kind: 'ends', stretch: true, themed: true, lopsided: true },
  { id: 'shuriken', group: 'weapons', nameKey: 'gen.shape.shuriken', shortKey: 'gen.short.shuriken', kind: 'ends', stretch: true, themed: true, options: [scale('fins', 'gen.opt.blades', 0.6, 1.5)] },
  { id: 'cannon', group: 'weapons', nameKey: 'gen.shape.cannon', shortKey: 'gen.short.cannon', kind: 'roll', least: 5, themed: true },
  { id: 'bomb', group: 'weapons', nameKey: 'gen.shape.bomb', shortKey: 'gen.short.bomb', kind: 'poly', round: true, themed: true },

  { id: 'drum', group: 'music', nameKey: 'gen.shape.drum', shortKey: 'gen.short.drum', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'djembe', group: 'music', nameKey: 'gen.shape.djembe', shortKey: 'gen.short.djembe', kind: 'roll', least: 5, themed: true },
  { id: 'tambourine', group: 'music', nameKey: 'gen.shape.tambourine', shortKey: 'gen.short.tambourine', kind: 'ends', stretch: true, themed: true },
  { id: 'gong', group: 'music', nameKey: 'gen.shape.gong', shortKey: 'gen.short.gong', kind: 'ends', stretch: true, themed: true },
  { id: 'bell', group: 'music', nameKey: 'gen.shape.bell', shortKey: 'gen.short.bell', kind: 'roll', least: 5, themed: true, options: [{ id: 'clapper', type: 'check', labelKey: 'gen.opt.clapper', initial: true }] },
  { id: 'flute', group: 'music', nameKey: 'gen.shape.flute', shortKey: 'gen.short.flute', kind: 'roll', least: 5, themed: true },
  { id: 'fanfare', group: 'music', nameKey: 'gen.shape.fanfare', shortKey: 'gen.short.fanfare', kind: 'roll', least: 5, themed: true },
  { id: 'maraca', group: 'music', nameKey: 'gen.shape.maraca', shortKey: 'gen.short.maraca', kind: 'roll', least: 5, themed: true },
  { id: 'lute', group: 'music', nameKey: 'gen.shape.lute', shortKey: 'gen.short.lute', kind: 'roll', least: 5, themed: true, awkward: true },

  { id: 'cauldron', group: 'vessels', nameKey: 'gen.shape.cauldron', shortKey: 'gen.short.cauldron', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
  { id: 'plate', group: 'vessels', nameKey: 'gen.shape.plate', shortKey: 'gen.short.plate', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'goblet', group: 'vessels', nameKey: 'gen.shape.goblet', shortKey: 'gen.short.goblet', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
  { id: 'vase', group: 'vessels', nameKey: 'gen.shape.vase', shortKey: 'gen.short.vase', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
  { id: 'mug', group: 'vessels', nameKey: 'gen.shape.mug', shortKey: 'gen.short.mug', kind: 'roll', least: 5, themed: true },
  { id: 'keg', group: 'vessels', nameKey: 'gen.shape.keg', shortKey: 'gen.short.keg', kind: 'roll', least: 5, themed: true },
  { id: 'potion', group: 'vessels', nameKey: 'gen.shape.potion', shortKey: 'gen.short.potion', kind: 'roll', least: 4, themed: true, options: POTION },

  { id: 'scroll', group: 'things', nameKey: 'gen.shape.scroll', shortKey: 'gen.short.scroll', kind: 'roll', least: 3, stretch: true, caps: false, themed: true, options: SCROLL },
  { id: 'book', group: 'things', nameKey: 'gen.shape.book', shortKey: 'gen.short.book', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'candle', group: 'things', nameKey: 'gen.shape.candle', shortKey: 'gen.short.candle', kind: 'roll', least: 4, themed: true },
  { id: 'tower', group: 'things', nameKey: 'gen.shape.tower', shortKey: 'gen.short.tower', kind: 'roll', least: 4, themed: true },
  { id: 'hourglass', group: 'things', nameKey: 'gen.shape.hourglass', shortKey: 'gen.short.hourglass', kind: 'roll', least: 3, themed: true, options: NUMBERS },
  { id: 'crown', group: 'things', nameKey: 'gen.shape.crown', shortKey: 'gen.short.crown', kind: 'ends', stretch: true, themed: true, options: [scale('fins', 'gen.opt.points', 0.4, 1.8)] },
  { id: 'coin', group: 'things', nameKey: 'gen.shape.coin', shortKey: 'gen.short.coin', kind: 'ends', stretch: true, themed: true },
  { id: 'gear', group: 'things', nameKey: 'gen.shape.gear', shortKey: 'gen.short.gear', kind: 'ends', stretch: true, themed: true, options: [scale('fins', 'gen.opt.teeth', 0.5, 2)] },
  { id: 'crystal', group: 'things', nameKey: 'gen.shape.crystal', shortKey: 'gen.short.crystal', kind: 'roll', least: 3, themed: true, options: [{ id: 'side', type: 'count', labelKey: 'gen.opt.side', min: 0, max: 5, initial: 2 }] },
  { id: 'egg', group: 'things', nameKey: 'gen.shape.egg', shortKey: 'gen.short.egg', kind: 'poly', round: true, themed: true },
  { id: 'bone', group: 'things', nameKey: 'gen.shape.bone', shortKey: 'gen.short.bone', kind: 'roll', least: 3, themed: true },
  { id: 'mushroom', group: 'things', nameKey: 'gen.shape.mushroom', shortKey: 'gen.short.mushroom', kind: 'roll', least: 5, themed: true },
  { id: 'cheese', group: 'things', nameKey: 'gen.shape.cheese', shortKey: 'gen.short.cheese', kind: 'ends', stretch: true, themed: true },
];

export const CAPS = ['cone', 'dome', 'flat'];

export function shapeById(id) {
  return SHAPES.find((shape) => shape.id === id) || SHAPES[0];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function unit(a) {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

// The shape's own settings with every value present and within its limits.
export function optionsFor(shapeId, given) {
  const out = {};
  const raw = given && typeof given === 'object' ? given : {};
  for (const option of shapeById(shapeId).options || []) {
    const value = raw[option.id];
    if (option.type === 'choice') {
      out[option.id] = option.values.some((entry) => entry.id === value) ? value : option.initial;
    } else if (option.type === 'check') {
      out[option.id] = typeof value === 'boolean' ? value : option.initial;
    } else {
      const number = Number(value);
      const within = value != null && value !== '' && Number.isFinite(number)
        ? Math.min(option.max, Math.max(option.min, number))
        : option.initial;
      out[option.id] = option.type === 'count' ? Math.round(within) : within;
    }
  }
  return out;
}

// The ways to share the facets of a die between two bands, the smaller band first.
// Two unequal bands need an even number of facets each: the one lying flat then shows a facet
// on top. Facets of the two bands that look almost the same way share one place to lie on, and
// the die seldom stops on either, so the two counts must fall into step often: their least
// common multiple is kept small. Two equal bands half a facet apart always do, odd ones too:
// such a die lies on a facet of one band and shows a facet of the other.
// paired: every band must have opposite facets.
const SPLIT_STEP = 45;
function splitsOf(faces, paired) {
  const list = [];
  if (faces % 2 || faces < 6) return list;
  const half = faces / 2;
  const divisor = (a, b) => (b ? divisor(b, a % b) : a);
  for (let few = 4; few < half; few += 2) {
    const many = faces - few;
    if (few >= faces / 4 && (few * many) / divisor(few, many) <= SPLIT_STEP) list.push([few, many]);
  }
  if (half % 2 === 0 || !paired) list.push([half, half]);
  return list;
}

// How many faces the solid gets for n outcomes, and whether the result reads from the top face.
// split: the facets of the two bands of a shape that carries a different set of numbers on each.
export function planDie(shapeId, outcomes, double, given) {
  const shape = shapeById(shapeId);
  const options = optionsFor(shapeId, given);
  const n = Math.max(MIN_OUTCOMES, Math.min(MAX_OUTCOMES, Math.round(outcomes)));
  // Every number on two opposite faces: the face count is an even multiple of n.
  const doubled = (least) => {
    let faces = 2 * n;
    while (faces < least) faces += 2 * n;
    return faces;
  };
  let faces;
  let top;
  let split = null;
  if (options.numbers === 'split') {
    // Not every count can be shared between two bands: see splitsOf. Then every number goes on
    // two or four facets.
    faces = double ? 2 * n : n;
    while (!splitsOf(faces, double).length) faces += faces === n ? n : 2 * n;
    top = true;
    for (const pair of splitsOf(faces, double)) {
      if (!split || Math.abs(pair[0] / faces - options.share) < Math.abs(split[0] / faces - options.share) - 1e-9) split = pair;
    }
  } else if (shape.id === 'sphere' || shape.round) {
    faces = !double && n >= 4 ? n : doubled(6);
    top = faces % 2 === 0 && faces !== 4;
  } else if (shape.id === 'spindle') {
    faces = !double && n >= 6 && n % 2 === 0 ? n : doubled(6);
    top = true;
  } else if (shape.kind === 'roll') {
    faces = !double && n >= shape.least ? n : doubled(Math.max(4, shape.least));
    top = faces % 2 === 0;
  } else if (n === 2 && !double) {
    // A coin: only the two ends count.
    faces = 2;
    top = true;
  } else {
    faces = !double && n >= 5 ? n : doubled(6);
    // A lopsided outline has no pairs of parallel sides, so only its two ends read from the top.
    top = faces % 2 === 0 && !shape.lopsided;
  }
  return { shape: shape.id, outcomes: n, faces, repeat: faces / n, top, forced: faces !== n && !double, split };
}

function cyclic(list) {
  const out = [];
  for (const [a, b, c] of list) out.push([a, b, c], [c, a, b], [b, c, a]);
  return out;
}

function signs(list) {
  const out = [];
  const seen = new Set();
  for (const point of list) {
    for (let mask = 0; mask < 8; mask++) {
      const next = point.map((value, i) => ((mask >> i) & 1 && value !== 0 ? -value : value));
      const id = next.map((value) => value.toFixed(6)).join(',');
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(next);
    }
  }
  return out;
}

// Face normals of the solids that are exactly fair. Other counts are spread numerically.
const EXACT = {
  4: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  6: signs([[1, 0, 0], [0, 1, 0], [0, 0, 1]]),
  8: signs([[1, 1, 1]]),
  12: signs(cyclic([[0, 1, PHI]])),
  20: signs([[1, 1, 1], ...cyclic([[0, 1 / PHI, PHI]])]),
  24: signs(cyclic([[1, 1, 1 + Math.SQRT2]])),
  30: signs([...cyclic([[0, 0, PHI]]), ...cyclic([[0.5, PHI / 2, (PHI * PHI) / 2]])]),
};

// Points pushed apart on the unit sphere until they sit evenly. With antipodal set,
// every point has a twin on the far side, so each face gets a parallel opposite one.
function spreadPoints(count, antipodal) {
  const own = antipodal ? count / 2 : count;
  const points = [];
  for (let i = 0; i < own; i++) {
    const z = antipodal ? 1 - (i + 0.5) / own : 1 - (2 * (i + 0.5)) / own;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const angle = i * GOLDEN_ANGLE;
    points.push([r * Math.cos(angle), r * Math.sin(angle), z]);
  }
  const spacing = Math.sqrt((4 * Math.PI) / count);
  const rounds = 500;
  const forces = points.map(() => [0, 0, 0]);
  for (let round = 0; round < rounds; round++) {
    let strongest = 0;
    for (let i = 0; i < own; i++) {
      const p = points[i];
      const force = [0, 0, 0];
      const push = (q) => {
        const d = sub(p, q);
        const l2 = dot(d, d);
        if (l2 < 1e-12) return;
        const k = 1 / (l2 * Math.sqrt(l2));
        force[0] += d[0] * k;
        force[1] += d[1] * k;
        force[2] += d[2] * k;
      };
      for (let j = 0; j < own; j++) {
        if (j !== i) push(points[j]);
        if (antipodal) push([-points[j][0], -points[j][1], -points[j][2]]);
      }
      // Only the part along the sphere moves the point.
      const radial = dot(force, p);
      forces[i] = [force[0] - radial * p[0], force[1] - radial * p[1], force[2] - radial * p[2]];
      strongest = Math.max(strongest, Math.hypot(forces[i][0], forces[i][1], forces[i][2]));
    }
    if (strongest < 1e-12) break;
    const fade = 1 - round / rounds;
    const step = (spacing * 0.25 * fade * fade) / strongest;
    for (let i = 0; i < own; i++) {
      points[i] = unit([
        points[i][0] + forces[i][0] * step,
        points[i][1] + forces[i][1] * step,
        points[i][2] + forces[i][2] * step,
      ]);
    }
  }
  if (!antipodal) return points;
  const all = [];
  for (const p of points) all.push(p, [-p[0], -p[1], -p[2]]);
  return all;
}

// Rotation that carries unit vector a onto unit vector b.
function rotationBetween(a, b) {
  const axis = cross(a, b);
  const sin = Math.hypot(axis[0], axis[1], axis[2]);
  const cos = dot(a, b);
  if (sin < 1e-12) {
    if (cos > 0) return (v) => v;
    // Opposite vectors: half a turn about any axis square to them.
    const side = unit(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]));
    return (v) => {
      const along = dot(v, side);
      return [2 * along * side[0] - v[0], 2 * along * side[1] - v[1], 2 * along * side[2] - v[2]];
    };
  }
  const k = [axis[0] / sin, axis[1] / sin, axis[2] / sin];
  return (v) => {
    const kv = cross(k, v);
    const kd = dot(k, v) * (1 - cos);
    return [
      v[0] * cos + kv[0] * sin + k[0] * kd,
      v[1] * cos + kv[1] * sin + k[1] * kd,
      v[2] * cos + kv[2] * sin + k[2] * kd,
    ];
  };
}

function projected(vector, normal) {
  const along = dot(vector, normal);
  return [vector[0] - along * normal[0], vector[1] - along * normal[1], vector[2] - along * normal[2]];
}

// The text's "up" on a face: the wanted direction flattened into the face, or a spare one for faces square to it.
function upOn(normal, wanted, spare = [0, 1, 0]) {
  let up = projected(wanted, normal);
  if (Math.hypot(up[0], up[1], up[2]) < 0.05) up = projected(spare, normal);
  return unit(up);
}

function tracker(api) {
  const made = [];
  return {
    api,
    keep(object) {
      made.push(object);
      return object;
    },
    free() {
      for (const object of made) object.delete();
    },
  };
}

// The solid inside every half-space n·x <= d.
function carve(kit, planes) {
  let solid = kit.keep(kit.api.Manifold.cube([BLOCK * 2, BLOCK * 2, BLOCK * 2], true));
  for (const { normal, offset } of planes) {
    solid = kit.keep(solid.trimByPlane([-normal[0], -normal[1], -normal[2]], -offset));
  }
  return solid;
}

function sortAround(points, normal) {
  const center = [0, 0, 0];
  for (const p of points) {
    center[0] += p[0] / points.length;
    center[1] += p[1] / points.length;
    center[2] += p[2] / points.length;
  }
  const u = unit(Math.abs(normal[2]) < 0.9 ? cross([0, 0, 1], normal) : cross([0, 1, 0], normal));
  const v = cross(normal, u);
  return points
    .map((p) => {
      const r = sub(p, center);
      return { p, angle: Math.atan2(dot(r, v), dot(r, u)) };
    })
    .sort((a, b) => a.angle - b.angle)
    .map((entry) => entry.p);
}

// The polygon each plane leaves on a carved solid, read back from the mesh corners that lie on it.
function carvedFaces(solid, planes, upFor) {
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const data = mesh.vertProperties;
  const faces = [];
  planes.forEach((plane, index) => {
    const points = [];
    for (let i = 0; i < data.length; i += stride) {
      const p = [data[i], data[i + 1], data[i + 2]];
      if (Math.abs(dot(plane.normal, p) - plane.offset) > 1e-4) continue;
      if (points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-5)) continue;
      points.push(p);
    }
    if (points.length < 3) return;
    faces.push({ normal: plane.normal, polygon: sortAround(points, plane.normal), up: upFor(plane, index) });
  });
  return faces;
}

function regularPolygon(sides, radius = 1, turn = 0) {
  const points = [];
  for (let i = 0; i < sides; i++) {
    const angle = turn + (i * TAU) / sides;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return points;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

// Height of a prism whose end is seen from the centre under the same solid angle as one face of a fair die.
function fairHeight(endArea, faces) {
  const radius = Math.sqrt(endArea / Math.PI);
  const q = 1 - 2 / faces;
  return (2 * radius * q) / Math.sqrt(1 - q * q);
}

// The same outline drawn counter-clockwise: the fill rule below keeps only such outlines.
function counterClockwise(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area < 0 ? points.slice().reverse() : points;
}

function lathe(kit, profile, segments) {
  const section = kit.keep(new kit.api.CrossSection([counterClockwise(profile)], 'Positive'));
  return kit.keep(section.revolve(segments));
}

function extrudeCentred(kit, polygon, height) {
  const section = kit.keep(new kit.api.CrossSection([polygon], 'Positive'));
  const solid = kit.keep(section.extrude(height));
  return kit.keep(solid.translate(0, 0, -height / 2));
}

// Side facets of a faceted body of revolution between two heights.
// margin keeps the numbers clear of whatever stands on the edges between facets.
function bandFaces(segments, radius, zLow, zHigh, upright, margin = 0) {
  const faces = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i * TAU) / segments;
    const a1 = ((i + 1) * TAU) / segments;
    const middle = (a0 + a1) / 2;
    const normal = [Math.cos(middle), Math.sin(middle), 0];
    const from = [radius * Math.cos(a0), radius * Math.sin(a0)];
    const to = [radius * Math.cos(a1), radius * Math.sin(a1)];
    const width = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const cut = Math.min(margin, width * 0.3) / width;
    const left = [from[0] + (to[0] - from[0]) * cut, from[1] + (to[1] - from[1]) * cut];
    const right = [to[0] + (from[0] - to[0]) * cut, to[1] + (from[1] - to[1]) * cut];
    faces.push({
      normal,
      polygon: [
        [left[0], left[1], zLow],
        [right[0], right[1], zLow],
        [right[0], right[1], zHigh],
        [left[0], left[1], zHigh],
      ],
      // Lying dice read along the axis; standing things keep their numbers upright.
      up: upright ? [0, 0, 1] : [-Math.sin(middle), Math.cos(middle), 0],
    });
  }
  return faces;
}

function endFaces(polygon, zTop, zBottom) {
  return [
    { normal: [0, 0, 1], polygon: polygon.map(([x, y]) => [x, y, zTop]), up: [0, 1, 0] },
    { normal: [0, 0, -1], polygon: polygon.map(([x, y]) => [x, y, zBottom]).reverse(), up: [0, 1, 0] },
  ];
}

// Where the faces of a ball-like die look.
function sphereNormals(plan) {
  const count = plan.faces;
  let normals;
  if (EXACT[count]) normals = EXACT[count].map(unit);
  else normals = spreadPoints(count, count % 2 === 0);
  // An even die shows a face on top; an odd one, like the tetrahedron, at least sits flat on one.
  const turn = rotationBetween(normals[0], plan.top ? [0, 0, 1] : [0, 0, -1]);
  return normals.map((normal) => unit(turn(normal)));
}

// offsetOf gives how far from the centre the face with a given normal lies: 1 for a ball.
function buildSphere(kit, plan, spec, offsetOf = () => 1) {
  const planes = sphereNormals(plan).map((normal) => ({ normal, offset: offsetOf(normal) }));
  const solid = carve(kit, planes);
  return { solid, faces: carvedFaces(solid, planes, (plane) => upOn(plane.normal, [0, 0, 1])) };
}

function buildSpindle(kit, plan, spec) {
  const half = plan.faces / 2;
  const height = 1.3 * spec.stretch;
  const planes = [];
  if (half % 2 === 0) {
    // Bipyramid: an even base gives every face a parallel opposite one.
    const apothem = Math.cos(Math.PI / half);
    const length = Math.hypot(height, apothem);
    for (const side of [1, -1]) {
      for (let i = 0; i < half; i++) {
        const angle = ((i + 0.5) * TAU) / half;
        planes.push({
          normal: [(height * Math.cos(angle)) / length, (height * Math.sin(angle)) / length, (side * apothem) / length],
          offset: (apothem * height) / length,
          side,
        });
      }
    }
  } else {
    // Trapezohedron, the shape of a d10: an odd base needs the zigzag belt to stay symmetric.
    const c = Math.cos(Math.PI / half);
    const belt = (height * (1 - c)) / (1 + c);
    const slope = height + belt;
    const length = Math.hypot(slope, 1);
    for (let j = 0; j < half * 2; j++) {
      const angle = (j * Math.PI) / half;
      const side = j % 2 === 0 ? 1 : -1;
      planes.push({
        normal: [(slope * Math.cos(angle)) / length, (slope * Math.sin(angle)) / length, side / length],
        offset: height / length,
        side,
      });
    }
  }
  const solid = carve(kit, planes);
  // Numbers point at the nearer tip, as on a d10.
  return { solid, faces: carvedFaces(solid, planes, (plane) => upOn(plane.normal, [0, 0, plane.side])) };
}

function buildCylinder(kit, plan, spec) {
  const half = 1.2 * spec.stretch;
  let profile;
  if (spec.caps === 'flat') {
    profile = [[0, -half], [1, -half], [1, half], [0, half]];
  } else if (spec.caps === 'dome') {
    const arc = [];
    for (let i = 1; i < 6; i++) {
      const angle = (i / 6) * (Math.PI / 2);
      arc.push([Math.cos(angle), 0.7 * Math.sin(angle)]);
    }
    profile = [
      [0, -half - 0.7],
      ...arc.map(([r, z]) => [r, -half - z]).reverse(),
      [1, -half],
      [1, half],
      ...arc.map(([r, z]) => [r, half + z]),
      [0, half + 0.7],
    ];
  } else {
    // Steep enough that the die cannot come to rest leaning on a tip.
    const tip = Math.max(0.9, 1.1 / half);
    profile = [[0, -half - tip], [1, -half], [1, half], [0, half + tip]];
  }
  return { solid: lathe(kit, profile, plan.faces), faces: bandFaces(plan.faces, 1, -half, half, false) };
}

function buildPrism(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const polygon = regularPolygon(sides);
  const height = (coin ? 0.3 : fairHeight(polygonArea(polygon), plan.faces)) * spec.stretch;
  const solid = extrudeCentred(kit, polygon, height);
  const faces = endFaces(polygon, height / 2, -height / 2);
  if (!coin) faces.push(...bandFaces(sides, 1, -height / 2, height / 2, true));
  return { solid, faces };
}

// ---- Themed shapes. The widest part is one unit from the axis; numbers go on its flat facets. ----

function union(kit, parts) {
  return parts.length === 1 ? parts[0] : kit.keep(kit.api.Manifold.union(parts));
}

function extrudeAt(kit, section, zLow, zHigh) {
  const solid = kit.keep(section.extrude(zHigh - zLow));
  return kit.keep(solid.translate(0, 0, zLow));
}

function sectionOf(kit, polygon) {
  return kit.keep(new kit.api.CrossSection([counterClockwise(polygon)], 'Positive'));
}

// A convex counter-clockwise polygon with every side moved inwards by the same distance.
function insetPolygon(points, distance) {
  const count = points.length;
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % count];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Outward normal of side i and its distance from the origin.
    const normal = [(b[1] - a[1]) / length, (a[0] - b[0]) / length];
    return { normal, offset: normal[0] * a[0] + normal[1] * a[1] - distance };
  });
  return points.map((point, i) => {
    const p = lines[(i + count - 1) % count];
    const q = lines[i];
    const det = p.normal[0] * q.normal[1] - p.normal[1] * q.normal[0];
    if (Math.abs(det) < 1e-9) return [point[0] - q.normal[0] * distance, point[1] - q.normal[1] * distance];
    return [
      (p.offset * q.normal[1] - q.offset * p.normal[1]) / det,
      (q.offset * p.normal[0] - p.offset * q.normal[0]) / det,
    ];
  });
}

// A flat band between two outlines, cut into or laid on a surface as a groove or a ridge.
function ringBetween(kit, outer, inner, zLow, zHigh) {
  const band = kit.keep(sectionOf(kit, outer).subtract(sectionOf(kit, inner)));
  return extrudeAt(kit, band, zLow, zHigh);
}

// A rolled parchment on a rod with a finial at each end. It lies on its side.
function buildScroll(kit, plan, spec) {
  const half = 1.2 * spec.stretch;
  const groove = 0.05;
  // The rings on the ends stand for the turns of the roll.
  const end = (z, inwards) => [
    [0.52, z],
    [0.52, z + inwards * groove],
    [0.58, z + inwards * groove],
    [0.58, z],
    [0.76, z],
    [0.76, z + inwards * groove],
    [0.82, z + inwards * groove],
    [0.82, z],
  ];
  const profile = [[0, -half], ...end(-half, 1), [1, -half], [1, half], ...end(half, -1).reverse(), [0, half]];
  const body = lathe(kit, profile, plan.faces);
  const radius = 0.2 * spec.options.rod;
  // One end of the rod from its tip to where it runs straight, as (radius, distance from the tip).
  let finial;
  if (spec.options.finial === 'cone') {
    finial = [[0, 0], [radius + 0.14, 0.5], [radius + 0.14, 0.58], [radius, 0.66]];
  } else if (spec.options.finial === 'ball') {
    const round = radius + 0.14;
    const stop = Math.acos(radius / round);
    finial = [[0, 0]];
    for (let i = 1; i <= 8; i++) {
      const angle = -Math.PI / 2 + (i / 8) * (Math.PI / 2 + stop);
      finial.push([round * Math.cos(angle), round + round * Math.sin(angle)]);
    }
  } else {
    finial = [[0, 0], [radius, 0.04], [radius + 0.1, 0.18], [radius + 0.1, 0.3], [radius, 0.4]];
  }
  const tip = half + 0.2 + finial[finial.length - 1][1];
  const rod = lathe(kit, [...finial.map(([r, z]) => [r, z - tip]), ...finial.map(([r, z]) => [r, tip - z]).reverse()], 32);
  return { solid: union(kit, [body, rod]), faces: bandFaces(plan.faces, 1, -half, half, false) };
}

// A tome: two covers that overhang the page block, a spine with two ribs, a frame on each cover.
function buildBook(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 4 : plan.faces - 2;
  // Side 0 is the spine. Four sides make the usual upright rectangle.
  const outline = sides === 4 ? [[0.75, -1], [0.75, 1], [-0.75, 1], [-0.75, -1]] : regularPolygon(sides, 1, -Math.PI / sides);
  // Past a certain thickness it stops looking like a book, so the fair height is capped.
  const height = (coin ? 0.42 : Math.min(1.6, fairHeight(polygonArea(outline), plan.faces))) * spec.stretch;
  const top = height / 2;
  const cover = Math.max(0.07, Math.min(0.1, height * 0.2));
  const overhang = 0.07;
  const pagesOutline = insetPolygon(outline, overhang);

  const whole = sectionOf(kit, outline);
  const parts = [extrudeAt(kit, whole, top - cover, top), extrudeAt(kit, whole, -top, -top + cover)];

  let pages = extrudeAt(kit, sectionOf(kit, pagesOutline), -top + cover - 0.01, top - cover + 0.01);
  // Thin grooves next to the covers read as the edges of the pages.
  // The middle of the block stays smooth: that is where the numbers go.
  const room = height - 2 * cover;
  const lines = room >= 0.7 ? [0.07, 0.15] : room >= 0.35 ? [0.07] : [];
  const lined = lines.length ? lines[lines.length - 1] + 0.05 : 0;
  if (lines.length) {
    const grooves = [];
    const shallow = insetPolygon(outline, overhang - 0.01);
    const deeper = insetPolygon(outline, overhang + 0.03);
    for (const offset of lines) {
      for (const z of [top - cover - offset, -top + cover + offset]) {
        grooves.push(ringBetween(kit, shallow, deeper, z - 0.015, z + 0.015));
      }
    }
    pages = kit.keep(pages.subtract(union(kit, grooves)));
  }
  parts.push(pages);

  // The spine fills the overhang along side 0, flush with the covers, and closes the grooves there.
  const a = outline[0];
  const b = outline[1];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const out = [along[1], -along[0]];
  // It stays within the corners of side 0, so the page sides next to it are left alone.
  const behind = insetPolygon(outline, overhang + 0.05);
  parts.push(extrudeAt(kit, sectionOf(kit, [a, b, behind[1], behind[0]]), -top, top));
  const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // A short spine, as on a many-sided book, has no room for ribs.
  const ribbed = length >= 0.6;
  const ribAt = 0.3 * length;
  const ribHalf = 0.04;
  const ribOut = 0.04;
  for (const side of ribbed ? [-1, 1] : []) {
    const at = [middle[0] + along[0] * ribAt * side, middle[1] + along[1] * ribAt * side];
    const corner = (s, depth) => [
      at[0] + along[0] * ribHalf * s + out[0] * depth,
      at[1] + along[1] * ribHalf * s + out[1] * depth,
    ];
    const rib = [corner(-1, -0.03), corner(-1, ribOut), corner(1, ribOut), corner(1, -0.03)];
    parts.push(extrudeAt(kit, sectionOf(kit, rib), -top, top));
  }

  let solid = union(kit, parts);
  const frameOuter = insetPolygon(outline, 0.12);
  const frameInner = insetPolygon(outline, 0.17);
  const frames = [
    ringBetween(kit, frameOuter, frameInner, top - 0.03, top + 0.02),
    ringBetween(kit, frameOuter, frameInner, -top - 0.02, -top + 0.03),
  ];
  solid = kit.keep(solid.subtract(union(kit, frames)));

  const faces = endFaces(insetPolygon(outline, 0.2), top, -top);
  if (!coin) {
    for (let i = 0; i < sides; i++) {
      const p = i === 0 ? outline[0] : pagesOutline[i];
      const q = i === 0 ? outline[1] : pagesOutline[(i + 1) % sides];
      const sideLength = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const dir = [(q[0] - p[0]) / sideLength, (q[1] - p[1]) / sideLength];
      // On the spine the number sits between the ribs.
      const from = i === 0 && ribbed ? sideLength / 2 - ribAt + ribHalf : 0;
      const to = sideLength - from;
      const low = i === 0 ? -top : -top + cover + lined;
      const high = -low;
      const start = [p[0] + dir[0] * from, p[1] + dir[1] * from];
      const stop = [p[0] + dir[0] * to, p[1] + dir[1] * to];
      faces.push({
        normal: [dir[1], -dir[0], 0],
        polygon: [
          [start[0], start[1], low],
          [stop[0], stop[1], low],
          [stop[0], stop[1], high],
          [start[0], start[1], high],
        ],
        up: [0, 0, 1],
      });
    }
  }
  return { solid, faces };
}

// A drum: the shell sits between two hoops, the skins are the ends, rods run between the hoops.
function buildDrum(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const height = (coin ? 0.5 : Math.min(2.4, fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const top = height / 2;
  const hoop = Math.min(0.14, height * 0.16);
  const skin = Math.min(0.05, height * 0.08);
  const shell = 0.93;
  const profile = [
    [0, -top + skin],
    [0.88, -top + skin],
    [0.9, -top],
    [1, -top],
    [1, -top + hoop],
    [shell, -top + hoop],
    [shell, top - hoop],
    [1, top - hoop],
    [1, top],
    [0.9, top],
    [0.88, top - skin],
    [0, top - skin],
  ];
  const parts = [lathe(kit, profile, sides)];
  const rods = !coin && sides <= 16;
  const rodRadius = 0.045;
  if (rods) {
    const length = height - 2 * hoop + 0.02;
    for (let i = 0; i < sides; i++) {
      const angle = (i * TAU) / sides;
      const rod = kit.keep(kit.api.Manifold.cylinder(length, rodRadius, rodRadius, 10, true));
      parts.push(kit.keep(rod.translate(shell * Math.cos(angle), shell * Math.sin(angle), 0)));
    }
  }
  const faces = endFaces(regularPolygon(sides, 0.88), top - skin, -top + skin);
  if (!coin) faces.push(...bandFaces(sides, shell, -top + hoop, top - hoop, true, rods ? rodRadius + 0.01 : 0));
  return { solid: union(kit, parts), faces };
}

// A cauldron on three feet with a thick lip. It lies on its belly.
function buildCauldron(kit, plan) {
  const profile = [
    [0, 0],
    [0.45, 0.03],
    [0.8, 0.25],
    [1, 0.62],
    [1, 1.12],
    [0.9, 1.38],
    [0.76, 1.5],
    [0.9, 1.62],
    [0.9, 1.7],
    [0.74, 1.7],
    [0.6, 1.5],
    [0.55, 1.3],
    [0, 1.3],
  ];
  const parts = [lathe(kit, profile, plan.faces)];
  for (let i = 0; i < 3; i++) {
    const angle = (i * TAU) / 3 + Math.PI / 6;
    const foot = kit.keep(kit.api.Manifold.cylinder(0.34, 0.09, 0.14, 12, false));
    parts.push(kit.keep(foot.translate(0.5 * Math.cos(angle), 0.5 * Math.sin(angle), -0.2)));
  }
  return { solid: union(kit, parts), faces: bandFaces(plan.faces, 1, 0.62, 1.12, true) };
}

// A plate when it has two faces, a bowl when it has more: a foot, a flare, a rim and a well.
function buildPlate(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const height = (coin ? 0.45 : Math.min(1.1, 0.8 * fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const flare = height * 0.35;
  const well = coin ? Math.min(0.13, height * 0.3) : Math.min(0.5, height * 0.35);
  const profile = [
    [0, 0],
    [0.55, 0],
    [1, flare],
    [1, height],
    [0.84, height],
    [0.74, height - well],
    [0, height - well],
  ];
  const faces = [
    { normal: [0, 0, 1], polygon: regularPolygon(sides, 0.74).map(([x, y]) => [x, y, height - well]), up: [0, 1, 0] },
    { normal: [0, 0, -1], polygon: regularPolygon(sides, 0.55).map(([x, y]) => [x, y, 0]).reverse(), up: [0, 1, 0] },
  ];
  if (!coin) faces.push(...bandFaces(sides, 1, flare, height, true));
  return { solid: lathe(kit, profile, sides), faces };
}

// A goblet: the foot is as wide as the bowl, so it lies flat on a facet of both.
function buildGoblet(kit, plan) {
  const profile = [
    [0, 0],
    [1, 0],
    [1, 0.14],
    [0.32, 0.3],
    [0.18, 0.5],
    [0.18, 0.8],
    [0.3, 0.88],
    [0.3, 0.98],
    [0.18, 1.06],
    [0.2, 1.2],
    [0.62, 1.4],
    [1, 1.55],
    [1, 2.3],
    [0.92, 2.4],
    [0.8, 2.4],
    [0.76, 1.9],
    [0, 1.8],
  ];
  return { solid: lathe(kit, profile, plan.faces), faces: bandFaces(plan.faces, 1, 1.55, 2.3, true) };
}

// A vase: a small foot, a wide belly the numbers go on, a neck and a lip.
function buildVase(kit, plan) {
  const profile = [
    [0, 0],
    [0.6, 0],
    [0.62, 0.08],
    [0.55, 0.16],
    [0.82, 0.55],
    [1, 0.8],
    [1, 1.5],
    [0.8, 1.85],
    [0.48, 2.15],
    [0.45, 2.35],
    [0.62, 2.55],
    [0.62, 2.6],
    [0.5, 2.6],
    [0.36, 2.42],
    [0, 2.38],
  ];
  return { solid: lathe(kit, profile, plan.faces), faces: bandFaces(plan.faces, 1, 0.8, 1.5, true) };
}

// ---- More themed shapes: weapons, instruments, vessels and things. ----

// A solid whose own z axis is laid along a direction, with its origin moved to a point.
function aim(kit, solid, direction, origin = [0, 0, 0]) {
  const turn = rotationBetween([0, 0, 1], unit(direction));
  const x = turn([1, 0, 0]);
  const y = turn([0, 1, 0]);
  const z = turn([0, 0, 1]);
  return kit.keep(
    solid.transform([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, origin[0], origin[1], origin[2], 1]),
  );
}

const degrees = (angle) => (angle * 180) / Math.PI;

// A plate cut to an outline and stood on edge so that it runs outwards from the axis.
// The outline is drawn as (distance from the axis, height).
function fin(kit, outline, thickness, angle) {
  const plate = kit.keep(sectionOf(kit, outline).extrude(thickness));
  const centred = kit.keep(plate.translate(0, 0, -thickness / 2));
  const upright = kit.keep(centred.rotate([90, 0, 0]));
  return kit.keep(upright.rotate([0, 0, degrees(angle)]));
}

// A plate cut to an outline and set across the direction it faces, like a sign on a wall.
// The outline is drawn as (sideways, height); the plate is centred at a distance from the axis.
function plaque(kit, outline, thickness, angle, distance) {
  const plate = kit.keep(sectionOf(kit, outline).extrude(thickness));
  const stood = kit.keep(plate.transform([0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, distance - thickness / 2, 0, 0, 1]));
  return kit.keep(stood.rotate([0, 0, degrees(angle)]));
}

function ball(kit, radius, at, segments = 16) {
  const sphere = kit.keep(kit.api.Manifold.sphere(radius, segments));
  return kit.keep(sphere.translate(at[0], at[1], at[2]));
}

// Rings turned on a shaft: the points to put into a profile on the way up.
function ringBumps(radius, from, count, pitch, rise = 0.045, width = 0.14) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const z = from + i * pitch;
    out.push([radius, z], [radius + rise, z + width / 3], [radius + rise, z + (2 * width) / 3], [radius, z + width]);
  }
  return out;
}

// Rods along the edges between the facets.
function edgeRods(kit, segments, radius, zLow, zHigh, thickness) {
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i * TAU) / segments;
    const rod = kit.keep(kit.api.Manifold.cylinder(zHigh - zLow, thickness, thickness, 10, false));
    parts.push(kit.keep(rod.translate(radius * Math.cos(angle), radius * Math.sin(angle), zLow)));
  }
  return parts;
}

// Width of one facet of a body with that many sides and corners at the given radius.
const facetWidth = (segments, radius = 1) => 2 * radius * Math.sin(Math.PI / segments);

// A faceted body of revolution with the numbers on one straight band of it.
function turned(kit, plan, profile, band, parts = [], holes = []) {
  let solid = union(kit, [lathe(kit, profile, plan.faces), ...parts]);
  if (holes.length) solid = kit.keep(solid.subtract(union(kit, holes)));
  return {
    solid,
    faces: bandFaces(plan.faces, band.radius || 1, band.low, band.high, band.upright !== false, band.margin || 0),
  };
}

// The same die turned in space. images are where the x, y and z axes go.
function reorient(kit, built, [ex, ey, ez]) {
  const map = (v) => [
    v[0] * ex[0] + v[1] * ey[0] + v[2] * ez[0],
    v[0] * ex[1] + v[1] * ey[1] + v[2] * ez[1],
    v[0] * ex[2] + v[1] * ey[2] + v[2] * ez[2],
  ];
  const turn = (face) => ({ ...face, normal: map(face.normal), polygon: face.polygon.map(map), up: map(face.up) });
  return {
    solid: kit.keep(built.solid.transform([ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, 0, 0, 0, 1])),
    faces: built.faces.map(turn),
    copies: (built.copies || []).map(turn),
  };
}

// The same faces turned about the axis.
function spun(faces, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const turn = (v) => [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos, v[2]];
  return faces.map((face) => ({ ...face, normal: turn(face.normal), polygon: face.polygon.map(turn), up: turn(face.up) }));
}

// How far to turn the second of two bands of facets about the axis, so that its facets
// look as far away from the facets of the first as they can.
function bandTurn(first, second) {
  const divisor = (a, b) => (b ? divisor(b, a % b) : a);
  const common = (first * second) / divisor(first, second);
  return Math.PI / common + Math.PI / first - Math.PI / second;
}

// Volume of a lathed profile and its moment along the axis.
function turnedMass(profile, segments) {
  const area = (segments / 2) * Math.sin(TAU / segments);
  let mass = 0;
  let moment = 0;
  for (let i = 0; i + 1 < profile.length; i++) {
    const [r0, z0] = profile[i];
    const [r1, z1] = profile[i + 1];
    const rise = z1 - z0;
    mass += (area * rise * (r0 * r0 + r0 * r1 + r1 * r1)) / 3;
    moment += (area * rise * (z0 * (3 * r0 * r0 + 2 * r0 * r1 + r1 * r1) + z1 * (r0 * r0 + 2 * r0 * r1 + 3 * r1 * r1))) / 12;
  }
  return { mass, moment };
}

// How much wider the half with more facets has to be for a two-banded die to lie steadily on
// every facet of both halves. Lying on its side, such a die rests on an edge of one rim and a
// corner of the other; the triangle between them holds the centre of mass only when the edges
// of both rims, seen from that centre, are equally wide: (1 - s) * edge of the few = s * edge
// of the many, s being how far the centre is from the rim with the few facets.
// centreAt(wide) gives s for a widening.
function bandWiden(few, many, centreAt) {
  if (few === many) return 1;
  const lean = (wide) => {
    const s = centreAt(wide);
    return s * wide * Math.sin(Math.PI / many) - (1 - s) * Math.sin(Math.PI / few);
  };
  let low = 1;
  let high = 4;
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (lean(middle) < 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

// The hilt of a sword or a dagger, pommel down: the profile up to the top of the guard
// and the height the blade starts at.
function hilt(options, { grip, length, swell, guard, thick }) {
  const radius = grip * options.gripWidth;
  const knob = radius + 0.2;
  const top = 0.5 + length * options.gripLength;
  const reach = guard * options.guardWidth;
  const height = thick * options.guardThick;
  const bevel = Math.min(0.1, height * 0.3);
  const rings = Math.max(1, Math.round((top - 0.6) / 0.21));
  const pitch = rings > 1 ? (top - 0.77) / (rings - 1) : 0;
  const handle = swell
    ? [[radius, 0.5], [radius * 1.27, (0.5 + top) / 2], [radius, top]]
    : [[radius, 0.5], ...ringBumps(radius, 0.6, rings, pitch), [radius, top]];
  return {
    points: [
      [0, 0], [knob - 0.14, 0], [knob, 0.14], [knob, 0.36], [knob - 0.14, 0.5],
      ...handle,
      [reach - bevel, top], [reach, top + bevel], [reach, top + height - bevel], [reach - bevel, top + height],
    ],
    top: top + height,
  };
}

// A sword stood on its pommel: the numbers run along the facets of the blade.
function buildSword(kit, plan, spec) {
  const { points, top } = hilt(spec.options, { grip: 0.24, length: 0.95, guard: 1, thick: 0.35 });
  const profile = [...points, [0.62, top], [0.62, top + 3.2], [0, top + 4.1]];
  return turned(kit, plan, profile, { radius: 0.62, low: top + 0.1, high: top + 3.15, upright: false });
}

// A dagger: a swelling grip, a flat guard, a short blade with a long point.
function buildDagger(kit, plan, spec) {
  const { points, top } = hilt(spec.options, { grip: 0.26, length: 0.85, swell: true, guard: 1, thick: 0.32 });
  const profile = [...points, [0.72, top], [0.72, top + 1.4], [0, top + 3.1]];
  return turned(kit, plan, profile, { radius: 0.72, low: top + 0.1, high: top + 1.35, upright: false });
}

// A mace: flanges stand on the edges of the head, so it comes to rest with a facet up.
function buildMace(kit, plan, spec) {
  const profile = [
    [0, 0], [0.3, 0], [0.42, 0.12], [0.42, 0.3], [0.24, 0.42],
    ...ringBumps(0.24, 0.7, 3, 0.22),
    [0.24, 3.0], [0.5, 3.0], [0.5, 3.15],
    [0.9, 3.3], [0.9, 4.5], [0.5, 4.72], [0.22, 4.78], [0.1, 5.35], [0, 5.4],
  ];
  const size = spec.options.fins;
  const flanged = plan.faces <= 12 && size > 0.02;
  const parts = [];
  if (flanged) {
    const reach = 0.9 + 0.3 * size;
    const outline = [[0.8, 3.3], [reach, 3.72], [reach, 4.08], [0.8, 4.5]];
    for (let i = 0; i < plan.faces; i++) parts.push(fin(kit, outline, 0.1, (i * TAU) / plan.faces));
  }
  return turned(kit, plan, profile, { radius: 0.9, low: 3.35, high: 4.45, margin: flanged ? 0.08 : 0 }, parts);
}

// A spear: a stout shaft, a socket, and a leaf-shaped head with the numbers on its wide part.
function buildSpear(kit, plan, spec) {
  const shaft = 0.5 * spec.options.shaft;
  const profile = [
    [0, 0], [shaft * 0.6, 0], [shaft, 0.25],
    ...ringBumps(shaft, 1.3, 2, 0.3),
    [shaft, 3.9], [shaft + 0.12, 3.9], [shaft + 0.12, 4.2], [shaft + 0.04, 4.32],
    [1, 5.0], [1, 5.9], [0, 7.9],
  ];
  return turned(kit, plan, profile, { low: 5.05, high: 5.85, upright: false });
}

// A wizard's staff: a faceted cup with an orb in it.
function buildStaff(kit, plan) {
  const profile = [
    [0, 0], [0.2, 0], [0.3, 0.12], [0.3, 0.4], [0.26, 0.4],
    ...ringBumps(0.26, 1.5, 2, 1.1),
    [0.26, 3.6], [0.5, 3.78],
    [1, 4.1], [1, 5.1], [0.82, 5.3], [0.6, 5.3], [0.5, 5.15], [0, 5.15],
  ];
  return turned(kit, plan, profile, { low: 4.15, high: 5.05 }, [ball(kit, 0.72, [0, 0, 5.75], 28)]);
}

// A magic wand: the numbers go on the thick handle.
function buildWand(kit, plan) {
  const profile = [
    [0, 0], [0.5, 0], [0.7, 0.14], [0.7, 0.3], [0.55, 0.4],
    [1, 0.5], [1, 2.3], [0.62, 2.45], [0.76, 2.5], [0.76, 2.66], [0.5, 2.72],
    [0.42, 2.85], [0.17, 6.1], [0, 6.1],
  ];
  return turned(kit, plan, profile, { low: 0.55, high: 2.25, upright: false }, [ball(kit, 0.3, [0, 0, 6.2])]);
}

// A torch: a faceted cup on a handle, with a flame.
function buildTorch(kit, plan) {
  const profile = [
    [0, 0], [0.3, 0], [0.36, 0.1], [0.36, 0.3], [0.3, 0.36], [0.5, 3.0],
    [0.92, 3.12], [1, 3.22], [1, 4.3], [0.92, 4.4], [0.8, 4.4], [0.72, 4.2], [0, 4.2],
  ];
  const flame = lathe(kit, [[0, 4.1], [0.5, 4.25], [0.66, 4.7], [0.56, 5.25], [0.32, 5.85], [0.12, 6.4], [0, 6.6]], 20);
  return turned(kit, plan, profile, { low: 3.27, high: 4.25 }, [flame]);
}

// A hand bell, mouth down and hollow. The clapper can be left out.
function buildBell(kit, plan, spec) {
  const clapper = [[0, 0.12], [0.18, 0.14], [0.27, 0.3], [0.27, 0.42], [0.18, 0.58], [0.07, 0.62], [0.07, 1.95]];
  const profile = [
    ...(spec.options.clapper ? clapper : [[0, 1.95]]),
    [0.4, 1.95], [0.46, 1.5], [0.6, 1.15], [0.8, 0.85], [0.84, 0],
    [1, 0], [1, 1.0], [0.78, 1.25], [0.64, 1.6], [0.58, 1.95], [0.52, 2.2], [0.38, 2.38],
    [0.2, 2.45], [0.2, 3.3], [0.34, 3.4], [0.34, 3.65], [0.2, 3.75], [0, 3.75],
  ];
  return turned(kit, plan, profile, { low: 0.05, high: 0.95 });
}

// A pipe: the numbers go round the thick foot joint, the finger holes sit on the thin tube above it.
function buildFlute(kit, plan) {
  const tube = 0.5;
  const profile = [
    [0, 0.6], [0.35, 0.6], [0.5, 0], [1, 0], [1, 0.25], [0.75, 0.62],
    [0.75, 2.9], [0.86, 2.9], [0.86, 3.1], [0.7, 3.1], [tube, 3.3],
    [tube, 5.9], [tube + 0.1, 5.9], [tube + 0.1, 6.1], [tube + 0.02, 6.1], [tube + 0.02, 6.8], [0.3, 7.5], [0, 7.5],
  ];
  // The holes sit in the middle of one facet.
  const front = Math.PI / plan.faces;
  const out = [Math.cos(front), Math.sin(front), 0];
  const width = facetWidth(plan.faces, tube);
  const bore = Math.min(0.11, width * 0.35);
  const holes = [];
  for (let i = 0; i < 5; i++) {
    const hole = kit.keep(kit.api.Manifold.cylinder(0.8, bore, bore, 12, true));
    holes.push(aim(kit, hole, out, [tube * out[0], tube * out[1], 3.75 + i * 0.42]));
  }
  const windowCut = kit.keep(kit.api.Manifold.cube([0.5, Math.min(0.26, width * 0.6), 0.22], true));
  const placed = kit.keep(windowCut.translate(tube + 0.05, 0, 6.45));
  holes.push(kit.keep(placed.rotate([0, 0, degrees(front)])));
  return turned(kit, plan, profile, { radius: 0.75, low: 0.7, high: 2.8, upright: false }, [], holes);
}

// A straight trumpet with a boss on the tube. The numbers go round the bell.
function buildFanfare(kit, plan) {
  const profile = [
    [0, 2.0], [0.18, 2.0], [0.84, 0], [1, 0], [1, 1.3], [0.66, 1.7], [0.45, 2.3],
    [0.3, 3.0], [0.3, 3.9], [0.5, 4.05], [0.5, 4.25], [0.3, 4.4],
    [0.3, 5.4], [0.22, 5.5], [0.22, 5.8], [0.42, 6.0], [0.42, 6.1], [0.3, 6.1], [0.15, 5.95], [0, 5.95],
  ];
  return turned(kit, plan, profile, { low: 0.05, high: 1.25 });
}

// A maraca: a round head on a thin handle. The numbers go round the widest part of the head.
function buildMaraca(kit, plan) {
  const centre = 3.5;
  const half = 0.38;
  const round = Math.hypot(1, half);
  const band = Math.asin(half / round);
  // The head is a ball with a straight belt for the numbers.
  const arc = (from, to, steps) => {
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const angle = from + ((to - from) * i) / steps;
      points.push([round * Math.cos(angle), centre + round * Math.sin(angle)]);
    }
    return points;
  };
  const profile = [
    [0, 0], [0.22, 0], [0.32, 0.1], [0.32, 0.3], [0.25, 0.42],
    [0.2, 2.3], [0.3, 2.34], [0.3, 2.46],
    ...arc(-1.27, -band, 5),
    ...arc(band, 1.45, 6),
    [0, centre + round],
  ];
  return turned(kit, plan, profile, { low: centre - half + 0.04, high: centre + half - 0.04 });
}

// A goblet drum: a hollow foot, a bowl, a skin in a hoop, ropes along the edges.
function buildDjembe(kit, plan) {
  const profile = [
    [0, 1.4], [0.3, 1.4], [0.55, 0], [0.75, 0], [0.75, 0.12], [0.5, 1.0], [0.45, 1.5], [0.6, 1.95],
    [1, 2.4], [1, 3.4], [0.96, 3.44], [0.96, 3.56], [0.9, 3.56], [0.88, 3.5], [0, 3.5],
  ];
  const roped = plan.faces <= 16;
  const parts = roped ? edgeRods(kit, plan.faces, 1, 2.4, 3.42, 0.04) : [];
  return turned(kit, plan, profile, { low: 2.45, high: 3.35, margin: roped ? 0.06 : 0 }, parts);
}

// A lute: a pear body, a fretted neck and a pegbox bent back. The rose and the bridge sit above the numbers.
function buildLute(kit, plan) {
  const profile = [
    [0, 0], [0.5, 0.06], [0.85, 0.3], [1, 0.65], [1, 1.7], [0.9, 2.2], [0.62, 2.9], [0.36, 3.4], [0.28, 3.6],
    ...ringBumps(0.28, 3.9, 4, 0.36, 0.035, 0.08),
    [0.28, 5.4], [0.34, 5.4], [0.34, 5.5], [0, 5.5],
  ];
  const front = Math.PI / plan.faces;
  const out = [Math.cos(front), Math.sin(front), 0];
  const lean = Math.cos(front);
  const pegbox = [kit.keep(kit.keep(kit.api.Manifold.cube([0.3, 0.44, 1.2], true)).translate(0, 0, 0.6))];
  for (let i = 0; i < 3; i++) {
    const peg = kit.keep(kit.keep(kit.api.Manifold.cylinder(0.9, 0.06, 0.06, 10, true)).rotate([90, 0, 0]));
    pegbox.push(kit.keep(peg.translate(0, 0, 0.35 + i * 0.3)));
  }
  // Bent back, away from the side with the rose.
  const bent = kit.keep(union(kit, pegbox).rotate([0, -70, 0]));
  const head = kit.keep(kit.keep(bent.translate(0, 0, 5.42)).rotate([0, 0, degrees(front)]));
  const bridgeWidth = Math.min(0.5, facetWidth(plan.faces, 0.95) * 0.7);
  const bar = kit.keep(kit.keep(kit.api.Manifold.cube([0.12, bridgeWidth, 0.09], true)).translate(0.95 * lean, 0, 1.95));
  const bridge = kit.keep(bar.rotate([0, 0, degrees(front)]));
  const rose = Math.min(0.2, facetWidth(plan.faces, 0.86) * 0.4);
  const reach = 0.86 * lean + 0.23;
  const hole = aim(kit, kit.keep(kit.api.Manifold.cylinder(0.6, rose, rose, 20, true)), out, [reach * out[0], reach * out[1], 2.3]);
  return turned(kit, plan, profile, { low: 0.7, high: 1.65 }, [head, bridge], [hole]);
}

// A war hammer: the head lies across, the handle hangs down. Both halves of the head carry numbers:
// the same ones, or a different set on each half, which then has its own count of facets.
function buildHammer(kit, plan, spec) {
  const shaft = lathe(
    kit,
    [
      [0, 0], [0.25, 0], [0.25, 3.3], [0.31, 3.36],
      ...ringBumps(0.31, 3.5, 3, 0.26, 0.03, 0.12),
      [0.31, 4.3], [0.36, 4.4], [0.36, 4.6], [0.24, 4.7], [0, 4.7],
    ],
    18,
  );
  let front;
  let head;
  let faces;
  let copies = [];
  if (plan.split) {
    const [few, many] = plan.split;
    front = Math.PI / few;
    const turn = bandTurn(few, many);
    const half = [[0, 0.1], [0.8, 0.1], [0.8, 1.2], [0.7, 1.3], [0, 1.3]];
    const far = lathe(kit, half.map(([r, z]) => [r, -z]), many);
    const collar = lathe(kit, [[0, -0.26], [0.84, -0.26], [0.88, -0.2], [0.88, 0.2], [0.84, 0.26], [0, 0.26]], 32);
    head = [lathe(kit, half, few), kit.keep(far.rotate([0, 0, degrees(turn)])), collar];
    faces = [
      ...bandFaces(few, 0.8, 0.32, 1.15, false).map((face) => ({ ...face, band: 0 })),
      ...spun(bandFaces(many, 0.8, -1.15, -0.32, false), turn).map((face) => ({ ...face, band: 1 })),
    ];
  } else {
    front = Math.PI / plan.faces;
    head = [lathe(kit, [[0, -1.3], [0.7, -1.3], [0.8, -1.2], [0.8, 1.2], [0.7, 1.3], [0, 1.3]], plan.faces)];
    faces = bandFaces(plan.faces, 0.8, 0.32, 1.15, false);
    copies = bandFaces(plan.faces, 0.8, -1.15, -0.32, false).map((face, of) => ({ ...face, of }));
  }
  // The handle leaves through the middle of a facet.
  const out = [Math.cos(front), Math.sin(front), 0];
  const built = { solid: union(kit, [...head, aim(kit, shaft, out)]), faces, copies };
  const sin = Math.sin(front);
  const cos = Math.cos(front);
  return reorient(kit, built, [[0, -sin, -cos], [0, cos, -sin], [1, 0, 0]]);
}

// A battle axe: the blades stand on the edges of the block the numbers go on.
function buildAxe(kit, plan, spec) {
  const profile = [
    [0, 0], [0.3, 0], [0.36, 0.1], [0.36, 0.3], [0.26, 0.4],
    ...ringBumps(0.26, 0.7, 3, 0.25),
    [0.26, 3.3], [0.7, 3.4], [0.8, 3.5], [0.8, 4.7], [0.7, 4.8], [0.3, 4.85], [0.22, 5.0], [0, 5.7],
  ];
  // The blade grows from where it leaves the block.
  const size = spec.options.fins;
  const outline = [
    [0.7, 3.7], [1.3, 3.55], [2.0, 2.75], [2.25, 3.4], [2.35, 4.1], [2.25, 4.8], [2.0, 5.45], [1.3, 4.65], [0.7, 4.5],
  ].map(([r, z]) => (r <= 0.7 ? [r, z] : [0.7 + (r - 0.7) * size, 4.1 + (z - 4.1) * size]));
  const thickness = Math.min(0.16, facetWidth(plan.faces, 0.8) * 0.35);
  const parts = [fin(kit, outline, thickness, 0)];
  // An even block has an edge straight across for the second blade.
  if (plan.faces % 2 === 0) parts.push(fin(kit, outline, thickness, Math.PI));
  return turned(kit, plan, profile, { radius: 0.8, low: 3.55, high: 4.65, margin: thickness / 2 + 0.03 }, parts);
}

// A cannon barrel, breech down: the numbers go round the breech.
function buildCannon(kit, plan) {
  const profile = [
    [0, 0], [0.2, 0], [0.3, 0.1], [0.3, 0.25], [0.18, 0.35], [0.18, 0.45], [0.8, 0.5],
    [1, 0.7], [1, 2.0], [0.9, 2.06], [0.84, 3.1], [0.92, 3.1], [0.92, 3.22], [0.8, 3.26],
    [0.66, 5.0], [0.72, 5.05], [0.84, 5.3], [0.84, 5.45], [0.72, 5.55], [0.4, 5.55], [0.4, 4.6], [0, 4.6],
  ];
  const front = Math.PI / plan.faces;
  const trunnion = kit.keep(kit.api.Manifold.cylinder(2.3, 0.2, 0.2, 16, true));
  const parts = [aim(kit, trunnion, [Math.cos(front), Math.sin(front), 0], [0, 0, 2.6])];
  return turned(kit, plan, profile, { low: 0.75, high: 1.95, upright: false }, parts);
}

// A potion: a faceted bottle, a neck that may be turned round, and a stopper.
function buildPotion(kit, plan, spec) {
  const tall = 1.5 * spec.options.body;
  const round = spec.options.neck === 'round';
  const bore = 0.38;
  // A round neck stands inside the facets of the shoulder, not over their corners.
  const collar = round ? Math.min(0.62, bore / Math.cos(Math.PI / plan.faces) + 0.02) : bore + 0.04;
  const shoulder = tall + 0.7;
  const bottle = lathe(
    kit,
    [[0, 0], [0.92, 0], [1, 0.08], [1, tall], [0.9, tall + 0.28], [0.66, tall + 0.55], [collar, shoulder], [0, shoulder]],
    plan.faces,
  );
  const lip = shoulder + 0.55;
  const top = lip + 0.15;
  const neck = [[0, shoulder - 0.12], [bore, shoulder - 0.12], [bore, lip], [0.5, lip], [0.5, top]];
  const stopper = spec.options.stopper;
  if (stopper === 'cork') neck.push([0.34, top], [0.3, top + 0.35], [0, top + 0.35]);
  else if (stopper === 'none') neck.push([0.26, top], [0.26, top - 0.45], [0, top - 0.45]);
  else neck.push([0, top]);
  const parts = [bottle, lathe(kit, neck, round ? 32 : plan.faces)];
  if (stopper === 'ball') parts.push(ball(kit, 0.36, [0, 0, top + 0.22], 20));
  if (stopper === 'crystal') parts.push(lathe(kit, [[0, top - 0.05], [0.22, top - 0.05], [0.4, top + 0.3], [0, top + 0.85]], 6));
  return { solid: union(kit, parts), faces: bandFaces(plan.faces, 1, 0.13, tall - 0.05, true) };
}

// A tankard with a handle on one edge and foam on top.
function buildMug(kit, plan) {
  const profile = [
    [0, 0], [1.04, 0], [1.04, 0.16], [1, 0.2], [1, 2.0], [1.04, 2.04], [1.04, 2.2], [0.86, 2.2], [0.86, 2.05], [0, 2.05],
  ];
  const foam = lathe(kit, [[0, 2.0], [0.84, 2.0], [0.8, 2.22], [0.55, 2.4], [0, 2.46]], plan.faces);
  const handle = [
    [0.95, 0.5], [1.45, 0.55], [1.62, 0.9], [1.62, 1.4], [1.45, 1.75], [0.95, 1.8],
    [0.95, 1.55], [1.35, 1.52], [1.42, 1.35], [1.42, 0.95], [1.35, 0.78], [0.95, 0.75],
  ];
  const thickness = Math.min(0.24, facetWidth(plan.faces) * 0.55);
  const parts = [
    foam,
    fin(kit, handle, thickness, 0),
    ball(kit, 0.16, [0.3, 0.2, 2.38]),
    ball(kit, 0.13, [-0.35, 0.1, 2.36]),
    ball(kit, 0.12, [0, -0.4, 2.34]),
  ];
  return turned(kit, plan, profile, { low: 0.25, high: 1.95, margin: thickness / 2 + 0.03 }, parts);
}

// A keg: staves that bulge towards the middle, a hoop near each end, heads set in.
function buildKeg(kit, plan) {
  const profile = [
    [0, 0.08], [0.7, 0.08], [0.7, 0], [0.8, 0],
    [0.863, 0.3], [0.903, 0.3], [0.941, 0.48], [0.901, 0.48],
    [1, 0.95], [1, 1.85],
    [0.901, 2.32], [0.941, 2.32], [0.903, 2.5], [0.863, 2.5],
    [0.8, 2.8], [0.7, 2.8], [0.7, 2.72], [0, 2.72],
  ];
  return turned(kit, plan, profile, { low: 1.0, high: 1.8 });
}

// A candle in a dish, with a flame and wax running down a few of the edges.
function buildCandle(kit, plan) {
  const profile = [
    [0, 0], [0.9, 0], [1.2, 0.25], [1.2, 0.36], [1.06, 0.36], [0.86, 0.2], [0.8, 0.2],
    [0.8, 3.0], [0.7, 3.0], [0.56, 2.88], [0, 2.88],
  ];
  const flame = lathe(kit, [[0, 2.8], [0.2, 2.98], [0.27, 3.3], [0.17, 3.7], [0.05, 4.05], [0, 4.1]], 16);
  const drop = Math.min(0.12, facetWidth(plan.faces, 0.8) * 0.25);
  const parts = [flame];
  const edges = [...new Set([0, Math.round(plan.faces / 3), Math.round((2 * plan.faces) / 3)])];
  edges.forEach((edge, i) => {
    const angle = (edge * TAU) / plan.faces;
    const wax = kit.keep(kit.keep(kit.api.Manifold.sphere(drop, 12)).scale([1, 1, 2.2 + i * 0.6]));
    parts.push(kit.keep(wax.translate(0.8 * Math.cos(angle), 0.8 * Math.sin(angle), 2.72 - i * 0.12)));
  });
  return turned(kit, plan, profile, { radius: 0.8, low: 0.45, high: 2.9, margin: drop + 0.02 }, parts);
}

// A tower: a plinth, a shaft and a parapet with a gap over every facet.
function buildTower(kit, plan) {
  const profile = [
    [0, 0], [1, 0], [1, 0.35], [0.85, 0.5], [0.85, 2.9], [1, 3.1], [1, 3.8], [0.78, 3.8], [0.78, 3.45], [0, 3.45],
  ];
  const gaps = [];
  if (plan.faces <= 16) {
    const half = facetWidth(plan.faces) * 0.225;
    const outline = [[-half, 3.55], [half, 3.55], [half, 3.9], [-half, 3.9]];
    for (let i = 0; i < plan.faces; i++) gaps.push(plaque(kit, outline, 0.6, ((i + 0.5) * TAU) / plan.faces, 0.95));
  }
  return turned(kit, plan, profile, { radius: 0.85, low: 0.55, high: 2.85 }, [], gaps);
}

// An hourglass between two plates. Both bulbs carry numbers: the same ones, with a post on every
// edge, or a different set on each bulb, which then has its own count of facets.
function buildHourglass(kit, plan) {
  if (plan.split) {
    const [few, many] = plan.split;
    const turn = bandTurn(many, few);
    const half = (wide) => [
      [0, 0], [wide, 0], [wide, 0.3], [0.78 * wide, 0.3], [0.78 * wide, 1.3], [0.14, 1.96], [0.14, 2.06], [0, 2.06],
    ];
    // The bulb with more facets is the wider and the heavier one: see bandWiden.
    const small = turnedMass(half(1), few);
    const wide = bandWiden(few, many, (width) => {
      const large = turnedMass(half(width), many);
      const centre = (small.moment + 4 * large.mass - large.moment) / (small.mass + large.mass);
      // Measured between the middles of the two rims.
      return (centre - 0.15) / 3.7;
    });
    const upper = lathe(kit, half(1).map(([r, z]) => [r, 4 - z]), few);
    return {
      solid: union(kit, [lathe(kit, half(wide), many), kit.keep(upper.rotate([0, 0, degrees(turn)]))]),
      faces: [
        ...bandFaces(many, 0.78 * wide, 0.35, 1.25, true).map((face) => ({ ...face, band: 0 })),
        ...spun(bandFaces(few, 0.78, 2.75, 3.65, true), turn).map((face) => ({ ...face, band: 1 })),
      ],
    };
  }
  const profile = [
    [0, 0], [1, 0], [1, 0.3], [0.78, 0.3], [0.78, 1.3], [0.14, 2.0], [0.78, 2.7], [0.78, 3.7], [1, 3.7], [1, 4], [0, 4],
  ];
  const posted = plan.faces <= 12;
  const margin = posted ? 0.08 : 0;
  const parts = posted ? edgeRods(kit, plan.faces, 0.9, 0.3, 3.7, 0.055) : [];
  return {
    solid: union(kit, [lathe(kit, profile, plan.faces), ...parts]),
    faces: bandFaces(plan.faces, 0.78, 0.35, 1.25, true, margin),
    copies: bandFaces(plan.faces, 0.78, 2.75, 3.65, true, margin).map((face, of) => ({ ...face, of })),
  };
}

// A bone: the numbers run along the shaft between the two knuckles.
function buildBone(kit, plan) {
  const profile = [
    [0, 0.2], [0.35, 0.04], [0.7, 0], [0.94, 0.18], [1, 0.45], [1, 0.6], [0.9, 0.88], [0.64, 1.06],
    [0.55, 1.25], [0.55, 3.75],
    [0.64, 3.94], [0.9, 4.12], [1, 4.4], [1, 4.55], [0.94, 4.82], [0.7, 5.0], [0.35, 4.96], [0, 4.8],
  ];
  return turned(kit, plan, profile, { radius: 0.55, low: 1.3, high: 3.7, upright: false });
}

// A mushroom: the numbers go round the rim of the cap, the spots sit on top of it.
function buildMushroom(kit, plan) {
  const profile = [
    [0, 0], [0.5, 0], [0.6, 0.12], [0.6, 0.3], [0.46, 0.7], [0.42, 1.5],
    [0.92, 1.38], [1, 1.5], [1, 2.3], [0.9, 2.65], [0.66, 2.95], [0.35, 3.1], [0, 3.15],
  ];
  const parts = [ball(kit, 0.14, [0, 0, 3.12])];
  for (let i = 0; i < 5; i++) {
    const angle = (i * TAU) / 5 + 0.35;
    parts.push(ball(kit, 0.12, [0.55 * Math.cos(angle), 0.55 * Math.sin(angle), 2.93]));
  }
  return turned(kit, plan, profile, { low: 1.55, high: 2.25 }, parts);
}

// A crystal with smaller ones grown from its foot, each on an edge of its own.
function buildCrystal(kit, plan, spec) {
  const profile = [[0, 0], [0.7, 0.25], [1, 0.6], [1, 3.2], [0.28, 4.5], [0, 4.56]];
  const tilt = (38 * Math.PI) / 180;
  const small = (radius, length, edge) => {
    const angle = (edge * TAU) / plan.faces;
    const shaft = kit.keep(kit.api.Manifold.cylinder(length, radius, radius, 6, false));
    const point = kit.keep(kit.keep(kit.api.Manifold.cylinder(radius * 1.3, radius, 0, 6, false)).translate(0, 0, length));
    const direction = [Math.sin(tilt) * Math.cos(angle), Math.sin(tilt) * Math.sin(angle), Math.cos(tilt)];
    return aim(kit, union(kit, [shaft, point]), direction, [0.45 * Math.cos(angle), 0.45 * Math.sin(angle), 0.25]);
  };
  // Thickness, length and how far round the foot each one stands.
  const grown = [[0.36, 1.5, 0], [0.28, 1.1, 0.42], [0.24, 0.9, 0.72], [0.3, 1.25, 0.21], [0.2, 0.75, 0.58]];
  const taken = new Set();
  const parts = [];
  for (const [radius, length, around] of grown.slice(0, spec.options.side)) {
    const edge = Math.round(plan.faces * around) % plan.faces;
    if (taken.has(edge)) continue;
    taken.add(edge);
    parts.push(small(radius, length, edge));
  }
  return turned(kit, plan, profile, { low: 1.75, high: 3.15 }, parts);
}

// The outline of a heater shield: a flat top edge, sides that curve down to a point.
function heaterOutline(sides) {
  const edge = (t) => [0.85 * (1 - t ** 2.4), 1 - 2.25 * t];
  const points = [[0.85, 1]];
  const steps = sides - 1;
  for (let i = 0; i < steps; i++) {
    const s = (2 * i) / steps;
    if (s <= 1) {
      const [x, y] = edge(s);
      points.push([-x, y]);
    } else points.push(edge(2 - s));
  }
  return points;
}

// The flat sides of a prism with any convex outline.
function sideFaces(outline, zLow, zHigh) {
  return outline.map((p, i) => {
    const q = outline[(i + 1) % outline.length];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return {
      normal: [(q[1] - p[1]) / length, (p[0] - q[0]) / length, 0],
      polygon: [[p[0], p[1], zLow], [q[0], q[1], zLow], [q[0], q[1], zHigh], [p[0], p[1], zHigh]],
      up: [0, 0, 1],
    };
  });
}

// A shield: a groove frames each side, studs sit along the border.
function buildShield(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 40 : plan.faces - 2;
  const outline = heaterOutline(sides);
  const height = (coin ? 0.4 : Math.min(0.9, fairHeight(polygonArea(outline), plan.faces))) * spec.stretch;
  const top = height / 2;
  const outer = insetPolygon(outline, 0.1);
  const inner = insetPolygon(outline, 0.15);
  const grooves = [
    ringBetween(kit, outer, inner, top - 0.04, top + 0.02),
    ringBetween(kit, outer, inner, -top - 0.02, -top + 0.04),
  ];
  const body = extrudeAt(kit, sectionOf(kit, outline), -top, top);
  const parts = [kit.keep(body.subtract(union(kit, grooves)))];
  const every = sides <= 8 ? 1 : 5;
  insetPolygon(outline, 0.05).forEach(([x, y], i) => {
    if (i % every) return;
    parts.push(ball(kit, 0.04, [x, y, top], 10), ball(kit, 0.04, [x, y, -top], 10));
  });
  const faces = endFaces(insetPolygon(outline, 0.2), top, -top);
  if (!coin) faces.push(...sideFaces(outline, -top, top));
  return { solid: union(kit, parts), faces };
}

// A throwing star: a small hub with a blade on every corner. The blades are ground thin towards
// the tips, which stay on the corners' lines, so the star stands on two tips with a side up.
function buildShuriken(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 4 : plan.faces - 2;
  const radius = 0.5;
  const hub = regularPolygon(sides, radius);
  const height = (coin ? 0.2 : Math.min(0.5, fairHeight(polygonArea(hub), plan.faces))) * spec.stretch;
  const top = height / 2;
  const reach = 1.2 * spec.options.fins;
  // How much of each side of the hub a blade takes. A plain star needs no room for numbers on its sides.
  // Crowded blades are slimmer, so that they keep clear of the numbers between them.
  const foot = coin ? 0.5 : sides > 60 ? 0.2 : 0.3;
  const thick = top * (coin ? 1 : 0.7);
  const edge = Math.min(thick, Math.max(0.02, thick * 0.3));
  const parts = [extrudeAt(kit, sectionOf(kit, hub), -top, top)];
  const between = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < sides; i++) {
    const corner = hub[i];
    const angle = (i * TAU) / sides;
    const base = [
      between(corner, hub[(i + sides - 1) % sides], foot),
      between(corner, hub[(i + 1) % sides], foot),
      [corner[0] * 0.4, corner[1] * 0.4],
    ];
    const tip = [reach * Math.cos(angle), reach * Math.sin(angle)];
    const points = [];
    for (const side of [1, -1]) {
      for (const [x, y] of base) points.push([x, y, side * thick]);
      points.push([tip[0], tip[1], side * edge]);
    }
    parts.push(kit.keep(kit.api.Manifold.hull(points)));
  }
  const faces = endFaces(regularPolygon(sides, radius * 0.8), top, -top);
  if (!coin) faces.push(...bandFaces(sides, radius, -top, top, true, facetWidth(sides, radius) * foot + 0.02));
  return { solid: union(kit, parts), faces };
}

// A tambourine: a hoop with one skin and a pair of jingles on every corner.
function buildTambourine(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const height = (coin ? 0.45 : Math.min(0.8, fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const top = height / 2;
  const profile = [
    [0, top - 0.12], [0.88, top - 0.12], [0.88, -top], [1, -top], [1, top], [0.9, top], [0.88, top - 0.04], [0, top - 0.04],
  ];
  const parts = [lathe(kit, profile, sides)];
  const jingled = coin || sides <= 12;
  const pairs = coin ? 6 : sides;
  for (let i = 0; jingled && i < pairs; i++) {
    const angle = (i * TAU) / pairs;
    const at = [0.98 * Math.cos(angle), 0.98 * Math.sin(angle)];
    for (const z of [-0.07, 0.07]) {
      const disc = kit.keep(kit.api.Manifold.cylinder(0.035, 0.15, 0.15, 16, true));
      parts.push(kit.keep(disc.translate(at[0], at[1], z)));
    }
    const pin = kit.keep(kit.api.Manifold.cylinder(0.24, 0.03, 0.03, 8, true));
    parts.push(kit.keep(pin.translate(at[0], at[1], 0)));
  }
  // The second number is on the inside of the skin, seen through the open side.
  const faces = [
    { normal: [0, 0, 1], polygon: regularPolygon(sides, 0.86).map(([x, y]) => [x, y, top - 0.04]), up: [0, 1, 0] },
    { normal: [0, 0, -1], polygon: regularPolygon(sides, 0.84).map(([x, y]) => [x, y, top - 0.12]).reverse(), up: [0, 1, 0] },
  ];
  if (!coin) faces.push(...bandFaces(sides, 1, -top, top, true, jingled ? 0.17 : 0));
  return { solid: union(kit, parts), faces };
}

// How far the edge of a regular polygon with corners at distance 1 is from the centre in a direction.
function reachOf(sides, angle) {
  const step = TAU / sides;
  const local = (((angle % step) + step) % step) - step / 2;
  return Math.cos(step / 2) / Math.cos(local);
}

// A gong: a boss on the front, rings round it, a rim turned back, two holes for the cord.
function buildGong(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const height = (coin ? 0.32 : Math.min(0.7, fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const top = height / 2;
  const profile = [
    [0, -top + 0.12], [0.82, -top + 0.12], [0.86, -top], [1, -top], [1, top - 0.05], [0.95, top],
    [0.82, top], [0.8, top - 0.03], [0.78, top], [0.68, top], [0.66, top - 0.03], [0.64, top],
    [0.52, top], [0.46, top + 0.1], [0, top + 0.1],
  ];
  const holes = [];
  for (const side of [-1, 1]) {
    const angle = Math.PI / 2 + side * 0.2;
    const distance = 0.87 * reachOf(sides, angle);
    const hole = kit.keep(kit.api.Manifold.cylinder(height + 1, 0.04, 0.04, 10, true));
    holes.push(kit.keep(hole.translate(distance * Math.cos(angle), distance * Math.sin(angle), 0)));
  }
  const solid = kit.keep(lathe(kit, profile, sides).subtract(union(kit, holes)));
  const faces = [
    { normal: [0, 0, 1], polygon: regularPolygon(sides, 0.42).map(([x, y]) => [x, y, top + 0.1]), up: [0, 1, 0] },
    { normal: [0, 0, -1], polygon: regularPolygon(sides, 0.78).map(([x, y]) => [x, y, -top + 0.12]).reverse(), up: [0, 1, 0] },
  ];
  if (!coin) faces.push(...bandFaces(sides, 1, -top, top - 0.05, true));
  return { solid, faces };
}

// A coin: a raised rim and a circle of beads on each side.
function buildCoin(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const outline = regularPolygon(sides);
  const height = (coin ? 0.26 : Math.min(0.6, fairHeight(polygonArea(outline), plan.faces))) * spec.stretch;
  const top = height / 2;
  const rim = insetPolygon(outline, 0.07);
  const parts = [
    extrudeAt(kit, sectionOf(kit, outline), -top, top),
    ringBetween(kit, outline, rim, top - 0.01, top + 0.04),
    ringBetween(kit, outline, rim, -top - 0.04, -top + 0.01),
  ];
  const track = insetPolygon(outline, 0.135);
  track.forEach((a, i) => {
    const b = track[(i + 1) % track.length];
    const count = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.13));
    for (let j = 0; j < count; j++) {
      const t = (j + 0.5) / count;
      const at = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      parts.push(ball(kit, 0.035, [at[0], at[1], top], 8), ball(kit, 0.035, [at[0], at[1], -top], 8));
    }
  });
  const faces = endFaces(insetPolygon(outline, 0.2), top, -top);
  if (!coin) faces.push(...bandFaces(sides, 1, -top, top, true));
  return { solid: union(kit, parts), faces };
}

// A gear: a tooth on every corner, a sunk ring on each side.
function buildGear(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 12 : plan.faces - 2;
  const radius = 0.8;
  const body = regularPolygon(sides, radius);
  const height = (coin ? 0.4 : Math.min(0.9, fairHeight(polygonArea(body), plan.faces))) * spec.stretch;
  const top = height / 2;
  const width = facetWidth(sides, radius);
  const foot = width * 0.34;
  const tip = width * 0.2;
  const reach = radius + 0.2 * spec.options.fins;
  const parts = [extrudeAt(kit, sectionOf(kit, body), -top, top)];
  for (let i = 0; i < sides; i++) {
    const angle = (i * TAU) / sides;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tooth = [[0.7, -foot / 2], [reach, -tip / 2], [reach, tip / 2], [0.7, foot / 2]].map(([u, v]) => [u * cos - v * sin, u * sin + v * cos]);
    parts.push(extrudeAt(kit, sectionOf(kit, tooth), -top, top));
  }
  const apothem = radius * Math.cos(Math.PI / sides);
  const outer = insetPolygon(body, apothem * 0.12);
  const inner = insetPolygon(body, apothem * 0.32);
  const sunk = [
    ringBetween(kit, outer, inner, top - 0.06, top + 0.02),
    ringBetween(kit, outer, inner, -top - 0.02, -top + 0.06),
  ];
  const solid = kit.keep(union(kit, parts).subtract(union(kit, sunk)));
  const faces = endFaces(insetPolygon(body, apothem * 0.4), top, -top);
  if (!coin) faces.push(...bandFaces(sides, radius, -top, top, true, foot / 2 + 0.02));
  return { solid, faces };
}

// The same "random" number for the same index, so a shape comes out the same every time.
function noise(index) {
  const value = Math.sin(index * 12.9898 + 4.1) * 43758.5453;
  return value - Math.floor(value);
}

// A wheel of cheese: holes on the edges and near the rim, clear of the numbers.
function buildCheese(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 40 : plan.faces - 2;
  const height = (coin ? 0.7 : Math.min(1.1, fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const top = height / 2;
  const profile = [[0, -top], [0.94, -top], [1, -top + 0.06], [1, top - 0.06], [0.94, top], [0, top]];
  const holes = [];
  const width = facetWidth(sides);
  const onEdges = coin ? 8 : sides <= 16 ? sides : 0;
  for (let i = 0; i < onEdges; i++) {
    const angle = (Math.round((i * sides) / onEdges) * TAU) / sides;
    const size = (0.09 + 0.08 * noise(i + 7)) * Math.min(1, width / 0.6);
    const z = (noise(i) - 0.5) * Math.max(0, height - 0.4);
    holes.push(ball(kit, size, [Math.cos(angle), Math.sin(angle), z], 14));
  }
  const inside = Math.cos(Math.PI / sides);
  const onEnds = Math.min(sides, 6);
  for (const side of [1, -1]) {
    for (let k = 0; k < onEnds; k++) {
      const facet = Math.floor((k * sides) / onEnds);
      const angle = ((facet + 0.5) * TAU) / sides;
      const size = ((0.07 + 0.05 * noise(k * 3 + side)) * (0.3 + inside)) / 1.3;
      holes.push(ball(kit, size, [0.76 * inside * Math.cos(angle), 0.76 * inside * Math.sin(angle), side * top], 14));
    }
  }
  const solid = kit.keep(lathe(kit, profile, sides).subtract(union(kit, holes)));
  const faces = endFaces(regularPolygon(sides, 0.5), top, -top);
  if (!coin) faces.push(...bandFaces(sides, 1, -top + 0.06, top - 0.06, true, onEdges ? 0.19 : 0));
  return { solid, faces };
}

// A crown: a band with a point on every corner and a cushion inside. The numbers go on the band,
// on the cushion and underneath.
function buildCrown(kit, plan, spec) {
  const coin = plan.faces === 2;
  const sides = coin ? 48 : plan.faces - 2;
  const height = (coin ? 0.7 : Math.min(1.1, fairHeight(polygonArea(regularPolygon(sides)), plan.faces))) * spec.stretch;
  const top = height / 2;
  const rise = 0.55 * spec.options.fins;
  const profile = [
    [0, -top], [1.04, -top], [1.04, -top + 0.12], [1, -top + 0.12], [1, top], [0.86, top], [0.84, top - 0.1], [0, top - 0.1],
  ];
  const wall = ringBetween(kit, regularPolygon(sides), regularPolygon(sides, 0.86), top - 0.01, top + rise);
  const points = coin ? 8 : sides;
  const width = 0.9 * facetWidth(points);
  const notch = [[-width / 2, top + rise + 0.01], [0, top + 0.04], [width / 2, top + rise + 0.01]];
  const notches = [];
  const parts = [lathe(kit, profile, sides)];
  for (let i = 0; i < points; i++) {
    notches.push(plaque(kit, notch, 1.4, ((i + 0.5) * TAU) / points, 0.75));
    if (points <= 16) {
      const angle = (i * TAU) / points;
      parts.push(ball(kit, 0.075, [0.93 * Math.cos(angle), 0.93 * Math.sin(angle), top + rise], 12));
    }
  }
  parts.push(kit.keep(wall.subtract(union(kit, notches))));
  const faces = [
    { normal: [0, 0, 1], polygon: regularPolygon(sides, 0.8).map(([x, y]) => [x, y, top - 0.1]), up: [0, 1, 0] },
    { normal: [0, 0, -1], polygon: regularPolygon(sides, 0.9).map(([x, y]) => [x, y, -top]).reverse(), up: [0, 1, 0] },
  ];
  if (!coin) faces.push(...bandFaces(sides, 1, -top + 0.14, top, true));
  return { solid: union(kit, parts), faces };
}

// The corners of a carved solid, each once, with the distance to its nearest neighbour.
function cornersOf(faces) {
  const corners = [];
  for (const face of faces) {
    for (const p of face.polygon) {
      if (!corners.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-4)) corners.push(p);
    }
  }
  return corners.map((p) => {
    let nearest = Infinity;
    for (const q of corners) {
      if (q !== p) nearest = Math.min(nearest, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]));
    }
    return { at: p, length: Math.hypot(p[0], p[1], p[2]), nearest };
  });
}

// The area of a face a number may take: every corner moves towards the middle of the face
// by the room that whatever stands on that corner needs.
function drawnIn(faces, corners) {
  return faces.map((face) => {
    const middle = [0, 0, 0];
    for (const p of face.polygon) for (let k = 0; k < 3; k++) middle[k] += p[k] / face.polygon.length;
    const polygon = face.polygon.map((p) => {
      const corner = corners.find((c) => Math.hypot(c.at[0] - p[0], c.at[1] - p[1], c.at[2] - p[2]) < 1e-4);
      if (!corner || !corner.room) return p;
      const away = sub(middle, p);
      const length = Math.hypot(away[0], away[1], away[2]);
      const step = Math.min(corner.room, length * 0.6) / (length || 1);
      return [p[0] + away[0] * step, p[1] + away[1] * step, p[2] + away[2] * step];
    });
    return { ...face, polygon };
  });
}

// How far over the faces a round thing on a corner reaches, when it is that thick where it comes out.
// Every face at a corner at distance d lies at distance 1, so they all meet the axis at the same angle.
const reachOnFaces = (thick, distance) => thick * distance * 1.1 + 0.02;

// A morning star: a spike on every corner. All the tips of one face lie in a plane parallel to it,
// so the ball rests on its spikes with a face straight up.
function buildMorningstar(kit, plan, spec) {
  const { solid, faces } = buildSphere(kit, plan, spec);
  const parts = [solid];
  const corners = cornersOf(faces);
  for (const corner of corners) {
    const tip = corner.length * (1 + 0.3 * spec.options.fins);
    const slope = Math.sqrt(1 - 1 / (corner.length * corner.length));
    // The spike widens on its way into the ball, so on the faces it is thicker than at the corner.
    const onFaces = (thick) => thick / Math.max(0.2, 1 - (thick * slope * corner.length) / (tip - corner.length));
    // A short spike stays a spike, not a wart: no wider than it is long.
    let thick = Math.min(0.2, corner.nearest * 0.25, (tip - corner.length) * 0.5);
    for (let i = 0; i < 24 && reachOnFaces(onFaces(thick), corner.length) > corner.nearest * 0.3; i++) thick *= 0.85;
    corner.room = reachOnFaces(onFaces(thick), corner.length);
    const foot = (thick * (tip - 0.8)) / (tip - corner.length);
    const direction = unit(corner.at);
    const spike = kit.keep(kit.api.Manifold.cylinder(tip - 0.8, foot, 0, 8, false));
    parts.push(aim(kit, spike, direction, direction.map((value) => value * 0.8)));
  }
  return { solid: union(kit, parts), faces: drawnIn(faces, corners) };
}

// A bomb: a neck and a bent fuse on the topmost corner.
function buildBomb(kit, plan, spec) {
  const { solid, faces } = buildSphere(kit, plan, spec);
  const corners = cornersOf(faces);
  const corner = corners.reduce((best, c) => (c.at[2] + c.at[0] * 1e-3 > best.at[2] + best.at[0] * 1e-3 ? c : best), corners[0]);
  const direction = unit(corner.at);
  const along = (distance) => direction.map((value) => value * distance);
  const thick = Math.min(0.26, (corner.nearest * 0.3) / corner.length);
  corner.room = reachOnFaces(thick, corner.length);
  const neck = kit.keep(kit.api.Manifold.cylinder(corner.length - 0.8 + 0.25, thick, thick, 16, false));
  const lip = kit.keep(kit.api.Manifold.cylinder(0.09, thick * 1.2, thick * 1.2, 16, false));
  const cord = thick * 0.3;
  const fuse = kit.keep(kit.api.Manifold.cylinder(0.3, cord, cord, 8, false));
  const side = unit(Math.abs(direction[0]) < 0.9 ? cross(direction, [1, 0, 0]) : cross(direction, [0, 1, 0]));
  const bend = unit([direction[0] + side[0] * 0.8, direction[1] + side[1] * 0.8, direction[2] + side[2] * 0.8]);
  const end = kit.keep(kit.api.Manifold.cylinder(0.32, cord, cord, 8, false));
  const elbow = along(corner.length + 0.62);
  const parts = [
    solid,
    aim(kit, neck, direction, along(0.8)),
    aim(kit, lip, direction, along(corner.length + 0.2)),
    aim(kit, fuse, direction, along(corner.length + 0.28)),
    ball(kit, cord, elbow, 8),
    aim(kit, end, bend, elbow),
  ];
  return { solid: union(kit, parts), faces: drawnIn(faces, corners) };
}

// A dragon's egg: the ball drawn out along its axis, more at the top than at the bottom.
function buildEgg(kit, plan, spec) {
  return buildSphere(kit, plan, spec, (normal) => {
    const tall = normal[2] > 0 ? 1.6 : 1.25;
    return Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + tall * tall * normal[2] * normal[2]);
  });
}

const BUILDERS = {
  sphere: buildSphere,
  spindle: buildSpindle,
  cylinder: buildCylinder,
  prism: buildPrism,
  scroll: buildScroll,
  book: buildBook,
  drum: buildDrum,
  cauldron: buildCauldron,
  plate: buildPlate,
  goblet: buildGoblet,
  vase: buildVase,
  sword: buildSword,
  dagger: buildDagger,
  mace: buildMace,
  morningstar: buildMorningstar,
  spear: buildSpear,
  axe: buildAxe,
  hammer: buildHammer,
  staff: buildStaff,
  wand: buildWand,
  torch: buildTorch,
  shield: buildShield,
  shuriken: buildShuriken,
  cannon: buildCannon,
  bomb: buildBomb,
  djembe: buildDjembe,
  tambourine: buildTambourine,
  gong: buildGong,
  bell: buildBell,
  flute: buildFlute,
  fanfare: buildFanfare,
  maraca: buildMaraca,
  lute: buildLute,
  mug: buildMug,
  keg: buildKeg,
  potion: buildPotion,
  candle: buildCandle,
  tower: buildTower,
  hourglass: buildHourglass,
  crown: buildCrown,
  coin: buildCoin,
  gear: buildGear,
  crystal: buildCrystal,
  egg: buildEgg,
  bone: buildBone,
  mushroom: buildMushroom,
  cheese: buildCheese,
};

function centroid(polygon, normal) {
  // Fan from the first corner: fine for the convex faces built here.
  const origin = polygon[0];
  let total = 0;
  const center = [0, 0, 0];
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = sub(polygon[i], origin);
    const b = sub(polygon[i + 1], origin);
    const area = Math.abs(dot(cross(a, b), normal)) / 2;
    total += area;
    for (let axis = 0; axis < 3; axis++) {
      center[axis] += (area * (origin[axis] + polygon[i][axis] + polygon[i + 1][axis])) / 3;
    }
  }
  if (total < 1e-12) return origin.slice();
  return [center[0] / total, center[1] / total, center[2] / total];
}

// Opposite faces of a plain die add up to n + 1; on a doubled die they carry the same number.
function numberFaces(faces, outcomes) {
  // Faces of two different bands may be all but parallel; they are no pair.
  const opposite = faces.map((face, i) =>
    faces.findIndex((other, j) => j !== i && other.band === face.band && dot(face.normal, other.normal) < -0.9999));
  const values = new Array(faces.length).fill(0);
  if (opposite.every((j) => j >= 0)) {
    let pair = 0;
    faces.forEach((face, i) => {
      if (values[i]) return;
      const j = opposite[i];
      if (faces.length === outcomes) {
        const low = pair + 1;
        const high = outcomes - pair;
        values[i] = pair % 2 ? high : low;
        values[j] = pair % 2 ? low : high;
      } else {
        values[i] = (pair % outcomes) + 1;
        values[j] = values[i];
      }
      pair += 1;
    });
  } else {
    faces.forEach((face, i) => {
      values[i] = (i % outcomes) + 1;
    });
  }
  // A dot tells 6 from 9 once both are on the die.
  const marked = outcomes >= 9;
  return values.map((value) => (marked && (value === 6 || value === 9) ? `${value}.` : String(value)));
}

// spec: { shape, outcomes, double, size, stretch, caps, options }. Lengths come out in the units of size.
// copies: how many faces at the end of the list repeat the number of another face.
export function buildDie(api, spec) {
  const plan = planDie(spec.shape, spec.outcomes, Boolean(spec.double), spec.options);
  const settings = {
    stretch: Math.min(3, Math.max(0.3, Number(spec.stretch) || 1)),
    caps: CAPS.includes(spec.caps) ? spec.caps : CAPS[0],
    options: optionsFor(plan.shape, spec.options),
  };
  const size = Math.max(1, Number(spec.size) || 20);
  const kit = tracker(api);
  try {
    const { solid, faces, copies = [] } = BUILDERS[plan.shape](kit, plan, settings);
    const status = solid.status();
    if (status !== 'NoError') throw new Error(`die solid: ${status}`);
    const mesh = solid.getMesh();
    const stride = mesh.numProp;
    const count = mesh.vertProperties.length / stride;
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const value = mesh.vertProperties[i * stride + axis];
        if (value < low[axis]) low[axis] = value;
        if (value > high[axis]) high[axis] = value;
      }
    }
    const extent = Math.max(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
    if (!(extent > 0) || extent > BLOCK) throw new Error('die solid: no bounds');
    const scale = size / extent;
    const middle = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, (low[2] + high[2]) / 2];
    const place = (p) => [(p[0] - middle[0]) * scale, (p[1] - middle[1]) * scale, (p[2] - middle[2]) * scale];

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const p = place([mesh.vertProperties[i * stride], mesh.vertProperties[i * stride + 1], mesh.vertProperties[i * stride + 2]]);
      positions.set(p, i * 3);
    }
    const labels = numberFaces(faces, plan.outcomes);
    const placed = (face, label) => {
      const polygon = face.polygon.map(place);
      const normal = unit(face.normal);
      return { normal, polygon, up: unit(face.up), center: centroid(polygon, normal), label };
    };
    return {
      plan,
      positions,
      index: Uint32Array.from(mesh.triVerts),
      faces: [
        ...faces.map((face, i) => placed(face, labels[i])),
        ...copies.map((face) => placed(face, labels[face.of])),
      ],
      copies: copies.length,
    };
  } finally {
    kit.free();
  }
}

// The tallest text of the given width-to-height ratio that stays inside the face around its centre.
export function fitHeight(face, aspect) {
  const right = cross(face.up, face.normal);
  const points = face.polygon.map((p) => {
    const r = sub(p, face.center);
    return [dot(r, right), dot(r, face.up)];
  });
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    let nx = b[1] - a[1];
    let ny = a[0] - b[0];
    const length = Math.hypot(nx, ny);
    if (length < 1e-12) continue;
    nx /= length;
    ny /= length;
    const reach = Math.abs(nx * a[0] + ny * a[1]);
    best = Math.min(best, reach / (Math.abs(nx) * aspect * 0.5 + Math.abs(ny) * 0.5));
  }
  return Number.isFinite(best) ? best : 0;
}
