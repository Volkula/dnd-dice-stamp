import * as THREE from 'three';
import { AppError } from './i18n.js?v=11';

export const PROJECT_APP = 'dnd-dice-stamp';
// Version 2 holds several objects; version 1 files with a single model still open.
export const PROJECT_VERSION = 2;
export const PROJECT_EXT = '.dicestamp.json';

export function toBase64(data) {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function packGeometry(geometry) {
  const position = geometry.getAttribute('position');
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i);
    positions[i * 3 + 1] = position.getY(i);
    positions[i * 3 + 2] = position.getZ(i);
  }
  const source = geometry.getIndex();
  const index = new Uint32Array(source ? source.count : position.count);
  for (let i = 0; i < index.length; i++) index[i] = source ? source.getX(i) : i;
  const packed = { positions, index };
  // One flag per triangle: the surface of a sign, which the tray may paint.
  const ink = geometry.userData && geometry.userData.ink;
  if (ink instanceof Uint8Array && ink.length === index.length / 3) packed.ink = ink.slice();
  return packed;
}

export function unpackGeometry(packed) {
  const { positions, index } = packed || {};
  if (!(positions instanceof Float32Array) || !(index instanceof Uint32Array)) {
    throw new AppError('err.projectBroken');
  }
  if (positions.length < 9 || positions.length % 3 || index.length < 3 || index.length % 3) {
    throw new AppError('err.projectBroken');
  }
  const count = positions.length / 3;
  for (let i = 0; i < index.length; i++) {
    if (index[i] >= count) throw new AppError('err.projectBroken');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  if (packed.ink instanceof Uint8Array && packed.ink.length === index.length / 3) geometry.userData = { ink: packed.ink };
  return geometry;
}

export function encodeGeometry(packed) {
  const encoded = { positions: toBase64(packed.positions), index: toBase64(packed.index) };
  if (packed.ink) encoded.ink = toBase64(packed.ink);
  return encoded;
}

export function decodeGeometry(encoded) {
  if (!encoded || typeof encoded.positions !== 'string' || typeof encoded.index !== 'string') {
    throw new AppError('err.projectBroken');
  }
  let positions;
  let index;
  try {
    positions = fromBase64(encoded.positions);
    index = fromBase64(encoded.index);
  } catch {
    throw new AppError('err.projectBroken');
  }
  if (positions.byteLength % 4 || index.byteLength % 4) throw new AppError('err.projectBroken');
  const decoded = { positions: new Float32Array(positions), index: new Uint32Array(index) };
  if (typeof encoded.ink === 'string') {
    try {
      decoded.ink = new Uint8Array(fromBase64(encoded.ink));
    } catch {
      // The model opens without its painted signs.
    }
  }
  return decoded;
}

const round = (n) => Math.round(n * 1e5) / 1e5;

export function stampToData(stamp) {
  return {
    id: stamp.id,
    kind: stamp.kind,
    source: stamp.source,
    label: stamp.label || '',
    fontId: stamp.fontId || '',
    sourceContours: stamp.sourceContours.map((contour) => contour.map(([x, y]) => [round(x), round(y)])),
    fillRule: stamp.fillRule,
    tiltX: stamp.tiltX || 0,
    tiltY: stamp.tiltY || 0,
    mode: stamp.mode,
    height: stamp.height,
    depth: stamp.depth,
    rotation: stamp.rotation,
    offsetU: stamp.offsetU,
    offsetV: stamp.offsetV,
    wrap: Boolean(stamp.wrap),
    point: stamp.point.toArray(),
    normal: stamp.normal.toArray(),
  };
}

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function vector(value) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => Number.isFinite(n))) {
    throw new AppError('err.projectBroken');
  }
  return new THREE.Vector3(value[0], value[1], value[2]);
}

// Returns a stamp without the fitted shape: the caller scales the contours to the height.
export function stampFromData(data) {
  if (!data) throw new AppError('err.projectBroken');
  // A pad is a flat cut that makes a face: its outline is one of a few named shapes, kept in `source`.
  const pad = data.kind === 'pad';
  if (!pad && !Array.isArray(data.sourceContours)) throw new AppError('err.projectBroken');
  const sourceContours = pad
    ? []
    : data.sourceContours
      .filter((contour) => Array.isArray(contour) && contour.length >= 3)
      .map((contour) => contour.map((p) => [finite(p && p[0], 0), finite(p && p[1], 0)]));
  if (!pad && !sourceContours.length) throw new AppError('err.projectBroken');
  const tilt = (value) => Math.min(85, Math.max(-85, finite(value, 0)));
  const normal = vector(data.normal);
  if (normal.lengthSq() < 1e-12) throw new AppError('err.projectBroken');
  return {
    id: Math.max(1, Math.floor(finite(data.id, 1))),
    kind: pad ? 'pad' : data.kind === 'svg' ? 'svg' : 'text',
    source: String(data.source ?? ''),
    label: String(data.label ?? ''),
    fontId: String(data.fontId ?? ''),
    sourceContours,
    fillRule: data.fillRule === 'EvenOdd' && !pad ? 'EvenOdd' : 'NonZero',
    mode: data.mode === 'raise' && !pad ? 'raise' : 'cut',
    height: Math.max(0.05, finite(data.height, 6)),
    depth: Math.max(0.02, finite(data.depth, 0.6)),
    rotation: finite(data.rotation, 0),
    offsetU: finite(data.offsetU, 0),
    offsetV: finite(data.offsetV, 0),
    // Stamps saved before signs could follow the relief get it too: on a flat face nothing
    // changes, and on a rough one the sign stops sinking into the bumps.
    wrap: data.wrap !== false && !pad,
    tiltX: pad ? tilt(data.tiltX) : 0,
    tiltY: pad ? tilt(data.tiltY) : 0,
    point: vector(data.point),
    normal: normal.normalize(),
  };
}
