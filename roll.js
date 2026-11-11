// Dice tray: throws copies of the current die with rigid-body physics, across the tray,
// through a dice tower that stands next to it, or one die at a time by hand.
// Lengths are centimetres, so a 16 mm die is 1.6 units and gravity is 981.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { t } from './i18n.js?v=11';
import { MATERIALS, materialById, gramsOf, massProps, principalAxes } from './balance.js?v=11';

const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/rapier.es.js';
const STEP = 1 / 240;
// Steps of physics in one frame at the usual speed. A faster throw is allowed as many times more.
const MAX_STEPS_PER_FRAME = 12;
// How stiff a contact is. The engine's own 30 Hz is tuned for metres: under a gravity of 981 a
// die at rest sinks a quarter of a millimetre into the felt, and that is as much as parts two
// faces a few degrees apart, so such a die would stop between them.
const CONTACT_HZ = 180;
const GRAVITY = 981;
// Seconds after which a throw is read whatever the dice are doing, and seconds of free tumbling
// before the dice are braked harder. The way down a tower takes longer than a throw across the tray.
const TIMEOUT = { tray: 6, tower: 16, hand: 8 };
const CALM_AFTER = { tray: 2.5, tower: 7, hand: 3 };
// Dice count as stopped when all of them stay under these speeds (cm/s, rad/s) for this long (s).
const QUIET_SPEED = 2;
const QUIET_SPIN = 0.6;
const QUIET_TIME = 0.35;
// A top face must look up at least this close to how squarely the bottom one looks down.
const EDGE_MARGIN = 0.0015;
// How much more squarely a blank face may look up than the sign that is read.
const TILT = 0.12;
// Two different signs this close to looking up equally mean the die leans on an edge between them.
// A die whose faces are closer to each other than that gets a tighter measure: see tieOf.
const TIE = 0.02;
const TRAY = { width: 30, depth: 20, wall: 4, thick: 1.2, sky: 90 };
// The dice tower: the slope of its two baffles and of the chute, the thickness of their boards,
// and the seconds between two dice dropped into it.
const TOWER = { slope: 0.6, chute: 0.5, board: 0.5, pause: 0.22 };
// A die held by hand: how hard it is pulled to the pointer, its top speed, cm/s,
// and how high over the tray walls it is carried.
// A die caught between two faces: how fast it is turned towards the nearer one (rad/s), how
// many times in a throw, and the seconds it gets to lie down after that.
const NUDGE = { spin: 1.6, most: 3, time: 1.5 };
const HAND = { pull: 14, fastest: 260, lift: 2.5 };
// Two presses on one die this close together, in milliseconds and in pixels, throw it anew.
const DOUBLE_PRESS = 400;
const DOUBLE_REACH = 14;
// The paint in the signs when none was chosen: dark on a light die, light on a dark one.
const INK = { dark: '#1d1612', light: '#f6ecd2' };
const VIEW_DIRECTION = new THREE.Vector3(0, -34, 32).normalize();
const SETTINGS_KEY = 'dice.roll';
const LIMITS = {
  count: [1, 12, 2],
  size: [8, 40, 16],
  weight: [1, 60, 5],
  // How fast the throw is played: under 1 is slow motion, over 1 is a hurry.
  speed: [0.25, 3, 1],
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
    speed: Math.round(clampSetting('speed', saved.speed) * 4) / 4,
    // 'manual' takes the weight from the slider; a material counts it from the die's volume.
    material: saved.material === 'manual' || materialById(saved.material) ? saved.material : 'resin',
    // The signs of the dice are painted. The paint is a colour only: it weighs nothing.
    ink: saved.ink !== false,
    inkColor: /^#[0-9a-f]{6}$/i.test(saved.inkColor || '') ? saved.inkColor : null,
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

// Where everything in the tower is, for dice whose bounding ball has the given radius.
// The tower stands outside the left wall of the tray; its chute comes out over that wall.
// How close to equally up two different signs must look to call the die undecided: half of what
// parts the two nearest faces. On a die with two bands of facets the band that lies flat shows
// its facet only a few degrees more squarely than the nearest facet of the other band.
function tieOf(marks) {
  let nearest = -1;
  for (let i = 0; i < marks.length; i++) {
    for (let j = i + 1; j < marks.length; j++) {
      if (marks[i].label === marks[j].label) continue;
      const dot = marks[i].normal.dot(marks[j].normal);
      if (dot < 0.999 && dot > nearest) nearest = dot;
    }
  }
  return Math.min(TIE, (1 - nearest) / 2);
}

function towerLayout(radius) {
  // The room a die needs to pass a baffle.
  const gap = Math.max(4.2, radius * 2 + 1.4);
  const reach = gap * 1.3;
  const depth = Math.max(8, gap * 2);
  const front = -TRAY.width / 2 - TRAY.thick;
  const back = front - gap - reach;
  const mouth = -TRAY.width / 2 + 1.5;
  const lip = TRAY.wall + 0.6;
  const chuteAt = (x) => lip + (mouth - x) * TOWER.chute;
  const opening = chuteAt(front) + gap + 0.5;
  const lowB = Math.max(chuteAt(front - reach) + gap + 0.5, opening + 0.3 - reach * TOWER.slope);
  const highB = lowB + reach * TOWER.slope;
  const lowA = highB - gap * TOWER.slope + gap + 0.5;
  const highA = lowA + reach * TOWER.slope;
  return {
    gap,
    reach,
    depth,
    front,
    back,
    opening,
    top: highA + gap * 0.5 + 1,
    // The surface of each board as [x, z] at its free end and at the wall it hangs on:
    // a baffle from the back wall, one from the front wall, and the chute.
    ramps: [
      [[back + reach, lowA], [back, highA]],
      [[front - reach, lowB], [front, highB]],
      [[mouth, lip], [back, chuteAt(back)]],
    ],
  };
}

// A board of the tower as a box: its centre, size and turn about the y axis.
function boardBox([free, hung], depth) {
  const dx = hung[0] - free[0];
  const dz = hung[1] - free[1];
  const run = Math.hypot(dx, dz);
  const ux = dx / run;
  const uz = dz / run;
  // The board goes a little way into the wall it hangs on, and lies under its surface line.
  const length = run + 0.6;
  const down = ux > 0 ? [uz, -ux] : [-uz, ux];
  const angle = Math.atan2(-uz, ux);
  return {
    x: (free[0] + hung[0]) / 2 + ux * 0.3 + (down[0] * TOWER.board) / 2,
    z: (free[1] + hung[1]) / 2 + uz * 0.3 + (down[1] * TOWER.board) / 2,
    size: [length, depth, TOWER.board],
    turn: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) },
  };
}

// The walls of the tower as boxes [x0, x1, y0, y1, z0, z1]. The front one starts over the opening.
function towerWalls(layout) {
  const side = layout.depth / 2;
  const t = TRAY.thick;
  return [
    [layout.back - t, layout.back, -side - t, side + t, 0, layout.top],
    [layout.back, layout.front + t, side, side + t, 0, layout.top],
    [layout.back, layout.front + t, -side - t, -side, 0, layout.top],
    [layout.front, layout.front + t, -side, side, layout.opening, layout.top],
  ];
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
    tower: $('roll-tower'),
    count: $('roll-count'),
    size: $('roll-size'),
    weight: $('roll-weight'),
    speed: $('roll-speed'),
    countOut: $('roll-count-out'),
    sizeOut: $('roll-size-out'),
    weightOut: $('roll-weight-out'),
    speedOut: $('roll-speed-out'),
    material: $('roll-material'),
    ink: $('roll-ink'),
    inkColor: $('roll-ink-color'),
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
  // The same die lit up under the pointer, and the paint in its signs.
  let hotMaterial = null;
  let inkMaterial = null;
  let bodyColor = '#d7c4a3';
  // True when the model says which of its triangles are signs.
  let inked = false;
  // Volume, centre of mass and inertia of the model as it came, in its own units. Null for a mesh with no inside.
  let props = null;
  // The die under the pointer or the one whose result is: its place in `dice`, or -1.
  let hot = -1;
  // The last press on a die: { die, at, x, y }.
  let pressed = null;
  let marks = [];
  let flats = [];
  let tie = TIE;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let elapsed = 0;
  let quiet = 0;
  let calmed = false;
  // How the dice were last set going: 'tray', 'tower' or 'hand'.
  let way = 'tray';
  // The tower as it stands now, sized for the dice of the last throw.
  let tower = towerLayout(1);
  // The die carried by the pointer: { die, target, trail }.
  let held = null;
  let dieRadius = 1;
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
    sun.shadow.mapSize.set(2048, 2048);
    // Wide enough on the left for the tower as well.
    const reach = TRAY.width * 0.8;
    Object.assign(sun.shadow.camera, { left: -reach * 2, right: reach, top: reach * 1.3, bottom: -reach * 1.3, near: 1, far: 160 });
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

    const towerGroup = new THREE.Group();
    scene.add(towerGroup);
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd6e2, roughness: 0.2, transparent: true, opacity: 0.16, depthWrite: false });
    const rim = new THREE.LineBasicMaterial({ color: 0x6b4a2c });

    // The corners of the tray and of the tower: all of them must be in view.
    const corners = () => {
      const out = [];
      const far = TRAY.depth / 2 + TRAY.thick;
      for (const y of [-far, far]) {
        out.push(new THREE.Vector3(TRAY.width / 2 + TRAY.thick, y, -0.6), new THREE.Vector3(TRAY.width / 2 + TRAY.thick, y, TRAY.wall));
        out.push(new THREE.Vector3(-TRAY.width / 2 - TRAY.thick, y, -0.6));
      }
      const side = tower.depth / 2 + TRAY.thick;
      for (const y of [-side, side]) {
        out.push(new THREE.Vector3(tower.back - TRAY.thick, y, 0), new THREE.Vector3(tower.back - TRAY.thick, y, tower.top));
        out.push(new THREE.Vector3(tower.front + TRAY.thick, y, tower.top));
      }
      return out;
    };
    const probe = new THREE.Vector3();
    const fitsAt = (distance, points) => {
      camera.position.copy(controls.target).addScaledVector(VIEW_DIRECTION, distance);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
      return points.every((corner) => {
        probe.copy(corner).project(camera);
        return Math.abs(probe.x) <= 0.94 && Math.abs(probe.y) <= 0.94 && probe.z < 1;
      });
    };

    // Backs the camera off until the tray and the tower are in view, whatever the shape of the window.
    const frame = () => {
      const points = corners();
      controls.target.set((tower.back - TRAY.thick + TRAY.width / 2 + TRAY.thick) / 2, 0, Math.min(6, tower.top / 4));
      let near = controls.minDistance;
      let far = controls.maxDistance;
      for (let i = 0; i < 20; i++) {
        const middle = (near + far) / 2;
        if (fitsAt(middle, points)) far = middle;
        else near = middle;
      }
      fitsAt(far, points);
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
    view = { scene, camera, renderer, controls, resize, frame, moved: false, towerGroup, glass, rim, wood };
    new ResizeObserver(resize).observe(ui.stage);
  }

  // Grams of one die: counted from its volume at the chosen size and the material, or the slider's.
  function weightNow() {
    const made = materialById(settings.material);
    if (!made || !props) return settings.weight;
    const side = settings.size / baseSize;
    return Math.max(0.05, gramsOf(props.volume * side * side * side, made.density));
  }

  function showOutputs() {
    const grams = weightNow();
    // A weight counted from the material is shown on the slider but cannot be dragged.
    const counted = Boolean(props && materialById(settings.material));
    ui.countOut.textContent = String(settings.count);
    ui.sizeOut.textContent = t('roll.mm', { n: settings.size });
    ui.weightOut.textContent = t('roll.g', { n: counted ? Number(grams.toFixed(grams < 10 ? 1 : 0)) : settings.weight });
    ui.speedOut.textContent = `×${settings.speed}`;
    ui.weight.disabled = counted;
    ui.weight.value = String(counted ? clampSetting('weight', grams) : settings.weight);
  }

  function showMaterials() {
    ui.material.replaceChildren();
    const add = (value, text) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      ui.material.append(option);
    };
    add('manual', t('roll.manual'));
    for (const made of MATERIALS) add(made.id, t(made.key));
    ui.material.value = settings.material;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Settings then last for this visit only.
    }
  }

  function inkColorNow() {
    if (settings.inkColor) return settings.inkColor;
    const tone = new THREE.Color(bodyColor);
    return 0.2126 * tone.r + 0.7152 * tone.g + 0.0722 * tone.b > 0.2 ? INK.dark : INK.light;
  }

  // What a die is drawn with: its body, lit up when it is the hot one, and the paint of its signs.
  function skin(lit) {
    const body = lit ? hotMaterial : material;
    return inked && settings.ink ? [body, inkMaterial] : body;
  }

  function paint() {
    if (inkMaterial) {
      inkMaterial.color.set(inkColorNow());
      // A little light of its own, so a pale sign reads in the shade too.
      inkMaterial.emissive.set(inkColorNow()).multiplyScalar(0.18);
    }
    dice.forEach((die, i) => {
      die.mesh.material = skin(i === hot);
    });
    ui.inkColor.value = inkColorNow();
    // A model that does not say where its signs are has nothing to paint.
    ui.ink.disabled = !inked;
    ui.inkColor.disabled = !inked || !settings.ink;
    ui.ink.closest('label').title = inked ? '' : t('roll.inkNone');
  }

  // Lights up one die together with its result in the strip. -1 lights none.
  function setHot(index) {
    if (index === hot) return;
    hot = index;
    dice.forEach((die, i) => {
      die.mesh.material = skin(i === hot);
    });
    for (const chip of ui.result.querySelectorAll('.chip')) {
      chip.classList.toggle('is-hot', Number(chip.dataset.die) === hot);
    }
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
    labels.forEach((label, i) => {
      const chip = document.createElement('span');
      chip.className = label == null ? 'chip is-unknown' : 'chip';
      chip.classList.toggle('is-hot', i === hot);
      chip.textContent = label == null ? '?' : label;
      chip.title = t('roll.chipHint');
      // The strip and the tray point at each other: a result lights its die, a die its result.
      chip.dataset.die = String(i);
      chip.addEventListener('pointerenter', () => setHot(i));
      chip.addEventListener('pointerleave', () => setHot(-1));
      chip.addEventListener('dblclick', () => rethrow(dice[i]));
      chips.append(chip);
    });
    ui.result.append(chips);
    const numbers = labels.map((label) => (label == null ? null : numberOf(label)));
    if (labels.length > 1 && numbers.every((n) => n != null)) {
      line(t('roll.sum', { n: numbers.reduce((a, b) => a + b, 0) }));
    } else if (labels.some((label) => label == null)) {
      line(t('roll.unknown'));
    }
  }

  // Rebuilds the tower on screen: glass walls with their edges drawn, wooden boards inside.
  function showTower() {
    const group = view.towerGroup;
    for (const child of [...group.children]) {
      group.remove(child);
      child.geometry.dispose();
    }
    for (const [x0, x1, y0, y1, z0, z1] of towerWalls(tower)) {
      const box = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const wall = new THREE.Mesh(box, view.glass);
      wall.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      wall.renderOrder = 2;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), view.rim);
      edges.position.copy(wall.position);
      group.add(wall, edges);
    }
    for (const ramp of tower.ramps) {
      const box = boardBox(ramp, tower.depth);
      const board = new THREE.Mesh(new THREE.BoxGeometry(...box.size), view.wood);
      board.position.set(box.x, 0, box.z);
      board.quaternion.set(box.turn.x, box.turn.y, box.turn.z, box.turn.w);
      board.castShadow = true;
      board.receiveShadow = true;
      group.add(board);
    }
  }

  function clearWorld() {
    letGo();
    for (const die of dice) view.scene.remove(die.mesh);
    dice = [];
    hot = -1;
    pressed = null;
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

  // A box given by its corners rather than by its middle.
  function addBlock(x0, x1, y0, y1, z0, z1) {
    addBox((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }

  // The felt, an unseen lid and unseen walls that go up from the tray's own, so no die leaves.
  // On the left they make way for the tower: a die may fly or be carried into its open top.
  function buildTray() {
    const { width, depth, sky } = TRAY;
    const hw = width / 2;
    const hd = depth / 2;
    const side = tower.depth / 2 + TRAY.thick;
    const behind = tower.back - TRAY.thick;
    addBlock(behind - 2, hw + 2, -hd - 2, hd + 2, -2, 0);
    addBlock(behind - 2, hw + 2, -hd - 2, hd + 2, sky, sky + 2);
    addBlock(hw, hw + 2, -hd - 2, hd + 2, 0, sky);
    addBlock(-hw - 2, hw + 2, hd, hd + 2, 0, sky);
    addBlock(-hw - 2, hw + 2, -hd - 2, -hd, 0, sky);
    addBlock(-hw - 2, -hw, side, hd + 2, 0, sky);
    addBlock(-hw - 2, -hw, -hd - 2, -side, 0, sky);
    // The tray's own left wall under the chute.
    addBlock(-hw - TRAY.thick, -hw, -side, side, 0, TRAY.wall);
  }

  // The tower: its back and side walls go on up unseen, the front one ends at its top.
  function buildTower() {
    towerWalls(tower).forEach(([x0, x1, y0, y1, z0, z1], i) => {
      addBlock(x0, x1, y0, y1, z0, i === 3 ? z1 : TRAY.sky);
    });
    for (const ramp of tower.ramps) {
      const box = boardBox(ramp, tower.depth + TRAY.thick);
      world.createCollider(
        rapier.ColliderDesc.cuboid(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)
          .setTranslation(box.x, 0, box.z)
          .setRotation(box.turn)
          .setRestitution(0.3)
          .setFriction(0.1),
      );
    }
  }

  // through: 'tray' sends the dice across the felt, 'tower' drops them into the tower one by one.
  function throwDice(through = 'tray') {
    if (!rapier || !base || !opened) return;
    clearWorld();
    world = new rapier.World({ x: 0, y: 0, z: -GRAVITY });
    world.timestep = STEP;
    world.integrationParameters.contact_natural_frequency = CONTACT_HZ;

    const edge = settings.size / 10;
    const k = edge / baseSize;
    scaled = base.clone().scale(k, k, k);
    const points = hullPoints(scaled.getAttribute('position').array);
    scaled.computeBoundingSphere();
    const radius = scaled.boundingSphere.radius;
    dieRadius = radius;

    // The tower is as roomy as these dice need.
    const next = towerLayout(radius);
    const changed = next.gap !== tower.gap || !view.towerGroup.children.length;
    tower = next;
    if (changed) {
      showTower();
      if (!view.moved) view.frame();
    }
    buildTray();
    buildTower();

    // Weight cannot change how gravity pulls, so it shows as a slower, deader throw.
    const grams = weightNow();
    const heft = Math.min(1, Math.max(0, (grams - LIMITS.weight[0]) / (LIMITS.weight[1] - LIMITS.weight[0])));
    const balance = bodyProps(k, grams, radius);
    const speed = 1.25 - 0.7 * heft;
    const bounce = 0.5 - 0.32 * heft;
    const gap = Math.max(edge * 1.6, radius * 2.2);
    // As many dice side by side as fit between the walls; the rest start in layers above.
    const room = TRAY.depth - radius * 2 - 1;
    const columns = Math.max(1, Math.min(settings.count, 3, Math.floor(room / gap) + 1));
    const rand = (min, max) => min + Math.random() * (max - min);

    // Over the upper baffle, clear of the tower's walls.
    const drop = Math.max(0, tower.depth / 2 - radius - 0.4);
    for (let i = 0; i < settings.count; i++) {
      const column = i % columns;
      const layer = Math.floor(i / columns);
      let at;
      let push;
      if (through === 'tower') {
        at = [tower.back + Math.max(radius + 0.3, tower.reach * 0.4) + rand(-0.3, 0.3), rand(-drop, drop), tower.top + radius + 1];
        push = [rand(-8, 8), rand(-12, 12), rand(-30, 0)];
      } else {
        // The start is clear of the end of the chute.
        at = [-TRAY.width / 2 + radius + 3.5 + rand(0, 1), (column - (columns - 1) / 2) * gap + rand(-0.3, 0.3), 7 + radius + layer * gap];
        push = [rand(65, 135) * speed, rand(-45, 45) * speed, rand(-20, 20)];
      }
      const turn = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2)),
      );
      const spin = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(14, 30) * speed);
      const body = world.createRigidBody(
        rapier.RigidBodyDesc.dynamic()
          .setTranslation(at[0], at[1], at[2])
          .setRotation({ x: turn.x, y: turn.y, z: turn.z, w: turn.w })
          .setLinvel(push[0], push[1], push[2])
          .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
          .setLinearDamping(0.1)
          .setAngularDamping(0.15)
          .setCcdEnabled(true),
      );
      const shape = rapier.ColliderDesc.convexHull(points) || rapier.ColliderDesc.ball(radius);
      // The die collides by its hull but weighs as it is: with its real centre of mass and
      // inertia, so a side lightened by signs or a cut comes up a little more often.
      if (balance) shape.setMassProperties(grams, balance.centre, balance.inertia, balance.frame);
      else shape.setMass(grams);
      world.createCollider(shape.setRestitution(bounce).setFriction(0.4), body);
      const mesh = new THREE.Mesh(scaled, skin(false));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      view.scene.add(mesh);
      // Dice go into the tower one after another; each waits for its turn out of sight.
      const startAt = through === 'tower' ? i * TOWER.pause : 0;
      if (startAt > 0) {
        body.setEnabled(false);
        mesh.visible = false;
      }
      dice.push({ body, mesh, startAt, started: startAt === 0, nudges: 0 });
    }

    setGoing(through);
    labels = [];
    syncMeshes();
    showResult();
  }

  // The mass of the die for the engine, in the tray's units: scale k from the model's.
  // Null when the model has no inside to weigh; the engine then takes the hull as solid.
  function bodyProps(k, grams, radius) {
    if (!props) return null;
    const { moments, frame } = principalAxes(props.inertia);
    const per = (grams / props.volume) * k * k;
    const centre = { x: props.centre.x * k, y: props.centre.y * k, z: props.centre.z * k };
    if (!moments.every((moment) => moment > 0) || Math.hypot(centre.x, centre.y, centre.z) > radius) return null;
    return {
      centre,
      inertia: { x: moments[0] * per, y: moments[1] * per, z: moments[2] * per },
      frame: { x: frame.x, y: frame.y, z: frame.z, w: frame.w },
    };
  }

  // Throws one die anew from where it lies. The others stay as they are unless it lands on them.
  function rethrow(die) {
    if (!world || !die || !die.started || phase === 'loading' || phase === 'failed') return;
    letGo();
    const rand = (min, max) => min + Math.random() * (max - min);
    const room = dieRadius + 0.5;
    const p = die.body.translation();
    const turn = new THREE.Quaternion().random();
    const spin = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(14, 30));
    die.body.setTranslation({
      x: Math.min(TRAY.width / 2 - room, Math.max(-TRAY.width / 2 + room, p.x)),
      y: Math.min(TRAY.depth / 2 - room, Math.max(-TRAY.depth / 2 + room, p.y)),
      z: TRAY.wall + dieRadius + 5,
    }, true);
    die.body.setRotation({ x: turn.x, y: turn.y, z: turn.z, w: turn.w }, true);
    die.body.setLinvel({ x: rand(-30, 30), y: rand(-30, 30), z: rand(20, 60) }, true);
    die.body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);
    // It may have been in the hand a moment ago.
    die.body.setGravityScale(1, true);
    die.body.setLinearDamping(0.1);
    die.body.setAngularDamping(0.15);
    setGoing('hand');
    labels = [];
    showResult();
  }

  // Starts the clock of a throw: the dice tumble freely again and are read once they stop.
  function setGoing(how) {
    way = how;
    carry = 0;
    elapsed = 0;
    quiet = 0;
    resting = false;
    phase = 'rolling';
    for (const die of dice) die.nudges = 0;
    if (calmed) {
      for (const die of dice) {
        die.body.setLinearDamping(0.1);
        die.body.setAngularDamping(0.15);
      }
    }
    calmed = false;
  }

  // ---- A die in the hand ----

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const spot = new THREE.Vector3();

  function aimRay(event) {
    const rect = view.renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    return ray.ray;
  }

  // The die under the pointer, judged by its bounding ball: quick even for a dense model.
  function dieAt(event) {
    if (!world || !dice.length) return null;
    const line = aimRay(event);
    let best = null;
    let nearest = Infinity;
    for (const die of dice) {
      if (!die.started) continue;
      const along = spot.copy(die.mesh.position).sub(line.origin).dot(line.direction);
      if (along <= 0 || along >= nearest) continue;
      if (line.distanceSqToPoint(die.mesh.position) > dieRadius * dieRadius) continue;
      best = die;
      nearest = along;
    }
    return best;
  }

  // How high a held die is carried: just over the tray's walls, and over the tower near it.
  function carryHeight(x) {
    const low = TRAY.wall + dieRadius + HAND.lift;
    const high = tower.top + dieRadius + 1.5;
    const from = tower.front + TRAY.thick + 2 * dieRadius + 4;
    const share = Math.min(1, Math.max(0, (from - x) / 4));
    return low + (high - low) * share * share * (3 - 2 * share);
  }

  // Where the pointer wants the held die: on the carrying surface, inside the tray or over the tower.
  function carryTo(event, target) {
    const line = aimRay(event);
    if (Math.abs(line.direction.z) < 1e-3) return;
    let height = carryHeight(target.x);
    for (let i = 0; i < 4; i++) {
      const reach = (height - line.origin.z) / line.direction.z;
      if (reach <= 0) return;
      spot.copy(line.origin).addScaledVector(line.direction, reach);
      height = carryHeight(spot.x);
    }
    const room = dieRadius + 0.2;
    const overTower = spot.x < tower.front + TRAY.thick + room;
    const side = (overTower ? tower.depth / 2 : TRAY.depth / 2) - room;
    target.set(
      Math.min(TRAY.width / 2 - room, Math.max(tower.back + room, spot.x)),
      Math.min(side, Math.max(-side, spot.y)),
      height,
    );
  }

  function grab(die, event) {
    letGo();
    const p = die.body.translation();
    held = { die, target: new THREE.Vector3(p.x, p.y, p.z), trail: [] };
    carryTo(event, held.target);
    die.body.setGravityScale(0, true);
    die.body.setAngularDamping(3);
    die.body.setLinearDamping(0.1);
    view.controls.enabled = false;
    ui.stage.classList.add('is-holding');
    setGoing('hand');
    labels = [];
    showResult();
    window.addEventListener('pointermove', onHandMove);
    window.addEventListener('pointerup', onHandUp);
    window.addEventListener('pointercancel', onHandUp);
  }

  function onHandMove(event) {
    if (!held) return;
    carryTo(event, held.target);
    const now = performance.now();
    held.trail.push({ at: now, x: held.target.x, y: held.target.y, z: held.target.z });
    while (held.trail.length > 2 && now - held.trail[0].at > 120) held.trail.shift();
  }

  // Pulls the held die towards the pointer. Called before every frame of physics.
  function carryHeld() {
    const { die, target } = held;
    const p = die.body.translation();
    spot.set(target.x - p.x, target.y - p.y, target.z - p.z).multiplyScalar(HAND.pull);
    if (spot.length() > HAND.fastest) spot.setLength(HAND.fastest);
    die.body.setLinvel({ x: spot.x, y: spot.y, z: spot.z }, true);
    // The clock of the throw starts when the die leaves the hand.
    elapsed = 0;
    quiet = 0;
  }

  // Lets the held die go. thrown: it flies on the way the pointer was moving, and spins.
  function letGo(thrown = false) {
    if (!held) return;
    const { die, trail } = held;
    held = null;
    window.removeEventListener('pointermove', onHandMove);
    window.removeEventListener('pointerup', onHandUp);
    window.removeEventListener('pointercancel', onHandUp);
    view.controls.enabled = true;
    ui.stage.classList.remove('is-holding');
    if (!thrown || !world) return;
    die.body.setGravityScale(1, true);
    die.body.setAngularDamping(0.15);
    const first = trail[0];
    const last = trail[trail.length - 1];
    const span = first && last ? (last.at - first.at) / 1000 : 0;
    // A pointer that stood still before the release means a drop, not a throw.
    const fresh = last && performance.now() - last.at < 80 && span > 0.01;
    spot.set(0, 0, 0);
    if (fresh) spot.set(last.x - first.x, last.y - first.y, last.z - first.z).divideScalar(span);
    if (spot.length() > HAND.fastest) spot.setLength(HAND.fastest);
    die.body.setLinvel({ x: spot.x, y: spot.y, z: spot.z }, true);
    const turn = 10 + spot.length() / 9;
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(turn);
    die.body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);
    setGoing('hand');
  }

  function onHandUp() {
    letGo(true);
  }

  const onChip = (event) => Boolean(event.target && event.target.closest && event.target.closest('.chip'));

  function onStageDown(event) {
    if (event.button !== 0 || phase === 'loading' || phase === 'failed' || onChip(event)) return;
    // A second press at the same place throws the die of the first one anew. The first press
    // has lifted that die into the hand, so it is no longer under the pointer to be found there.
    const again = pressed
      && performance.now() - pressed.at < DOUBLE_PRESS
      && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DOUBLE_REACH
      && dice.includes(pressed.die);
    if (again) {
      event.preventDefault();
      event.stopPropagation();
      const die = pressed.die;
      pressed = null;
      rethrow(die);
      return;
    }
    const die = dieAt(event);
    if (!die) return;
    // The camera must not turn while a die is carried.
    event.preventDefault();
    event.stopPropagation();
    pressed = { die, at: performance.now(), x: event.clientX, y: event.clientY };
    grab(die, event);
  }

  function onStageHover(event) {
    // A result in the strip lights its die by itself.
    if (held || onChip(event)) return;
    const die = dieAt(event);
    ui.stage.classList.toggle('is-over-die', Boolean(die));
    setHot(die ? dice.indexOf(die) : -1);
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

  // between: an object that gets the sign nearest to the top when the die hangs between two faces.
  function faceUp(die, between) {
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
        if (mark.label !== top.label && mark.normal.dot(up) > topDot - tie && mark.normal.dot(top.normal) < 0.999) {
          if (between) between.top = top;
          return null;
        }
      }
      return top.label;
    }
    // A d4 or a die with an odd number of faces shows an edge or a corner: it is read by the face
    // it lies on. That holds only when no face at all looks straight up.
    if (flatTop >= flatBottom - EDGE_MARGIN) return null;
    return -bottomDot >= flatBottom - 0.01 && -bottomDot > 0.9 ? bottom.label : null;
  }

  function quietNow() {
    if (held) return false;
    for (const { body, started } of dice) {
      if (!started) return false;
      const v = body.linvel();
      const w = body.angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > QUIET_SPEED * QUIET_SPEED) return false;
      if (w.x * w.x + w.y * w.y + w.z * w.z > QUIET_SPIN * QUIET_SPIN) return false;
    }
    return true;
  }

  const between = { top: null };
  const lean = new THREE.Vector3();

  // A die with faces a few degrees apart may stop half-way over the ridge between two of them:
  // it tips so slowly there that the damping which calms round dice holds it. Such a die gets
  // a light push towards the face that is nearer to the top. Returns true when any was pushed.
  function settleBetween() {
    let pushed = false;
    for (const die of dice) {
      if (!die.started || die.nudges >= NUDGE.most || (held && held.die === die)) continue;
      const w = die.body.angvel();
      if (w.x * w.x + w.y * w.y + w.z * w.z > NUDGE.spin * NUDGE.spin * 0.25) continue;
      between.top = null;
      if (faceUp(die, between) !== null || !between.top) continue;
      const r = die.body.rotation();
      lean.copy(between.top.normal).applyQuaternion(turnBack.set(r.x, r.y, r.z, r.w)).cross(up.set(0, 0, 1));
      if (lean.lengthSq() < 1e-10) continue;
      lean.setLength(NUDGE.spin);
      die.body.setAngularDamping(0.15);
      die.body.setAngvel({ x: lean.x, y: lean.y, z: lean.z }, true);
      die.nudges += 1;
      pushed = true;
    }
    return pushed;
  }

  // Returns true when the reading differs from the one on screen.
  function readFaces() {
    const next = dice.map((die) => faceUp(die));
    const changed = next.length !== labels.length || next.some((label, i) => label !== labels[i]);
    labels = next;
    return changed;
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (world && !resting) {
      // The chosen speed plays the flight and the roll. A die in the hand follows the pointer as it is.
      const pace = held ? 1 : settings.speed;
      const span = dt * pace;
      const most = Math.ceil(MAX_STEPS_PER_FRAME * Math.max(1, pace));
      carry += span;
      elapsed += span;
      for (const die of dice) {
        if (die.started || elapsed < die.startAt) continue;
        die.started = true;
        die.body.setEnabled(true);
        die.mesh.visible = true;
      }
      if (held) carryHeld();
      let steps = 0;
      while (carry >= STEP && steps < most) {
        world.step();
        carry -= STEP;
        steps += 1;
      }
      if (steps === most) carry = 0;
      syncMeshes();
      // Round dice (a coin on its rim, a cylinder) would roll about the tray for a long time:
      // nothing in the model stands for rolling resistance, so the damping grows instead.
      if (elapsed > CALM_AFTER[way] && !calmed) {
        calmed = true;
        for (const die of dice) {
          die.body.setLinearDamping(1.2);
          die.body.setAngularDamping(2.5);
        }
      }
      quiet = quietNow() ? quiet + span : 0;
      // The engine puts bodies to sleep about two seconds after they stop; the reading need not wait for that.
      const asleep = !held && (elapsed > TIMEOUT[way] || dice.every((die) => die.started && die.body.isSleeping()));
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
      if (phase === 'done' && settleBetween()) {
        // The pushed die needs a moment to lie down.
        elapsed = Math.min(elapsed, TIMEOUT[way] - NUDGE.time);
      } else if (asleep) {
        resting = true;
      }
    }
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
  }

  // Puts the triangles of the signs last, as a second group, so they can have a paint of their own.
  function groupInk(geometry, ink) {
    const index = geometry.getIndex();
    if (!index || !ink || ink.length !== index.count / 3 || !ink.includes(1)) return false;
    const from = index.array;
    const sorted = new from.constructor(from.length);
    let o = 0;
    let body = 0;
    for (const flag of [0, 1]) {
      for (let i = 0; i < ink.length; i++) {
        if ((ink[i] ? 1 : 0) !== flag) continue;
        sorted[o++] = from[i * 3];
        sorted[o++] = from[i * 3 + 1];
        sorted[o++] = from[i * 3 + 2];
      }
      if (flag === 0) body = o;
    }
    geometry.setIndex(new THREE.BufferAttribute(sorted, 1));
    geometry.clearGroups();
    geometry.addGroup(0, body, 0);
    geometry.addGroup(body, from.length - body, 1);
    return true;
  }

  // ink: one flag per triangle of the geometry, 1 for the surface of a sign; null when not known.
  async function open({ geometry, color, flat, marks: faceMarks, ink = null }) {
    if (!view) buildView();
    opened = true;
    ui.root.hidden = false;
    view.scene.background = sceneColor();
    view.moved = false;
    if (!view.towerGroup.children.length) showTower();
    view.resize();

    if (base) base.dispose();
    base = geometry.clone();
    base.computeBoundingBox();
    const center = base.boundingBox.getCenter(new THREE.Vector3());
    const size = base.boundingBox.getSize(new THREE.Vector3());
    base.translate(-center.x, -center.y, -center.z);
    baseSize = Math.max(size.x, size.y, size.z) || 1;
    flats = flatNormals(base);
    props = massProps(base);
    inked = groupInk(base, ink);
    for (const old of [material, hotMaterial, inkMaterial]) if (old) old.dispose();
    bodyColor = color;
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04, flatShading: flat });
    hotMaterial = material.clone();
    hotMaterial.emissive.set(0xe2b15a);
    hotMaterial.emissiveIntensity = 0.5;
    inkMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02, flatShading: flat });
    paint();
    marks = faceMarks.map((mark) => ({ label: mark.label, normal: new THREE.Vector3().fromArray(mark.normal).normalize() }));
    tie = tieOf(marks);

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

  // rethrow: the setting changes the dice themselves, so they are thrown anew.
  function bindSlider(input, name, rethrow = true) {
    input.min = String(LIMITS[name][0]);
    input.max = String(LIMITS[name][1]);
    input.value = String(settings[name]);
    input.addEventListener('input', () => {
      settings[name] = name === 'count' ? Math.round(clampSetting(name, input.value)) : clampSetting(name, input.value);
      showOutputs();
    });
    // Re-throw once the slider is released, not on every pixel of travel.
    input.addEventListener('change', () => {
      saveSettings();
      // The dice go the way they went last time, except that a hand does not throw by itself.
      if (rethrow) throwDice(way === 'tower' ? 'tower' : 'tray');
    });
  }

  bindSlider(ui.count, 'count');
  bindSlider(ui.size, 'size');
  bindSlider(ui.weight, 'weight');
  // The speed takes hold at once, in the middle of a throw too.
  bindSlider(ui.speed, 'speed', false);
  showMaterials();
  showOutputs();
  ui.material.addEventListener('change', () => {
    settings.material = ui.material.value === 'manual' || materialById(ui.material.value) ? ui.material.value : 'manual';
    saveSettings();
    showOutputs();
    throwDice(way === 'tower' ? 'tower' : 'tray');
  });
  ui.ink.checked = settings.ink;
  ui.ink.addEventListener('change', () => {
    settings.ink = ui.ink.checked;
    saveSettings();
    paint();
  });
  ui.inkColor.value = inkColorNow();
  ui.inkColor.addEventListener('input', () => {
    settings.inkColor = ui.inkColor.value;
    paint();
  });
  ui.inkColor.addEventListener('change', saveSettings);
  ui.stage.addEventListener('pointerleave', () => setHot(-1));
  ui.again.addEventListener('click', () => throwDice('tray'));
  ui.tower.addEventListener('click', () => throwDice('tower'));
  // Ahead of the camera controls, which listen on the canvas inside the stage.
  ui.stage.addEventListener('pointerdown', onStageDown, true);
  ui.stage.addEventListener('pointermove', onStageHover);
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
      showMaterials();
      showOutputs();
      showResult();
      if (view) view.scene.background = sceneColor();
    },
  };
}
