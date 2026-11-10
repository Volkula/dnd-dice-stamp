// Dice tray: throws copies of the current die with rigid-body physics.
// Lengths are centimetres, so a 16 mm die is 1.6 units and gravity is 981.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from './i18n.js?v=6';

const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
const STEP = 1 / 240;
const MAX_STEPS_PER_FRAME = 12;
const GRAVITY = 981;
const TIMEOUT = 6;
// Seconds of free tumbling before the dice are braked harder.
const CALM_AFTER = 2.5;
// Dice count as stopped when all of them stay under these speeds (cm/s, rad/s) for this long (s).
const QUIET_SPEED = 2;
const QUIET_SPIN = 0.6;
const QUIET_TIME = 0.35;
// A top face must look up at least this close to how squarely the bottom one looks down.
const EDGE_MARGIN = 0.0015;
// How much more squarely a blank face may look up than the sign that is read.
const TILT = 0.12;
const TRAY = { width: 30, depth: 20, wall: 4, thick: 1.2, sky: 70 };
const VIEW_DIRECTION = new THREE.Vector3(0, -34, 32).normalize();
const SETTINGS_KEY = 'dice.roll';
const LIMITS = {
  count: [1, 12, 2],
  size: [8, 40, 16],
  weight: [1, 60, 5],
};

let rapierLoading = null;

function loadRapier() {
  if (!rapierLoading) {
    rapierLoading = import(RAPIER_URL)
      .then(async (module) => {
        const rapier = module.default || module;
        await rapier.init();
        return rapier;
      })
      .catch((error) => {
        rapierLoading = null;
        throw error;
      });
  }
  return rapierLoading;
}

function clampSetting(name, value) {
  const [min, max, fallback] = LIMITS[name];
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function readSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    saved = {};
  }
  return {
    count: Math.round(clampSetting('count', saved.count)),
    size: clampSetting('size', saved.size),
    weight: clampSetting('weight', saved.weight),
  };
}

// A convex hull only needs the outermost vertices; a dense STL has far more than the solver wants.
function hullPoints(positions) {
  const total = positions.length / 3;
  if (total <= 1200) return new Float32Array(positions);
  const stride = Math.max(1, Math.floor(total / 200000));
  const directions = 256;
  const picked = new Set();
  for (let i = 0; i < directions; i++) {
    const z = 1 - (2 * (i + 0.5)) / directions;
    const r = Math.sqrt(1 - z * z);
    const angle = i * 2.399963229728653;
    const dx = r * Math.cos(angle);
    const dy = r * Math.sin(angle);
    let best = -Infinity;
    let bestIndex = 0;
    for (let v = 0; v < total; v += stride) {
      const dot = positions[v * 3] * dx + positions[v * 3 + 1] * dy + positions[v * 3 + 2] * z;
      if (dot > best) {
        best = dot;
        bestIndex = v;
      }
    }
    picked.add(bestIndex);
  }
  const out = new Float32Array(picked.size * 3);
  let o = 0;
  for (const v of picked) {
    out[o++] = positions[v * 3];
    out[o++] = positions[v * 3 + 1];
    out[o++] = positions[v * 3 + 2];
  }
  return out;
}

// Directions of the die's flat faces: normals that carry a real share of the surface.
// A dense sculpted mesh has no faces in this sense and gets an empty list.
function flatNormals(geometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangles = (index ? index.count : position.count) / 3;
  if (triangles > 20000) return [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const sums = new Map();
  let total = 0;
  for (let i = 0; i < triangles; i++) {
    a.fromBufferAttribute(position, index ? index.getX(i * 3) : i * 3);
    b.fromBufferAttribute(position, index ? index.getX(i * 3 + 1) : i * 3 + 1);
    c.fromBufferAttribute(position, index ? index.getX(i * 3 + 2) : i * 3 + 2);
    b.sub(a);
    c.sub(a);
    b.cross(c);
    const area = b.length() / 2;
    if (!(area > 0)) continue;
    b.normalize();
    total += area;
    const id = `${Math.round(b.x * 50)},${Math.round(b.y * 50)},${Math.round(b.z * 50)}`;
    const entry = sums.get(id);
    if (entry) entry.area += area;
    else sums.set(id, { area, normal: b.clone() });
  }
  const out = [];
  for (const entry of sums.values()) {
    if (entry.area >= total * 0.004) out.push(entry.normal);
  }
  return out;
}

function numberOf(label) {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\.?\s*$/.exec(label);
  return match ? Number(match[1].replace(',', '.')) : null;
}

export function createRoller() {
  const $ = (id) => document.getElementById(id);
  const ui = {
    root: $('roll'),
    stage: $('roll-stage'),
    result: $('roll-result'),
    close: $('roll-close'),
    again: $('roll-throw'),
    count: $('roll-count'),
    size: $('roll-size'),
    weight: $('roll-weight'),
    countOut: $('roll-count-out'),
    sizeOut: $('roll-size-out'),
    weightOut: $('roll-weight-out'),
  };

  const settings = readSettings();
  let view = null;
  let rapier = null;
  let world = null;
  let dice = [];
  let base = null;
  let baseSize = 1;
  let scaled = null;
  let material = null;
  let marks = [];
  let flats = [];
  let frame = 0;
  let last = 0;
  let carry = 0;
  let elapsed = 0;
  let quiet = 0;
  let calmed = false;
  // True once every die is asleep: the physics stops stepping until the next throw.
  let resting = true;
  // 'idle' | 'loading' | 'rolling' | 'done' | 'failed'
  let phase = 'idle';
  let labels = [];
  let opened = false;

  function sceneColor() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--scene').trim();
    return new THREE.Color(value || '#2a241c');
  }

  function buildView() {
    const scene = new THREE.Scene();
    scene.background = sceneColor();
    scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a3026, 1.1));
    const sun = new THREE.DirectionalLight(0xfff8ee, 1.6);
    sun.position.set(-14, -18, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const reach = TRAY.width * 0.8;
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 120 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const felt = new THREE.MeshStandardMaterial({ color: 0x2f5d4a, roughness: 0.95 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.7 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(TRAY.width, TRAY.depth, 0.6), felt);
    floor.position.z = -0.3;
    floor.receiveShadow = true;
    scene.add(floor);
    const outerW = TRAY.width + TRAY.thick * 2;
    const wallZ = (TRAY.wall - 0.6) / 2;
    const wallH = TRAY.wall + 0.6;
    const sides = [
      [outerW, TRAY.thick, 0, (TRAY.depth + TRAY.thick) / 2],
      [outerW, TRAY.thick, 0, -(TRAY.depth + TRAY.thick) / 2],
      [TRAY.thick, TRAY.depth, (TRAY.width + TRAY.thick) / 2, 0],
      [TRAY.thick, TRAY.depth, -(TRAY.width + TRAY.thick) / 2, 0],
    ];
    for (const [sx, sy, x, y] of sides) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, wallH), wood);
      wall.position.set(x, y, wallZ);
      wall.receiveShadow = true;
      wall.castShadow = true;
      scene.add(wall);
    }

    const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    ui.stage.prepend(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 1);
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 6;
    controls.maxDistance = 300;
    // Once the user turns the camera, resizing the window no longer re-frames the tray.
    controls.addEventListener('start', () => {
      view.moved = true;
    });

    const corners = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-0.6, TRAY.wall]) {
          corners.push(new THREE.Vector3(x * (TRAY.width / 2 + TRAY.thick), y * (TRAY.depth / 2 + TRAY.thick), z));
        }
      }
    }
    const probe = new THREE.Vector3();
    const fitsAt = (distance) => {
      camera.position.copy(controls.target).addScaledVector(VIEW_DIRECTION, distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      return corners.every((corner) => {
        probe.copy(corner).project(camera);
        return Math.abs(probe.x) <= 0.94 && Math.abs(probe.y) <= 0.94 && probe.z < 1;
      });
    };

    // Backs the camera off until the whole tray is in view, whatever the shape of the window.
    const frame = () => {
      let near = controls.minDistance;
      let far = controls.maxDistance;
      for (let i = 0; i < 20; i++) {
        const middle = (near + far) / 2;
        if (fitsAt(middle)) far = middle;
        else near = middle;
      }
      fitsAt(far);
      controls.update();
    };

    const resize = () => {
      const width = ui.stage.clientWidth;
      const height = ui.stage.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      if (!view.moved) frame();
    };
    view = { scene, camera, renderer, controls, resize, frame, moved: false };
    new ResizeObserver(resize).observe(ui.stage);
  }

  function showOutputs() {
    ui.countOut.textContent = String(settings.count);
    ui.sizeOut.textContent = t('roll.mm', { n: settings.size });
    ui.weightOut.textContent = t('roll.g', { n: settings.weight });
  }

  function showResult() {
    ui.result.replaceChildren();
    const line = (text) => {
      const p = document.createElement('p');
      p.textContent = text;
      ui.result.append(p);
    };
    const waiting = { loading: 'roll.loading', failed: 'roll.failed', rolling: 'roll.rolling' }[phase];
    if (waiting) {
      line(t(waiting));
      return;
    }
    if (phase !== 'done') return;
    if (!marks.length) {
      line(t('roll.noMarks'));
      return;
    }
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const label of labels) {
      const chip = document.createElement('span');
      chip.className = label == null ? 'chip is-unknown' : 'chip';
      chip.textContent = label == null ? '?' : label;
      chips.append(chip);
    }
    ui.result.append(chips);
    const numbers = labels.map((label) => (label == null ? null : numberOf(label)));
    if (labels.length > 1 && numbers.every((n) => n != null)) {
      line(t('roll.sum', { n: numbers.reduce((a, b) => a + b, 0) }));
    } else if (labels.some((label) => label == null)) {
      line(t('roll.unknown'));
    }
  }

  function clearWorld() {
    for (const die of dice) view.scene.remove(die.mesh);
    dice = [];
    if (world) {
      world.free();
      world = null;
    }
    if (scaled) {
      scaled.dispose();
      scaled = null;
    }
  }

  function addBox(hx, hy, hz, x, y, z) {
    world.createCollider(
      rapier.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRestitution(0.25).setFriction(0.6),
    );
  }

  function buildTray() {
    const { width, depth, sky } = TRAY;
    const hw = width / 2;
    const hd = depth / 2;
    addBox(hw + 2, hd + 2, 1, 0, 0, -1);
    addBox(hw + 2, hd + 2, 1, 0, 0, sky + 1);
    addBox(1, hd + 2, sky / 2, hw + 1, 0, sky / 2);
    addBox(1, hd + 2, sky / 2, -hw - 1, 0, sky / 2);
    addBox(hw + 2, 1, sky / 2, 0, hd + 1, sky / 2);
    addBox(hw + 2, 1, sky / 2, 0, -hd - 1, sky / 2);
  }

  function throwDice() {
    if (!rapier || !base || !opened) return;
    clearWorld();
    world = new rapier.World({ x: 0, y: 0, z: -GRAVITY });
    world.timestep = STEP;
    buildTray();

    const edge = settings.size / 10;
    const k = edge / baseSize;
    scaled = base.clone().scale(k, k, k);
    const points = hullPoints(scaled.getAttribute('position').array);
    scaled.computeBoundingSphere();
    const radius = scaled.boundingSphere.radius;

    // The slider cannot change how gravity pulls, so weight shows as a slower, deader throw.
    const heft = (settings.weight - LIMITS.weight[0]) / (LIMITS.weight[1] - LIMITS.weight[0]);
    const speed = 1.25 - 0.7 * heft;
    const bounce = 0.5 - 0.32 * heft;
    const gap = Math.max(edge * 1.6, radius * 2.2);
    // As many dice side by side as fit between the walls; the rest start in layers above.
    const room = TRAY.depth - radius * 2 - 1;
    const columns = Math.max(1, Math.min(settings.count, 3, Math.floor(room / gap) + 1));
    const rand = (min, max) => min + Math.random() * (max - min);

    for (let i = 0; i < settings.count; i++) {
      const column = i % columns;
      const layer = Math.floor(i / columns);
      const x = -TRAY.width / 2 + radius + 1.5 + rand(0, 1);
      const y = (column - (columns - 1) / 2) * gap + rand(-0.3, 0.3);
      const z = 7 + radius + layer * gap;
      const turn = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2)),
      );
      const spin = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(14, 30) * speed);
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(x, y, z)
          .setRotation({ x: turn.x, y: turn.y, z: turn.z, w: turn.w })
          .setLinvel(rand(65, 135) * speed, rand(-45, 45) * speed, rand(-20, 20))
          .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
          .setLinearDamping(0.1)
          .setAngularDamping(0.15)
          .setCcdEnabled(true),
      );
      const shape = rapier.ColliderDesc.convexHull(points) || rapier.ColliderDesc.ball(radius);
      world.createCollider(shape.setMass(settings.weight).setRestitution(bounce).setFriction(0.4), body);
      const mesh = new THREE.Mesh(scaled, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      view.scene.add(mesh);
      dice.push({ body, mesh });
    }

    carry = 0;
    elapsed = 0;
    quiet = 0;
    calmed = false;
    resting = false;
    labels = [];
    phase = 'rolling';
    syncMeshes();
    showResult();
  }

  function syncMeshes() {
    for (const { body, mesh } of dice) {
      const p = body.translation();
      const r = body.rotation();
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  const up = new THREE.Vector3();
  const turnBack = new THREE.Quaternion();

  function faceUp(die) {
    const r = die.body.rotation();
    up.set(0, 0, 1).applyQuaternion(turnBack.set(r.x, r.y, r.z, r.w).invert());
    let top = null;
    let topDot = -Infinity;
    let bottom = null;
    let bottomDot = Infinity;
    for (const mark of marks) {
      const dot = mark.normal.dot(up);
      if (dot > topDot) {
        topDot = dot;
        top = mark;
      }
      if (dot < bottomDot) {
        bottomDot = dot;
        bottom = mark;
      }
    }
    if (!top) return null;
    // How squarely the die's own flat faces look up and down. A sculpted mesh has none: its signs decide.
    let flatTop = flats.length ? -Infinity : topDot;
    let flatBottom = -Infinity;
    for (const normal of flats) {
      const dot = normal.dot(up);
      if (dot > flatTop) flatTop = dot;
      if (-dot > flatBottom) flatBottom = -dot;
    }
    if (topDot >= -bottomDot - EDGE_MARGIN) {
      // A sign looks up at least as squarely as any looks down, so the die is read from the top.
      // Below 0.6 it leans on an edge and no sign is "up". A blank face that looks up much more
      // squarely than the sign means the die shows nothing; a little more is fine: a goblet or
      // a cauldron lies tilted, and the number on its belly is still the one on top.
      if (topDot <= 0.6 || topDot < flatTop - TILT) return null;
      // Two different faces equally close to the top: the die sits on an edge between them.
      for (const mark of marks) {
        if (mark.label !== top.label && mark.normal.dot(up) > topDot - 0.02 && mark.normal.dot(top.normal) < 0.999) return null;
      }
      return top.label;
    }
    // A d4 or a die with an odd number of faces shows an edge or a corner: it is read by the face
    // it lies on. That holds only when no face at all looks straight up.
    if (flatTop >= flatBottom - EDGE_MARGIN) return null;
    return -bottomDot >= flatBottom - 0.01 && -bottomDot > 0.9 ? bottom.label : null;
  }

  function quietNow() {
    for (const { body } of dice) {
      const v = body.linvel();
      const w = body.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > QUIET_SPEED * QUIET_SPEED) return false;
      if (w.x * w.x + w.y * w.y + w.z * w.z > QUIET_SPIN * QUIET_SPIN) return false;
    }
    return true;
  }

  // Returns true when the reading differs from the one on screen.
  function readFaces() {
    const next = dice.map(faceUp);
    const changed = next.length !== labels.length || next.some((label, i) => label !== labels[i]);
    labels = next;
    return changed;
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (world && !resting) {
      carry += dt;
      elapsed += dt;
      let steps = 0;
      while (carry >= STEP && steps < MAX_STEPS_PER_FRAME) {
        world.step();
        carry -= STEP;
        steps += 1;
      }
      if (steps === MAX_STEPS_PER_FRAME) carry = 0;
      syncMeshes();
      // Round dice (a coin on its rim, a cylinder) would roll about the tray for a long time:
      // nothing in the model stands for rolling resistance, so the damping grows instead.
      if (elapsed > CALM_AFTER && !calmed) {
        calmed = true;
        for (const die of dice) {
          die.body.setLinearDamping(1.2);
          die.body.setAngularDamping(2.5);
        }
      }
      quiet = quietNow() ? quiet + dt : 0;
      // The engine puts bodies to sleep about two seconds after they stop; the reading need not wait for that.
      const asleep = elapsed > TIMEOUT || dice.every((die) => die.body.isSleeping());
      if (phase === 'rolling') {
        if (asleep || quiet >= QUIET_TIME) {
          readFaces();
          phase = 'done';
          showResult();
        }
      } else if (readFaces()) {
        // A die that was balancing on an edge tipped over after the first reading.
        showResult();
      }
      if (asleep) resting = true;
    }
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
  }

  async function open({ geometry, color, flat, marks: faceMarks }) {
    if (!view) buildView();
    opened = true;
    ui.root.hidden = false;
    view.scene.background = sceneColor();
    view.moved = false;
    view.resize();

    if (base) base.dispose();
    base = geometry.clone();
    base.computeBoundingBox();
    const center = base.boundingBox.getCenter(new THREE.Vector3());
    const size = base.boundingBox.getSize(new THREE.Vector3());
    base.translate(-center.x, -center.y, -center.z);
    baseSize = Math.max(size.x, size.y, size.z) || 1;
    flats = flatNormals(base);
    if (material) material.dispose();
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04, flatShading: flat });
    marks = faceMarks.map((mark) => ({ label: mark.label, normal: new THREE.Vector3().fromArray(mark.normal).normalize() }));

    showOutputs();
    last = performance.now();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
    ui.again.focus();

    if (!rapier) {
      phase = 'loading';
      showResult();
      try {
        rapier = await loadRapier();
      } catch {
        phase = 'failed';
        showResult();
        return;
      }
    }
    throwDice();
  }

  function close() {
    if (!opened) return;
    opened = false;
    cancelAnimationFrame(frame);
    clearWorld();
    phase = 'idle';
    ui.root.hidden = true;
  }

  function bindSlider(input, name) {
    input.min = String(LIMITS[name][0]);
    input.max = String(LIMITS[name][1]);
    input.value = String(settings[name]);
    input.addEventListener('input', () => {
      settings[name] = name === 'count' ? Math.round(clampSetting(name, input.value)) : clampSetting(name, input.value);
      showOutputs();
    });
    // Re-throw once the slider is released, not on every pixel of travel.
    input.addEventListener('change', () => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // Settings then last for this visit only.
      }
      throwDice();
    });
  }

  bindSlider(ui.count, 'count');
  bindSlider(ui.size, 'size');
  bindSlider(ui.weight, 'weight');
  showOutputs();
  ui.again.addEventListener('click', throwDice);
  ui.close.addEventListener('click', close);
  ui.root.addEventListener('pointerdown', (event) => {
    if (event.target === ui.root) close();
  });

  return {
    open,
    close,
    isOpen: () => opened,
    // Called when the language or the theme changes.
    refresh() {
      showOutputs();
      showResult();
      if (view) view.scene.background = sceneColor();
    },
  };
}
