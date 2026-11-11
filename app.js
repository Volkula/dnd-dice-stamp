import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { MeshBVH } from 'three-mesh-bvh';
import { artworkFromSvg, fitContours } from './geom2d.js?v=9';
import {
  initManifold,
  localToolGeometry,
  prepareSolid,
  applyStamps,
  flipWinding,
  signedVolume,
  manifoldApi,
} from './stamp.js?v=9';
import {
  LANGS,
  AppError,
  t,
  msg,
  render,
  errorMsg,
  getLang,
  setLang,
  onLangChange,
  applyI18n,
  locale,
} from './i18n.js?v=9';
import { cacheGet, cacheSet, cacheDel } from './store.js?v=9';
import {
  DEFAULT_FONT,
  EMOJI_CSS_FAMILY,
  loadBuiltinFont,
  ensureEmoji,
  listFonts,
  hasFont,
  fontName,
  addFont,
  addFontFromFile,
  addFontFromUrl,
  removeFont,
  customFonts,
  needsEmoji,
  layoutText,
} from './fonts.js?v=9';
import { LIBRARIES, library, loadLibrary, searchItems } from './symbols.js?v=9';
import { createRoller } from './roll.js?v=9';
import { buildDie, fitHeight, shapeById, optionsFor, SHAPES } from './dicegen.js?v=9';
import { createGenerator } from './genui.js?v=9';
import {
  PROJECT_APP,
  PROJECT_VERSION,
  PROJECT_EXT,
  toBase64,
  fromBase64,
  packGeometry,
  unpackGeometry,
  encodeGeometry,
  decodeGeometry,
  stampToData,
  stampFromData,
} from './project.js?v=9';

const THEMES = ['midnight', 'day', 'contrast', 'sepia'];
const THEME_KEY = 'dice.theme';
const HISTORY_LIMIT = 8;
const EMOJI_LIMIT = 240;
const ICON_LIMIT = 120;

const PRESETS = [
  {
    key: 'preset.circle',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42"/></svg>',
  },
  {
    key: 'preset.ring',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M50 8a42 42 0 1 1 0 84a42 42 0 1 1 0-84zm0 22a20 20 0 1 0 0 40a20 20 0 1 0 0-40z"/></svg>',
  },
  {
    key: 'preset.star',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,6 61,38 96,38 68,58 79,92 50,72 21,92 32,58 4,38 39,38"/></svg>',
  },
  {
    key: 'preset.triangle',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,8 94,88 6,88"/></svg>',
  },
];

const $ = (id) => document.getElementById(id);

const ui = {
  engine: $('engine'),
  hint: $('hint'),
  drop: $('drop'),
  busy: $('busy'),
  stage: $('stage'),
  lang: $('lang'),
  theme: $('theme'),
  roll: $('btn-roll'),
  gen: $('btn-gen'),
  objects: $('objects'),
  fitAll: $('btn-fit-all'),
  name: $('obj-name'),
  scope: $('export-scope'),
  fileProject: $('file-project'),
  saveProject: $('btn-save-project'),
  newProject: $('btn-new'),
  fileStl: $('file-stl'),
  fileSvg: $('file-svg'),
  sample: $('btn-sample'),
  info: $('model-info'),
  color: $('die-color'),
  smooth: $('smooth'),
  flip: $('btn-flip'),
  fit: $('btn-fit'),
  regen: $('btn-regen'),
  tabText: $('tab-text'),
  tabSvg: $('tab-svg'),
  tabSymbols: $('tab-symbols'),
  paneText: $('pane-text'),
  paneSvg: $('pane-svg'),
  paneSymbols: $('pane-symbols'),
  text: $('text'),
  font: $('font'),
  fontRemove: $('btn-font-remove'),
  fileFont: $('file-font'),
  fontUrl: $('font-url'),
  fontLoad: $('btn-font-url'),
  svg: $('svg'),
  editNote: $('edit-note'),
  presets: $('presets'),
  symLib: $('sym-lib'),
  symQuery: $('sym-query'),
  symInfo: $('sym-info'),
  symGrid: $('sym-grid'),
  symCredit: $('sym-credit'),
  symNow: $('sym-now'),
  modeCut: $('mode-cut'),
  modeRaise: $('mode-raise'),
  height: $('height'),
  heightNum: $('height-num'),
  depth: $('depth'),
  depthNum: $('depth-num'),
  rotation: $('rotation'),
  rotationNum: $('rotation-num'),
  offU: $('off-u'),
  offV: $('off-v'),
  wrap: $('wrap'),
  list: $('stamps'),
  deselect: $('btn-deselect'),
  apply: $('btn-apply'),
  undo: $('btn-undo'),
  reset: $('btn-reset'),
  auto: $('auto'),
  dir: $('btn-dir'),
  dirClear: $('btn-dir-clear'),
  dirName: $('dir-name'),
  download: $('btn-download'),
  status: $('status'),
};

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(cssVar('--scene', '#2a241c'));
scene.add(new THREE.HemisphereLight(0xfff4e4, 0x3a3026, 0.9));
const key = new THREE.DirectionalLight(0xfff8ee, 1.5);
key.position.set(50, -90, 80);
scene.add(key);
const fill = new THREE.DirectionalLight(0xc5d4e4, 0.5);
fill.position.set(-70, 50, 30);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
camera.up.set(0, 0, 1);
camera.position.set(30, -40, 24);
const headlamp = new THREE.DirectionalLight(0xfff4e4, 0.5);
headlamp.position.set(12, -18, 8);
camera.add(headlamp);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
ui.stage.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const loader = new STLLoader();
const exporter = new STLExporter();
const roller = createRoller();

const cutMat = new THREE.MeshStandardMaterial({
  color: 0xe07a5f,
  transparent: true,
  opacity: 0.72,
  roughness: 0.35,
  metalness: 0.05,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const raiseMat = cutMat.clone();
raiseMat.color.set(0xe2b15a);
const cutMatOn = cutMat.clone();
cutMatOn.opacity = 0.92;
cutMatOn.emissive.set(0x8a2f16);
const raiseMatOn = raiseMat.clone();
raiseMatOn.opacity = 0.92;
raiseMatOn.emissive.set(0x7a5512);

function previewMaterial(obj, stamp) {
  const on = obj === active && stamp.id === obj.selectedId;
  if (stamp.mode === 'raise') return on ? raiseMatOn : raiseMat;
  return on ? cutMatOn : cutMat;
}

// A ring on the floor marks the object the panel works on once there is more than one.
const ring = new THREE.Mesh(
  new THREE.RingGeometry(0.965, 1, 96),
  new THREE.MeshBasicMaterial({
    color: cssVar('--accent', '#e2b15a'),
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
ring.visible = false;
scene.add(ring);

let engineReady = false;
let fontReady = false;
// What the next click stamps: 'text' reads the text field, 'svg' the SVG field.
let kind = 'text';
// Which tab is open. The symbol picker is a third tab that feeds one of the two fields.
let pane = 'text';
let svgLabel = '';
let mode = 'cut';
let formLock = false;
// Everything on the scene. Each object keeps its own model, stamps and undo history;
// stamp coordinates are in the object's own space, the scene only decides where the object stands.
let objects = [];
// The object the panel edits and a click stamps.
let active = null;
let objectSeq = 1;
let busy = false;
let exportDir = null;
const canPickDir = typeof window.showDirectoryPicker === 'function';
const generator = createGenerator({ engine: manifoldApi, onAdd: addGenerated, onApply: applyGenerated });

// Shown texts are kept as message keys so a language switch can redraw them.
const live = {
  status: msg('status.start'),
  hint: msg('hint.start'),
  engine: msg('engine.loading'),
  busy: msg('busy.working'),
};

window.__diceApp = true;

function asMessage(keyOrMessage, params) {
  return typeof keyOrMessage === 'string' ? msg(keyOrMessage, params) : keyOrMessage;
}

function setStatus(keyOrMessage, params) {
  live.status = asMessage(keyOrMessage, params);
  ui.status.textContent = render(live.status);
}

function setHint(keyOrMessage, params) {
  live.hint = asMessage(keyOrMessage, params);
  ui.hint.textContent = render(live.hint);
}

function setEngine(keyOrMessage) {
  live.engine = asMessage(keyOrMessage);
  ui.engine.textContent = render(live.engine);
}

function setBusy(on, keyOrMessage, params) {
  busy = on;
  if (keyOrMessage) live.busy = asMessage(keyOrMessage, params);
  ui.busy.querySelector('span').textContent = render(live.busy);
  ui.busy.hidden = !on;
  syncButtons();
}

// Lets the overlay paint before a long synchronous calculation blocks the page.
function nextPaint() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function num(input) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
}

function bindPair(range, field, onInput) {
  const sync = (source) => {
    if (formLock) return;
    const value = num(source);
    formLock = true;
    range.value = String(value);
    field.value = String(value);
    formLock = false;
    onInput();
  };
  range.addEventListener('input', () => sync(range));
  field.addEventListener('input', () => sync(field));
}

function setPair(range, field, value) {
  range.value = String(value);
  field.value = String(value);
}

function selectedStamp() {
  if (!active) return null;
  return active.stamps.find((stamp) => stamp.id === active.selectedId) || null;
}

function signSummary() {
  if (kind === 'svg') return svgLabel || 'SVG';
  return ui.text.value.replace(/\s+/g, ' ').trim().slice(0, 24) || '—';
}

function syncButtons() {
  const has = Boolean(active);
  const any = objects.length > 0;
  ui.flip.disabled = !has || busy;
  ui.fit.disabled = !has || busy;
  ui.regen.hidden = !has || !active.gen;
  ui.regen.disabled = busy;
  ui.fitAll.disabled = !any || busy;
  ui.roll.disabled = !has || busy;
  ui.gen.disabled = busy;
  ui.name.disabled = !has;
  ui.saveProject.disabled = !any || busy;
  ui.newProject.disabled = !any || busy;
  ui.apply.disabled = !has || !active.solid || !engineReady || active.stamps.length === 0 || busy;
  ui.undo.disabled = !has || active.history.length === 0 || busy;
  ui.reset.disabled = !has || busy;
  ui.download.disabled = !any || busy;
  ui.fontRemove.disabled = !hasFont(ui.font.value) || ui.font.value === DEFAULT_FONT;
  const selected = selectedStamp();
  ui.deselect.hidden = !selected;
  ui.editNote.textContent = t(selected ? 'sign.noteEditing' : 'sign.noteNext');
  ui.symNow.textContent = t('sym.now', { what: signSummary() });
}

function formatNumber(n) {
  const a = Math.abs(n);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return Number(n.toFixed(digits)).toLocaleString(locale());
}

function measure(geometry) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute('position');
  return {
    box: geometry.boundingBox.clone(),
    size: geometry.boundingBox.getSize(new THREE.Vector3()),
    triangles: Math.round((geometry.index ? geometry.index.count : position.count) / 3),
    volume: Math.abs(signedVolume(geometry)),
  };
}

function renderInfo() {
  if (!active) {
    ui.info.textContent = t('model.none');
    return;
  }
  const stats = active.stats;
  const text = t('model.info', {
    x: formatNumber(stats.size.x),
    y: formatNumber(stats.size.y),
    z: formatNumber(stats.size.z),
    triangles: stats.triangles.toLocaleString(locale()),
    volume: formatNumber(stats.volume),
  });
  ui.info.textContent = active.solid ? text : `${text} ${t('model.notSolid')}`;
}

// Where the object's bounding box is on the scene.
function objectBox(obj) {
  return obj.stats.box.clone().translate(obj.group.position);
}

function sceneBox(visibleOnly) {
  const box = new THREE.Box3();
  for (const obj of objects) {
    if (visibleOnly && !obj.group.visible) continue;
    box.union(objectBox(obj));
  }
  return box;
}

function setClipping(radius) {
  const whole = sceneBox(false);
  const reach = whole.isEmpty() ? radius : Math.max(radius, whole.getSize(new THREE.Vector3()).length());
  camera.near = Math.max(radius / 800, 1e-4);
  camera.far = reach * 50;
  camera.updateProjectionMatrix();
}

function frameBox(box) {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() * 0.9, 1);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius, -radius * 1.25, radius * 0.85));
  setClipping(radius);
  controls.update();
  touch();
}

function fitCamera() {
  if (active) frameBox(objectBox(active));
}

function fitScene() {
  const box = sceneBox(true);
  if (!box.isEmpty()) frameBox(box);
}

// ---- Scene objects ----

function createObject(id, name, color) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0.04,
    side: THREE.DoubleSide,
    flatShading: !ui.smooth.checked,
  }));
  group.add(mesh);
  scene.add(group);
  const obj = {
    id,
    name,
    color,
    group,
    mesh,
    solid: false,
    // The geometry as it was opened or generated, for "restore the original".
    source: null,
    sourceSolid: false,
    // True once the model differs from the source, so the source is worth storing separately.
    edited: false,
    stats: null,
    stamps: [],
    selectedId: null,
    stampSeq: 1,
    // Baked stamps as { label, normal }: the tray reads a throw by the mark that faces up.
    marks: [],
    history: [],
    previews: new Map(),
    timers: new Map(),
    refits: new Map(),
    // The search tree for signs that follow the relief, built on first use.
    relief: null,
    // For a die made by the generator: { spec, number }, so its shape can be changed later.
    gen: null,
  };
  mesh.userData.owner = obj;
  return obj;
}

function setGeometry(obj, geometry, solid) {
  if (obj.mesh.geometry !== geometry) obj.mesh.geometry.dispose();
  obj.mesh.geometry = geometry;
  obj.solid = solid;
  obj.stats = measure(geometry);
}

// Stands the objects in a grid on the floor. Their own coordinates are untouched.
function layout() {
  const count = objects.length;
  if (!count) {
    ring.visible = false;
    return;
  }
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  // A column is as wide as its widest object and a row as deep as its deepest one,
  // so one large model does not push small dice far apart.
  const widths = new Array(columns).fill(0);
  const depths = new Array(rows).fill(0);
  let mean = 0;
  objects.forEach((obj, i) => {
    const { x, y } = obj.stats.size;
    const column = i % columns;
    const row = Math.floor(i / columns);
    widths[column] = Math.max(widths[column], x);
    depths[row] = Math.max(depths[row], y);
    mean += (x + y) / (2 * count);
  });
  const gap = Math.max(mean * 0.5, 0.5);
  const middles = (sizes) => {
    const total = sizes.reduce((sum, size) => sum + size, 0) + gap * (sizes.length - 1);
    let at = -total / 2;
    return sizes.map((size) => {
      const middle = at + size / 2;
      at += size + gap;
      return middle;
    });
  };
  const xs = middles(widths);
  const ys = middles(depths);
  objects.forEach((obj, i) => {
    const center = obj.stats.box.getCenter(new THREE.Vector3());
    obj.group.position.set(
      xs[i % columns] - center.x,
      -ys[Math.floor(i / columns)] - center.y,
      -obj.stats.box.min.z,
    );
    obj.group.updateMatrixWorld(true);
  });
  placeRing();
}

function placeRing() {
  if (!active || objects.length < 2 || !active.group.visible) {
    ring.visible = false;
    return;
  }
  const box = objectBox(active);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  ring.visible = true;
  ring.scale.setScalar(Math.max(Math.hypot(size.x, size.y) * 0.56, 0.5));
  ring.position.set(center.x, center.y, 0);
}

function uniqueName(wanted) {
  const base = String(wanted || '').trim() || 'dice';
  const taken = new Set(objects.map((obj) => obj.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const next = `${base} ${n}`;
    if (!taken.has(next)) return next;
  }
}

function clearStamps(obj) {
  for (const timer of obj.timers.values()) clearTimeout(timer);
  obj.timers.clear();
  for (const timer of obj.refits.values()) clearTimeout(timer);
  obj.refits.clear();
  for (const mesh of obj.previews.values()) {
    obj.group.remove(mesh);
    mesh.geometry.dispose();
  }
  obj.previews.clear();
  obj.stamps = [];
  obj.selectedId = null;
  if (obj === active) renderList();
}

function clearHistory(obj) {
  for (const entry of obj.history) entry.geometry.dispose();
  obj.history = [];
}

function disposeObject(obj) {
  clearStamps(obj);
  clearHistory(obj);
  scene.remove(obj.group);
  obj.mesh.geometry.dispose();
  obj.mesh.material.dispose();
  if (obj.source) obj.source.dispose();
}

// Colours a stamp preview. Only the selected stamp shows its direction arrow,
// otherwise a numbered die bristles with thirty of them.
function paintPreview(obj, stamp, mesh) {
  mesh.material = previewMaterial(obj, stamp);
  const arrow = mesh.children[0];
  if (arrow) arrow.visible = obj === active && stamp.id === obj.selectedId;
}

function refreshPreviews(obj) {
  for (const stamp of obj.stamps) {
    const mesh = obj.previews.get(stamp.id);
    if (mesh) paintPreview(obj, stamp, mesh);
  }
}

function sceneHint() {
  if (!active) return 'hint.start';
  return active.solid ? 'hint.ready' : 'hint.notSolid';
}

// Points the panel at an object (or at nothing) and redraws everything that depends on it.
function activate(obj) {
  const previous = active;
  active = obj;
  if (previous && previous !== obj && objects.includes(previous)) refreshPreviews(previous);
  if (obj) {
    ui.color.value = obj.color;
    ui.name.value = obj.name;
    const stamp = selectedStamp();
    if (stamp) showStampInForm(stamp);
  } else {
    ui.name.value = '';
  }
  placeRing();
  renderObjects();
  renderList();
  renderInfo();
  setHint(sceneHint());
  touch();
}

function setActive(obj) {
  if (obj !== active) activate(obj);
}

function objectButton(text, title, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.addEventListener('click', onClick);
  return button;
}

function renderObjects() {
  ui.objects.replaceChildren();
  for (const obj of objects) {
    const item = document.createElement('li');
    if (obj === active) item.classList.add('is-on');
    const shown = obj.group.visible;
    if (!shown) item.classList.add('is-hidden');
    const pick = objectButton(obj.name, obj.name, 'pick', () => {
      setActive(obj);
      setStatus('status.objectPicked', { name: obj.name });
    });
    if (obj === active) pick.setAttribute('aria-current', 'true');
    item.append(
      pick,
      objectButton(shown ? '●' : '○', t(shown ? 'scene.hide' : 'scene.show'), 'tool', () => toggleObject(obj)),
      objectButton('2×', t('scene.duplicate'), 'tool', () => duplicateObject(obj)),
      objectButton('×', t('scene.remove'), 'x', () => removeObject(obj)),
    );
    ui.objects.append(item);
  }
  if (!objects.length) {
    const item = document.createElement('li');
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = t('scene.empty');
    item.append(note);
    ui.objects.append(item);
  }
}

function toggleObject(obj) {
  obj.group.visible = !obj.group.visible;
  placeRing();
  renderObjects();
  setStatus(obj.group.visible ? 'status.objectShown' : 'status.objectHidden', { name: obj.name });
  touch();
}

function removeObject(obj) {
  if (busy) return;
  const hasWork = obj.stamps.length > 0 || obj.edited;
  if (hasWork && !window.confirm(t('scene.removeConfirm', { name: obj.name }))) return;
  const index = objects.indexOf(obj);
  if (index < 0) return;
  objects.splice(index, 1);
  disposeObject(obj);
  dropCached(obj);
  layout();
  if (obj === active) activate(objects[Math.min(index, objects.length - 1)] || null);
  else renderObjects();
  setStatus('status.objectRemoved', { name: obj.name });
  saveSession();
}

function copyStamp(stamp) {
  const copy = stampFromData(stampToData(stamp));
  Object.assign(copy, shapeFor(copy.sourceContours, copy.height));
  return copy;
}

function duplicateObject(obj) {
  if (busy) return;
  const copy = createObject(objectSeq++, uniqueName(obj.name), obj.color);
  copy.source = obj.source.clone();
  copy.sourceSolid = obj.sourceSolid;
  copy.edited = obj.edited;
  copy.marks = obj.marks.map((mark) => ({ label: mark.label, normal: mark.normal.slice() }));
  copy.gen = readGen(obj.gen);
  objects.splice(objects.indexOf(obj) + 1, 0, copy);
  setGeometry(copy, obj.mesh.geometry.clone(), obj.solid);
  copy.group.visible = obj.group.visible;
  for (const stamp of obj.stamps) {
    const next = copyStamp(stamp);
    next.id = copy.stampSeq++;
    copy.stamps.push(next);
    rebuildPreview(copy, next);
  }
  layout();
  activate(copy);
  fitCamera();
  setStatus('status.objectCopied', { name: copy.name });
  saveModel(copy);
  saveSource(copy);
  saveSession();
}

// Welds the mesh and checks it is a closed body; an open mesh is still shown, just not cut.
function solidify(raw, autoFlip) {
  try {
    const prepared = prepareSolid(raw, { autoFlip });
    return { geometry: prepared.geometry, solid: true, flipped: prepared.flipped, failure: null };
  } catch (error) {
    return { geometry: error.geometry || raw, solid: false, flipped: false, failure: error };
  }
}

function addObject(raw, name) {
  const made = solidify(raw, true);
  const obj = createObject(objectSeq++, uniqueName(name), ui.color.value);
  obj.source = made.geometry.clone();
  obj.sourceSolid = made.solid;
  objects.push(obj);
  setGeometry(obj, made.geometry, made.solid);
  return { obj, made };
}

function importGeometry(raw, name) {
  const { obj, made } = addObject(raw, name);
  layout();
  activate(obj);
  fitCamera();
  if (made.failure) setStatus(errorMsg(made.failure, 'err.solid.open'));
  else setStatus(made.flipped ? 'status.modelFlipped' : 'status.modelReady');
  saveModel(obj);
  saveSource(obj);
  saveSession();
}

function flipActive() {
  const obj = active;
  if (!obj || busy) return;
  clearStamps(obj);
  const made = solidify(flipWinding(obj.mesh.geometry), false);
  setGeometry(obj, made.geometry, made.solid);
  obj.edited = true;
  layout();
  renderInfo();
  setHint(sceneHint());
  syncButtons();
  if (made.failure) setStatus(errorMsg(made.failure, 'err.solid.open'));
  else setStatus('status.modelReady');
  saveModel(obj);
  saveSource(obj);
  touch();
}

async function loadArrayBuffer(buffer, name) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  let geometry;
  try {
    geometry = loader.parse(buffer);
  } catch {
    setStatus('err.stlParse');
    return;
  }
  const position = geometry.getAttribute('position');
  if (!position || position.count < 3) {
    setStatus('err.stlEmpty');
    return;
  }
  importGeometry(geometry, name.replace(/\.stl$/i, '') || 'dice');
}

// ---- Stamps ----

// The stamp's axes before its own rotation: z along the normal, y as upright as the face allows.
function stampBasis(normal) {
  const z = normal.clone().normalize();
  const helper = Math.abs(z.z) < 0.92 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(helper, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return { x, y, z };
}

function placementMatrix(stamp) {
  const { x, y, z } = stampBasis(stamp.normal);
  if (stamp.rotation) {
    const q = new THREE.Quaternion().setFromAxisAngle(z, THREE.MathUtils.degToRad(stamp.rotation));
    x.applyQuaternion(q);
    y.applyQuaternion(q);
  }
  const pos = stamp.point.clone()
    .addScaledVector(x, stamp.offsetU || 0)
    .addScaledVector(y, stamp.offsetV || 0);
  const matrix = new THREE.Matrix4().makeBasis(x, y, z);
  matrix.setPosition(pos);
  return matrix;
}

// The rotation that turns a stamp on this face so its top points along `up`.
function rotationFor(normal, up) {
  const { y, z } = stampBasis(normal);
  const angle = Math.atan2(new THREE.Vector3().crossVectors(y, up).dot(z), y.dot(up));
  return Math.round(THREE.MathUtils.radToDeg(angle) * 100) / 100;
}

// The search tree over the object's mesh, rebuilt when the mesh is replaced.
function reliefOf(obj) {
  const geometry = obj.mesh.geometry;
  if (!obj.relief || obj.relief.geometry !== geometry) {
    obj.relief = { geometry, tree: new MeshBVH(geometry, { indirect: true }) };
  }
  return obj.relief.tree;
}

const probeRay = new THREE.Ray();

// Height of the model over the stamp's plane at a point of that plane. Null where there is
// nothing under the point, or where the nearest surface is far from the stamp: on a goblet
// that is the foot seen past the edge of the bowl, and the sign must not drop down to it.
function surfaceUnder(obj, stamp) {
  const tree = reliefOf(obj);
  const matrix = placementMatrix(stamp);
  const x = new THREE.Vector3();
  const y = new THREE.Vector3();
  const z = new THREE.Vector3();
  matrix.extractBasis(x, y, z);
  const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
  const reach = Math.max(stamp.halfWidth, stamp.halfHeight) + stamp.depth;
  const down = z.clone().negate();
  return (u, v) => {
    probeRay.origin.copy(origin).addScaledVector(x, u).addScaledVector(y, v).addScaledVector(z, reach);
    probeRay.direction.copy(down);
    const hit = tree.raycastFirst(probeRay, THREE.FrontSide);
    return hit && hit.distance <= reach * 2 ? reach - hit.distance : null;
  };
}

// On a rough surface the triangle under the cursor may look anywhere, and a sign laid along it
// would stand askew. The stamp then takes the average direction of the surface under it.
// On a die with flat faces a good part of the neighbourhood lies in the clicked face even when
// the sign hangs over its edges, and then the face keeps the say: the sign stays square to it.
function settledNormal(obj, stamp, hit) {
  const tree = reliefOf(obj);
  const { x, y, z } = stampBasis(hit.normal);
  const radius = Math.max(stamp.halfWidth, stamp.halfHeight);
  const sum = new THREE.Vector3();
  let seen = 0;
  let agree = 0;
  const spots = [[0, 0]];
  for (const [ring, count] of [[0.5, 6], [1, 10]]) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      spots.push([ring * radius * Math.cos(angle), ring * radius * Math.sin(angle)]);
    }
  }
  probeRay.direction.copy(z).negate();
  for (const [u, v] of spots) {
    probeRay.origin.copy(hit.point).addScaledVector(x, u).addScaledVector(y, v).addScaledVector(z, radius);
    const found = tree.raycastFirst(probeRay, THREE.FrontSide);
    if (!found || found.distance > radius * 2) continue;
    seen += 1;
    if (found.face.normal.dot(z) > 0.996) agree += 1;
    sum.add(found.face.normal);
  }
  if (!seen || agree >= seen * 0.3 || sum.lengthSq() < 1e-8) return hit.normal;
  sum.normalize();
  // A direction that looks away from the clicked triangle would put the sign on edge.
  return sum.dot(z) > 0.5 ? sum : hit.normal;
}

function stampJobs(obj) {
  return obj.stamps.map((stamp) => ({
    contours: stamp.contours,
    fillRule: stamp.fillRule,
    depth: stamp.depth,
    mode: stamp.mode,
    matrix: Array.from(placementMatrix(stamp).elements),
    surface: stamp.wrap ? surfaceUnder(obj, stamp) : null,
  }));
}

function positionPreview(obj, stamp) {
  const mesh = obj.previews.get(stamp.id);
  if (!mesh) return;
  const matrix = placementMatrix(stamp);
  mesh.position.setFromMatrixPosition(matrix);
  mesh.quaternion.setFromRotationMatrix(matrix);
  mesh.scale.set(1, 1, 1);
  const arrow = mesh.children[0];
  if (arrow && arrow.setLength) {
    const length = Math.max(stamp.height * 0.45, stamp.depth * 2, 0.4);
    arrow.setLength(length, length * 0.28, length * 0.16);
  }
}

function rebuildPreview(obj, stamp) {
  let geometry;
  try {
    const surface = stamp.wrap ? surfaceUnder(obj, stamp) : null;
    geometry = localToolGeometry(stamp.contours, stamp.fillRule, stamp.depth, stamp.mode, surface);
  } catch (error) {
    setStatus(errorMsg(error, 'err.stampBuild'));
    return;
  }
  let mesh = obj.previews.get(stamp.id);
  if (!mesh) {
    mesh = new THREE.Mesh(geometry, previewMaterial(obj, stamp));
    mesh.raycast = () => {};
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0xf3eee6, 0.3, 0.16);
    mesh.add(arrow);
    obj.group.add(mesh);
    obj.previews.set(stamp.id, mesh);
  } else {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  }
  paintPreview(obj, stamp, mesh);
  positionPreview(obj, stamp);
}

// Fitted contours are centred on the origin, so the footprint is symmetric.
function shapeFor(sourceContours, height) {
  const contours = fitContours(sourceContours, height);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const contour of contours) {
    for (const [x, y] of contour) {
      halfWidth = Math.max(halfWidth, Math.abs(x));
      halfHeight = Math.max(halfHeight, Math.abs(y));
    }
  }
  return { contours, halfWidth, halfHeight };
}

function scheduleRebuild(obj, stamp) {
  clearTimeout(obj.timers.get(stamp.id));
  obj.timers.set(stamp.id, setTimeout(() => rebuildPreview(obj, stamp), 40));
}

// A sign that follows the relief changes shape as it moves. During a drag it is rebuilt
// a few times a second rather than on every pointer event.
function refitSoon(obj, stamp) {
  if (!stamp.wrap || obj.refits.has(stamp.id)) return;
  obj.refits.set(
    stamp.id,
    setTimeout(() => {
      obj.refits.delete(stamp.id);
      if (obj.stamps.includes(stamp)) rebuildPreview(obj, stamp);
    }, 50),
  );
}

function stampName(stamp) {
  const raw = stamp.kind === 'text' ? stamp.source : stamp.label || 'SVG';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 24) || '—';
}

function stampLabel(stamp) {
  return t('stamps.item', {
    what: stampName(stamp),
    how: t(stamp.mode === 'raise' ? 'how.raiseShort' : 'how.cutShort'),
    height: stamp.height,
  });
}

function renderList() {
  ui.list.replaceChildren();
  const stamps = active ? active.stamps : [];
  for (const stamp of stamps) {
    const item = document.createElement('li');
    if (stamp.id === active.selectedId) item.classList.add('is-on');
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'pick';
    pick.textContent = stampLabel(stamp);
    pick.addEventListener('click', () => selectStamp(stamp.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'x';
    remove.textContent = '×';
    remove.title = t('stamps.remove');
    remove.setAttribute('aria-label', t('stamps.remove'));
    remove.addEventListener('click', () => removeStamp(stamp.id));
    item.append(pick, remove);
    ui.list.append(item);
  }
  if (!stamps.length) {
    const item = document.createElement('li');
    const note = document.createElement('span');
    note.className = 'muted';
    note.textContent = t(active ? 'stamps.empty' : 'stamps.noObject');
    item.append(note);
    ui.list.append(item);
  }
  if (active) refreshPreviews(active);
  syncButtons();
}

function deselect() {
  if (!active || active.selectedId == null) return;
  active.selectedId = null;
  renderList();
  setStatus('status.deselected');
  touch();
}

// Loads the stamp's sign and numbers into the form. The symbol tab stays open if the user is in it.
function showStampInForm(stamp) {
  formLock = true;
  kind = stamp.kind;
  if (stamp.kind === 'text') {
    ui.text.value = stamp.source;
    if (hasFont(stamp.fontId)) ui.font.value = stamp.fontId;
  } else {
    ui.svg.value = stamp.source;
    svgLabel = stamp.label || '';
  }
  if (pane !== 'symbols') showPane(stamp.kind);
  mode = stamp.mode;
  ui.modeCut.classList.toggle('is-on', mode === 'cut');
  ui.modeRaise.classList.toggle('is-on', mode === 'raise');
  setPair(ui.height, ui.heightNum, stamp.height);
  setPair(ui.depth, ui.depthNum, stamp.depth);
  setPair(ui.rotation, ui.rotationNum, stamp.rotation);
  ui.offU.value = String(stamp.offsetU);
  ui.offV.value = String(stamp.offsetV);
  ui.wrap.checked = Boolean(stamp.wrap);
  formLock = false;
}

function selectStamp(id) {
  if (!active) return;
  const stamp = active.stamps.find((item) => item.id === id);
  if (!stamp) return;
  active.selectedId = id;
  showStampInForm(stamp);
  renderList();
  setStatus('status.selected', { label: stampLabel(stamp) });
  touch();
}

function removeStamp(id) {
  const obj = active;
  if (!obj) return;
  obj.stamps = obj.stamps.filter((stamp) => stamp.id !== id);
  clearTimeout(obj.timers.get(id));
  obj.timers.delete(id);
  const mesh = obj.previews.get(id);
  if (mesh) {
    obj.group.remove(mesh);
    mesh.geometry.dispose();
    obj.previews.delete(id);
  }
  if (obj.selectedId === id) obj.selectedId = null;
  renderList();
  touch();
}

async function readArtwork() {
  if (kind === 'svg') {
    let svg = ui.svg.value.trim();
    if (!svg) throw new AppError('err.svgEmpty');
    if (!/<svg[\s>]/i.test(svg)) {
      if (!/<(path|circle|polygon|rect|ellipse)\b/i.test(svg)) throw new AppError('err.notSvg');
      svg = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
    }
    return { kind: 'svg', source: svg, label: svgLabel, fontId: '', ...artworkFromSvg(svg) };
  }
  const text = ui.text.value.replace(/\r/g, '');
  if (!text.trim()) throw new AppError('err.textEmpty');
  if (!fontReady) throw new AppError('err.fontNotReady');
  const fontId = hasFont(ui.font.value) ? ui.font.value : DEFAULT_FONT;
  if (needsEmoji(fontId, text)) {
    try {
      await ensureEmoji();
    } catch {
      // Without the emoji font the characters are simply reported as missing below.
    }
  }
  return { kind: 'text', source: text, label: '', fontId, ...layoutText(fontId, text, 10) };
}

function missingMessage(artwork) {
  return artwork.missing && artwork.missing.length
    ? msg('status.missing', { chars: artwork.missing.join(' ') })
    : null;
}

async function placeStamp(hit) {
  const obj = hit.object;
  const height = Math.max(0.05, num(ui.height));
  let artwork;
  let shape;
  try {
    artwork = await readArtwork();
    shape = shapeFor(artwork.contours, height);
  } catch (error) {
    setStatus(errorMsg(error));
    return;
  }
  if (!objects.includes(obj)) return;
  const stamp = {
    id: obj.stampSeq++,
    kind: artwork.kind,
    source: artwork.source,
    label: artwork.label,
    fontId: artwork.fontId,
    sourceContours: artwork.contours,
    ...shape,
    fillRule: artwork.fillRule,
    mode,
    height,
    depth: Math.max(0.02, num(ui.depth)),
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
    wrap: ui.wrap.checked,
    point: hit.point.clone(),
    normal: hit.normal.clone(),
  };
  if (stamp.wrap) stamp.normal.copy(settledNormal(obj, stamp, hit));
  obj.stamps.push(stamp);
  obj.selectedId = stamp.id;
  rebuildPreview(obj, stamp);
  if (obj === active) {
    formLock = true;
    setPair(ui.rotation, ui.rotationNum, 0);
    ui.offU.value = '0';
    ui.offV.value = '0';
    formLock = false;
    renderList();
  }
  setStatus(missingMessage(artwork) || msg('status.placed'));
  touch();
}

// Sits the stamp on the surface under the hit and tilts it to that face.
function seatStamp(obj, stamp, hit) {
  stamp.point.copy(hit.point);
  stamp.normal.copy(stamp.wrap ? settledNormal(obj, stamp, hit) : hit.normal);
  positionPreview(obj, stamp);
  refitSoon(obj, stamp);
}

function moveSelected(hit) {
  const stamp = selectedStamp();
  if (!stamp) return;
  seatStamp(active, stamp, hit);
  setStatus('status.moved');
  touch();
}

let sourceTimer = 0;

function scheduleSourceEdit() {
  touch();
  syncButtons();
  const stamp = selectedStamp();
  if (formLock || !stamp) return;
  clearTimeout(sourceTimer);
  sourceTimer = setTimeout(() => {
    if (selectedStamp() === stamp) applySourceEdit();
  }, 120);
}

// Rebuilds the selected stamp from whatever is in the active sign field.
async function applySourceEdit() {
  const obj = active;
  const stamp = selectedStamp();
  if (!stamp) return false;
  let artwork;
  let shape;
  try {
    artwork = await readArtwork();
    shape = shapeFor(artwork.contours, stamp.height);
  } catch (error) {
    setStatus('status.editKept', { reason: errorMsg(error) });
    return false;
  }
  if (!objects.includes(obj) || !obj.stamps.includes(stamp)) return false;
  Object.assign(stamp, shape, {
    kind: artwork.kind,
    source: artwork.source,
    label: artwork.label,
    fontId: artwork.fontId,
    sourceContours: artwork.contours,
    fillRule: artwork.fillRule,
  });
  rebuildPreview(obj, stamp);
  if (obj === active) renderList();
  setStatus(missingMessage(artwork) || msg('status.signUpdated'));
  touch();
  return true;
}

// A sign was picked from a file, a preset or the symbol library.
async function signChosen(label) {
  touch();
  syncButtons();
  if (selectedStamp()) {
    if (await applySourceEdit()) setStatus('status.signOnStamp', { label });
  } else {
    setStatus('status.signReady', { label });
  }
}

function useSvg(text, label) {
  ui.svg.value = text;
  svgLabel = label;
  kind = 'svg';
  if (pane !== 'symbols') showPane('svg');
  signChosen(label);
}

function onGeomInput() {
  if (formLock) return;
  touch();
  const stamp = selectedStamp();
  if (!stamp) return;
  const nextHeight = Math.max(0.05, num(ui.height));
  const nextDepth = Math.max(0.02, num(ui.depth));
  const wrap = ui.wrap.checked;
  // A sign that follows the relief is rebuilt on any change: a turn or a shift puts it over other bumps.
  const shape = nextHeight !== stamp.height || nextDepth !== stamp.depth || mode !== stamp.mode || wrap || stamp.wrap;
  stamp.height = nextHeight;
  stamp.depth = nextDepth;
  stamp.mode = mode;
  stamp.wrap = wrap;
  stamp.rotation = num(ui.rotation);
  stamp.offsetU = num(ui.offU);
  stamp.offsetV = num(ui.offV);
  if (shape) {
    try {
      Object.assign(stamp, shapeFor(stamp.sourceContours, stamp.height));
    } catch (error) {
      setStatus(errorMsg(error));
      return;
    }
    scheduleRebuild(active, stamp);
  } else {
    positionPreview(active, stamp);
  }
  renderList();
}

// The nearest surface under the cursor, in the hit object's own coordinates.
function hitAt(clientX, clientY, only = null) {
  const targets = only ? [only.mesh] : objects.filter((obj) => obj.group.visible).map((obj) => obj.mesh);
  if (!targets.length) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(targets, false).find((entry) => entry.face);
  if (!hit) return null;
  const owner = hit.object.userData.owner;
  return {
    object: owner,
    point: owner.group.worldToLocal(hit.point.clone()),
    normal: hit.face.normal.clone().normalize(),
  };
}

function screenPoint(world) {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = world.clone().project(camera);
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height,
  };
}

// Picks by the stamp's padded bounding box: thin glyphs would be hard to grab exactly.
function stampUnder(obj, point) {
  const local = new THREE.Vector3();
  let best = null;
  let bestDistance = Infinity;
  for (const stamp of obj.stamps) {
    local.copy(point).applyMatrix4(placementMatrix(stamp).invert());
    const pad = stamp.height * 0.15;
    if (Math.abs(local.x) > stamp.halfWidth + pad) continue;
    if (Math.abs(local.y) > stamp.halfHeight + pad) continue;
    // A sign that follows the relief lies well off its own plane wherever the surface bends.
    const off = stamp.wrap
      ? Math.max(stamp.halfWidth, stamp.halfHeight) + stamp.depth
      : Math.max(stamp.height * 0.35, stamp.depth * 1.5);
    if (Math.abs(local.z) > off) continue;
    const distance = Math.hypot(local.x, local.y);
    if (distance < bestDistance) {
      best = stamp;
      bestDistance = distance;
    }
  }
  return best;
}

function dragTo(obj, stamp, clientX, clientY) {
  // Only the stamp's own object is tested, so a drag cannot jump to a neighbour.
  const hit = hitAt(clientX, clientY, obj);
  if (!hit) return false;
  // The slider offsets live in the old face's plane, so the drag absorbs them.
  stamp.offsetU = 0;
  stamp.offsetV = 0;
  seatStamp(obj, stamp, hit);
  return true;
}

function markOf(stamp) {
  return { label: stampName(stamp), normal: stamp.normal.toArray() };
}

// Cuts or adds every placed stamp of the object. Resolves to false when the boolean failed.
async function bake(obj = active) {
  if (!obj || !obj.stamps.length || busy || !obj.solid) return false;
  setBusy(true, 'busy.baking', { n: obj.stamps.length });
  await nextPaint();
  try {
    const next = applyStamps(obj.mesh.geometry, stampJobs(obj));
    obj.history.push({ geometry: obj.mesh.geometry, marks: obj.marks.length, stamps: obj.stamps.slice() });
    if (obj.history.length > HISTORY_LIMIT) obj.history.shift().geometry.dispose();
    obj.marks = obj.marks.concat(obj.stamps.map(markOf));
    obj.mesh.geometry = next;
    obj.stats = measure(next);
    obj.edited = true;
    clearStamps(obj);
    layout();
    if (obj === active) renderInfo();
    setStatus('status.baked');
    saveModel(obj);
    saveSource(obj);
    touch();
    return true;
  } catch (error) {
    setStatus(errorMsg(error, 'err.boolean'));
    return false;
  } finally {
    setBusy(false);
  }
}

function undo() {
  const obj = active;
  if (!obj || busy) return;
  const previous = obj.history.pop();
  if (!previous) return;
  obj.mesh.geometry.dispose();
  obj.mesh.geometry = previous.geometry;
  obj.marks = obj.marks.slice(0, previous.marks);
  obj.solid = true;
  obj.stats = measure(previous.geometry);
  // The stamps of that step come back as editable ones, next to any placed since.
  const placedSince = obj.stamps;
  obj.stamps = previous.stamps.concat(placedSince);
  for (const stamp of previous.stamps) rebuildPreview(obj, stamp);
  // The relief under the later stamps has changed too.
  for (const stamp of placedSince) if (stamp.wrap) rebuildPreview(obj, stamp);
  layout();
  renderList();
  renderInfo();
  setStatus('status.undone');
  syncButtons();
  saveModel(obj);
  touch();
}

function resetSource() {
  const obj = active;
  if (!obj || busy) return;
  clearStamps(obj);
  clearHistory(obj);
  obj.marks = [];
  setGeometry(obj, obj.source.clone(), obj.sourceSolid);
  obj.edited = false;
  layout();
  renderInfo();
  setHint(sceneHint());
  syncButtons();
  setStatus('status.reset');
  saveModel(obj);
  saveSource(obj);
  touch();
}

// ---- Generated dice ----

function polygonSize(face) {
  let area = 0;
  const origin = new THREE.Vector3().fromArray(face.polygon[0]);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 1; i + 1 < face.polygon.length; i++) {
    a.fromArray(face.polygon[i]).sub(origin);
    b.fromArray(face.polygon[i + 1]).sub(origin);
    area += a.cross(b).length() / 2;
  }
  return area;
}

// Puts the die's numbers on its faces as ordinary stamps, sized to fit and still editable.
function numberStamps(obj, die) {
  const fontId = hasFont(ui.font.value) ? ui.font.value : DEFAULT_FONT;
  const depthWanted = Math.max(0.02, num(ui.depth));
  const drafts = [];
  for (const face of die.faces) {
    let art;
    let unit;
    try {
      art = layoutText(fontId, face.label, 10);
      unit = shapeFor(art.contours, 1);
    } catch {
      continue;
    }
    drafts.push({ face, art, fit: fitHeight(face, unit.halfWidth / unit.halfHeight), area: polygonSize(face) });
  }
  for (const draft of drafts) {
    // Faces of one size share the smallest fit among them, so "1" does not come out taller than "20".
    let fit = draft.fit;
    for (const other of drafts) {
      if (Math.abs(other.area - draft.area) <= draft.area * 0.05) fit = Math.min(fit, other.fit);
    }
    const height = Math.max(0.2, Math.round(fit * 0.62 * 100) / 100);
    const { face, art } = draft;
    const normal = new THREE.Vector3().fromArray(face.normal);
    obj.stamps.push({
      id: obj.stampSeq++,
      kind: 'text',
      source: face.label,
      label: '',
      fontId,
      sourceContours: art.contours,
      ...shapeFor(art.contours, height),
      fillRule: art.fillRule,
      mode: 'cut',
      height,
      depth: Math.round(Math.min(depthWanted, Math.max(0.15, height * 0.14)) * 100) / 100,
      rotation: rotationFor(normal, new THREE.Vector3().fromArray(face.up)),
      offsetU: 0,
      offsetV: 0,
      wrap: ui.wrap.checked,
      point: new THREE.Vector3().fromArray(face.center),
      normal,
    });
  }
  for (const stamp of obj.stamps) rebuildPreview(obj, stamp);
}

function dieGeometry(die) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(die.positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(die.index, 1));
  return geometry;
}

function dieName(spec, outcomes) {
  return `d${outcomes} ${t(shapeById(spec.shape).shortKey)}`;
}

// What the generator was asked for, as kept with the object and in saved scenes. Null when unusable.
function readGen(saved) {
  const spec = saved && saved.spec;
  if (!spec || typeof spec !== 'object' || !SHAPES.some((shape) => shape.id === spec.shape)) return null;
  const outcomes = Math.round(Number(spec.outcomes));
  const size = Number(spec.size);
  if (!(outcomes >= 2) || !(size > 0)) return null;
  return {
    spec: {
      shape: spec.shape,
      outcomes,
      double: Boolean(spec.double),
      size,
      stretch: Number(spec.stretch) || 1,
      caps: String(spec.caps || ''),
      options: optionsFor(spec.shape, spec.options),
    },
    number: Boolean(saved.number),
  };
}

function openRegen() {
  const obj = active;
  if (!obj || !obj.gen || busy) return;
  generator.open({ spec: obj.gen.spec, number: obj.gen.number, name: obj.name });
}

// Called by the generator dialog when it was opened on a die of the scene: builds the die anew in its place.
async function applyGenerated(spec, number) {
  const obj = active;
  if (!obj || !obj.gen || busy) return;
  try {
    await enginePromise;
  } catch {
    return;
  }
  // Signs already cut into the model go with the old shape.
  if (obj.edited && !window.confirm(t('model.regenConfirm', { name: obj.name }))) return;
  setBusy(true, 'busy.generating', { n: 1 });
  await nextPaint();
  try {
    let die;
    try {
      die = buildDie(manifoldApi(), spec);
    } catch {
      setStatus('err.generate');
      return;
    }
    const made = solidify(dieGeometry(die), true);
    const named = obj.name === dieName(obj.gen.spec, obj.gen.spec.outcomes);
    clearStamps(obj);
    clearHistory(obj);
    obj.marks = [];
    obj.source.dispose();
    obj.source = made.geometry.clone();
    obj.sourceSolid = made.solid;
    obj.edited = false;
    setGeometry(obj, made.geometry, made.solid);
    obj.gen = readGen({ spec, number });
    // A name the generator gave follows the new shape; a name typed by hand stays.
    if (named) {
      obj.name = '';
      obj.name = uniqueName(dieName(spec, die.plan.outcomes));
    }
    if (number && fontReady && obj.solid) numberStamps(obj, die);
  } finally {
    setBusy(false);
  }
  layout();
  activate(obj);
  fitCamera();
  saveModel(obj);
  saveSource(obj);
  saveSession();
  setStatus('status.regenerated', { name: obj.name, stamps: obj.stamps.length });
}

// Called by the generator dialog with one spec per die.
async function addGenerated(specs, number) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  if (busy) return;
  setBusy(true, 'busy.generating', { n: specs.length });
  await nextPaint();
  const made = [];
  let failed = 0;
  try {
    for (const spec of specs) {
      let die;
      try {
        die = buildDie(manifoldApi(), spec);
      } catch {
        failed += 1;
        continue;
      }
      const { obj } = addObject(dieGeometry(die), dieName(spec, die.plan.outcomes));
      obj.gen = readGen({ spec, number });
      if (number && fontReady && obj.solid) numberStamps(obj, die);
      made.push(obj);
    }
  } finally {
    setBusy(false);
  }
  if (!made.length) {
    setStatus('err.generate');
    return;
  }
  layout();
  activate(made[made.length - 1]);
  if (made.length > 1) fitScene();
  else fitCamera();
  for (const obj of made) {
    saveModel(obj);
    saveSource(obj);
  }
  saveSession();
  const stamps = made.reduce((sum, obj) => sum + obj.stamps.length, 0);
  if (failed) setStatus('status.generatedPartly', { n: made.length, failed });
  else if (stamps) setStatus('status.generatedNumbered', { n: made.length, stamps });
  else setStatus('status.generated', { n: made.length });
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dice';
}

function downloadBlob(name, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// Asks for write access while the click is still fresh: the browser refuses after a long calculation.
async function exportDirReady() {
  if (!exportDir) return false;
  try {
    const options = { mode: 'readwrite' };
    let state = await exportDir.queryPermission(options);
    if (state !== 'granted') state = await exportDir.requestPermission(options);
    return state === 'granted';
  } catch {
    return false;
  }
}

// Writes into the chosen folder, or hands the file to the browser's downloads when that is not possible.
async function saveFile(name, blob, toDir) {
  if (toDir && exportDir) {
    try {
      const handle = await exportDir.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
      return msg('where.folder', { name: exportDir.name });
    } catch {
      downloadBlob(name, blob);
      return msg('where.folderFailed', { name: exportDir.name });
    }
  }
  downloadBlob(name, blob);
  return msg(exportDir ? 'where.folderDenied' : 'where.downloads', exportDir ? { name: exportDir.name } : undefined);
}

// Welds the mesh, checks it is one closed body and turns the normals outward.
function tidyModel(obj) {
  let prepared;
  try {
    prepared = prepareSolid(obj.mesh.geometry, { autoFlip: true });
  } catch {
    return msg('export.tidyBroken');
  }
  const before = obj.mesh.geometry.getAttribute('position').count;
  const after = prepared.geometry.getAttribute('position').count;
  if (!prepared.flipped && before === after) {
    prepared.geometry.dispose();
    return msg('export.tidyOk');
  }
  setGeometry(obj, prepared.geometry, true);
  obj.edited = true;
  layout();
  if (obj === active) renderInfo();
  saveModel(obj);
  saveSource(obj);
  return msg(prepared.flipped ? 'export.tidyFlipped' : 'export.tidyWelded');
}

// Gets one object ready for writing. Resolves to null when its stamps could not be applied.
async function finishObject(obj) {
  const pending = obj.stamps.length;
  if (!ui.auto.checked) {
    return { baked: 0, left: pending, broken: false, note: pending ? msg('export.pendingLeft', { n: pending }) : msg('export.asIs') };
  }
  if (!obj.solid || !engineReady) {
    return { baked: 0, left: pending, broken: true, note: msg(pending ? 'export.brokenPending' : 'export.tidyBroken') };
  }
  if (pending && !(await bake(obj))) return null;
  setBusy(true, 'busy.checking');
  await nextPaint();
  let note;
  try {
    note = tidyModel(obj);
  } finally {
    setBusy(false);
  }
  if (pending) note = msg('export.baked', { n: pending, note });
  return { baked: pending, left: 0, broken: false, note };
}

function stlBlob(root) {
  root.updateMatrixWorld(true);
  const data = exporter.parse(root, { binary: true });
  return new Blob([new Uint8Array(data.buffer, data.byteOffset, data.byteLength)], { type: 'model/stl' });
}

// One object is written in its own coordinates, as the STL it came from was.
function objectBlob(obj) {
  return stlBlob(new THREE.Mesh(obj.mesh.geometry));
}

// Several objects in one file keep the places they have on the scene.
function sceneBlob(list) {
  const root = new THREE.Group();
  for (const obj of list) {
    const mesh = new THREE.Mesh(obj.mesh.geometry);
    mesh.position.copy(obj.group.position);
    root.add(mesh);
  }
  return stlBlob(root);
}

function exportSummary(results) {
  if (!ui.auto.checked) {
    return msg('export.summaryRaw', { left: results.reduce((sum, result) => sum + result.left, 0) });
  }
  return msg('export.summary', {
    stamps: results.reduce((sum, result) => sum + result.baked, 0),
    broken: results.filter((result) => result.broken).length,
  });
}

async function exportStl() {
  if (busy || !objects.length) return;
  const scope = ui.scope.value;
  const targets = scope === 'active' ? [active].filter(Boolean) : objects.filter((obj) => obj.group.visible);
  if (!targets.length) {
    setStatus('status.nothingToExport');
    return;
  }
  const toDir = await exportDirReady();
  const results = [];
  for (const obj of targets) {
    const result = await finishObject(obj);
    if (!result) return;
    results.push(result);
  }
  if (scope === 'merged') {
    const name = 'dice-set.stl';
    const where = await saveFile(name, sceneBlob(targets), toDir);
    setStatus('status.exported', { file: name, where, note: exportSummary(results) });
    return;
  }
  if (targets.length === 1) {
    const name = `${safeFileName(targets[0].name)}-stamped.stl`;
    const where = await saveFile(name, objectBlob(targets[0]), toDir);
    setStatus('status.exported', { file: name, where, note: results[0].note });
    return;
  }
  const used = new Set();
  let where;
  for (const obj of targets) {
    const base = safeFileName(obj.name);
    let name = `${base}-stamped.stl`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}-stamped.stl`;
    used.add(name.toLowerCase());
    where = await saveFile(name, objectBlob(obj), toDir);
  }
  setStatus('status.exportedMany', { n: targets.length, where, note: exportSummary(results) });
}

function showPane(next) {
  pane = next;
  const tabs = [[ui.tabText, ui.paneText, 'text'], [ui.tabSvg, ui.paneSvg, 'svg'], [ui.tabSymbols, ui.paneSymbols, 'symbols']];
  for (const [tab, box, name] of tabs) {
    tab.classList.toggle('is-on', name === next);
    tab.setAttribute('aria-selected', String(name === next));
    box.hidden = name !== next;
  }
}

function setPane(next) {
  showPane(next);
  if (next === 'symbols') {
    if (symbols.phase === 'idle') loadSymbols();
  } else {
    kind = next;
  }
  syncButtons();
  touch();
}

function setMode(next) {
  mode = next;
  ui.modeCut.classList.toggle('is-on', next === 'cut');
  ui.modeRaise.classList.toggle('is-on', next === 'raise');
  onGeomInput();
  touch();
}

// ---- Fonts ----

function refreshFontList(selectId) {
  const wanted = selectId || ui.font.value || DEFAULT_FONT;
  ui.font.replaceChildren();
  for (const entry of listFonts()) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    ui.font.append(option);
  }
  ui.font.value = hasFont(wanted) ? wanted : DEFAULT_FONT;
  syncButtons();
}

async function fontAdded(entry) {
  refreshFontList(entry.id);
  saveFonts();
  touch();
  if (kind === 'text' && selectedStamp()) await applySourceEdit();
  setStatus('status.fontAdded', { name: entry.name });
}

async function addFontFile(file) {
  try {
    await fontAdded(await addFontFromFile(file));
  } catch (error) {
    setStatus(errorMsg(error, 'err.fontParse'));
  }
}

async function addFontLink() {
  const value = ui.fontUrl.value;
  ui.fontLoad.disabled = true;
  setStatus('status.fontLoading');
  try {
    await fontAdded(await addFontFromUrl(value));
    ui.fontUrl.value = '';
  } catch (error) {
    setStatus(errorMsg(error, 'err.fontFetch'));
  } finally {
    ui.fontLoad.disabled = false;
  }
}

function dropFont() {
  const id = ui.font.value;
  const name = fontName(id);
  if (!removeFont(id)) return;
  refreshFontList(DEFAULT_FONT);
  saveFonts();
  touch();
  setStatus('status.fontRemoved', { name });
}

// ---- Symbol libraries ----

// phase: 'idle' | 'loading' | 'ready' | 'failed'
const symbols = { phase: 'idle', items: [], error: null, token: 0, shown: 0, total: 0 };

async function loadSymbols() {
  const lib = library(ui.symLib.value);
  const token = ++symbols.token;
  symbols.phase = 'loading';
  symbols.items = [];
  renderSymbols();
  try {
    const items = await loadLibrary(lib.id, getLang());
    if (token !== symbols.token) return;
    symbols.items = items;
    symbols.phase = 'ready';
  } catch (error) {
    if (token !== symbols.token) return;
    symbols.error = errorMsg(error, 'err.libFetch');
    symbols.phase = 'failed';
  }
  renderSymbols();
}

function symbolButton(lib, item, ink) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sym';
  button.title = item.label;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-label', item.label);
  if (lib.type === 'emoji') {
    button.textContent = item.char;
    button.style.fontFamily = `${EMOJI_CSS_FAMILY}, sans-serif`;
  } else {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = `data:image/svg+xml;utf8,${encodeURIComponent(item.svg.replace(/currentColor/g, ink))}`;
    button.append(image);
  }
  button.addEventListener('click', () => pickSymbol(lib, item));
  return button;
}

function renderSymbols() {
  const lib = library(ui.symLib.value);
  ui.symCredit.replaceChildren();
  const link = document.createElement('a');
  link.href = lib.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = lib.name;
  ui.symCredit.append(link, ` · ${lib.license}`);

  if (symbols.phase !== 'ready') {
    ui.symGrid.replaceChildren();
    if (symbols.phase === 'loading') ui.symInfo.textContent = t('sym.loading', { name: lib.name });
    else if (symbols.phase === 'failed') ui.symInfo.textContent = render(symbols.error);
    else ui.symInfo.textContent = '';
    return;
  }
  const limit = lib.type === 'emoji' ? EMOJI_LIMIT : ICON_LIMIT;
  const found = searchItems(symbols.items, ui.symQuery.value, limit);
  const ink = cssVar('--text', '#f3eee6');
  ui.symGrid.replaceChildren(...found.items.map((item) => symbolButton(lib, item, ink)));
  const count = found.total
    ? t('sym.shown', { shown: found.items.length, total: found.total.toLocaleString(locale()) })
    : t('sym.nothing');
  ui.symInfo.textContent = lib.type === 'icons' ? `${count} ${t('sym.english')}` : count;
}

function pickSymbol(lib, item) {
  if (lib.type === 'emoji') {
    ui.text.value = item.char;
    kind = 'text';
    signChosen(`${item.char} ${item.label}`);
    return;
  }
  ui.svg.value = item.svg;
  svgLabel = item.label;
  kind = 'svg';
  signChosen(`${item.label} (${lib.name})`);
}

let symbolTimer = 0;

function scheduleSymbolSearch() {
  clearTimeout(symbolTimer);
  symbolTimer = setTimeout(renderSymbols, 140);
  touch();
}

// ---- Cache and project files ----

// Nothing is written before the saved scene has been read back, or a reload would wipe it.
let cacheOpen = false;
let cacheWarned = false;
let saveTimer = 0;

const modelKey = (id) => `model:${id}`;
const sourceKey = (id) => `source:${id}`;

function store(name, value) {
  return cacheSet(name, value).catch(() => {
    if (cacheWarned) return;
    cacheWarned = true;
    setStatus('status.cacheFailed');
  });
}

function formData() {
  return {
    kind,
    pane,
    text: ui.text.value,
    svg: ui.svg.value,
    svgLabel,
    fontId: ui.font.value,
    mode,
    height: num(ui.height),
    depth: num(ui.depth),
    wrap: ui.wrap.checked,
    color: ui.color.value,
    smooth: ui.smooth.checked,
    auto: ui.auto.checked,
    scope: ui.scope.value,
    symLib: ui.symLib.value,
    symQuery: ui.symQuery.value,
  };
}

function objectData(obj) {
  return {
    id: obj.id,
    name: obj.name,
    color: obj.color,
    visible: obj.group.visible,
    solid: obj.solid,
    sourceSolid: obj.sourceSolid,
    selectedId: obj.selectedId,
    stamps: obj.stamps.map(stampToData),
    marks: obj.marks.map((mark) => ({ label: mark.label, normal: mark.normal.slice() })),
    gen: obj.gen,
  };
}

function viewData() {
  return { position: camera.position.toArray(), target: controls.target.toArray() };
}

function sessionData() {
  return {
    v: 2,
    objects: objects.map(objectData),
    activeId: active ? active.id : null,
    form: formData(),
    view: viewData(),
  };
}

function saveSession() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (cacheOpen) store('session', sessionData());
}

function touch() {
  if (!cacheOpen) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveSession, 250);
}

function saveModel(obj) {
  if (cacheOpen) store(modelKey(obj.id), packGeometry(obj.mesh.geometry));
}

// The source is stored only while it differs from the model; otherwise it is rebuilt from the model.
function saveSource(obj) {
  if (!cacheOpen) return;
  if (obj.edited && obj.source) store(sourceKey(obj.id), packGeometry(obj.source));
  else cacheDel(sourceKey(obj.id)).catch(() => {});
}

function dropCached(obj) {
  if (!cacheOpen) return;
  cacheDel(modelKey(obj.id)).catch(() => {});
  cacheDel(sourceKey(obj.id)).catch(() => {});
}

function saveFonts() {
  if (cacheOpen) store('fonts', customFonts());
}

function applyForm(form) {
  if (!form || typeof form !== 'object') return;
  formLock = true;
  if (typeof form.text === 'string') ui.text.value = form.text;
  if (typeof form.svg === 'string') ui.svg.value = form.svg;
  svgLabel = typeof form.svgLabel === 'string' ? form.svgLabel : '';
  if (hasFont(form.fontId)) ui.font.value = form.fontId;
  mode = form.mode === 'raise' ? 'raise' : 'cut';
  ui.modeCut.classList.toggle('is-on', mode === 'cut');
  ui.modeRaise.classList.toggle('is-on', mode === 'raise');
  if (Number.isFinite(form.height) && form.height > 0) setPair(ui.height, ui.heightNum, form.height);
  if (Number.isFinite(form.depth) && form.depth > 0) setPair(ui.depth, ui.depthNum, form.depth);
  if (typeof form.wrap === 'boolean') ui.wrap.checked = form.wrap;
  if (isColor(form.color)) ui.color.value = form.color;
  ui.smooth.checked = Boolean(form.smooth);
  if (typeof form.auto === 'boolean') ui.auto.checked = form.auto;
  if (['active', 'each', 'merged'].includes(form.scope)) ui.scope.value = form.scope;
  if (LIBRARIES.some((lib) => lib.id === form.symLib)) ui.symLib.value = form.symLib;
  if (typeof form.symQuery === 'string') ui.symQuery.value = form.symQuery;
  kind = form.kind === 'svg' ? 'svg' : 'text';
  formLock = false;
  const nextPane = ['text', 'svg', 'symbols'].includes(form.pane) ? form.pane : kind;
  showPane(nextPane);
  symbols.phase = 'idle';
  symbols.items = [];
  if (nextPane === 'symbols') loadSymbols();
  else renderSymbols();
}

function isColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function readMarks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const mark of list) {
    const n = mark && mark.normal;
    if (!Array.isArray(n) || n.length !== 3 || !n.every((value) => Number.isFinite(value))) continue;
    out.push({ label: String(mark.label ?? ''), normal: n.slice() });
  }
  return out;
}

function vectorFrom(list) {
  return Array.isArray(list) && list.length === 3 && list.every((value) => Number.isFinite(value))
    ? new THREE.Vector3().fromArray(list)
    : null;
}

// A scene saved before there could be several objects: one model with its stamps.
function legacyScene(session, geometry, source) {
  const form = session.form && typeof session.form === 'object' ? session.form : {};
  const meta = {
    id: 1,
    name: session.name,
    color: form.color,
    visible: true,
    solid: session.solid,
    sourceSolid: session.sourceSolid,
    selectedId: session.selectedId,
    stamps: session.stamps,
    marks: session.marks,
  };
  // The saved camera looked at the model where it used to stand, so it is not carried over.
  return { objects: geometry ? [{ meta, geometry, source }] : [], activeId: 1, form: session.form, view: null };
}

function clearScene() {
  for (const obj of objects) disposeObject(obj);
  objects = [];
  active = null;
  ring.visible = false;
}

// Rebuilds the whole scene from saved data: { objects: [{ meta, geometry, source }], activeId, form, view }.
// Returns how many stamps could not be read.
function applyScene(data) {
  clearScene();
  applyForm(data.form);
  let skipped = 0;
  const usedIds = new Set();
  for (const part of data.objects) {
    const meta = part.meta && typeof part.meta === 'object' ? part.meta : {};
    let id = Math.max(1, Math.floor(Number(meta.id)) || 1);
    while (usedIds.has(id)) id += 1;
    usedIds.add(id);
    const obj = createObject(id, uniqueName(meta.name), isColor(meta.color) ? meta.color : ui.color.value);
    obj.source = part.source || part.geometry.clone();
    obj.edited = Boolean(part.source);
    obj.sourceSolid = part.source ? meta.sourceSolid !== false : meta.solid !== false;
    objects.push(obj);
    setGeometry(obj, part.geometry, meta.solid !== false);
    obj.group.visible = meta.visible !== false;
    obj.marks = readMarks(meta.marks);
    obj.gen = readGen(meta.gen);

    const used = new Set();
    for (const saved of Array.isArray(meta.stamps) ? meta.stamps : []) {
      try {
        const stamp = stampFromData(saved);
        Object.assign(stamp, shapeFor(stamp.sourceContours, stamp.height));
        while (used.has(stamp.id)) stamp.id += 1;
        used.add(stamp.id);
        obj.stamps.push(stamp);
        rebuildPreview(obj, stamp);
      } catch {
        skipped += 1;
      }
    }
    obj.stampSeq = obj.stamps.reduce((max, stamp) => Math.max(max, stamp.id), 0) + 1;
    if (obj.stamps.some((stamp) => stamp.id === meta.selectedId)) obj.selectedId = meta.selectedId;
  }
  objectSeq = objects.reduce((max, obj) => Math.max(max, obj.id), 0) + 1;
  layout();
  activate(objects.find((obj) => obj.id === data.activeId) || objects[0] || null);

  const position = vectorFrom(data.view && data.view.position);
  const target = vectorFrom(data.view && data.view.target);
  if (objects.length && position && target && position.distanceToSquared(target) > 1e-12) {
    camera.position.copy(position);
    controls.target.copy(target);
    setClipping(Math.max(sceneBox(false).getSize(new THREE.Vector3()).length() * 0.9, 1));
    controls.update();
  } else if (objects.length > 1) {
    fitScene();
  } else {
    fitCamera();
  }
  return skipped;
}

function pendingStamps() {
  return objects.reduce((sum, obj) => sum + obj.stamps.length, 0);
}

async function readCachedScene(session) {
  if (!Array.isArray(session.objects)) {
    const [model, source] = await Promise.all([cacheGet('model'), cacheGet('source')]);
    const geometry = model ? unpackGeometry(model) : null;
    return { legacy: true, data: legacyScene(session, geometry, geometry && source ? unpackGeometry(source) : null) };
  }
  const parts = await Promise.all(session.objects.map(async (meta) => {
    const id = meta && meta.id;
    const [model, source] = await Promise.all([cacheGet(modelKey(id)), cacheGet(sourceKey(id))]);
    if (!model) return null;
    return { meta, geometry: unpackGeometry(model), source: source ? unpackGeometry(source) : null };
  }));
  return {
    legacy: false,
    data: { objects: parts.filter(Boolean), activeId: session.activeId, form: session.form, view: session.view },
  };
}

async function restoreCache() {
  if (!engineReady) return;
  let saved;
  try {
    saved = await Promise.all(['session', 'fonts', 'dir'].map((name) => cacheGet(name)));
  } catch {
    // No IndexedDB (private window, blocked storage): the app works, it just forgets on reload.
    cacheOpen = true;
    return;
  }
  const [session, savedFonts, dir] = saved;
  for (const entry of Array.isArray(savedFonts) ? savedFonts : []) {
    try {
      addFont(entry);
    } catch {
      // A font that no longer parses is dropped; stamps keep their own outlines.
    }
  }
  refreshFontList();
  if (dir && canPickDir) exportDir = dir;
  renderDir();
  let rewrite = objects.length > 0;
  if (session && typeof session === 'object') {
    try {
      const { legacy, data } = await readCachedScene(session);
      // Anything opened while the cache was being read wins over the saved scene.
      if (!objects.length) {
        applyScene(data);
        if (objects.length) setStatus('status.restored', { objects: objects.length, n: pendingStamps() });
        rewrite = legacy;
      }
    } catch {
      setStatus('status.cacheBroken');
    }
  }
  cacheOpen = true;
  if (rewrite) {
    // Either the scene was made before the cache opened, or it is in the old one-model layout.
    cacheDel('model').catch(() => {});
    cacheDel('source').catch(() => {});
    for (const obj of objects) {
      saveModel(obj);
      saveSource(obj);
    }
    saveSession();
  }
}

function projectName() {
  return objects.length === 1 ? objects[0].name : 'dice-set';
}

async function saveProject() {
  if (!objects.length || busy) return;
  const toDir = await exportDirReady();
  const project = {
    app: PROJECT_APP,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    session: { activeId: active ? active.id : null, form: formData(), view: viewData() },
    objects: objects.map((obj) => ({
      ...objectData(obj),
      model: encodeGeometry(packGeometry(obj.mesh.geometry)),
      source: obj.edited && obj.source ? encodeGeometry(packGeometry(obj.source)) : null,
    })),
    fonts: customFonts().map((entry) => ({
      id: entry.id,
      name: entry.name,
      origin: entry.origin,
      url: entry.url,
      files: entry.buffers.map(toBase64),
    })),
  };
  const name = `${safeFileName(projectName())}${PROJECT_EXT}`;
  const where = await saveFile(name, new Blob([JSON.stringify(project)], { type: 'application/json' }), toDir);
  setStatus('status.projectSaved', {
    file: name,
    where,
    objects: objects.length,
    n: pendingStamps(),
    fonts: project.fonts.length,
  });
}

// Decodes a project file into the shape applyScene takes. Throws on anything unreadable.
function sceneFromProject(project) {
  if (!Array.isArray(project.objects)) {
    const geometry = project.model ? unpackGeometry(decodeGeometry(project.model)) : null;
    const source = geometry && project.source ? unpackGeometry(decodeGeometry(project.source)) : null;
    return legacyScene(project.session, geometry, source);
  }
  return {
    objects: project.objects.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new AppError('err.projectBroken');
      return {
        meta: entry,
        geometry: unpackGeometry(decodeGeometry(entry.model)),
        source: entry.source ? unpackGeometry(decodeGeometry(entry.source)) : null,
      };
    }),
    activeId: project.session.activeId,
    form: project.session.form,
    view: project.session.view,
  };
}

async function openProject(text) {
  try {
    await enginePromise;
  } catch {
    return;
  }
  let skipped = 0;
  let badFonts = 0;
  try {
    let project;
    try {
      project = JSON.parse(text);
    } catch {
      throw new AppError('err.projectParse');
    }
    if (!project || project.app !== PROJECT_APP || !project.session || typeof project.session !== 'object') {
      throw new AppError('err.projectForeign');
    }
    if (Number(project.version) > PROJECT_VERSION) throw new AppError('err.projectNewer');
    // Everything is decoded before the current scene is touched, so a bad file changes nothing.
    const data = sceneFromProject(project);
    for (const entry of Array.isArray(project.fonts) ? project.fonts : []) {
      try {
        addFont({
          id: entry.id,
          name: entry.name,
          origin: entry.origin,
          url: typeof entry.url === 'string' ? entry.url : '',
          buffers: entry.files.map(fromBase64),
        });
      } catch {
        badFonts += 1;
      }
    }
    refreshFontList();
    for (const obj of objects) dropCached(obj);
    skipped = applyScene(data);
  } catch (error) {
    setStatus(errorMsg(error, 'err.projectBroken'));
    return;
  }
  for (const obj of objects) {
    saveModel(obj);
    saveSource(obj);
  }
  saveFonts();
  saveSession();
  if (skipped || badFonts) setStatus('status.projectPartly', { stamps: skipped, fonts: badFonts });
  else setStatus('status.projectOpened', { objects: objects.length, n: pendingStamps() });
}

function newProject() {
  if (!objects.length || busy) return;
  if (!window.confirm(t('project.newConfirm'))) return;
  for (const obj of objects) dropCached(obj);
  clearScene();
  activate(null);
  setStatus('status.cleared');
  saveSession();
}

// ---- Export folder ----

function renderDir() {
  ui.dir.disabled = !canPickDir;
  ui.dirClear.hidden = !exportDir;
  if (!canPickDir) ui.dirName.textContent = t('export.dirUnsupported');
  else if (exportDir) ui.dirName.textContent = t('export.dirNow', { name: exportDir.name });
  else ui.dirName.textContent = t('export.dirNone');
}

async function pickDir() {
  if (!canPickDir) return;
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'dice-stamp-export', mode: 'readwrite' });
  } catch (error) {
    // AbortError is the user closing the dialog.
    if (!error || error.name !== 'AbortError') setStatus('status.dirFailed');
    return;
  }
  exportDir = handle;
  renderDir();
  setStatus('status.dirSet', { name: handle.name });
  if (cacheOpen) store('dir', handle);
}

function clearDir() {
  exportDir = null;
  renderDir();
  setStatus('status.dirCleared');
  cacheDel('dir').catch(() => {});
}

// ---- Language and theme ----

function applyTheme(name) {
  const theme = THEMES.includes(name) ? name : 'midnight';
  document.documentElement.dataset.theme = theme;
  ui.theme.value = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the theme lasts for this visit.
  }
  scene.background = new THREE.Color(cssVar('--scene', '#2a241c'));
  ring.material.color.set(cssVar('--accent', '#e2b15a'));
  roller.refresh();
  generator.refresh();
  if (symbols.phase === 'ready') renderSymbols();
}

function renderPresets() {
  ui.presets.replaceChildren();
  for (const preset of PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t(preset.key);
    button.addEventListener('click', () => useSvg(preset.svg, t(preset.key)));
    ui.presets.append(button);
  }
}

function redrawTexts() {
  ui.status.textContent = render(live.status);
  ui.hint.textContent = render(live.hint);
  ui.engine.textContent = render(live.engine);
  ui.busy.querySelector('span').textContent = render(live.busy);
  renderPresets();
  renderInfo();
  renderObjects();
  renderList();
  renderDir();
  roller.refresh();
  generator.refresh();
}

function openRoll() {
  const obj = active;
  if (!obj || busy) return;
  let geometry = obj.mesh.geometry;
  let temporary = null;
  if (obj.stamps.length && obj.solid && engineReady) {
    try {
      temporary = applyStamps(obj.mesh.geometry, stampJobs(obj));
      geometry = temporary;
    } catch {
      // The tray then shows the die without the signs that are not applied yet.
    }
  }
  roller.open({
    geometry,
    color: obj.color,
    flat: !ui.smooth.checked,
    marks: obj.marks.concat(obj.stamps.map(markOf)),
  });
  if (temporary) temporary.dispose();
}

function resize() {
  const width = ui.stage.clientWidth;
  const height = ui.stage.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// ---- Wiring ----

function firstFile(input) {
  const file = input.files && input.files[0];
  // Clearing the value lets the same file be picked again.
  input.value = '';
  return file || null;
}

function openFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.stl')) {
    file.arrayBuffer().then((buffer) => loadArrayBuffer(buffer, file.name));
  } else if (name.endsWith('.svg')) {
    file.text().then((text) => useSvg(text, file.name.replace(/\.svg$/i, '')));
  } else if (name.endsWith('.json')) {
    file.text().then(openProject);
  } else if (/\.(ttf|otf|woff|woff2)$/.test(name)) {
    addFontFile(file);
  } else {
    setStatus('err.fileKind');
  }
}

for (const input of [ui.fileStl, ui.fileSvg, ui.fileProject, ui.fileFont]) {
  input.addEventListener('change', () => {
    const file = firstFile(input);
    if (file) openFile(file);
  });
}

ui.sample.addEventListener('click', async () => {
  let response;
  try {
    response = await fetch('./samples/cube.stl');
  } catch {
    response = null;
  }
  if (!response || !response.ok) {
    setStatus('err.sampleMissing');
    return;
  }
  loadArrayBuffer(await response.arrayBuffer(), 'cube.stl');
});

ui.color.addEventListener('input', () => {
  if (active) {
    active.color = ui.color.value;
    active.mesh.material.color.set(ui.color.value);
  }
  touch();
});

ui.smooth.addEventListener('change', () => {
  for (const obj of objects) {
    obj.mesh.material.flatShading = !ui.smooth.checked;
    obj.mesh.material.needsUpdate = true;
  }
  touch();
});

ui.name.addEventListener('input', () => {
  if (!active) return;
  active.name = ui.name.value.replace(/\s+/g, ' ').trim() || 'dice';
  renderObjects();
  touch();
});

ui.gen.addEventListener('click', () => {
  if (!busy) generator.open();
});
ui.flip.addEventListener('click', flipActive);
ui.fit.addEventListener('click', fitCamera);
ui.regen.addEventListener('click', openRegen);
ui.fitAll.addEventListener('click', fitScene);
ui.tabText.addEventListener('click', () => setPane('text'));
ui.tabSvg.addEventListener('click', () => setPane('svg'));
ui.tabSymbols.addEventListener('click', () => setPane('symbols'));
ui.modeCut.addEventListener('click', () => setMode('cut'));
ui.modeRaise.addEventListener('click', () => setMode('raise'));
ui.deselect.addEventListener('click', deselect);
ui.text.addEventListener('input', scheduleSourceEdit);
ui.svg.addEventListener('input', () => {
  // Hand-edited markup is no longer the icon or file it came from.
  if (!formLock) svgLabel = '';
  scheduleSourceEdit();
});
ui.font.addEventListener('change', scheduleSourceEdit);
ui.fontRemove.addEventListener('click', dropFont);
ui.fontLoad.addEventListener('click', addFontLink);
ui.fontUrl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addFontLink();
  }
});
ui.symLib.addEventListener('change', () => {
  touch();
  loadSymbols();
});
ui.symQuery.addEventListener('input', scheduleSymbolSearch);
ui.apply.addEventListener('click', () => bake());
ui.undo.addEventListener('click', undo);
ui.reset.addEventListener('click', resetSource);
ui.auto.addEventListener('change', touch);
ui.scope.addEventListener('change', touch);
ui.dir.addEventListener('click', pickDir);
ui.dirClear.addEventListener('click', clearDir);
ui.download.addEventListener('click', exportStl);
ui.saveProject.addEventListener('click', saveProject);
ui.newProject.addEventListener('click', newProject);
ui.roll.addEventListener('click', openRoll);
ui.theme.addEventListener('change', () => applyTheme(ui.theme.value));
ui.lang.addEventListener('change', () => setLang(ui.lang.value));
controls.addEventListener('end', touch);

bindPair(ui.height, ui.heightNum, onGeomInput);
bindPair(ui.depth, ui.depthNum, onGeomInput);
bindPair(ui.rotation, ui.rotationNum, onGeomInput);
ui.offU.addEventListener('input', onGeomInput);
ui.offV.addEventListener('input', onGeomInput);
ui.wrap.addEventListener('change', onGeomInput);

const canvas = renderer.domElement;
const CLICK_SLOP = 9;
let press = null;
let moveFrame = 0;
let lastMove = null;

function movedFar(event) {
  const dx = event.clientX - press.x;
  const dy = event.clientY - press.y;
  return dx * dx + dy * dy > CLICK_SLOP;
}

function queueMove(event) {
  lastMove = { x: event.clientX, y: event.clientY };
  if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
}

// Raycasts at most once per frame: big STLs make every ray expensive.
function flushMove() {
  moveFrame = 0;
  if (!lastMove || !active) return;
  const { x, y } = lastMove;
  if (press && press.stamp) {
    if (press.dragging) dragTo(press.object, press.stamp, x + press.dx, y + press.dy);
    return;
  }
  if (press) return;
  const hit = active.stamps.length ? hitAt(x, y) : null;
  canvas.style.cursor = hit && hit.object === active && stampUnder(active, hit.point) ? 'grab' : '';
}

function endStampPress(done, event) {
  controls.enabled = true;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  canvas.style.cursor = '';
  if (!done.dragging) return;
  const alive = objects.includes(done.object) && done.object.stamps.includes(done.stamp);
  if (!alive) return;
  if (event) dragTo(done.object, done.stamp, event.clientX + done.dx, event.clientY + done.dy);
  if (done.object === active && done.stamp.id === active.selectedId) {
    formLock = true;
    ui.offU.value = '0';
    ui.offV.value = '0';
    formLock = false;
  }
  setStatus('status.dragged');
  touch();
}

// Capture phase: this must run before OrbitControls so a grabbed stamp does not also spin the camera.
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || (press && press.stamp)) return;
  press = { id: event.pointerId, x: event.clientX, y: event.clientY, object: null, stamp: null, dragging: false };
  if (busy || !active || event.shiftKey || !active.stamps.length) return;
  const hit = hitAt(event.clientX, event.clientY);
  const stamp = hit && hit.object === active && stampUnder(active, hit.point);
  if (!stamp) return;
  // Keep the grab point under the cursor instead of snapping the stamp centre to it.
  const centre = new THREE.Vector3().setFromMatrixPosition(placementMatrix(stamp));
  const anchor = screenPoint(active.group.localToWorld(centre));
  press.object = active;
  press.stamp = stamp;
  press.dx = anchor.x - event.clientX;
  press.dy = anchor.y - event.clientY;
  controls.enabled = false;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // The pointer can already be gone; the drag still works inside the canvas.
  }
  if (active.selectedId !== stamp.id) selectStamp(stamp.id);
}, { capture: true });

canvas.addEventListener('pointermove', (event) => {
  if (press && press.stamp) {
    if (event.pointerId !== press.id) return;
    if (!press.dragging) {
      if (!movedFar(event)) return;
      press.dragging = true;
      canvas.style.cursor = 'grabbing';
    }
    queueMove(event);
    return;
  }
  if (event.buttons === 0 && !busy) queueMove(event);
});

canvas.addEventListener('pointerup', (event) => {
  if (!press || event.pointerId !== press.id || event.button !== 0) return;
  const done = press;
  const wasClick = !movedFar(event);
  press = null;
  if (done.stamp) {
    endStampPress(done, event);
    return;
  }
  if (!wasClick || busy || !objects.length) return;
  const hit = hitAt(event.clientX, event.clientY);
  if (!hit) {
    setStatus('status.missedModel');
    return;
  }
  if (hit.object !== active) {
    // The first click on another object only picks it, so a stamp never lands on the wrong die.
    setActive(hit.object);
    setStatus('status.objectPicked', { name: hit.object.name });
    return;
  }
  if (!active.solid) {
    // A stamp could never be applied to an open mesh, so it is not placed at all.
    setStatus('model.notSolid');
    return;
  }
  if (event.shiftKey && selectedStamp()) moveSelected(hit);
  else placeStamp(hit);
});

canvas.addEventListener('pointercancel', (event) => {
  if (!press || event.pointerId !== press.id) return;
  const done = press;
  press = null;
  if (done.stamp) endStampPress(done, null);
});

window.addEventListener('keydown', (event) => {
  if (roller.isOpen()) {
    if (event.key === 'Escape') roller.close();
    return;
  }
  if (generator.isOpen()) {
    if (event.key === 'Escape') generator.close();
    return;
  }
  if (event.key === 'Escape') {
    deselect();
    return;
  }
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (active && active.selectedId != null) {
      event.preventDefault();
      removeStamp(active.selectedId);
    }
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    undo();
  }
});

const dialogOpen = () => roller.isOpen() || generator.isOpen();

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!dialogOpen()) ui.drop.hidden = false;
});
window.addEventListener('dragleave', (event) => {
  if (event.target === document.documentElement) ui.drop.hidden = true;
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  ui.drop.hidden = true;
  if (dialogOpen()) return;
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) openFile(file);
});

// A reload right after an edit must not lose it to the save delay.
window.addEventListener('pagehide', () => {
  if (saveTimer) saveSession();
});

for (const [code, name] of LANGS) {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = name;
  ui.lang.append(option);
}
ui.lang.value = getLang();

for (const lib of LIBRARIES) {
  const option = document.createElement('option');
  option.value = lib.id;
  option.textContent = lib.type === 'emoji' ? `Emoji · ${lib.name}` : lib.name;
  ui.symLib.append(option);
}

applyI18n();
applyTheme(document.documentElement.dataset.theme);
redrawTexts();
renderSymbols();

onLangChange(() => {
  redrawTexts();
  // Emoji names are per language; icon names stay English.
  if (library(ui.symLib.value).type === 'emoji' && symbols.phase !== 'idle') loadSymbols();
  else renderSymbols();
});

new ResizeObserver(resize).observe(ui.stage);
resize();
animate();

if (location.protocol === 'file:') {
  setEngine('engine.fromDisk');
  setStatus('status.fromDisk');
}

const enginePromise = initManifold()
  .then(() => {
    engineReady = true;
    setEngine(fontReady ? 'engine.readyFont' : 'engine.ready');
    syncButtons();
  })
  .catch((error) => {
    setEngine('engine.failed');
    setStatus('status.engineFailed');
    throw error;
  });

const fontPromise = loadBuiltinFont()
  .then(() => {
    fontReady = true;
    refreshFontList();
    if (engineReady) setEngine('engine.readyFont');
  })
  .catch(() => {
    setStatus('status.fontFailed');
  });

// Warmed up in the background so the first emoji does not wait for a download.
ensureEmoji().catch(() => {});

Promise.allSettled([enginePromise, fontPromise]).then(restoreCache);
