// Weight and balance of a model: its mass, where its centre of mass is, how hard it is to spin,
// and how the mass is shared between the parts of the die that stand behind its faces.
// Lengths are the model's own units, taken as millimetres wherever grams are counted.

import * as THREE from 'three';

// Densities in g/cm³ of a solid body. A filament print with infill weighs less than this.
export const MATERIALS = [
  { id: 'resin', key: 'balance.matResin', density: 1.18 },
  { id: 'epoxy', key: 'balance.matEpoxy', density: 1.15 },
  { id: 'acrylic', key: 'balance.matAcrylic', density: 1.18 },
  { id: 'pla', key: 'balance.matPla', density: 1.24 },
  { id: 'petg', key: 'balance.matPetg', density: 1.27 },
  { id: 'abs', key: 'balance.matAbs', density: 1.04 },
  { id: 'aluminium', key: 'balance.matAluminium', density: 2.7 },
  { id: 'zinc', key: 'balance.matZinc', density: 6.6 },
  { id: 'brass', key: 'balance.matBrass', density: 8.5 },
  { id: 'steel', key: 'balance.matSteel', density: 7.85 },
];

export function materialById(id) {
  return MATERIALS.find((material) => material.id === id) || null;
}

// Grams of a body of this many cubic millimetres.
export function gramsOf(volume, density) {
  return (volume / 1000) * density;
}

export function triangleCount(geometry) {
  const index = geometry.getIndex();
  return (index ? index.count : geometry.getAttribute('position').count) / 3;
}

function eachTriangle(geometry, visit) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = triangleCount(geometry);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    a.fromBufferAttribute(position, index ? index.getX(i * 3) : i * 3);
    b.fromBufferAttribute(position, index ? index.getX(i * 3 + 1) : i * 3 + 1);
    c.fromBufferAttribute(position, index ? index.getX(i * 3 + 2) : i * 3 + 2);
    visit(a, b, c, i);
  }
}

// Volume, centre of mass and the inertia about that centre of a closed mesh of density one.
// The inertia is the full tensor as [xx, yy, zz, xy, xz, yz]. Null when the mesh has no inside.
export function massProps(geometry) {
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) return null;
  // Sums are taken about the middle of the model: far from the origin they would lose digits.
  const box = new THREE.Box3().setFromBufferAttribute(position);
  const o = box.getCenter(new THREE.Vector3());
  let six = 0;
  const first = new THREE.Vector3();
  const second = [0, 0, 0, 0, 0, 0];
  const cross = new THREE.Vector3();
  eachTriangle(geometry, (a, b, c) => {
    a.sub(o);
    b.sub(o);
    c.sub(o);
    const det = a.dot(cross.crossVectors(b, c));
    six += det;
    const sx = a.x + b.x + c.x;
    const sy = a.y + b.y + c.y;
    const sz = a.z + b.z + c.z;
    first.x += det * sx;
    first.y += det * sy;
    first.z += det * sz;
    second[0] += det * (a.x * a.x + b.x * b.x + c.x * c.x + sx * sx);
    second[1] += det * (a.y * a.y + b.y * b.y + c.y * c.y + sy * sy);
    second[2] += det * (a.z * a.z + b.z * b.z + c.z * c.z + sz * sz);
    second[3] += det * (a.x * a.y + b.x * b.y + c.x * c.y + sx * sy);
    second[4] += det * (a.x * a.z + b.x * b.z + c.x * c.z + sx * sz);
    second[5] += det * (a.y * a.z + b.y * b.z + c.y * c.z + sy * sz);
  });
  const volume = six / 6;
  if (!(volume > 0) || !Number.isFinite(volume)) return null;
  const centre = first.multiplyScalar(1 / (24 * volume));
  // The spread of the mass about the centre of mass, then the inertia it gives.
  const xx = second[0] / 120 - volume * centre.x * centre.x;
  const yy = second[1] / 120 - volume * centre.y * centre.y;
  const zz = second[2] / 120 - volume * centre.z * centre.z;
  const xy = second[3] / 120 - volume * centre.x * centre.y;
  const xz = second[4] / 120 - volume * centre.x * centre.z;
  const yz = second[5] / 120 - volume * centre.y * centre.z;
  return {
    volume,
    centre: centre.add(o),
    inertia: [yy + zz, xx + zz, xx + yy, -xy, -xz, -yz],
  };
}

// The principal moments of an inertia tensor [xx, yy, zz, xy, xz, yz] and the turn that takes
// the principal axes to the model's: what a physics engine wants to know about a body.
export function principalAxes(inertia) {
  const m = [
    [inertia[0], inertia[3], inertia[4]],
    [inertia[3], inertia[1], inertia[5]],
    [inertia[4], inertia[5], inertia[2]],
  ];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // Jacobi turns: each one zeroes the largest value off the diagonal.
  for (let sweep = 0; sweep < 32; sweep++) {
    let p = 0;
    let q = 1;
    for (const [i, j] of [[0, 2], [1, 2]]) {
      if (Math.abs(m[i][j]) > Math.abs(m[p][q])) {
        p = i;
        q = j;
      }
    }
    const scale = Math.abs(m[0][0]) + Math.abs(m[1][1]) + Math.abs(m[2][2]);
    if (Math.abs(m[p][q]) <= scale * 1e-14) break;
    const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
    const tan = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const cos = 1 / Math.sqrt(tan * tan + 1);
    const sin = tan * cos;
    for (let k = 0; k < 3; k++) {
      const kp = m[k][p];
      const kq = m[k][q];
      m[k][p] = cos * kp - sin * kq;
      m[k][q] = sin * kp + cos * kq;
    }
    for (let k = 0; k < 3; k++) {
      const pk = m[p][k];
      const qk = m[q][k];
      m[p][k] = cos * pk - sin * qk;
      m[q][k] = sin * pk + cos * qk;
    }
    for (let k = 0; k < 3; k++) {
      const kp = v[k][p];
      const kq = v[k][q];
      v[k][p] = cos * kp - sin * kq;
      v[k][q] = sin * kp + cos * kq;
    }
  }
  const x = new THREE.Vector3(v[0][0], v[1][0], v[2][0]);
  const y = new THREE.Vector3(v[0][1], v[1][1], v[2][1]);
  const z = new THREE.Vector3(v[0][2], v[1][2], v[2][2]);
  // The axes must stay a right-handed set to be a turn.
  if (x.clone().cross(y).dot(z) < 0) z.negate();
  const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return { moments: [m[0][0], m[1][1], m[2][2]], frame };
}

// The flat faces of a model: for every direction that carries a real share of the surface,
// the plane most of that share lies in. A cut sign has its floor in a lower plane and a raised
// one its top in a higher one; the face itself is where the greater area is.
// Returns [{ normal, offset, area }]; a dense sculpted mesh gets an empty list.
export function flatFaces(geometry, most = 60000) {
  if (triangleCount(geometry) > most) return [];
  const position = geometry.getAttribute('position');
  const box = new THREE.Box3().setFromBufferAttribute(position);
  const step = Math.max(box.getSize(new THREE.Vector3()).length() * 2e-3, 1e-6);
  const groups = new Map();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  let total = 0;
  eachTriangle(geometry, (a, b, c) => {
    normal.subVectors(b, a).cross(edge.subVectors(c, a));
    const area = normal.length() / 2;
    if (!(area > 0)) return;
    normal.normalize();
    total += area;
    const id = `${Math.round(normal.x * 50)},${Math.round(normal.y * 50)},${Math.round(normal.z * 50)}`;
    let group = groups.get(id);
    if (!group) {
      group = { area: 0, normal: new THREE.Vector3(), levels: new Map() };
      groups.set(id, group);
    }
    group.area += area;
    group.normal.addScaledVector(normal, area);
    const offset = normal.dot(a);
    const key = Math.round(offset / step);
    const level = group.levels.get(key);
    if (level) {
      level.area += area;
      level.sum += offset * area;
    } else {
      group.levels.set(key, { area, sum: offset * area });
    }
  });
  const faces = [];
  for (const group of groups.values()) {
    if (group.area < total * 0.004) continue;
    let best = null;
    for (const level of group.levels.values()) {
      if (!best || level.area > best.area) best = level;
    }
    const direction = group.normal.normalize();
    // Two groups a rounding step apart are one face.
    const same = faces.find((face) => face.normal.dot(direction) > 0.9995 && Math.abs(face.offset - best.sum / best.area) < step * 2);
    if (same) same.area += best.area;
    else faces.push({ normal: direction, offset: best.sum / best.area, area: best.area });
  }
  return faces;
}

// Faces for a model that has none of its own: the planes that touch it from the given directions.
export function touchingFaces(geometry, directions) {
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  return directions.map((direction) => {
    const normal = direction.clone().normalize();
    let offset = -Infinity;
    for (let i = 0; i < position.count; i++) {
      const reach = normal.dot(point.fromBufferAttribute(position, i));
      if (reach > offset) offset = reach;
    }
    return { normal, offset, area: 0 };
  });
}

// Six sides and eight corners: the parts of a body that has no faces.
export function roundDirections() {
  const out = [];
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    out.push(new THREE.Vector3(...axis), new THREE.Vector3(...axis).negate());
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(new THREE.Vector3(x, y, z).normalize());
  return out;
}

// Shares the model out between its faces. The part of a face is everything between the centre
// and the surface that belongs to that face: the face itself, the signs cut into it, the
// rounding at its rim. A piece of surface belongs to the face whose plane it is nearest to.
// Returns the volume of every part and, for every triangle, the face that owns it.
export function partsOf(geometry, centre, faces) {
  const volumes = new Float64Array(faces.length);
  const owner = new Int32Array(triangleCount(geometry));
  const middle = new THREE.Vector3();
  const cross = new THREE.Vector3();
  eachTriangle(geometry, (a, b, c, i) => {
    middle.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    let best = 0;
    let nearest = Infinity;
    for (let f = 0; f < faces.length; f++) {
      const distance = Math.abs(faces[f].offset - faces[f].normal.dot(middle));
      if (distance < nearest) {
        nearest = distance;
        best = f;
      }
    }
    owner[i] = best;
    a.sub(centre);
    b.sub(centre);
    c.sub(centre);
    volumes[best] += a.dot(cross.crossVectors(b, c)) / 6;
  });
  return { volumes, owner };
}

const COLD = new THREE.Color('#3f74d8');
const EVEN = new THREE.Color('#ece5d6');
const HOT = new THREE.Color('#d8483a');

// From -1, the lightest, through 0 to 1, the heaviest.
export function heatColor(value, target = new THREE.Color()) {
  const amount = Math.min(1, Math.abs(value));
  return target.copy(EVEN).lerp(value < 0 ? COLD : HOT, amount);
}

// The model painted by its parts: every triangle takes the colour of the part that owns it.
export function heatGeometry(geometry, owner, heat) {
  const count = triangleCount(geometry);
  const positions = new Float32Array(count * 9);
  const colors = new Float32Array(count * 9);
  const tones = heat.map((value) => heatColor(value));
  eachTriangle(geometry, (a, b, c, i) => {
    const tone = tones[owner[i]];
    let o = i * 9;
    for (const corner of [a, b, c]) {
      positions[o] = corner.x;
      positions[o + 1] = corner.y;
      positions[o + 2] = corner.z;
      colors[o] = tone.r;
      colors[o + 1] = tone.g;
      colors[o + 2] = tone.b;
      o += 3;
    }
  });
  const painted = new THREE.BufferGeometry();
  painted.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  painted.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  painted.computeVertexNormals();
  return painted;
}
