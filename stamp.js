import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import Module from 'manifold-3d';
import { AppError } from './i18n.js?v=7';

const WASM = 'https://cdn.jsdelivr.net/npm/manifold-3d@3.5.4/manifold.wasm';

let api = null;

export async function initManifold() {
  if (api) return api;
  const wasm = await Module({ locateFile: () => WASM });
  wasm.setup();
  api = wasm;
  return api;
}

// The loaded manifold module, or null while it is still downloading.
export function manifoldApi() {
  return api;
}

function zShift(depth, mode) {
  const eps = Math.max(0.02, depth * 0.08);
  return {
    height: depth + eps,
    z0: mode === 'raise' ? -eps : -depth,
  };
}

function sectionFrom(contours, fillRule) {
  const { CrossSection } = api;
  const cleaned = contours.filter((c) => c && c.length >= 3);
  if (!cleaned.length) throw new AppError('err.noContour');
  let cs = new CrossSection(cleaned, fillRule || 'NonZero');
  if (Math.abs(cs.area()) < 1e-8) {
    cs.delete();
    cs = new CrossSection(cleaned.map((c) => c.slice().reverse()), fillRule || 'NonZero');
  }
  if (Math.abs(cs.area()) < 1e-8) {
    cs.delete();
    throw new AppError('err.noArea');
  }
  return cs;
}

function extrudeLocal(contours, fillRule, depth, mode) {
  const cs = sectionFrom(contours, fillRule);
  let solid = null;
  let shifted = null;
  try {
    const { height, z0 } = zShift(depth, mode);
    solid = cs.extrude(height);
    shifted = solid.translate(0, 0, z0);
    return shifted;
  } finally {
    cs.delete();
    if (solid) solid.delete();
  }
}

// How finely a sign that follows the relief is cut up: its longer side over this many steps.
const WRAP_STEPS = 40;

// A quick look before the costly cutting-up: the outline of the sign and a grid over its box.
// On the flat face of an ordinary die every one of these points lies in the stamp's plane.
function looksFlat(contours, min, max, surface, tolerance) {
  const level = (x, y) => {
    const height = surface(x, y);
    return height !== null && Math.abs(height) < tolerance;
  };
  let points = 0;
  for (const contour of contours) points += contour.length;
  const skip = Math.max(1, Math.ceil(points / 400));
  for (const contour of contours) {
    for (let i = 0; i < contour.length; i += skip) {
      if (!level(contour[i][0], contour[i][1])) return false;
    }
  }
  const cells = 8;
  for (let i = 0; i <= cells; i++) {
    for (let j = 0; j <= cells; j++) {
      const x = min[0] + ((max[0] - min[0]) * i) / cells;
      const y = min[1] + ((max[1] - min[1]) * j) / cells;
      if (!level(x, y)) return false;
    }
  }
  return true;
}

// The tool for a sign that follows the relief. surface(x, y) is the height of the model over
// the stamp's plane, or null where there is nothing under that point. Every part of the sign
// keeps the same depth below the surface (or height above it), so a bump cannot bury it and
// a dip cannot leave it uncut.
// Returns null when the surface under the sign is flat: the plain prism does the same job.
// shell: for the preview, a cut is shown as a skin on the surface, not as the block that removes it.
function wrapLocal(contours, fillRule, depth, mode, surface, shell) {
  const { Manifold, Mesh } = api;
  const made = [];
  try {
    const section = sectionFrom(contours, fillRule);
    made.push(section);
    const { min, max } = section.bounds();
    const extent = Math.max(max[0] - min[0], max[1] - min[1]);
    if (!(extent > 0)) return null;
    if (looksFlat(contours, min, max, surface, extent * 1e-3)) return null;
    const step = extent / WRAP_STEPS;
    const slab = section.extrude(step);
    made.push(slab);
    const fine = slab.refineToLength(step);
    made.push(fine);
    const mesh = fine.getMesh();
    const stride = mesh.numProp;
    const source = mesh.vertProperties;
    const count = source.length / stride;

    // The top and the bottom of the slab share their outline, so each spot is measured once.
    const known = new Map();
    const spots = [];
    const spotOf = new Uint32Array(count);
    for (let i = 0; i < count; i++) {
      const x = source[i * stride];
      const y = source[i * stride + 1];
      const key = `${x},${y}`;
      let spot = known.get(key);
      if (spot === undefined) {
        spot = spots.length;
        known.set(key, spot);
        const height = surface(x, y);
        spots.push({ x, y, height: Number.isFinite(height) ? height : null });
      }
      spotOf[i] = spot;
    }
    const found = spots.filter((spot) => spot.height !== null);
    if (!found.length) return null;
    let lowest = Infinity;
    let highest = -Infinity;
    for (const spot of found) {
      lowest = Math.min(lowest, spot.height);
      highest = Math.max(highest, spot.height);
    }
    if (highest - lowest < extent * 1e-3 && Math.abs(highest) < extent * 1e-3) return null;
    // Where the sign hangs over an edge of the model it carries on at the height of the nearest part that does not.
    for (const spot of spots) {
      if (spot.height !== null) continue;
      let nearest = Infinity;
      for (const other of found) {
        const distance = (other.x - spot.x) ** 2 + (other.y - spot.y) ** 2;
        if (distance < nearest) {
          nearest = distance;
          spot.filled = other.height;
        }
      }
    }

    const eps = Math.max(0.02, depth * 0.08);
    // The surface is known only at the spots; between them the tool must still reach past it.
    const slack = Math.max(eps, step * 0.5);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const spot = spots[spotOf[i]];
      const height = spot.height !== null ? spot.height : spot.filled;
      let low;
      let high;
      if (mode === 'raise') {
        low = height - slack;
        high = height + depth;
      } else {
        low = height - depth;
        high = shell ? height + eps : highest + slack;
      }
      const t = Math.min(1, Math.max(0, source[i * stride + 2] / step));
      positions[i * 3] = spot.x;
      positions[i * 3 + 1] = spot.y;
      positions[i * 3 + 2] = low + (high - low) * t;
    }
    const tool = new Manifold(new Mesh({ numProp: 3, vertProperties: positions, triVerts: mesh.triVerts }));
    if (tool.status() !== 'NoError') {
      const status = tool.status();
      tool.delete();
      throw statusError(status);
    }
    return tool;
  } finally {
    for (const object of made) object.delete();
  }
}

function toolFor(contours, fillRule, depth, mode, surface, shell) {
  const wrapped = surface ? wrapLocal(contours, fillRule, depth, mode, surface, shell) : null;
  return wrapped || extrudeLocal(contours, fillRule, depth, mode);
}

// The stamp as it is drawn over the model before it is applied.
// With a surface function the sign follows the relief, see wrapLocal.
export function localToolGeometry(contours, fillRule, depth, mode, surface = null) {
  const solid = toolFor(contours, fillRule, depth, mode, surface, true);
  try {
    return meshToGeometry(solid.getMesh());
  } finally {
    solid.delete();
  }
}

function geometryToManifold(geometry) {
  const { Manifold, Mesh } = api;
  const welded = weld(geometry);
  const pos = welded.getAttribute('position');
  const index = welded.getIndex();
  const vertProperties = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    vertProperties[i * 3] = pos.getX(i);
    vertProperties[i * 3 + 1] = pos.getY(i);
    vertProperties[i * 3 + 2] = pos.getZ(i);
  }
  const triVerts = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) triVerts[i] = index.getX(i);
  return new Manifold(new Mesh({ numProp: 3, vertProperties, triVerts }));
}

export function weld(geometry) {
  const source = geometry.clone();
  // Normals differ per face, so a position-only weld would never share corners.
  source.deleteAttribute('normal');
  source.deleteAttribute('uv');
  source.deleteAttribute('color');
  const box = new THREE.Box3().setFromBufferAttribute(source.getAttribute('position'));
  const diag = box.getSize(new THREE.Vector3()).length() || 1;
  const welded = mergeVertices(source, Math.max(diag * 1e-6, 1e-8));
  welded.computeVertexNormals();
  return welded;
}

export function meshToGeometry(mesh) {
  const stride = mesh.numProp || 3;
  const src = mesh.vertProperties;
  const count = Math.floor(src.length / stride);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = src[i * stride];
    positions[i * 3 + 1] = src[i * stride + 1];
    positions[i * 3 + 2] = src[i * stride + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.triVerts), 1));
  geo.computeVertexNormals();
  return geo;
}

export function signedVolume(geometry) {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!pos || !index) return 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    v += a.dot(b.cross(c));
  }
  return v / 6;
}

export function flipWinding(geometry) {
  const geo = geometry.index ? geometry.clone() : weld(geometry);
  const index = geo.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    const t = index.getX(i);
    index.setX(i, index.getX(i + 1));
    index.setX(i + 1, t);
  }
  geo.computeVertexNormals();
  return geo;
}

const STATUS_KEYS = {
  NonFiniteVertex: 'err.solid.nonFinite',
  NotManifold: 'err.solid.notManifold',
  InvalidConstruction: 'err.solid.invalid',
  ResultTooLarge: 'err.solid.tooLarge',
};

function statusError(status) {
  const key = STATUS_KEYS[status];
  return key ? new AppError(key) : new AppError('err.solid.other', { status });
}

export function prepareSolid(geometry, { autoFlip = true } = {}) {
  let current = weld(geometry);
  let flipped = false;
  let lastError = null;
  const attempts = autoFlip ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let solid = null;
    try {
      solid = geometryToManifold(current);
      const status = solid.status();
      if (status !== 'NoError') throw statusError(status);
      const volume = solid.volume();
      solid.delete();
      if (volume < 0 && autoFlip && attempt === 0) {
        current = flipWinding(current);
        flipped = true;
        continue;
      }
      return { geometry: current, volume, flipped };
    } catch (error) {
      if (solid) solid.delete();
      lastError = error;
      if (autoFlip && attempt === 0) {
        current = flipWinding(current);
        flipped = true;
        continue;
      }
    }
  }
  const wrapped = lastError && lastError.key
    ? new AppError(lastError.key, lastError.params)
    : new AppError('err.solid.open');
  wrapped.geometry = current;
  throw wrapped;
}

export function applyStamps(geometry, jobs) {
  if (!api) throw new AppError('err.engineNotReady');
  const created = [];
  const track = (solid) => {
    created.push(solid);
    return solid;
  };
  try {
    let current = track(geometryToManifold(geometry));
    const baseStatus = current.status();
    if (baseStatus !== 'NoError') throw statusError(baseStatus);

    jobs.forEach((job, index) => {
      try {
        const tool = track(toolFor(job.contours, job.fillRule, job.depth, job.mode, job.surface, false));
        const world = track(tool.transform(job.matrix));
        const next = track(job.mode === 'raise' ? current.add(world) : current.subtract(world));
        const status = next.status();
        if (status !== 'NoError') throw statusError(status);
        current = next;
      } catch (error) {
        // The reason stays a key so the whole line can be re-read in another language.
        const reason = error && error.key
          ? { key: error.key, params: error.params }
          : { key: 'err.stampBuild' };
        throw new AppError('err.stampN', { n: index + 1, reason });
      }
    });

    return meshToGeometry(current.getMesh());
  } finally {
    for (const solid of created) solid.delete();
  }
}
