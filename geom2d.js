// 2D contours for text and SVG. Y grows down in source data; callers flip to Y-up.

import { AppError } from './i18n.js?v=7';

const NUM = '[-+]?(?:\\d*\\.\\d+|\\d+)(?:[eE][-+]?\\d+)?';
const TOKEN = new RegExp(`[MmLlHhVvCcSsQqTtAaZz]|${NUM}`, 'g');

export function identity() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function multiply(a, b) {
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    e: a.a * b.e + a.c * b.f + a.e,
    f: a.b * b.e + a.d * b.f + a.f,
  };
}

export function applyMatrix(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function translate(x, y) {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

function scale(x, y) {
  return { a: x, b: 0, c: 0, d: y, e: 0, f: 0 };
}

export function flipY(contours) {
  return contours.map((c) => c.map(([x, y]) => [x, -y]));
}

export function fitContours(contours, height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const h = maxY - minY;
  const w = maxX - minX;
  if (!(h > 0) || !(w > 0)) {
    throw new AppError('err.emptyArt');
  }
  const s = height / h;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return contours
    .map((contour) => contour.map(([x, y]) => [(x - cx) * s, (y - cy) * s]))
    .map((contour) => cleanContour(contour))
    .filter(Boolean);
}

export function cleanContour(poly) {
  if (!poly) return null;
  const out = [];
  for (const p of poly) {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const prev = out[out.length - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1e-7) continue;
    out.push([p[0], p[1]]);
  }
  if (out.length > 2) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-7) out.pop();
  }
  if (out.length < 3) return null;
  let area = 0;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    const n = out[(i + 1) % out.length];
    area += c[0] * n[1] - n[0] * c[1];
  }
  if (Math.abs(area) < 1e-12) return null;
  if (out.length > 2400) {
    const step = Math.ceil(out.length / 2400);
    const reduced = [];
    for (let i = 0; i < out.length; i += step) reduced.push(out[i]);
    return reduced.length >= 3 ? reduced : null;
  }
  return out;
}

function flattenQuad(out, x0, y0, x1, y1, x2, y2, tol, depth) {
  if (depth > 16) {
    out.push([x2, y2]);
    return;
  }
  const dx = x2 - x0;
  const dy = y2 - y0;
  const len = Math.hypot(dx, dy);
  const dist = len < 1e-9
    ? Math.hypot(x1 - x0, y1 - y0)
    : Math.abs((x1 - x0) * dy - (y1 - y0) * dx) / len;
  if (dist <= tol) {
    out.push([x2, y2]);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  flattenQuad(out, x0, y0, x01, y01, x012, y012, tol, depth + 1);
  flattenQuad(out, x012, y012, x12, y12, x2, y2, tol, depth + 1);
}

function flattenCubic(out, x0, y0, x1, y1, x2, y2, x3, y3, tol, depth) {
  if (depth > 16) {
    out.push([x3, y3]);
    return;
  }
  const dx = x3 - x0;
  const dy = y3 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const d1 = Math.abs((x1 - x0) * dy - (y1 - y0) * dx) / len;
  const d2 = Math.abs((x2 - x0) * dy - (y2 - y0) * dx) / len;
  if (Math.max(d1, d2) <= tol) {
    out.push([x3, y3]);
    return;
  }
  const x01 = (x0 + x1) / 2;
  const y01 = (y0 + y1) / 2;
  const x12 = (x1 + x2) / 2;
  const y12 = (y1 + y2) / 2;
  const x23 = (x2 + x3) / 2;
  const y23 = (y2 + y3) / 2;
  const x012 = (x01 + x12) / 2;
  const y012 = (y01 + y12) / 2;
  const x123 = (x12 + x23) / 2;
  const y123 = (y12 + y23) / 2;
  const x0123 = (x012 + x123) / 2;
  const y0123 = (y012 + y123) / 2;
  flattenCubic(out, x0, y0, x01, y01, x012, y012, x0123, y0123, tol, depth + 1);
  flattenCubic(out, x0123, y0123, x123, y123, x23, y23, x3, y3, tol, depth + 1);
}

function arcPoints(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2) {
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-9) return [];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-9 || ry < 1e-9) return [[x2, y2]];
  let rx2 = rx * rx;
  let ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;
  const lambda = x1p2 / rx2 + y1p2 / ry2;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }
  const sign = large === sweep ? -1 : 1;
  const coef = sign * Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2)));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= Math.PI * 2;
  if (sweep && dtheta < 0) dtheta += Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(dtheta) / (Math.PI / 18)));
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (dtheta * i) / steps;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    pts.push([
      cx + rx * ct * cos - ry * st * sin,
      cy + rx * ct * sin + ry * st * cos,
    ]);
  }
  return pts;
}

function pushContour(contours, contour) {
  const clean = cleanContour(contour);
  if (clean) contours.push(clean);
}

export function contoursFromPathData(d, tolerance = 0.2) {
  const tokens = d.match(TOKEN) || [];
  const contours = [];
  let contour = [];
  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC = null;
  let lastQ = null;

  const take = () => Number(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);

  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i])) cmd = tokens[i++];
    if (!cmd) break;
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;

    if (upper === 'Z') {
      if (contour.length) {
        contour.push([sx, sy]);
        pushContour(contours, contour);
      }
      contour = [];
      cx = sx;
      cy = sy;
      lastC = null;
      lastQ = null;
      continue;
    }

    if (!hasNum()) break;

    if (upper === 'M') {
      if (contour.length) pushContour(contours, contour);
      contour = [];
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      contour.push([cx, cy]);
      lastC = null;
      lastQ = null;
      cmd = rel ? 'l' : 'L';
      continue;
    }

    if (upper === 'L') {
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      contour.push([x, y]);
      cx = x;
      cy = y;
      lastC = null;
      lastQ = null;
      continue;
    }

    if (upper === 'H') {
      const x = (rel ? cx : 0) + take();
      contour.push([x, cy]);
      cx = x;
      lastC = null;
      lastQ = null;
      continue;
    }

    if (upper === 'V') {
      const y = (rel ? cy : 0) + take();
      contour.push([cx, y]);
      cy = y;
      lastC = null;
      lastQ = null;
      continue;
    }

    if (upper === 'C') {
      const x1 = (rel ? cx : 0) + take();
      const y1 = (rel ? cy : 0) + take();
      const x2 = (rel ? cx : 0) + take();
      const y2 = (rel ? cy : 0) + take();
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      flattenCubic(contour, cx, cy, x1, y1, x2, y2, x, y, tolerance, 0);
      lastC = [x2, y2];
      lastQ = null;
      cx = x;
      cy = y;
      continue;
    }

    if (upper === 'S') {
      const x2 = (rel ? cx : 0) + take();
      const y2 = (rel ? cy : 0) + take();
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      const x1 = lastC ? 2 * cx - lastC[0] : cx;
      const y1 = lastC ? 2 * cy - lastC[1] : cy;
      flattenCubic(contour, cx, cy, x1, y1, x2, y2, x, y, tolerance, 0);
      lastC = [x2, y2];
      lastQ = null;
      cx = x;
      cy = y;
      continue;
    }

    if (upper === 'Q') {
      const x1 = (rel ? cx : 0) + take();
      const y1 = (rel ? cy : 0) + take();
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      flattenQuad(contour, cx, cy, x1, y1, x, y, tolerance, 0);
      lastQ = [x1, y1];
      lastC = null;
      cx = x;
      cy = y;
      continue;
    }

    if (upper === 'T') {
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      const x1 = lastQ ? 2 * cx - lastQ[0] : cx;
      const y1 = lastQ ? 2 * cy - lastQ[1] : cy;
      flattenQuad(contour, cx, cy, x1, y1, x, y, tolerance, 0);
      lastQ = [x1, y1];
      lastC = null;
      cx = x;
      cy = y;
      continue;
    }

    if (upper === 'A') {
      const rx = take();
      const ry = take();
      const rot = take();
      const large = take() !== 0;
      const sweep = take() !== 0;
      const x = (rel ? cx : 0) + take();
      const y = (rel ? cy : 0) + take();
      const pts = arcPoints(cx, cy, rx, ry, rot, large, sweep, x, y);
      for (const p of pts) contour.push(p);
      cx = x;
      cy = y;
      lastC = null;
      lastQ = null;
      continue;
    }

    break;
  }

  if (contour.length) pushContour(contours, contour);
  return contours;
}

export function contoursFromOpentypePath(path, tolerance) {
  const contours = [];
  let contour = [];
  let cx = 0;
  let cy = 0;
  for (const cmd of path.commands) {
    if (cmd.type === 'M') {
      if (contour.length) pushContour(contours, contour);
      contour = [[cmd.x, cmd.y]];
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === 'L') {
      contour.push([cmd.x, cmd.y]);
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === 'Q') {
      flattenQuad(contour, cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, tolerance, 0);
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === 'C') {
      flattenCubic(contour, cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, tolerance, 0);
      cx = cmd.x;
      cy = cmd.y;
    } else if (cmd.type === 'Z') {
      pushContour(contours, contour);
      contour = [];
    }
  }
  if (contour.length) pushContour(contours, contour);
  return contours;
}

function parseStyle(text) {
  const out = {};
  if (!text) return out;
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function classMap(doc) {
  const map = new Map();
  for (const style of doc.querySelectorAll('style')) {
    const css = style.textContent || '';
    const re = /([^{}]+)\{([^{}]+)\}/g;
    let match;
    while ((match = re.exec(css))) {
      const body = parseStyle(match[2]);
      for (const raw of match[1].split(',')) {
        const sel = raw.trim();
        if (!sel.startsWith('.')) continue;
        const name = sel.slice(1).split(/[:\s>+~]/)[0];
        if (!name) continue;
        map.set(name, { ...map.get(name), ...body });
      }
    }
  }
  return map;
}

function attrNumber(el, name, fallback = 0) {
  const raw = el.getAttribute(name);
  if (raw == null || raw === '') return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function paintOf(el, inherited, classes) {
  const fromClass = {};
  for (const name of (el.getAttribute('class') || '').split(/\s+/)) {
    if (classes.has(name)) Object.assign(fromClass, classes.get(name));
  }
  const style = parseStyle(el.getAttribute('style'));
  const fill = style.fill ?? el.getAttribute('fill') ?? fromClass.fill ?? inherited.fill;
  const rule = (style['fill-rule'] ?? el.getAttribute('fill-rule') ?? fromClass['fill-rule'] ?? inherited.rule ?? 'nonzero').toLowerCase();
  const display = (style.display ?? el.getAttribute('display') ?? fromClass.display ?? 'inline').toLowerCase();
  const visibility = (style.visibility ?? el.getAttribute('visibility') ?? 'visible').toLowerCase();
  return { fill, rule, display, visibility };
}

function elementMatrix(el) {
  const base = el.transform && el.transform.baseVal;
  if (!base || !base.numberOfItems) return null;
  const consolidated = base.consolidate();
  if (!consolidated) return null;
  const m = consolidated.matrix;
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

function mapPoints(matrix, points) {
  return points.map(([x, y]) => applyMatrix(matrix, x, y));
}

function ellipsePoints(cx, cy, rx, ry) {
  const n = Math.max(16, Math.ceil((Math.PI * (rx + ry)) / Math.max((rx + ry) * 0.08, 0.5)));
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
}

function shapeContours(el, matrix) {
  const tag = el.localName;
  if (tag === 'path') {
    const d = el.getAttribute('d');
    if (!d) return [];
    const nums = d.match(new RegExp(NUM, 'g')) || ['0'];
    let max = 0;
    for (const n of nums) max = Math.max(max, Math.abs(Number(n)));
    const tol = Math.max(max * 0.0015, 1e-4);
    return contoursFromPathData(d, tol).map((c) => mapPoints(matrix, c));
  }
  if (tag === 'polygon') {
    const pts = parsePointList(el.getAttribute('points') || '');
    return pts.length ? [mapPoints(matrix, pts)] : [];
  }
  if (tag === 'rect') {
    const x = attrNumber(el, 'x');
    const y = attrNumber(el, 'y');
    const w = attrNumber(el, 'width');
    const h = attrNumber(el, 'height');
    if (w <= 0 || h <= 0) return [];
    const rx = Math.min(attrNumber(el, 'rx', attrNumber(el, 'ry')), w / 2);
    const ry = Math.min(attrNumber(el, 'ry', attrNumber(el, 'rx')), h / 2);
    let pts;
    if (rx > 1e-6 && ry > 1e-6) {
      pts = roundedRect(x, y, w, h, rx, ry);
    } else {
      pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    }
    return [mapPoints(matrix, pts)];
  }
  if (tag === 'circle') {
    const r = attrNumber(el, 'r');
    if (r <= 0) return [];
    return [mapPoints(matrix, ellipsePoints(attrNumber(el, 'cx'), attrNumber(el, 'cy'), r, r))];
  }
  if (tag === 'ellipse') {
    const rx = attrNumber(el, 'rx');
    const ry = attrNumber(el, 'ry');
    if (rx <= 0 || ry <= 0) return [];
    return [mapPoints(matrix, ellipsePoints(attrNumber(el, 'cx'), attrNumber(el, 'cy'), rx, ry))];
  }
  return [];
}

function parsePointList(text) {
  const nums = text.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function roundedRect(x, y, w, h, rx, ry) {
  const pts = [];
  const corner = (cx, cy, a0, a1) => {
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
  };
  corner(x + w - rx, y + ry, -Math.PI / 2, 0);
  corner(x + w - rx, y + h - ry, 0, Math.PI / 2);
  corner(x + rx, y + h - ry, Math.PI / 2, Math.PI);
  corner(x + rx, y + ry, Math.PI, Math.PI * 1.5);
  return pts;
}

function hrefOf(el) {
  return el.getAttribute('href')
    || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    || el.getAttribute('xlink:href');
}

export function artworkFromSvg(svgText) {
  if (typeof DOMParser === 'undefined') {
    throw new AppError('err.svgParse');
  }
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new AppError('err.svgParse');
  }
  const root = doc.querySelector('svg');
  if (!root) throw new AppError('err.svgNoRoot');
  const classes = classMap(doc);
  const contours = [];
  let evenOdd = false;

  const walk = (el, matrix, inherited, depth, stack) => {
    if (!el || depth > 24 || stack.has(el)) return;
    const tag = el.localName;
    if (!tag || tag === 'defs' || tag === 'clippath' || tag === 'mask' || tag === 'style' || tag === 'title' || tag === 'desc' || tag === 'metadata' || tag === 'filter' || tag === 'lineargradient' || tag === 'radialgradient') {
      return;
    }
    const paint = paintOf(el, inherited, classes);
    if (paint.display === 'none' || paint.visibility === 'hidden') return;

    let next = matrix;
    const local = elementMatrix(el);
    if (local) next = multiply(next, local);

    if (tag === 'svg' && el !== root) {
      const vb = (el.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      const w = attrNumber(el, 'width', 0);
      const h = attrNumber(el, 'height', 0);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) {
        next = multiply(next, translate(attrNumber(el, 'x'), attrNumber(el, 'y')));
        next = multiply(next, scale(w / vb[2], h / vb[3]));
        next = multiply(next, translate(-vb[0], -vb[1]));
      }
    }

    if (tag === 'use') {
      const href = hrefOf(el);
      if (href && href.startsWith('#')) {
        const ref = doc.getElementById(href.slice(1));
        if (ref) {
          const shifted = multiply(next, translate(attrNumber(el, 'x'), attrNumber(el, 'y')));
          stack.add(el);
          walk(ref, shifted, paint, depth + 1, stack);
          stack.delete(el);
        }
      }
      return;
    }

    const filled = paint.fill && paint.fill !== 'none' && paint.fill !== 'transparent';
    if (filled && (tag === 'path' || tag === 'polygon' || tag === 'rect' || tag === 'circle' || tag === 'ellipse')) {
      if (paint.rule === 'evenodd') evenOdd = true;
      for (const contour of shapeContours(el, next)) {
        const clean = cleanContour(contour);
        if (clean) contours.push(clean);
      }
    }

    for (const child of el.children) {
      walk(child, next, paint, depth + 1, stack);
    }
  };

  walk(root, identity(), { fill: '#000', rule: 'nonzero' }, 0, new Set());
  if (!contours.length) {
    throw new AppError('err.svgNoFill');
  }
  return {
    contours: flipY(contours),
    fillRule: evenOdd ? 'EvenOdd' : 'NonZero',
  };
}
