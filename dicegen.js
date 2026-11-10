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

// kind: 'poly' lands on any face, 'roll' lies on its side (ends carry no number),
// 'ends' is a prism whose two ends count as faces too.
// least: the fewest faces the shape looks right with. themed: a decorative shape, not a fair one.
export const SHAPES = [
  { id: 'sphere', nameKey: 'gen.shape.sphere', shortKey: 'gen.short.sphere', kind: 'poly', stretch: false, caps: false },
  { id: 'spindle', nameKey: 'gen.shape.spindle', shortKey: 'gen.short.spindle', kind: 'poly', stretch: true, caps: false },
  { id: 'cylinder', nameKey: 'gen.shape.cylinder', shortKey: 'gen.short.cylinder', kind: 'roll', least: 3, stretch: true, caps: true },
  { id: 'prism', nameKey: 'gen.shape.prism', shortKey: 'gen.short.prism', kind: 'ends', stretch: true, caps: false },
  { id: 'scroll', nameKey: 'gen.shape.scroll', shortKey: 'gen.short.scroll', kind: 'roll', least: 3, stretch: true, caps: false, themed: true },
  { id: 'book', nameKey: 'gen.shape.book', shortKey: 'gen.short.book', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'drum', nameKey: 'gen.shape.drum', shortKey: 'gen.short.drum', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'cauldron', nameKey: 'gen.shape.cauldron', shortKey: 'gen.short.cauldron', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
  { id: 'plate', nameKey: 'gen.shape.plate', shortKey: 'gen.short.plate', kind: 'ends', stretch: true, caps: false, themed: true },
  { id: 'goblet', nameKey: 'gen.shape.goblet', shortKey: 'gen.short.goblet', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
  { id: 'vase', nameKey: 'gen.shape.vase', shortKey: 'gen.short.vase', kind: 'roll', least: 5, stretch: false, caps: false, themed: true },
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

// How many faces the solid gets for n outcomes, and whether the result reads from the top face.
export function planDie(shapeId, outcomes, double) {
  const shape = shapeById(shapeId);
  const n = Math.max(MIN_OUTCOMES, Math.min(MAX_OUTCOMES, Math.round(outcomes)));
  // Every number on two opposite faces: the face count is an even multiple of n.
  const doubled = (least) => {
    let faces = 2 * n;
    while (faces < least) faces += 2 * n;
    return faces;
  };
  let faces;
  let top;
  if (shape.id === 'sphere') {
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
    top = faces % 2 === 0;
  }
  return { shape: shape.id, outcomes: n, faces, repeat: faces / n, top, forced: faces !== n && !double };
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

function lathe(kit, profile, segments) {
  const section = kit.keep(new kit.api.CrossSection([profile], 'Positive'));
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

function buildSphere(kit, plan) {
  const count = plan.faces;
  let normals;
  if (EXACT[count]) normals = EXACT[count].map(unit);
  else normals = spreadPoints(count, count % 2 === 0);
  // An even die shows a face on top; an odd one, like the tetrahedron, at least sits flat on one.
  const turn = rotationBetween(normals[0], plan.top ? [0, 0, 1] : [0, 0, -1]);
  const planes = normals.map((normal) => ({ normal: unit(turn(normal)), offset: 1 }));
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
  return kit.keep(new kit.api.CrossSection([polygon], 'Positive'));
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

// A rolled parchment on a rod with a knob at each end. It lies on its side.
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
  const tip = half + 0.6;
  const rod = lathe(
    kit,
    [
      [0, -tip],
      [0.2, -tip + 0.04],
      [0.3, -tip + 0.18],
      [0.3, -tip + 0.3],
      [0.2, -tip + 0.4],
      [0.2, tip - 0.4],
      [0.3, tip - 0.3],
      [0.3, tip - 0.18],
      [0.2, tip - 0.04],
      [0, tip],
    ],
    32,
  );
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
  const opposite = faces.map((face, i) => faces.findIndex((other, j) => j !== i && dot(face.normal, other.normal) < -0.9999));
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

// spec: { shape, outcomes, double, size, stretch, caps }. Lengths come out in the units of size.
export function buildDie(api, spec) {
  const plan = planDie(spec.shape, spec.outcomes, Boolean(spec.double));
  const settings = {
    stretch: Math.min(3, Math.max(0.3, Number(spec.stretch) || 1)),
    caps: CAPS.includes(spec.caps) ? spec.caps : CAPS[0],
  };
  const size = Math.max(1, Number(spec.size) || 20);
  const kit = tracker(api);
  try {
    const { solid, faces } = BUILDERS[plan.shape](kit, plan, settings);
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
    return {
      plan,
      positions,
      index: Uint32Array.from(mesh.triVerts),
      faces: faces.map((face, i) => {
        const polygon = face.polygon.map(place);
        const normal = unit(face.normal);
        return { normal, polygon, up: unit(face.up), center: centroid(polygon, normal), label: labels[i] };
      }),
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
